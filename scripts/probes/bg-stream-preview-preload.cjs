'use strict';
const http = require('node:http');
if (process.env.G19_STREAM_PROBE !== '1' || !/g19-stream-[A-Za-z0-9_-]+$/.test(process.cwd()))
    throw Error('Streaming probe requires an isolated synthetic cwd');
const emit = row => { if (process.connected) process.send(row); };
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
globalThis.fetch = async (input, options = {}) => {
    options.signal?.throwIfAborted();
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!url.startsWith('https://api.openai.com/v1/chat/completions')) {
        emit({ event: 'outbound-denied' }); throw Error('Synthetic runtime denies other outbound requests');
    }
    const body = JSON.parse(typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString('utf8'));
    if (body.model !== 'gpt-3.5-turbo' || !Array.isArray(body.messages)) throw Error('Unexpected synthetic model');
    const call = ++calls;
    emit({ event: 'main', call, streaming: body.stream === true });
    if (!body.stream) return Response.json({ choices: [{ index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: 'G1.9 nonstream answer' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3 } });
    const first = device ? '**서버 응답 ' + call + '**\n\n<Thoughts>접힌 테스트 생각</Thoughts>\n\n응답 조각 1'
        : '**G1.9 partial ' + call + '**\n\n<Thoughts>hidden-preview-thought';
    const tail = (device ? '\n\n**완료 ' + call + '**' : '</Thoughts>\n\n**G1.9 complete ' + call + '**')
        + (process.env.G19_STREAM_CONTINUE === '1' ? call === 1 ? ' continue' : '.' : '');
    const encode = new TextEncoder();
    const frame = text => encode.encode('data: ' + JSON.stringify({ choices: [{ index: 0,
        delta: { content: text }, finish_reason: null }] }) + '\n\n');
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
                controller.enqueue(encode.encode('data: ' + JSON.stringify({ choices: [{ index: 0,
                    delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } }) + '\n\ndata: [DONE]\n\n'));
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
