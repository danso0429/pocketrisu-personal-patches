import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const rootArgument = process.argv.slice(2).find(value => !value.startsWith('--'))
if (!rootArgument) throw new Error('Usage: node scripts/probe-bg-native-input.mjs <built-target-root> [--lua] [--mask] [--provider-error] [--editinput]')
const root = path.resolve(rootArgument)
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'g16-native-probe-'))
process.chdir(scratch)
const calls = []
const lua = process.argv.includes('--lua')
const editInput = process.argv.includes('--editinput')
globalThis.fetch = async (input, init = {}) => {
  let url = String(input)
  let headers = init.headers || {}
  if (url === '/api/token/refresh' || url === '/api/test_auth') {
    return Response.json({ status: 'success', token: 'synthetic' })
  }
  if (url === '/api/request-logs') return Response.json({ ok: true })
  if (url === '/lua/json.lua') return new Response(fs.readFileSync(path.join(root, 'dist/lua/json.lua'), 'utf8'))
  if (url === '/proxy2') {
    url = decodeURIComponent(headers['risu-url'])
    headers = JSON.parse(decodeURIComponent(headers['risu-header']))
  }
  if (!url.startsWith('https://native-input.example.test/')) {
    throw new Error('Unexpected probe request: ' + url)
  }
  const body = JSON.parse(new TextDecoder().decode(init.body instanceof Uint8Array ? init.body : new TextEncoder().encode(init.body)))
  calls.push({ url, model: body.model, messages: body.messages, authorization: headers.Authorization || headers.authorization })
  if (process.argv.includes('--provider-error')) return Response.json({ error: { message: 'synthetic provider failure' } }, { status: 500 })
  return Response.json({ choices: [{ message: { role: 'assistant', content: 'synthetic input result' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } })
}
await import(pathToFileURL(path.join(root, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href)
await import(pathToFileURL(path.join(root, 'server/node/bgOrchBundle.mjs')).href)
const bg = globalThis.__bgOrch
const db = bg.dbmod.getDatabase()
const preset = {
  id: 'synthetic-preset', name: 'Synthetic', createdAt: 100, updatedAt: 100,
  profileSnapshot: {
    profileId: 'synthetic:standard', profileVersion: 1, providerBaseId: 'synthetic', providerBaseVersion: 1,
    adapterKind: 'openai-compatible', auth: { kind: 'bearer', fields: ['apiKey'] },
    endpoint: { kind: 'static', url: 'https://native-input.example.test/v1/chat/completions' },
    modelId: 'synthetic-model', schema: [
      { key: 'apiKey', type: 'string', label: 'Key', secret: true, mapsTo: { target: 'auth', path: 'apiKey' } },
      { key: 'modelId', type: 'string', label: 'Model', default: 'synthetic-model', mapsTo: { target: 'body', path: 'model' } },
    ], uiSchema: { groups: [], fields: [] }, defaults: {}, headerTemplate: { 'Content-Type': 'application/json' }, capabilities: [],
  }, userValues: { apiKey: 'synthetic-key' },
}
const chat = { id: 'synthetic-chat', name: 'Synthetic', message: [], scriptstate: {}, useModelPreset: true,
  modelBinding: { main: preset.id, sub: preset.id } }
const character = { type: 'character', chaId: 'synthetic-character', name: 'Synthetic', chats: [chat], chatPage: 0,
  lowLevelAccess: true, defaultVariables: '', customscript: [], lorebook: [],
  triggerscript: [{ comment: 'input test', type: 'input', conditions: [], effect: [
    { type: 'v2RunLLM', valueType: 'value', value: 'synthetic question', outputVar: 'nativeResult', model: 'model', indent: 0 },
  ] }],
}
Object.assign(db, { characters: [character], modelPresets: [preset], nodeOnlyModelModeLock: 'none',
  enabledModules: [], modules: [], plugins: [], personas: [], templateDefaultVariables: '',
  globalChatVariables: {}, statics: {}, requestRetrys: 0,
  fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] },
  nodeOnlyServerSideRequests: false, requestLogEnabled: false, moduleModelBindingsEnabled: false })
bg.dbmod.setDatabase(db)
bg.stores.selectedCharID.set(0)
if (lua) character.triggerscript[0].effect = [{ type: 'triggerlua', code:
  'function onInput(id) setChatVar(id, "nativeResult", "lua-input-result") end\n'
  + (editInput ? 'listenEdit("editInput", function(id, text, meta) return text .. " [lua]" end)' : '') }]
if (editInput) character.customscript = [{ types: ['editinput'], in: 'raw input', out: 'regex input', flag: 'g', ableFlag: true }]
if (process.argv.includes('--mask')) {
  delete globalThis.document
  delete globalThis.location
}
let ok = false
try {
  const { default: transformer } = await import(pathToFileURL(path.join(root, 'server/node/serverChatInputTransform.cjs')).href)
  const transformed = await transformer.transformServerChatInput(character, chat,
    { rawText: 'raw input', userMessageId: 'synthetic-input', submittedAt: 123 },
    bg.triggers, bg.scripts, value => { character.chats[0] = value })
  const result = { chat: transformed }
  console.log(JSON.stringify({ calls, resultVariables: result.chat.scriptstate, input: result.chat.message.at(-1).data }))
  ok = lua ? calls.length === 0 && result?.chat?.scriptstate?.$nativeResult === 'lua-input-result'
    : calls.length === 1 && result?.chat?.scriptstate?.$nativeResult === (process.argv.includes('--provider-error') ? 'null' : 'synthetic input result')
  ok = ok && result.chat.message.at(-1).chatId === 'synthetic-input'
    && result.chat.message.at(-1).data === (editInput ? (lua ? 'regex input [lua]' : 'regex input') : 'raw input')
} catch (error) {
  console.log(JSON.stringify({ probeError: error?.name, message: error?.message }))
} finally {
  process.exit(ok ? 0 : 2)
}
