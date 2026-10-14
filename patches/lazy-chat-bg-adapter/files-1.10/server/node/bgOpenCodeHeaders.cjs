'use strict';
const { createHash } = require('node:crypto');

const SESSION_HEADER = 'x-opencode-session';
const USER_AGENT = 'PocketRisu-BGPluginHost/1';

function completeOpenCodeSessionHeaders(url, options, operation) {
    let target;
    try { target = new URL(url); } catch { return options; }
    if (target.protocol !== 'https:' || target.hostname !== 'opencode.ai' || target.port
        || target.username || target.password
        || !['/zen/go/', '/inference/go/'].some(prefix => target.pathname.startsWith(prefix))
        || String(options.method ?? 'POST').toUpperCase() !== 'POST') return options;
    const ids = [operation?.charId, operation?.chatId];
    if (ids.some(id => typeof id !== 'string' || !id || id.length > 255)) return options;
    const original = options.headers;
    // Keep existing non-record formats unchanged: proxy serialization does not
    // support them consistently, and secret-header references must not be coerced.
    if (original != null && (typeof original !== 'object' || Array.isArray(original)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(original)))) return options;
    const names = Object.keys(original ?? {}).map(name => name.toLowerCase());
    const needsSession = !names.includes(SESSION_HEADER);
    const needsAgent = !names.includes('user-agent');
    if (!needsSession && !needsAgent) return options;
    const headers = { ...(original ?? {}) };
    if (needsSession) headers[SESSION_HEADER] = createHash('sha256')
        .update('pocketrisu-go-session:v1\0' + JSON.stringify(ids)).digest('hex');
    if (needsAgent) headers['User-Agent'] = USER_AGENT;
    return { ...options, headers };
}

module.exports = { completeOpenCodeSessionHeaders };
