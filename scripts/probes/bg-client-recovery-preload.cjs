'use strict'
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
if (process.env.POCKETRISU_NATIVE_BROWSER_PROBE !== '1'
  || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-native-browser-'))) {
  throw new Error('This preload is restricted to the synthetic browser probe')
}
const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }))
  return listen.apply(this, args)
}
globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  if (!url.startsWith('https://native-input.example.test/')) throw new Error('Denied synthetic server outbound request')
  const body = typeof init.body === 'string' ? init.body : Buffer.from(init.body || []).toString('utf8')
  const inputSeen = body.includes('Synthetic recovery message')
  const effectSeen = body.includes('accepted in app')
  process.send?.({ event: 'provider', url, signalPresent: !!init.signal, inputSeen, effectSeen })
  await new Promise((resolve, reject) => {
    const cleanup = () => { process.off('message', release); init.signal?.removeEventListener('abort', abort) }
    const release = message => {
      if (message?.event !== 'release-main') return
      cleanup(); resolve()
    }
    const abort = () => { cleanup(); reject(new Error('Synthetic provider was aborted')) }
    process.on('message', release)
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) abort()
  })
  return Response.json({ choices: [{ message: { role: 'assistant', content: 'Synthetic server answer' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2, completion_tokens: 3 } })
}
