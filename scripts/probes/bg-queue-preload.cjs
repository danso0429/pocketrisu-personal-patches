'use strict'
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
if (process.env.POCKETRISU_QUEUE_PROBE !== '1'
  || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-queue-browser-'))) {
  throw new Error('Restricted to the synthetic queue probe')
}
const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number' || typeof args[0] === 'string') {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1'
    else args.splice(1, 0, '127.0.0.1')
  }
  this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }))
  return listen.apply(this, args)
}
let calls = 0
globalThis.fetch = async (input, init = {}) => {
  if (!String(input).startsWith('https://native-input.example.test/')) throw new Error('Denied outbound request')
  const call = ++calls
  const body = typeof init.body === 'string' ? init.body : Buffer.from(init.body || []).toString('utf8')
  process.send?.({ event: 'provider', call, previousAnswer: body.includes('Synthetic queue answer 1'),
    firstInput: body.includes('Synthetic queue input 1'), secondInput: body.includes('Synthetic queue input 2') })
  await new Promise((resolve, reject) => {
    const cleanup = () => { process.off('message', release); init.signal?.removeEventListener('abort', abort) }
    const release = message => {
      if (message?.event !== 'release' || message.call !== call) return
      cleanup(); resolve()
    }
    const abort = () => { cleanup(); reject(new Error('Synthetic provider aborted')) }
    process.on('message', release)
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) abort()
  })
  return Response.json({ choices: [{ message: { role: 'assistant', content: `Synthetic queue answer ${call}` }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2, completion_tokens: 3 } })
}
