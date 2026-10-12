'use strict'
const { setImmediate, clearImmediate } = require('node:timers')

// The native display loop keeps its 125ms coalescing. Its final frame is an
// event-loop turn on Node, not a browser refresh or a model-execution deadline.
function installBgStreamingScheduler(target = globalThis) {
    if (typeof target.requestAnimationFrame === 'function' && typeof target.cancelAnimationFrame === 'function') return false
    if (target.requestAnimationFrame !== undefined || target.cancelAnimationFrame !== undefined) {
        throw new Error('incomplete server streaming scheduler')
    }
    target.requestAnimationFrame = callback => {
        if (typeof callback !== 'function') throw new TypeError('frame callback must be a function')
        return setImmediate(() => {
            try { callback(performance.now()) }
            catch { console.error('[bg-orch] streaming frame callback failed') }
        })
    }
    target.cancelAnimationFrame = handle => clearImmediate(handle)
    return true
}

module.exports = { installBgStreamingScheduler }
