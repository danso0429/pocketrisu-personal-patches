'use strict';
const http = require('node:http');
if (process.env.G19_STREAM_PROBE !== '1' || !/g19-stream-[A-Za-z0-9_-]+$/.test(process.cwd()))
    throw Error('Streaming probe requires an isolated synthetic cwd');
const emit = row => { if (process.connected) process.send({ ...row, at: performance.now() }); };
const marp = process.env.G110_MARP_STREAM === '1';
const lifecycle = process.env.G110_LIFECYCLE_CASE || '';
const epoch = Number(process.env.G110_EPOCH || 0);
function lifecycleRequest(body, analysis) {
    if (!lifecycle) return {};
    const contents = body.messages.map(row => typeof row.content === 'string' ? row.content : JSON.stringify(row.content));
    const text = contents.join('\n');
    const requestKey = analysis ? text.match(/G110_CURRENT=(G110_REQUEST_[A-Z0-9_]+)/)?.[1]
        : [...body.messages].reverse().find(row => row.role === 'user')?.content?.match?.(/G110_REQUEST_[A-Z0-9_]+/)?.[0];
    if (!requestKey) { emit({ event: 'validation-error' }); throw Error('Lifecycle request identity missing'); }
    return { requestKey, epoch, beforeEdit: text.includes('G110_BEFORE_QUARTZ'), afterEdit: text.includes('G110_AFTER_COBALT'),
        priorAnswerComplete: text.includes('G1.9 complete 1'), text };
}
if (marp) {
    const Module = require('node:module');
    const { createHash } = require('node:crypto');
    const load = Module._load;
    Module._load = function (request, ...args) {
        const value = load.call(this, request, ...args);
        if (request === './bgPluginSession.cjs') return { ...value, createPluginSession: options => {
            emit({ event: 'session-create', sourceHash: createHash('sha256').update(options.script).digest('hex') });
            return value.createPluginSession(options);
        } };
        if (request === './bgPluginHost.cjs') return { ...value, createBgPluginHost: async options => {
            const operationId = options.operation.operationId;
            emit({ event: 'host', operationId });
            const host = await value.createBgPluginHost({ ...options, publishNotification: (...values) => {
                emit({ event: 'host-notice', operationId, code: values[0].code, phase: values[0].phase });
                return options.publishNotification(...values);
            } });
            const refresh = host.refreshIdentity.bind(host);
            host.refreshIdentity = async () => {
                emit({ event: 'identity-refresh-start', operationId });
                const result = await refresh();
                emit({ event: 'identity-refresh-end', operationId });
                return result;
            };
            return host;
        } };
        if (lifecycle && request === './serverChatCommitOwner.cjs' && typeof value.createServerChatCommitOwner === 'function') {
            return { ...value, createServerChatCommitOwner: options => {
                assertNotification(options.notifyCommit);
                return value.createServerChatCommitOwner({ ...options, notifyCommit: record => {
                    emit({ event: 'commit-notified', epoch, operationId: record.operationId });
                    return options.notifyCommit(record);
                } });
            } };
        }
        return value;
    };
}
function assertNotification(notify) { if (typeof notify !== 'function') throw Error('Actual commit notification owner required'); }
const device = process.env.G19_STREAM_DEVICE === '1';
if (device || process.env.G19_STREAM_COOKIE_NAMESPACE === '1') {
    const requestEvent = http.Server.prototype.emit;
    http.Server.prototype.emit = function (event, ...args) {
        if (event === 'request') {
            const [request, response] = args;
            const own = String(request.headers.cookie || '').split(';').map(value => value.trim())
                .find(value => value.startsWith('g19-stream-session='));
            request.headers.cookie = own ? 'risu-session=' + own.slice('g19-stream-session='.length) : '';
            const setHeader = response.setHeader;
            response.setHeader = function (name, value) {
                if (String(name).toLowerCase() === 'set-cookie') {
                    const rename = cookie => String(cookie).replace(/^risu-session=/, 'g19-stream-session=');
                    value = Array.isArray(value) ? value.map(rename) : rename(value);
                }
                return setHeader.call(this, name, value);
            };
        }
        return requestEvent.call(this, event, ...args);
    };
}
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => emit({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};
const waiting = new Map();
process.on('message', value => {
    if (value?.event === 'release') waiting.get(value.call)?.();
});
let calls = 0;
let analyses = 0, releaseAnalysis, analysisReleased = false;
process.on('message', row => {
    if (row?.event === 'release-analysis') { analysisReleased = true; releaseAnalysis?.(); }
});
globalThis.fetch = async (input, options = {}) => {
    options.signal?.throwIfAborted();
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (marp && (url === '/api/logs' || url === '/api/pending-sends/synthetic-chat')) {
        emit({ event: 'internal-relative-refused', path: url });
        throw Error('relative URL has no server origin');
    }
    if (marp && url === 'https://analysis.example.test/v1/chat/completions') {
        const body = JSON.parse(typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString('utf8'));
        if (new Headers(options.headers).get('authorization') !== 'Bearer synthetic-only'
            || !Array.isArray(body.messages) || typeof body.model !== 'string' || body.stream === true) {
            emit({ event: 'validation-error' }); throw Error('Unexpected synthetic analysis');
        }
        const id = ++analyses;
        const identity = lifecycleRequest(body, true);
        emit({ event: 'analysis', id, model: body.model, ...identity });
        if (id === 1 && process.env.G110_CLOSE_ANALYSIS === '1' && !analysisReleased) {
            emit({ event: 'analysis-held', id, ...identity });
            await new Promise((resolve, reject) => {
                const done = () => { options.signal?.removeEventListener('abort', abort); releaseAnalysis = null; resolve(); };
                const abort = () => { releaseAnalysis = null; emit({ event: 'analysis-aborted', id, ...identity }); reject(options.signal.reason); };
                releaseAnalysis = done;
                options.signal?.addEventListener('abort', abort, { once: true });
                if (options.signal?.aborted) abort();
            });
        }
        emit({ event: 'analysis-finished', id, ...identity });
        const label = lifecycle ? '[epoch:' + epoch + ' request:' + identity.requestKey + ' analysis:' + id + ']'
            : '[analysis:' + id + ']';
        return Response.json({ choices: [{ message: { content: 'Synthetic note ' + body.model + ' ' + label } }] });
    }
    const gemini = url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')
        || url.startsWith('https://aiplatform.googleapis.com/v1/projects/synthetic-project/locations/global/publishers/google/models/');
    if (marp ? url !== 'https://native-input.example.test/v1/chat/completions'
        : !gemini && !url.startsWith('https://api.openai.com/v1/chat/completions')) {
        let destination;
        try { const address = new URL(url); destination = address.origin + address.pathname; }
        catch { destination = url.startsWith('/') ? url.slice(0, 160) : 'non-URL'; }
        emit({ event: 'outbound-denied', destination, method: options.method || input?.method || 'GET' });
        throw Error('Synthetic runtime denies other outbound requests');
    }
    const body = JSON.parse(typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString('utf8'));
    if (gemini ? !Array.isArray(body.contents)
        : body.model !== (marp ? 'synthetic-model' : 'gpt-3.5-turbo') || !Array.isArray(body.messages)) throw Error('Unexpected synthetic model');
    const nonstreamLifecycle = process.env.G110_LIFECYCLE_CASE === 'stop-main-nonstream';
    if (marp && (body.stream !== !nonstreamLifecycle || new Headers(options.headers).get('authorization') !== 'Bearer synthetic-key')) {
        emit({ event: 'validation-error' }); throw Error('Native preset stream/authentication mismatch');
    }
    const call = ++calls;
    const streaming = gemini ? url.includes(':streamGenerateContent') : body.stream === true;
    emit({ event: 'main', call, gemini, streaming,
        ...(marp ? { model: body.model, messages: body.messages, endpoint: url, ...lifecycleRequest(body, false) } : {}) });
    if (nonstreamLifecycle) {
        await new Promise((resolve, reject) => {
            const cleanup = () => { waiting.delete(call); options.signal?.removeEventListener('abort', abort); };
            const abort = () => { cleanup(); emit({ event: 'aborted', call }); reject(options.signal.reason); };
            waiting.set(call, () => { cleanup(); resolve(); });
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) abort();
        });
        return Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
            content: '**G1.9 partial ' + call + '**\n\n<Thoughts>hidden-preview-thought</Thoughts>\n\n**G1.9 complete ' + call + '**' } }],
            usage: { prompt_tokens: 2, completion_tokens: 3 } });
    }
    if (!streaming && gemini) return Response.json({ candidates: [{ content: {role:'model',parts:[{text:'G1.9 nonstream answer'}]},finishReason:'STOP' }] });
    if (!streaming) return Response.json({ choices: [{ index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: 'G1.9 nonstream answer' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3 } });
    const first = device ? '**서버 응답 ' + call + '**\n\n<Thoughts>접힌 테스트 생각</Thoughts>\n\n응답 조각 1'
        : '**G1.9 partial ' + call + '**\n\n<Thoughts>hidden-preview-thought';
    const tail = (device ? '\n\n**완료 ' + call + '**' : '</Thoughts>\n\n**G1.9 complete ' + call + '**')
        + (process.env.G19_STREAM_CONTINUE === '1' ? call === 1 ? ' continue' : '.' : '');
    const encode = new TextEncoder();
    const frame = text => encode.encode('data: ' + JSON.stringify(gemini
        ? { candidates: [{ content: { role: 'model', parts: [{ text }] } }] }
        : { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) + '\n\n');
    let cleanup, interval, finishTimer;
    return new Response(new ReadableStream({
        start(controller) {
            let settled = false;
            const abort = () => { if (!settled) { settled = true; cleanup(); controller.error(options.signal.reason); emit({ event: 'aborted', call }); } };
            cleanup = () => { clearInterval(interval); clearTimeout(finishTimer); waiting.delete(call); options.signal?.removeEventListener('abort', abort); };
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) { abort(); return; }
            waiting.set(call, () => {
                if (settled) return;
                settled = true; cleanup();
                const deviceFailure = device && JSON.stringify(body.messages.filter(row => row.role === 'user').at(-1)).includes('실패');
                if ((process.env.G19_STREAM_FAIL === '1' && call === 1) || deviceFailure) {
                    controller.error(Error('synthetic late stream failure'));
                    emit({ event: 'stream-failed', call }); return;
                }
                controller.enqueue(frame(tail));
                controller.enqueue(encode.encode('data: ' + JSON.stringify(gemini
                    ? { candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } }
                    : { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } })
                    + (gemini ? '\n\n' : '\n\ndata: [DONE]\n\n')));
                controller.close(); emit({ event: 'stream-finished', call });
            });
            controller.enqueue(frame(first)); emit({ event: 'partial', call });
            if (device) {
                let piece = 1;
                interval = setInterval(() => { if (!settled) controller.enqueue(frame('\n응답 조각 ' + (++piece))); }, 1000);
                finishTimer = setTimeout(() => waiting.get(call)?.(), 15000);
            }
        },
        cancel() { cleanup?.(); emit({ event: 'reader-cancelled', call }); },
    }), { headers: { 'content-type': 'text/event-stream' } });
};
require('./bg-marp-pdf-transport.cjs').installPdfHttpTransport(globalThis.fetch, emit);
