// Real application/browser, synthetic SQLite database and controlled provider.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const [root, dependencyRoot, browserPath, fixturePath] = process.argv.slice(2)
if (!root || !dependencyRoot || !browserPath || !fixturePath) throw new Error('Expected target, playwright root, chromium, synthetic fixture')
assert.ok(fs.existsSync(browserPath), 'Chromium executable must exist before server startup')
const checkGuards = process.argv.includes('--check-guards')
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
const { decodeRisuSave } = createRequire(path.join(root, 'package.json'))('./server/node/utils.cjs')
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-queue-browser-'))
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
const origin = `http://127.0.0.1:${port}`
const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
const { token } = await login.json()
const readChat = async () => {
  const response = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: { 'risu-auth': token, 'x-chat-id': 'synthetic-chat' } })
  assert.equal(response.status, 200)
  return decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
}
const browser = await chromium.launch({ headless: true, executablePath: browserPath })
const context = await browser.newContext()
await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
const page = await context.newPage()
let secondContext, secondPage
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', async response => {
  if (new URL(response.url()).pathname.startsWith('/api/bg-')) requests.push({ path: new URL(response.url()).pathname,
    status: response.status(), body: await response.json().catch(() => null) })
})
async function until(predicate, label) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 200)) }
  throw new Error('Timed out: ' + label)
}
async function takeTabControl(target) {
  const inactive = target.getByText('Current tab is inactivated since other tab is active.', { exact: false })
  if (!await inactive.isVisible()) return
  await Promise.all([
    target.waitForEvent('domcontentloaded'),
    target.getByRole('button', { name: 'Confirm', exact: true }).click(),
  ])
  await target.locator('[data-char-id="synthetic-character"]').first().click()
  await target.locator('textarea').waitFor()
}
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByText('Input your password.', { exact: false }).waitFor()
  await page.locator('input').fill('synthetic-browser-password')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator('[data-char-id="synthetic-character"]').first().click()
  if (checkGuards) {
    secondContext = await browser.newContext()
    await secondContext.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
    secondPage = await secondContext.newPage()
    await secondPage.goto(origin, { waitUntil: 'domcontentloaded' })
    await secondPage.locator('input').fill('synthetic-browser-password')
    await secondPage.getByRole('button', { name: 'Confirm', exact: true }).click()
    await secondPage.locator('[data-char-id="synthetic-character"]').first().click()
    await until(async () => await secondPage.locator('button.button-icon-reroll.force-show:not([disabled])').count() > 0, 'idle reroll enabled')
    await takeTabControl(page)
  }
  await page.locator('textarea').fill('Synthetic queue input 1')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await until(() => providers.length === 1, 'first provider')
  if (checkGuards) {
    await until(async () => await secondPage.locator('button.button-icon-reroll.force-show:not([disabled])').count() === 0, 'empty-storage tab reroll disabled')
    fs.writeFileSync(path.join(runtime, 'second-tab.txt'), await secondPage.locator('body').innerText())
    assert.ok(await secondPage.locator('button.button-icon-reroll.force-show[disabled]').count() > 0)
    await takeTabControl(secondPage)
    await secondPage.getByRole('button', { name: 'menu', exact: true }).click()
    assert.equal(await secondPage.getByRole('menuitem', { name: 'Continue Response', exact: true }).getAttribute('aria-disabled'), 'true')
    await secondPage.keyboard.press('Escape')
    const activity = await context.request.get(origin + '/api/bg-chat-activity/synthetic-character/synthetic-chat')
    assert.equal(activity.status(), 200)
    assert.equal((await activity.json()).busy, true)
    const oldMain = await fetch(origin + '/api/model-jobs', { method: 'POST',
      headers: { 'risu-auth': token, 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: 'synthetic-chat', targetUrl: 'https://native-input.example.test/v1/chat/completions', body: '{}' }) })
    assert.equal(oldMain.status, 409, 'old bundle main call must not start or fall back')
    await takeTabControl(page)
  }
  await until(async () => (await page.locator('textarea').inputValue()) === '', 'first draft cleared')
  await page.locator('textarea').fill('Synthetic queue input 2')
  await page.locator('textarea').press('Enter')
  await until(() => requests.filter(row => row.path === '/api/bg-orchestrate' && row.body?.accepted === true).length >= 1, 'second input accepted')
  if (checkGuards) {
    await until(async () => (await page.locator('textarea').inputValue()) === '', 'second draft cleared')
    await page.locator('textarea').fill('Synthetic third input kept as draft')
    await page.locator('textarea').press('Enter')
    await until(async () => (await page.locator('body').innerText()).includes('서버 입력을 시작하지 않았어요'), 'third input rejected')
    assert.equal(await page.locator('textarea').inputValue(), 'Synthetic third input kept as draft')
  }
  const before = await readChat()
  assert.equal(before.message.filter(m => m.role === 'user').length, 2, 'queued input must not attach early')
  assert.equal(providers.length, 1)
  server.send({ event: 'release', call: 1 })
  await until(() => providers.length === 2, 'second provider')
  assert.equal(providers[1].previousAnswer, true, 'N+1 must include N answer')
  assert.equal(providers[1].secondInput, true)
  await until(async () => (await page.locator('body').innerText()).includes('Synthetic queue answer 1'), 'first answer displayed while second runs')
  const middle = await readChat()
  assert.deepEqual(middle.message.map(m => m.role), ['user', 'char', 'user', 'char', 'user'])
  await page.close()
  server.send({ event: 'release', call: 2 })
  await until(async () => (await readChat()).message.some(m => m.data.includes('Synthetic queue answer 2')), 'second saved after page closes')
  const final = await readChat()
  assert.deepEqual(final.message.map(m => m.role), ['user', 'char', 'user', 'char', 'user', 'char'])
  assert.equal(providers.length, 2)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, runtime, providers, messages: final.message.length }))
} catch (error) {
  if (!page.isClosed()) fs.writeFileSync(path.join(runtime, 'failure.txt'), await page.locator('body').innerText())
  fs.writeFileSync(path.join(runtime, 'chat.json'), JSON.stringify(await readChat()))
  console.log(JSON.stringify({ passed: false, runtime, providers, errors, failure: error.message }))
  throw error
} finally {
  fs.writeFileSync(path.join(runtime, 'requests.json'), JSON.stringify(requests, null, 2))
  await browser.close(); server.kill('SIGTERM'); await once(server, 'exit')
}
