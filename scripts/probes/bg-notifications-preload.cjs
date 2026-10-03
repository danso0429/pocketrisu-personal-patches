'use strict'
const http = require('node:http')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
if (process.env.POCKETRISU_NOTIFICATION_PROBE !== '1'
  || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-notification-browser-'))) {
  throw new Error('Restricted to the synthetic notification probe')
}
const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) {
  if (typeof args[1] === 'string') args[1] = '127.0.0.1'
  else args.splice(1, 0, '127.0.0.1')
  this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }))
  return listen.apply(this, args)
}
let release, used = false
const gate = new Promise(resolve => { release = resolve })
process.on('message', message => { if (message?.event === 'release-input') release() })
const load = Module._load
Module._load = function (name, parent, ...rest) {
  const value = load.call(this, name, parent, ...rest)
  if (name !== './serverChatInputOwner.cjs' || !parent?.filename.endsWith('/server/node/server.cjs')) return value
  return { ...value, createServerChatInputOwner: deps => {
    const owner = value.createServerChatInputOwner(deps)
    return { ...owner,
      beginTransform: async (...args) => {
        if (!used) { used = true; process.send?.({ event: 'before-input' }); await gate }
        return owner.beginTransform(...args)
      },
      stopUnsupportedInputSynchronously: (...args) => {
        const result = owner.stopUnsupportedInputSynchronously(...args)
        process.send?.({ event: 'input-stopped' })
        return result
      },
    }
  } }
}
globalThis.fetch = async input => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  let target = 'invalid-url'
  try { const parsed = new URL(url); target = parsed.origin + parsed.pathname } catch {}
  process.send?.({ event: url.startsWith('https://native-input.example.test/')
    ? 'unexpected-provider' : 'denied-background-fetch', target })
  throw new Error('Denied synthetic server outbound request')
}
