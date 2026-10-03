import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { generateKeyPairSync } from 'node:crypto'
import { createServer } from 'node:http'

const rootArgument = process.argv.slice(2).find(value => !value.startsWith('--'))
if (!rootArgument) throw new Error('Usage: node scripts/probe-bg-native-input.mjs <built-target-root> [--lua] [--mask] [--provider-error] [--editinput]')
const root = path.resolve(rootArgument)
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'g16-native-probe-'))
process.chdir(scratch)
const calls = []
const lua = process.argv.includes('--lua')
const luaLLM = process.argv.includes('--lua-llm')
const similarity = process.argv.includes('--similarity')
const editInput = process.argv.includes('--editinput')
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const adapter = option('adapter') || 'openai-compatible'
const modelMode = option('mode') || 'model'
if (!['openai-compatible', 'anthropic-messages', 'google-gemini'].includes(adapter)) throw new Error('Unknown adapter')
const moduleBinding = process.argv.includes('--module')
const streaming = process.argv.includes('--stream')
const endpointOverride = process.argv.includes('--endpoint-override')
const classic = option('classic')
const unsupported = option('unsupported')
const vertex = process.argv.includes('--vertex')
const serverShim = process.argv.includes('--server-shim') || vertex
const localHttp = process.argv.includes('--local-http')
const credentialSource = option('credential') || 'direct'
const tokenCalls = []
const realFetch = globalThis.fetch
let localOrigin = ''
let localServer
if (localHttp) {
  localServer = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    try {
      const result = await syntheticFetch(localOrigin + request.url, {
        headers: request.headers, body: Buffer.concat(chunks),
      })
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(Buffer.from(await result.arrayBuffer()))
    } catch {
      response.writeHead(500)
      response.end('synthetic fixture failure')
    }
  })
  await new Promise((resolve, reject) => { localServer.once('error', reject); localServer.listen(0, '127.0.0.1', resolve) })
  localOrigin = `http://127.0.0.1:${localServer.address().port}`
}
if (unsupported && !['interactive_ui', 'image_generation', 'browser_model_provider'].includes(unsupported)) throw new Error('Unknown unsupported fixture')
if (classic && !['reverse_proxy', 'xcustom'].includes(classic)) throw new Error('Unknown classic route')
if (classic && moduleBinding) throw new Error('Classic and module fixtures are separate')
if (!['model', 'submodel', 'memory', 'emotion', 'translate', 'otherAx'].includes(modelMode)) throw new Error('Unknown model mode')
async function syntheticFetch(input, init = {}) {
  let url = String(input)
  let headers = init.headers || {}
  if (url === '/api/token/refresh' || url === '/api/test_auth') {
    return Response.json({ status: 'success', token: 'synthetic' })
  }
  if (url === '/api/request-logs') return Response.json({ ok: true })
  if (url === 'https://oauth2.googleapis.com/token' && vertex) {
    const parameters = new URLSearchParams(init.body)
    const assertion = parameters.get('assertion')?.split('.')
    if (parameters.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer'
      || assertion?.length !== 3 || !assertion[2]) throw new Error('Invalid synthetic OAuth exchange')
    const payload = JSON.parse(Buffer.from(assertion[1], 'base64url').toString())
    if (payload.aud !== url || payload.iss !== 'synthetic@example.test') throw new Error('Wrong OAuth audience or issuer')
    tokenCalls.push({ signed: true })
    return Response.json({ access_token: 'synthetic-access-token', token_type: 'Bearer', expires_in: 3600 })
  }
  if (url === '/lua/json.lua') return new Response(fs.readFileSync(path.join(root, 'dist/lua/json.lua'), 'utf8'))
  if (url === '/proxy2') {
    url = decodeURIComponent(headers['risu-url'])
    headers = JSON.parse(decodeURIComponent(headers['risu-header']))
  }
  if (!url.startsWith('https://native-input.example.test/')
    && !(localOrigin && url.startsWith(localOrigin + '/'))
    && !(vertex && url.startsWith('https://aiplatform.googleapis.com/v1/projects/synthetic-project/'))) {
    throw new Error('Unexpected probe request: ' + url)
  }
  const body = JSON.parse(new TextDecoder().decode(init.body instanceof Uint8Array ? init.body : new TextEncoder().encode(init.body)))
  if (similarity && url.endsWith('/embeddings')) {
    const inputs = Array.isArray(body.input) ? body.input : [body.input]
    calls.push({ url, model: body.model, embeddingInput: inputs, headers: Object.fromEntries(new Headers(headers)) })
    return Response.json({ data: inputs.map((text, index) => ({ index,
      embedding: text.includes('alpha') ? [1, 0] : [0, 1] })) })
  }
  calls.push({ url, model: body.model, messages: body.messages, contents: body.contents,
    headers: Object.fromEntries(new Headers(headers)), streaming: body.stream === true || url.includes(':streamGenerateContent') })
  if (process.argv.includes('--provider-error')) return Response.json({ error: { message: 'synthetic provider failure' } }, { status: 500 })
  if (streaming) {
    const frames = adapter === 'anthropic-messages' ? [
      { type: 'message_start', message: { id: 'synthetic-response', usage: { input_tokens: 2 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'synthetic input result' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ] : adapter === 'google-gemini' ? [
      { candidates: [{ content: { role: 'model', parts: [{ text: 'synthetic input result' }] } }] },
      { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] },
    ] : [
      { choices: [{ delta: { content: 'synthetic input result' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]
    return new Response(frames.map(frame => (frame.type ? `event: ${frame.type}\n` : '')
      + `data: ${JSON.stringify(frame)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  if (adapter === 'anthropic-messages') return Response.json({
    id: 'synthetic-response', type: 'message', role: 'assistant',
    content: [{ type: 'text', text: 'synthetic input result' }], stop_reason: 'end_turn',
    usage: { input_tokens: 2, output_tokens: 3 },
  })
  if (adapter === 'google-gemini') return Response.json({
    candidates: [{ content: { role: 'model', parts: [{ text: 'synthetic input result' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
  })
  return Response.json({ choices: [{ message: { role: 'assistant', content: 'synthetic input result' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } })
}
globalThis.fetch = (input, init) => localOrigin && String(input).startsWith(localOrigin + '/')
  ? realFetch(input, init) : syntheticFetch(input, init)
if (serverShim) {
  // Execute the unchanged generated server module and expose its actual loader
  // only inside this synthetic process. The registered production API is intact.
  const filename = path.join(root, 'server/node/bgOrchestrator.cjs')
  const source = fs.readFileSync(filename, 'utf8')
  const load = new Function('require', 'module', '__dirname', source + '\nreturn loadBundle;')(
    createRequire(filename), { exports: {} }, path.dirname(filename))
  await load()
} else {
  await import(pathToFileURL(path.join(root, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href)
  await import(pathToFileURL(path.join(root, 'server/node/bgOrchBundle.mjs')).href)
}
const bg = globalThis.__bgOrch
const db = bg.dbmod.getDatabase()
const preset = {
  id: 'synthetic-preset', name: 'Synthetic', createdAt: 100, updatedAt: 100, useStreaming: streaming,
  profileSnapshot: {
    profileId: 'synthetic:standard', profileVersion: 1, providerBaseId: 'synthetic', providerBaseVersion: 1,
    adapterKind: adapter, auth: { kind: adapter === 'google-gemini' ? 'x-goog-api-key'
      : adapter === 'anthropic-messages' ? 'x-api-key' : 'bearer', fields: ['apiKey'] },
    endpoint: { kind: 'static', url: (localOrigin || 'https://native-input.example.test') + '/'
      + (adapter === 'google-gemini' ? 'v1beta/models' : adapter === 'anthropic-messages' ? 'v1/messages' : 'v1/chat/completions') },
    modelId: 'synthetic-model', schema: [
      { key: 'apiKey', type: 'string', label: 'Key', secret: true, mapsTo: { target: 'auth', path: 'apiKey' } },
      { key: 'modelId', type: 'string', label: 'Model', default: 'synthetic-model', mapsTo: { target: 'body', path: 'model' } },
    ], uiSchema: { groups: [], fields: [] }, defaults: { max_tokens: 128 }, headerTemplate: { 'Content-Type': 'application/json' }, capabilities: ['streaming'],
  }, userValues: { apiKey: 'synthetic-key' },
}
let serviceAccount
if (vertex) {
  if (classic || adapter === 'anthropic-messages') throw new Error('Vertex fixture requires native OpenAI/Gemini preset')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  serviceAccount = JSON.stringify({ type: 'service_account', project_id: 'synthetic-project',
    private_key: privateKey, client_email: 'synthetic@example.test', token_uri: 'https://oauth2.googleapis.com/token' })
  preset.profileSnapshot.auth = { kind: 'google-service-account', fields: ['apiKey'] }
  preset.profileSnapshot.endpoint = { kind: adapter === 'google-gemini' ? 'vertex-gemini' : 'vertex-openai' }
  preset.userValues.apiKey = serviceAccount
}
if (endpointOverride) {
  preset.profileSnapshot.schema.push({ key: 'endpointUrl', type: 'string', label: 'Endpoint',
    mapsTo: { target: 'custom', path: 'endpointUrl' } })
  preset.userValues.endpointUrl = vertex
    ? (localOrigin || 'https://native-input.example.test') + (adapter === 'google-gemini' ? '/override/models' : '/override/chat/completions')
    : preset.profileSnapshot.endpoint.url.replace(new URL(preset.profileSnapshot.endpoint.url).origin + '/',
      new URL(preset.profileSnapshot.endpoint.url).origin + '/override/')
}
const chat = { id: 'synthetic-chat', name: 'Synthetic', message: [], scriptstate: {}, useModelPreset: true,
  modelBinding: { main: preset.id, sub: preset.id } }
const character = { type: 'character', chaId: 'synthetic-character', name: 'Synthetic', chats: [chat], chatPage: 0,
  lowLevelAccess: true, defaultVariables: '', customscript: [], lorebook: [],
  triggerscript: [{ comment: 'input test', type: 'input', conditions: [], effect: [
    { type: 'v2RunLLM', valueType: 'value', value: 'synthetic question', outputVar: 'nativeResult', model: modelMode, streaming, indent: 0 },
  ] }],
}
Object.assign(db, { characters: [character], modelPresets: [preset], nodeOnlyModelModeLock: 'none',
  enabledModules: [], modules: [], plugins: [], personas: [], templateDefaultVariables: '',
  globalChatVariables: {}, statics: {}, requestRetrys: 0,
  fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] },
  nodeOnlyServerSideRequests: false, requestLogEnabled: false, moduleModelBindingsEnabled: false })
if (vertex && credentialSource !== 'direct') {
  delete preset.userValues.apiKey
  if (credentialSource === 'pool') {
    preset.apiKeyRef = 'synthetic-pool'
    db.apiKeyPool = { 'synthetic-pool': { key: serviceAccount } }
  } else if (credentialSource === 'inline') preset.inlineCredential = serviceAccount
  else throw new Error('Unknown credential fixture')
}
if (moduleBinding) {
  db.moduleModelBindingsEnabled = true
  db.moduleModelBindings = { 'synthetic-module': preset.id }
  character.triggerscript[0].moduleId = 'synthetic-module'
  chat.useModelPreset = false
  // A wrong module selection must fail the probe rather than accidentally use
  // the same preset through the chat binding.
  // These remain eligible native defaults, but their upstream URL is denied by
  // syntheticFetch. A missing module override cannot pass the endpoint assertion.
  db.aiModel = 'gpt-4o'
  db.subModel = 'gpt-4o'
}
if (classic) {
  chat.useModelPreset = false
  db.useStreaming = streaming
  const modelId = classic === 'xcustom' ? 'xcustom:::synthetic' : classic
  db.aiModel = modelId
  db.subModel = modelId
  const format = adapter === 'anthropic-messages' ? 2 : adapter === 'google-gemini' ? 5 : 0
  // Classic Google accepts the API base; the preset adapter accepts the models
  // base. Supplying the same base to both would duplicate the /models segment.
  const endpoint = (endpointOverride ? preset.userValues.endpointUrl : preset.profileSnapshot.endpoint.url)
    .replace(adapter === 'google-gemini' ? /\/models$/ : /$^/, '')
  if (classic === 'reverse_proxy') {
    db.customAPIFormat = format
    db.forceReplaceUrl = endpoint
    db.customProxyRequestModel = 'synthetic-model'
    db.proxyKey = 'synthetic-key'
  } else {
    db.customModels = [{ id: modelId, name: 'Synthetic', internalId: 'synthetic-model',
      format, flags: [], tokenizer: 0, url: endpoint, key: 'synthetic-key' }]
  }
}
bg.dbmod.setDatabase(db)
bg.stores.selectedCharID.set(0)
if (option('export-empty-fixture') || option('export-browser-fixture')) {
  if (option('export-empty-fixture')) db.characters = []
  else {
    db.characterOrder = [character.chaId]
    chat.modelBinding.separateAux = false
    chat.modelBinding.aux = { memory: '', emotion: '', translate: '', otherAx: '' }
    Object.assign(character, { firstMessage: '', desc: 'Chosen value: {{getvar::dialogResult}}', notes: '', chatFolders: [], emotionImages: [], bias: [],
      viewScreen: 'none', globalLore: [], sdData: [], utilityBot: false, exampleMessage: '', creatorNotes: '',
      systemPrompt: '', postHistoryInstructions: '', alternateGreetings: [], tags: [], creator: '',
      characterVersion: '', personality: '', scenario: '', firstMsgIndex: -1, replaceGlobalNote: '', additionalText: '' })
    Object.assign(chat, { note: '', localLore: [] })
    character.triggerscript[0].effect = [{ type: 'triggerlua', code:
      'onInput = async(function(id) local answer = alertInput(id, "Synthetic recovery question"):await(); setChatVar(id, "dialogResult", answer) end)' }]
  }
  db.username = 'Synthetic'
  db.language = 'en'
  fs.writeFileSync(path.resolve(option('export-empty-fixture') || option('export-browser-fixture')), JSON.stringify(db))
  process.exit(0)
}
if (lua) character.triggerscript[0].effect = [{ type: 'triggerlua', code:
  'function onInput(id) setChatVar(id, "nativeResult", "lua-input-result") end\n'
  + (editInput ? 'listenEdit("editInput", function(id, text, meta) return text .. " [lua]" end)' : '') }]
if (luaLLM) character.triggerscript[0].effect = [{ type: 'triggerlua', code:
  `onInput = async(function(id) local r = LLM(id, {{role="user", content="synthetic question"}}, false, {streaming=${streaming}}); setChatVar(id, "nativeResult", r.success and r.result or "null") end)` }]
if (similarity) {
  db.hypaModel = 'custom'
  db.hypaCustomSettings = { url: (localOrigin || 'https://native-input.example.test') + '/v1',
    key: 'synthetic-key', model: 'synthetic-embedding' }
  character.triggerscript[0].effect = [{ type: 'v2CheckSimilarity', sourceType: 'value', source: 'alpha',
    valueType: 'value', value: 'alpha§beta', outputVar: 'nativeResult', indent: 0 }]
}
if (unsupported === 'interactive_ui' || unsupported === 'image_generation') {
  const api = unsupported === 'interactive_ui' ? 'alertInput' : 'generateImage'
  character.triggerscript[0].effect = [{ type: 'triggerlua', code:
    `onInput = async(function(id) pcall(function() ${api}(id, "synthetic question"):await() end) end)` },
    { type: 'v2RunLLM', valueType: 'value', value: 'synthetic question',
      outputVar: 'afterUnsupported', model: 'model', indent: 0 }]
}
if (unsupported === 'browser_model_provider') {
  chat.useModelPreset = false
  db.aiModel = 'pluginmodel:::unavailable'
  db.subModel = 'pluginmodel:::unavailable'
}
if (editInput) character.customscript = [{ types: ['editinput'], in: 'raw input', out: 'regex input', flag: 'g', ableFlag: true }]
if (process.argv.includes('--mask')) {
  delete globalThis.document
  delete globalThis.location
}
let ok = false
try {
  const admission = bg.inputPolicy.evaluateServerInputModels(db, chat)
  if (process.argv.includes('--expect-client-network-route')) {
    if (admission.kind !== 'client-prepared' || admission.reason !== 'client-network-route') {
      throw new Error('Browser-local route was not retained on its preparation path')
    }
  } else if (!unsupported && admission.kind !== 'server-input') {
    throw new Error('Fixture route was not eligible for server input')
  }
  const { default: transformer } = await import(pathToFileURL(path.join(root, 'server/node/serverChatInputTransform.cjs')).href)
  const transformed = await transformer.transformServerChatInput(character, chat,
    { rawText: 'raw input', userMessageId: 'synthetic-input', submittedAt: 123 },
    bg.triggers, bg.scripts, value => { character.chats[0] = value })
  const result = { chat: transformed }
  console.log(JSON.stringify({ admission, adapter, modelMode, moduleBinding, streaming, endpointOverride, classic, vertex, credentialSource, serverShim, localHttp,
    tokenCalls: tokenCalls.length, calls, resultVariables: result.chat.scriptstate, input: result.chat.message.at(-1).data }))
  ok = lua && !luaLLM ? calls.length === 0 && result?.chat?.scriptstate?.$nativeResult === 'lua-input-result'
    : calls.length === 1 && result?.chat?.scriptstate?.$nativeResult === (process.argv.includes('--provider-error') ? 'null' : 'synthetic input result')
  if (similarity) ok = calls.length === 2 && result.chat.scriptstate.$nativeResult === 'alpha§beta'
    && calls.every(call => call.url === db.hypaCustomSettings.url + '/embeddings'
      && call.model === 'synthetic-embedding' && call.headers.authorization === 'Bearer synthetic-key')
  ok = ok && result.chat.message.at(-1).chatId === 'synthetic-input'
    && result.chat.message.at(-1).data === (editInput ? (lua ? 'regex input [lua]' : 'regex input') : 'raw input')
  if ((!lua || luaLLM) && !similarity) {
    const vertexBase = 'https://aiplatform.googleapis.com/v1/projects/synthetic-project/locations/global/'
      + (adapter === 'google-gemini' ? 'publishers/google/models' : 'endpoints/openapi/chat/completions')
    let expectedUrl = (endpointOverride ? preset.userValues.endpointUrl : vertex ? vertexBase : preset.profileSnapshot.endpoint.url)
      + (adapter === 'google-gemini' ? '/synthetic-model:' + (streaming ? 'streamGenerateContent?alt=sse' : 'generateContent') : '')
    if (classic && adapter === 'google-gemini') expectedUrl = expectedUrl.replace('?alt=sse', '')
      + '?key=synthetic-key' + (streaming ? '&alt=sse' : '')
    const authHeader = vertex ? 'authorization' : adapter === 'google-gemini' ? 'x-goog-api-key' : adapter === 'anthropic-messages' ? 'x-api-key' : 'authorization'
    const expectedCredential = vertex ? 'Bearer synthetic-access-token' : adapter === 'openai-compatible' ? 'Bearer synthetic-key' : 'synthetic-key'
    const credentialMatches = classic && adapter === 'google-gemini'
      ? calls[0]?.headers[authHeader] === undefined && new URL(calls[0].url).searchParams.get('key') === 'synthetic-key'
      : calls[0]?.headers[authHeader] === expectedCredential
    ok = ok && calls[0]?.url === expectedUrl && credentialMatches
      && calls[0]?.streaming === streaming
    const requestMessages = adapter === 'google-gemini' ? calls[0]?.contents : calls[0]?.messages
    ok = ok && JSON.stringify(requestMessages).includes('synthetic question')
      && (adapter === 'google-gemini' || calls[0]?.model === 'synthetic-model')
    if (vertex) ok = ok && tokenCalls.length === 1
  }
} catch (error) {
  console.log(JSON.stringify({ probeError: error?.name, message: error?.message, code: error?.code, api: error?.api, calls: calls.length }))
  ok = !!unsupported && error?.code === 'BG_INPUT_HOST_UNSUPPORTED' && error?.api === unsupported
    && calls.length === 0 && !character.chats[0].message.some(message => message.chatId === 'synthetic-input')
} finally {
  if (localServer) await new Promise(resolve => { localServer.close(resolve); localServer.closeAllConnections() })
  process.exit(ok ? 0 : 2)
}
