// Real application/browser, synthetic SQLite database and controlled provider.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
const [root, dependencyRoot, browserPath, fixturePath] = process.argv.slice(2, 6).map(value => path.resolve(value))
if (!root || !dependencyRoot || !browserPath || !fixturePath) throw new Error('Expected target, playwright root, chromium, synthetic fixture')
assert.ok(fs.existsSync(browserPath), 'Chromium executable must exist before server startup')
const mode = process.argv[6]
assert.ok(['raw-base', 'prepared-stop'].includes(mode), 'Expected raw-base or prepared-stop')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.characters?.length, 1)
assert.equal(fixture.characters[0].chaId, 'synthetic-character')
assert.equal(fixture.characters[0].chats[0].id, 'synthetic-chat')
assert.equal(fixture.plugins?.length, 0)
fixture.characters[0].triggerscript = []
fixture.characters[0].chats[0].message = [
  { role: 'user', data: 'Synthetic earlier question', chatId: 'earlier-user' },
  { role: 'char', data: 'Synthetic earlier answer', chatId: 'earlier-answer' },
]
const { chromium } = createRequire(path.join(dependencyRoot, 'package.json'))('playwright')
// The existing preload admits only this synthetic runtime prefix.
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-queue-browser-'))
process.chdir(runtime)
const { decodeRisuSave } = createRequire(path.join(root, 'package.json'))('./server/node/utils.cjs')
fs.symlinkSync(path.join(root, 'dist'), path.join(runtime, 'dist'))
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }))
const password = createHash('sha256').update('synthetic-browser-password').digest('hex')
const worker = fork(root + '/server/node/bgServerChatProcessClient.cjs', [], { cwd: runtime, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
worker.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: root,
  password, databaseBase64: Buffer.from(JSON.stringify(fixture)).toString('base64') })
assert.equal((await once(worker, 'exit'))[0], 0)
const server = fork(root + '/server/node/server.cjs', [], { cwd: runtime,
  execArgv: ['--require', path.join(import.meta.dirname, 'probes/bg-queue-preload.cjs')],
  env: { ...process.env, PORT: '0', POCKETRISU_QUEUE_PROBE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
const log = fs.createWriteStream(path.join(runtime, 'server.log'))
server.stdout.pipe(log); server.stderr.pipe(log)
const providers = []
server.on('message', value => { if (value.event === 'provider') providers.push(value) })
const port = await new Promise((resolve, reject) => {
  server.on('message', value => { if (value.event === 'ready') resolve(value.port) })
  server.once('exit', code => reject(new Error('Server exited ' + code)))
})
const backend = `http://127.0.0.1:${port}`
const login = await fetch(backend + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
const { token } = await login.json()
const readChat = async () => {
  const response = await fetch(backend + '/api/chat-content/synthetic-character/0', { headers: { 'risu-auth': token, 'x-chat-id': 'synthetic-chat' } })
  assert.equal(response.status, 200)
  return decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
}

// Hold the original response stream after real headers; no browser response clone,
// repeated application request or replacement production timer is involved.
let gate = mode, capabilityReads = 0, admissions = 0, closedStreams = 0, held
const proxy = createServer((req, res) => {
  const pathname = new URL(req.url, backend).pathname
  if (pathname === '/api/bg-orchestrate-capabilities') {
    capabilityReads++
    if (mode === 'prepared-stop' && capabilityReads === 1) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{}')
      return
    }
  }
  if (pathname === '/api/bg-orchestrate' && req.method === 'POST') admissions++
  const upstream = httpRequest(new URL(req.url, backend), { method: req.method, headers: req.headers }, response => {
    const stall = gate === 'raw-base' && pathname.startsWith('/api/bg-orchestrate-input-base/')
      || gate === 'prepared-stop' && pathname === '/api/bg-orchestrate-capabilities'
    if (stall) {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const bytes = Buffer.concat(chunks)
        const headers = { ...response.headers }
        delete headers['content-length']; delete headers['transfer-encoding']
        res.writeHead(response.statusCode, headers)
        res.flushHeaders()
        res.write(bytes.subarray(0, 1))
        held = { res, remainder: bytes.subarray(1) }
        res.once('close', () => { closedStreams++ })
      })
      response.on('error', () => res.destroy())
    } else {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
      response.on('error', () => res.destroy())
    }
  })
  upstream.on('error', () => res.destroy())
  res.once('close', () => { if (!res.writableEnded) upstream.destroy() })
  req.pipe(upstream)
})
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${proxy.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: browserPath })
const context = await browser.newContext()
await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
async function until(predicate, label, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw Error('Timed out: ' + label)
}
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByText('Input your password.', { exact: false }).waitFor()
  await page.locator('input').fill('synthetic-browser-password')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator('[data-char-id="synthetic-character"]').first().click()
  const text = 'Synthetic CAP input preserved'
  await page.locator('textarea').fill(text)
  await page.locator('textarea').press('Enter')
  await until(() => held !== undefined, 'held original response')
  assert.equal(admissions, 0)
  assert.equal(providers.length, 0)
  if (mode === 'raw-base') {
    assert.equal(await page.getByRole('button', { name: '서버 입력 접수 확인 중', exact: true }).isDisabled(), true)
    await until(async () => (await page.locator('body').innerText()).includes('서버 입력을 시작하지 않았어요'), 'bounded admission notice')
    assert.equal(await page.locator('textarea').inputValue(), text)
    assert.equal(await page.getByRole('button', { name: '서버 입력 접수 확인 중', exact: true }).count(), 0)
  } else {
    const stop = page.locator('button[aria-labelledby="cancel"]')
    await stop.waitFor()
    const started = Date.now()
    await stop.click()
    await until(async () => await page.locator('button.button-icon-send').count() === 1, 'native Stop released', 5000)
    assert.ok(Date.now() - started < 5000, 'Stop must not wait for the body budget')
    assert.ok((await readChat()).message.some(message => message.data === text), 'prepared input stays durably saved')
  }
  await until(() => closedStreams > 0, 'actual response connection closed')
  // Late response release cannot cause a start. Enable a new attempt only after
  // observing the old native connection close and the unchanged no-start state.
  held.res.end(held.remainder)
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(admissions, 0)
  assert.equal(providers.length, 0)
  gate = null
  await page.locator('textarea').fill(mode === 'raw-base' ? text : 'Synthetic CAP subsequent input')
  await page.locator('textarea').press('Enter')
  await until(() => providers.length === 1, 'subsequent provider')
  server.send({ event: 'release', call: 1 })
  await until(async () => (await readChat()).message.some(message => message.data === 'Synthetic queue answer 1'), 'answer stored')
  assert.equal(admissions, 1)
  assert.equal(providers.length, 1)
  assert.deepEqual(pageErrors, [])
  console.log(JSON.stringify({ passed: true, mode, runtime, capabilityReads, admissions,
    providers: providers.length, closedStreams, pageErrors: pageErrors.length }))
} catch (error) {
  fs.writeFileSync(path.join(runtime, 'cap-failure.txt'), await page.locator('body').innerText().catch(() => ''))
  console.log(JSON.stringify({ passed: false, mode, runtime, error: error.message, capabilityReads,
    admissions, providers: providers.length, closedStreams, pageErrors }))
  throw error
} finally {
  await browser.close()
  proxy.closeAllConnections()
  await new Promise(resolve => proxy.close(resolve))
  server.kill('SIGTERM')
  await once(server, 'exit')
  log.end()
}
