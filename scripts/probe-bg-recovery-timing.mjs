// Synthetic native completion -> cold browser recovery -> native client log.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const [root, dependencyRoot, browserPath, fixturePath] = process.argv.slice(2).map(value => path.resolve(value))
const expectCurrentView = process.argv.includes('--expect-current-view')
const orchestrationSource = fs.readFileSync(path.join(root, 'src/ts/bgOrchestrate.ts'), 'utf8')
if (expectCurrentView) assert.doesNotMatch(orchestrationSource, /bgRecoveryTiming/)
assert.doesNotMatch(orchestrationSource, /await\s+(res|response|statusResponse)\.json\(\)/,
    'every known control body call must be wrapped after composition')
assert.deepEqual([...orchestrationSource.matchAll(/await\s+(\w+)\.json\(\)/g)].map(match => match[1]).sort(),
    ['capabilityResponse', 'probe'], 'new uninstrumented JSON call sites require classification')
const output = execFileSync(process.execPath, [path.join(import.meta.dirname, 'probe-bg-plugin-process.cjs'), root, fixturePath, 'normal'],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
const seed = JSON.parse(output.trim().split('\n').findLast(line => line.startsWith('{"passed":')))
assert.equal(seed.passed, true)
const runtime = seed.runtime
assert.ok(runtime.startsWith(path.join(os.tmpdir(), 'pocketrisu-plugin-process-')))
const { chromium } = createRequire(path.join(dependencyRoot, 'package.json'))('playwright')
const Database = createRequire(path.join(root, 'package.json'))('better-sqlite3')
const readTraces = () => {
    const db = new Database(path.join(runtime, 'save/logs.db'), { readonly: true })
    try { return db.prepare("SELECT message,description FROM logs WHERE source='bg-recovery-timing' ORDER BY id").all()
        .map(row => ({ message: row.message, data: JSON.parse(row.description) })) }
    finally { db.close() }
}
const server = fork(path.join(root, 'server/node/server.cjs'), [], { cwd: runtime,
    execArgv: ['--require', path.join(import.meta.dirname, 'probes/bg-plugin-process-preload.cjs')],
    env: { ...process.env, PORT: '0', POCKETRISU_PLUGIN_PROCESS_PROBE: '1',
        POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '0', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
const log = fs.createWriteStream(path.join(runtime, 'recovery-timing-server.log'))
server.stdout.pipe(log); server.stderr.pipe(log)
let newProviderCalls = 0
server.on('message', message => { if (['analysis', 'provider'].includes(message.event)) newProviderCalls++ })
const origin = await new Promise((resolve, reject) => {
    server.on('message', message => { if (message.event === 'ready') resolve(`http://127.0.0.1:${message.port}`) })
    server.once('exit', code => reject(Error('server exited ' + code)))
})
const browser = await chromium.launch({ headless: true, executablePath: browserPath })
const errors = []
try {
    const context = await browser.newContext()
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
    await context.addInitScript(() => {
        if (window.top !== window) return
        if (localStorage.getItem('synthetic-recovery-probe')) return
        localStorage.setItem('synthetic-recovery-probe', '1')
        localStorage.setItem('bg-orch-pending:synthetic-plugin-operation', JSON.stringify({
            charId: 'synthetic-character', chatId: 'synthetic-chat', operationId: 'synthetic-plugin-operation',
            baselineMsgs: 0, deliveryVersion: 2, resultKeyVersion: 1, staticsMessagesApplied: 0,
            expectedChatRevision: 'synthetic-old-view', ts: Date.now(),
        }))
    })
    const page = await context.newPage()
    const observed = []
    page.on('requestfinished', request => {
        const route = new URL(request.url()).pathname
        const method = request.method()
        const kind = route.startsWith('/api/bg-orchestrate-result/') ? (method === 'DELETE' ? 'ack' : 'result-get')
            : route.startsWith('/api/bg-orchestrate-chat-state/') ? 'projection'
            : route.startsWith('/api/chat-content/') && method === 'GET' ? 'snapshot' : null
        if (kind) observed.push({ kind, phase: 'complete' })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.getByText('Input your password.', { exact: false }).waitFor()
    await page.locator('input').fill('synthetic-plugin-password')
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.locator('[data-char-id="synthetic-character"]').first().waitFor()
    const deadline = Date.now() + 90_000
    let traces
    while (Date.now() < deadline) {
        traces = readTraces()
        if (expectCurrentView
            ? observed.some(row => row.kind === 'ack')
                && await page.evaluate(() => localStorage.getItem('bg-orch-pending:synthetic-plugin-operation')) === null
            : traces.some(row => row.data.checkpoint === 'finished')) break
        await page.waitForTimeout(200)
    }
    let trace
    if (expectCurrentView) {
        assert.deepEqual(traces, [], 'instrumentation must not produce runtime logs')
        trace = { outcome: 'finished', requests: observed }
    } else {
        // Historical mode is for the measurement-only .21 artifact.
        assert.ok(traces?.length)
        const finished = traces.filter(row => row.data.checkpoint === 'finished')
        assert.equal(finished.length, 1)
        trace = finished[0].data
        assert.equal(trace.context, 'boot')
        assert.ok(trace.requests.some(row => row.kind === 'result-get' && row.phase === 'complete' && typeof row.headersMs === 'number' && typeof row.bodyMs === 'number'))
        assert.ok(trace.requests.some(row => row.kind === 'snapshot' && row.bytes > 0))
    }
    assert.ok(trace.requests.some(row => row.kind === 'projection' && row.phase === 'complete'))
    assert.ok(trace.requests.some(row => row.kind === 'ack' && row.phase === 'complete'))
    if (expectCurrentView) {
        assert.equal(trace.outcome, 'finished')
        const complete = kind => trace.requests.filter(row => row.kind === kind && row.phase === 'complete')
        assert.equal(complete('result-get').length, 1, 'current view must not wait for three result polls')
        assert.equal(complete('snapshot').length, 1, 'cold hydration alone reads the chat; adoption must not read it again')
        assert.equal(complete('ack').length, 1)
        // Allow the native 500ms log buffer to flush another batch. This is a
        // bounded observation window, not proof against arbitrarily late logs.
        await page.waitForTimeout(1500)
        assert.equal(await page.getByText('답변은 서버 채팅에 저장돼 있어요. 채팅을 다시 열면 보여요.', { exact: true }).count(), 0)
        const db = new Database(path.join(runtime, 'save/logs.db'), { readonly: true })
        try {
            assert.equal(db.prepare("SELECT count(*) n FROM logs WHERE message LIKE '%committed result cannot be adopted%'").get().n, 0)
            assert.equal(db.prepare("SELECT count(*) n FROM logs WHERE source = 'bg-saved-answer' AND message = ?")
                .get('답변은 서버 채팅에 저장돼 있어요. 채팅을 다시 열면 보여요.').n, 0)
            assert.equal(db.prepare("SELECT count(*) n FROM logs WHERE source = 'bg-recovery' OR (source = 'blocking-alert' AND level = 'error')").get().n, 0)
        } finally { db.close() }
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('bg-orch-pending:synthetic-plugin-operation')), null)
    assert.equal(newProviderCalls, 0)
    assert.deepEqual(errors, [])
    assert.doesNotMatch(JSON.stringify(traces), /synthetic-(plugin|character|chat|answer)|https?:|token|password/)
    fs.writeFileSync(path.join(runtime, 'timing.json'), JSON.stringify(traces, null, 2))
    console.log(JSON.stringify({ passed: true, runtime, expectCurrentView, traces: traces.length,
        requests: trace.requests.length, kinds: [...new Set(trace.requests.map(row => row.kind))],
        resourceSplits: trace.requests.filter(row => typeof row.networkBodyMs === 'number').length,
        providerReplay: newProviderCalls, pageErrors: errors.length }))
} catch (error) {
    console.log(JSON.stringify({ passed: false, runtime, error: error.message, pageErrors: errors }))
    throw error
} finally {
    await browser.close()
    if (server.exitCode === null && server.signalCode === null) { const done = once(server, 'exit'); server.kill('SIGTERM'); await done }
}
