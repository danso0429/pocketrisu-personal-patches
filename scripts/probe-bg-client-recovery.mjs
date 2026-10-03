// Isolated real-browser qualification. This script never uses a live save directory.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const [rootArgument, dependencyArgument, browserArgument, fixtureArgument] = process.argv.slice(2)
if (!rootArgument || !dependencyArgument || !browserArgument || !fixtureArgument) {
  throw new Error('Usage: node probe-bg-client-recovery.mjs <generated-target> <playwright-dependency-root> <chromium> <synthetic-fixture.json>')
}
const root = path.resolve(rootArgument)
const dependencyRoot = path.resolve(dependencyArgument)
const browserPath = path.resolve(browserArgument)
const fixturePath = path.resolve(fixtureArgument)
const saveOrder = process.argv[6] || 'normal'
if (!['normal', 'save-before-attach', 'save-after-attach', 'rename-before-send'].includes(saveOrder)) throw new Error('Unknown save-order fixture')
const saveRace = saveOrder.startsWith('save-')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
if (fixture.characters?.length !== 1 || fixture.characters[0].chaId !== 'synthetic-character'
  || fixture.characters[0].chats?.[0]?.id !== 'synthetic-chat' || fixture.plugins?.length !== 0) {
  throw new Error('Only the synthetic browser fixture is accepted')
}
if (saveRace) fixture.characters[0].triggerscript[0].effect[0].code +=
  '\nlistenEdit("editInput", function(id, text, meta) sleep(id, 5000):await(); return text end)'
const require = createRequire(path.join(dependencyRoot, 'package.json'))
const { chromium } = require('playwright')
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-native-browser-'))
process.chdir(runtime)
fs.symlinkSync(path.join(root, 'dist'), path.join(runtime, 'dist'))
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }))
const worker = fork(root + '/server/node/bgServerChatProcessClient.cjs', [], { cwd: runtime, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
worker.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: root,
  password: createHash('sha256').update('synthetic-browser-password').digest('hex'), databaseBase64: Buffer.from(JSON.stringify(fixture)).toString('base64') })
const [seedExit] = await once(worker, 'exit')
if (seedExit !== 0) throw new Error('Synthetic fixture seeding failed')
const server = fork(root + '/server/node/server.cjs', [], { cwd: runtime, execArgv: ['--require', path.join(import.meta.dirname, 'probes/bg-client-recovery-preload.cjs')],
  env: { ...process.env, PORT: '0', POCKETRISU_NATIVE_BROWSER_PROBE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
const log = fs.createWriteStream(path.join(runtime, 'server.log'))
server.stdout.pipe(log); server.stderr.pipe(log)
const port = await new Promise((resolve, reject) => {
  server.on('message', message => { if (message.event === 'ready') resolve(message.port) })
  server.once('exit', code => reject(new Error('Server exited ' + code)))
})
let providerCalls = 0
let providerInputSeen = false, providerEffectSeen = false
let startedMain
const mainStarted = new Promise(resolve => { startedMain = resolve })
server.on('message', message => { if (message.event === 'provider') {
  providerCalls++; providerInputSeen = message.inputSeen; providerEffectSeen = message.effectSeen; startedMain()
} })
const backend = `http://127.0.0.1:${port}`
const origin = backend
const browser = await chromium.launch({ headless: true,
  executablePath: browserPath })
const context = await browser.newContext()
let claimSeen = false, attachmentSeen = false, racedWrites = 0, releaseWrites
const writesMayProceed = new Promise(resolve => { releaseWrites = resolve })
const { decodeRisuSave: decodeProbeSave } = createRequire(root + '/package.json')('./server/node/utils.cjs')
const denied = []
await context.route('**/*', async route => {
  const url = route.request().url()
  if (saveRace && claimSeen && !attachmentSeen
    && route.request().method() === 'POST' && new URL(url).pathname.startsWith('/api/chat-content/')) {
    const bytes = route.request().postDataBuffer()
    let body
    try { body = url.endsWith('/patch') ? JSON.parse(bytes.toString()) : await decodeProbeSave(bytes) } catch {}
    const serialized = JSON.stringify(body)
    if (serialized?.includes('dialogResult')) {
      if (serialized.includes('Synthetic recovery message')) throw new Error('Expected a save made before user input attachment')
      racedWrites++
      if (saveOrder === 'save-after-attach') await writesMayProceed
    }
  }
  if (url.startsWith(origin + '/')) return route.continue()
  if (url.includes('/wasmoon@1.16.0/') && url.endsWith('/glue.wasm')) {
    return route.fulfill({ body: fs.readFileSync(root + '/node_modules/wasmoon/dist/glue.wasm'), contentType: 'application/wasm' })
  }
  denied.push(url)
  return route.abort()
})
const page = await context.newPage()
const errors = [], pageErrors = []
const requests = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('response', async response => {
  const url = new URL(response.url())
  if (url.pathname.endsWith('/api/bg-orchestrate-input/claim') && response.status() === 200) claimSeen = true
  if (url.pathname.endsWith('/api/bg-orchestrate-input/attach') && response.status() === 200) {
    attachmentSeen = true
    releaseWrites()
  }
  if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, status: response.status(),
    ...(url.pathname.startsWith('/api/bg-') ? { body: await response.json().catch(() => null) } : {}) })
})
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByText('Input your password.', { exact: false }).waitFor({ timeout: 30000 })
  await page.locator('input').fill('synthetic-browser-password')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator('[data-char-id="synthetic-character"]').first().click()
  if (saveOrder === 'rename-before-send') {
    const editNames = page.locator('button:has(svg.lucide-pencil):visible').last()
    await editNames.click()
    await page.locator('button[data-risu-chat-idx="0"] input').fill('Renamed synthetic chat')
    await editNames.click()
  }
  await page.locator('textarea').fill('Synthetic recovery message')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const recover = page.getByRole('button', { name: '앱에서 입력 처리 후 서버 생성 (모델 재호출 가능)', exact: true })
  await recover.waitFor({ timeout: 30000 })
  if (providerCalls !== 0) throw new Error('Provider ran before unsupported input recovery')
  await recover.click()
  await page.getByText('Synthetic recovery question', { exact: true }).waitFor({ timeout: 30000 })
  await page.locator('input:visible').last().fill('accepted in app')
  const attachment = page.waitForResponse(response => response.url().endsWith('/api/bg-orchestrate-input/attach'), { timeout: 30000 })
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  const attached = await attachment
  if (attached.status() !== 200 || (await attached.json()).status !== 'attached') throw new Error('Client prepared input was not attached')
  if (saveRace && racedWrites === 0) throw new Error('The requested browser save race was not exercised')
  if (saveOrder === 'save-after-attach') await page.waitForTimeout(1500)
  let timeout
  try {
    await Promise.race([mainStarted, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Server main did not start')), 30000)
    })])
  } finally { clearTimeout(timeout) }
  await page.close()
  server.send({ event: 'release-main' })
  const login = await fetch(backend + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: createHash('sha256').update('synthetic-browser-password').digest('hex') }) })
  const { token } = await login.json()
  const targetRequire = createRequire(root + '/package.json')
  const { decodeRisuSave } = targetRequire('./server/node/utils.cjs')
  let stored
  for (let attempt = 0; attempt < 300; attempt++) {
    const response = await fetch(backend + '/api/chat-content/synthetic-character/0', {
      headers: { 'risu-auth': token, 'x-chat-id': 'synthetic-chat' } })
    if (response.ok) stored = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
    if (stored?.message?.some(message => message.role === 'char' && message.data.includes('Synthetic server answer'))) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const inputs = stored?.message?.filter(message => message.role === 'user' && message.data === 'Synthetic recovery message') || []
  const answers = stored?.message?.filter(message => message.role === 'char' && message.data.includes('Synthetic server answer')) || []
  const passed = pageErrors.length === 0 && providerCalls === 1 && providerInputSeen && providerEffectSeen
    && inputs.length === 1 && answers.length === 1 && stored?.scriptstate?.$dialogResult === 'accepted in app'
    && (saveOrder !== 'rename-before-send' || stored?.name === 'Renamed synthetic chat')
  console.log(JSON.stringify({ runtime, saveOrder, racedWrites, providerCalls, providerInputSeen, providerEffectSeen,
    inputs: inputs.length, answers: answers.length, dialogResult: stored?.scriptstate?.$dialogResult, passed, pageErrors, resourceErrors: errors.length, browser: browser.version() }))
  if (!passed) throw new Error('Browser recovery result mismatch')
  fs.writeFileSync(path.join(runtime, 'requests.json'), JSON.stringify(requests, null, 2))
} catch (error) {
  fs.writeFileSync(path.join(runtime, 'requests.json'), JSON.stringify(requests, null, 2))
  if (!page.isClosed()) {
    fs.writeFileSync(path.join(runtime, 'failure.txt'), await page.locator('body').innerText())
    await page.screenshot({ path: path.join(runtime, 'failure.png') })
  }
  const auth = await fetch(backend + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: createHash('sha256').update('synthetic-browser-password').digest('hex') }) })
  const { token } = await auth.json()
  const response = await fetch(backend + '/api/chat-content/synthetic-character/0', { headers: { 'risu-auth': token, 'x-chat-id': 'synthetic-chat' } })
  if (response.ok) {
    const { decodeRisuSave } = createRequire(root + '/package.json')('./server/node/utils.cjs')
    fs.writeFileSync(path.join(runtime, 'server-chat.json'), JSON.stringify(await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))))
  }
  console.log(JSON.stringify({ runtime, pageErrors, errors, denied, failure: error.message }))
  throw error
} finally {
  releaseWrites()
  await context.close(); await browser.close(); server.kill('SIGTERM')
  await once(server, 'exit')
}
