'use strict';
const assert = require('node:assert/strict');
const { verify } = require('node:crypto');
const { Writable, Readable } = require('node:stream');

// Shared synthetic wire boundary. Errors are recorded independently of MARP's
// catches. This replaces external responses, not host APIs or PDF construction.
function createPdfTransport({ family, publicKey, emit }) {
    return async (input, options = {}) => {
        const url = String(input);
        if (url === '/api/logs' || url === '/api/request-logs') {
            emit({ event: 'allowed-internal' }); return Response.json({ ok: true });
        }
        if (url === 'https://oauth2.googleapis.com/token') {
            try {
                const bytes = typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString();
                const form = new URLSearchParams(bytes);
                assert.equal(options.method, 'POST');
                assert.equal(new Headers(options.headers).get('content-type'), 'application/x-www-form-urlencoded');
                emit({ event: 'oauth-wire', bytes: Buffer.byteLength(bytes),
                    grantPresent: form.has('grant_type'), assertionPresent: form.has('assertion') });
                const jwt = form.get('assertion').split('.');
                assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
                assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).alg, 'RS256');
                assert.ok(verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), publicKey, Buffer.from(jwt[2], 'base64url')));
                const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
                assert.equal(claims.iss, 'synthetic-account@example.invalid');
                assert.equal(claims.aud, url); assert.equal(claims.exp - claims.iat, 3600);
                assert.equal(claims.scope, 'https://www.googleapis.com/auth/cloud-platform');
                emit({ event: 'oauth' });
                return Response.json({ access_token: 'synthetic-oauth', expires_in: 3600 });
            } catch (error) { emit({ event: 'validation-error', code: error.code ?? error.name }); throw error; }
        }
        const selected = url.startsWith('https://analysis.example.test/v1/')
            || url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')
            || url.startsWith('https://generativelanguage.googleapis.com/v1beta/openai/')
            || url.startsWith('https://synthetic-aiplatform.invalid/v1/');
        if (!selected) { emit({ event: 'denied' }); throw Error('synthetic outbound denied'); }
        try {
            const bytes = typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString();
            const body = JSON.parse(bytes), headers = new Headers(options.headers);
            const native = Array.isArray(body.contents);
            const model = native ? new URL(url).pathname.split('/models/')[1].split(':')[0] : body.model;
            const agent = model?.replace(/^fixture-/, '');
            assert.ok(['worldbuilding', 'plot', 'character'].includes(agent));
            assert.equal(options.method, 'POST'); assert.equal(headers.get('content-type'), 'application/json');
            const expectedUrl = native ? family === 'gemini'
                ? 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent'
                : 'https://synthetic-aiplatform.invalid/v1/projects/synthetic/locations/global/publishers/google/models/' + model + ':generateContent'
                : (family === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
                    : family === 'vertex' ? 'https://synthetic-aiplatform.invalid/v1/projects/synthetic/locations/global/endpoints/openapi'
                        : 'https://analysis.example.test/v1') + (family === 'anthropic' ? '/messages' : '/chat/completions');
            assert.equal(url, expectedUrl);
            if (family === 'anthropic') {
                assert.equal(headers.get('x-api-key'), 'synthetic-only');
                assert.equal(headers.get('anthropic-version'), '2023-06-01');
            } else if (family === 'gemini' && native) assert.equal(headers.get('x-goog-api-key'), 'synthetic-only');
            else assert.equal(headers.get('authorization'), 'Bearer ' + (family === 'vertex' ? 'synthetic-oauth' : 'synthetic-only'));
            emit({ event: 'analysis', agent, url, body, headers: [...headers].sort() });
            const text = 'Synthetic ' + agent + ' note.';
            return Response.json(family === 'anthropic' ? { content: [{ type: 'text', text }] }
                : family === 'gemini' || family === 'vertex' ? { candidates: [{ content: { parts: [{ text }] } }] }
                    : { choices: [{ message: { content: text } }] });
        } catch (error) { emit({ event: 'validation-error', code: error.code ?? error.name }); throw error; }
    };
}
function installPdfHttpTransport(transport, emit) {
    installPdfSocketBoundary(emit);
    for (const scheme of ['http', 'https']) {
        const client = require('node:' + scheme);
        client.request = (input, options = {}, callback) => {
            if (typeof options === 'function') { callback = options; options = {}; }
            const url = typeof input === 'string' || input instanceof URL ? String(input)
                : scheme + '://' + (input.hostname ?? input.host) + (input.port ? ':' + input.port : '') + (input.path ?? '/');
            const chunks = [];
            let timer;
            const request = new Writable({ autoDestroy: false,
                write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
                final(done) {
                    const body = Buffer.concat(chunks);
                    emit({ event: 'node-request', bytes: body.length });
                    transport(url, { ...options, method: options.method ?? 'GET', body }).then(response => {
                        clearTimeout(timer);
                        if (request.destroyed) { done(); return; }
                        const readable = Readable.fromWeb(response.body);
                        readable.statusCode = response.status;
                        readable.headers = Object.fromEntries(response.headers);
                        request.emit('response', readable); done();
                    }, done);
                },
                destroy(error, done) { clearTimeout(timer); done(error); },
            });
            if (callback) request.once('response', callback);
            request.setTimeout = (ms, listener) => {
                clearTimeout(timer); if (listener) request.once('timeout', listener);
                if (ms > 0) timer = setTimeout(() => request.emit('timeout'), ms);
                return request;
            };
            return request;
        };
        client.get = (...args) => { const request = client.request(...args); request.end(); return request; };
    }
    require('node:module').syncBuiltinESMExports();
}
function installPdfSocketBoundary(emit) {
    const net = require('node:net'), tls = require('node:tls');
    const connect = net.Socket.prototype.connect, secure = tls.connect;
    const permitted = args => {
        let first = args[0]; if (Array.isArray(first)) first = first[0];
        const options = typeof first === 'object' ? first
            : typeof first === 'string' ? { path: first }
                : { port: first, host: typeof args[1] === 'string' ? args[1] : '' };
        if (typeof options?.path === 'string') return options.path.startsWith('/tmp/') || options.path === '/rpc.sock';
        return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(options?.host ?? options?.hostname);
    };
    const refuse = api => { emit({ event: 'socket-denied', api }); throw Error('synthetic_socket_denied'); };
    net.Socket.prototype.connect = function(...args) { if (!permitted(args)) return refuse('net'); return connect.apply(this, args); };
    tls.connect = function(...args) { if (!permitted(args)) return refuse('tls'); return secure.apply(this, args); };
    // Node-side alternate clients must not bypass the TCP boundary. Browser
    // WebSockets are separately confined to the fixture's loopback origin.
    for (const name of ['WebSocket', 'EventSource']) if (typeof globalThis[name] === 'function') {
        globalThis[name] = class { constructor() { refuse(name); } };
    }
    const socket = new net.Socket();
    assert.throws(() => socket.connect({ host: '198.51.100.1', port: 443 }), /synthetic_socket_denied/); socket.destroy();
    assert.throws(() => tls.connect({ host: '198.51.100.1', port: 443 }), /synthetic_socket_denied/);
    emit({ event: 'socket-boundary-control', refused: 2 });
}
module.exports = { createPdfTransport, installPdfHttpTransport };

if (process.env.MARP_PDF_PROBE === '1') {
    const fs = require('node:fs'), http = require('node:http');
    if (!process.cwd().startsWith('/tmp/marp-pdf-')) throw Error('isolated PDF probe only');
    if (typeof process.send !== 'function') throw Error('PDF probe requires an IPC observer');
    const config = JSON.parse(fs.readFileSync(process.env.MARP_PDF_TRANSPORT_FILE));
    const emit = row => process.send?.({ ...row, at: performance.now() });
    globalThis.fetch = createPdfTransport({ ...config, emit });
    installPdfHttpTransport(globalThis.fetch, emit);
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function(...args) {
        this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
        return listen.apply(this, args);
    };
}
