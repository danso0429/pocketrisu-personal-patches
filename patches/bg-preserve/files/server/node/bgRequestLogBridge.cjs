'use strict'

const MAX_BG_REQUEST_LOG_BODY_BYTES = 100 * 1024 * 1024

function response(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function headerValue(headers, name) {
    if (!headers) return null
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get(name)
    }
    if (Array.isArray(headers)) {
        const found = headers.find((entry) =>
            Array.isArray(entry) && String(entry[0]).toLowerCase() === name.toLowerCase()
        )
        return found ? String(found[1]) : null
    }
    if (typeof headers === 'object') {
        const key = Object.keys(headers).find((candidate) =>
            candidate.toLowerCase() === name.toLowerCase()
        )
        return key ? String(headers[key]) : null
    }
    return null
}

function parseBgRequestLogBatch(init = {}, maxBytes = MAX_BG_REQUEST_LOG_BODY_BYTES) {
    if (String(init.method || '').toUpperCase() !== 'POST') return null
    const contentType = headerValue(init.headers, 'content-type')
    const auth = headerValue(init.headers, 'risu-auth')
    if (!contentType || !contentType.toLowerCase().includes('application/json')) return null
    if (!auth || !auth.trim()) return null
    if (typeof init.body !== 'string') return null
    if (Buffer.byteLength(init.body, 'utf8') > maxBytes) return null

    try {
        const payload = JSON.parse(init.body)
        return Array.isArray(payload) && payload.length > 0 ? payload : null
    } catch {
        return null
    }
}

async function deliverBgRequestLog(requestLogs, entries) {
    if (!requestLogs || typeof requestLogs.addRequestLogBatch !== 'function') {
        return response(503, { success: false, written: 0 })
    }
    if (!Array.isArray(entries) || entries.length === 0) {
        return response(400, { success: false, written: 0 })
    }

    try {
        const written = requestLogs.addRequestLogBatch(entries)
        return response(200, { success: true, written })
    } catch {
        // Request logging and usage accounting are observational. A DB failure
        // must never reject the paid provider request or its result pipeline.
        return response(500, { success: false, written: 0 })
    }
}

module.exports = {
    MAX_BG_REQUEST_LOG_BODY_BYTES,
    deliverBgRequestLog,
    parseBgRequestLogBatch,
}
