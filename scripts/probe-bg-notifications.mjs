// Isolated real-browser test: close before input processing, restart, return at home.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const [root, dependencyRoot, browserPath, fixturePath] = process.argv.slice(2, 6).map(value => path.resolve(value))
if (!root || !dependencyRoot || !browserPath || !fixturePath) throw new Error('Expected target, playwright root, chromium, synthetic fixture')
assert.ok(fs.existsSync(browserPath))
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.characters?.length, 1)
assert.equal(fixture.characters[0].chaId, 'synthetic-character')
assert.equal(fixture.characters[0].chats[0].id, 'synthetic-chat')
assert.equal(fixture.plugins?.length, 0)
assert.ok(fixture.characters[0].triggerscript[0].effect[0].code.includes('alertInput'))
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-notification-browser-'))
process.chdir(runtime)
const { chromium } = createRequire(path.join(dependencyRoot, 'package.json'))('playwright')
const Database = createRequire(path.join(root, 'package.json'))('better-sqlite3')
const includeMessages = process.argv.includes('--plugin-messages')
const messageText = 'Synthetic <b>plain text</b>'
const expectedNotices = includeMessages ? 4 : 1
fs.symlinkSync(path.join(root, 'dist'), path.join(runtime, 'dist'))
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }))
const worker = fork(root + '/server/node/bgServerChatProcessClient.cjs', [], { cwd: runtime, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
worker.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: root,
  password: createHash('sha256').update('synthetic-browser-password').digest('hex'), databaseBase64: Buffer.from(JSON.stringify(fixture)).toString('base64') })
assert.equal((await once(worker, 'exit'))[0], 0)
let server, origin, beforeInput = false, stopped = false, providerCalls = 0, deniedBackgroundFetches = 0, launches = 0
const deniedTargets = new Set()
async function startServer() {
  server = fork(root + '/server/node/server.cjs', [], { cwd: runtime,
    execArgv: ['--require', path.join(import.meta.dirname, 'probes/bg-notifications-preload.cjs')],
    env: { ...process.env, PORT: '0', POCKETRISU_NOTIFICATION_PROBE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const log = fs.createWriteStream(path.join(runtime, 'server-' + (++launches) + '.log'))
  server.stdout.pipe(log); server.stderr.pipe(log)
  server.on('message', message => {
    if (message.event === 'before-input') beforeInput = true
    if (message.event === 'input-stopped') stopped = true
    if (message.event === 'unexpected-provider') providerCalls++
    if (message.event === 'denied-background-fetch') { deniedBackgroundFetches++; deniedTargets.add(message.target) }
  })
  const port = await new Promise((resolve, reject) => {
    server.on('message', message => { if (message.event === 'ready') resolve(message.port) })
    server.once('exit', code => reject(new Error('Server exited ' + code)))
  })
  origin = `http://127.0.0.1:${port}`
}
const rows = () => {
  const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true })
  try { return db.prepare("SELECT value FROM kv WHERE key LIKE 'internal/bg-notifications/v1/%'").all().map(row => JSON.parse(row.value)) }
  finally { db.close() }
}
async function until(predicate, label) {
  for (let i = 0; i < 300; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 200)) }
  throw new Error('Timed out: ' + label)
}
const browser = await chromium.launch({ headless: true, executablePath: browserPath })
const pageErrors = []
async function openHome(configure = async () => {}) {
  const context = await browser.newContext()
  if (process.argv.includes('--without-native-uuid')) {
    await context.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }) })
  }
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
  const page = await context.newPage()
  await configure(page)
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByText('Input your password.', { exact: false }).waitFor()
  await page.locator('input').fill('synthetic-browser-password')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator('[data-char-id="synthetic-character"]').first().waitFor()
  return { context, page }
}
try {
  await startServer()
  const first = await openHome()
  const stamp = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-stamp.json'), 'utf8')).stamp
  const unauthenticated = await fetch(origin + '/api/bg-notifications/claim', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-build': stamp }, body: JSON.stringify({ consumerId: 'anonymous-consumer' }) })
  assert.equal(unauthenticated.status, 401)
  assert.equal((await first.context.request.post(origin + '/api/bg-notifications/claim', { data: { consumerId: 'stale-consumer' } })).status(), 426)
  await first.page.locator('[data-char-id="synthetic-character"]').first().click()
  await first.page.locator('textarea').fill('Synthetic unseen input')
  await first.page.getByRole('button', { name: 'Send', exact: true }).click()
  await until(() => beforeInput, 'server input gate')
  await first.context.close()
  server.send({ event: 'release-input' })
  await until(() => stopped, 'unsupported stop after browser close')
  assert.equal(rows().length, 1)
  assert.equal(rows()[0].deliveredAt, null)
  server.kill('SIGTERM'); await once(server, 'exit')
  if (includeMessages) {
    // Exercise the real durable writer and browser delivery; do not synthesize
    // HTTP claim responses or bypass client parsing/rendering.
    const db = new Database(path.join(runtime, 'save/risuai.db'))
    const { createBgNotifications } = createRequire(path.join(root, 'package.json'))('./server/node/bgNotifications.cjs')
    const owner = createBgNotifications({ db,
      kvGet: key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null,
      kvSet: (key, value) => db.prepare('INSERT OR REPLACE INTO kv (key,value,updated_at) VALUES (?,?,?)').run(key, value, Date.now()),
      kvDel: key => db.prepare('DELETE FROM kv WHERE key=?').run(key),
      kvList: prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=?').all(prefix.length, prefix).map(row => row.key),
    })
    try {
      for (const level of ['info', 'warning', 'error']) assert.equal(owner.publish({
        operationId: 'synthetic-plugin-operation', eventKey: 'message-' + level, code: 'plugin_message',
        charId: 'synthetic-character', chatId: 'synthetic-chat', createdAt: Date.now(),
        effectsMayHaveOccurred: false, pluginName: 'Synthetic', pluginVersion: '1', phase: 'load',
        message: messageText + ' ' + level, level,
      }).status, 'stored')
    } finally { db.close() }
  }
  await startServer()
  let ackRequests = 0
  const second = await openHome(page => page.route('**/api/bg-notifications/ack', route => {
    ackRequests++
    return ackRequests === 1 ? route.abort() : route.continue()
  }))
  await second.page.getByText('서버에서 처리할 수 없는 입력 동작으로 멈췄어요. 원문은 해당 채팅에 보존했어요.', { exact: true }).waitFor()
  assert.equal(await second.page.locator('textarea').count(), 0, 'must notify on home without selecting the chat')
  if (includeMessages) for (const level of ['info', 'warning', 'error']) {
    await second.page.getByText('Synthetic (1): ' + messageText + ' ' + level, { exact: true }).waitFor()
  }
  assert.equal(await second.page.locator('[data-sonner-toast] b').count(), 0, 'message markup must remain text')
  await until(() => rows().length === expectedNotices && rows().every(row => row.deliveredAt !== null)
    && ackRequests >= 2, 'ACK retry after lost first request')
  const logs = new Database(path.join(runtime, 'save/logs.db'), { readonly: true })
  const notificationsLogged = logs.prepare("SELECT count(*) AS count FROM logs WHERE source='bg-notification'").get().count
  logs.close()
  assert.equal(notificationsLogged, expectedNotices, 'ACK retry must not enqueue/log the toast twice')
  await second.context.close()
  const third = await openHome()
  await third.page.waitForTimeout(5500)
  assert.equal(await third.page.getByText('서버에서 처리할 수 없는 입력 동작으로 멈췄어요. 원문은 해당 채팅에 보존했어요.', { exact: true }).count(), 0)
  assert.equal(rows().length, expectedNotices)
  if (includeMessages) assert.equal(await third.page.getByText('Synthetic (1):', { exact: false }).count(), 0)
  assert.equal(providerCalls, 0)
  assert.deepEqual(pageErrors, [])
  await third.context.close()
  console.log(JSON.stringify({ passed: true, runtime, serverLaunches: launches, notices: rows().length,
    notificationsLogged, ackRequests, providerCalls, deniedBackgroundFetches, pageErrors }))
} catch (error) {
  console.log(JSON.stringify({ passed: false, runtime, error: error.message, providerCalls, pageErrors }))
  throw error
} finally {
  fs.writeFileSync(path.join(runtime, 'denied-targets.json'), JSON.stringify([...deniedTargets]))
  await browser.close()
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit') }
}
