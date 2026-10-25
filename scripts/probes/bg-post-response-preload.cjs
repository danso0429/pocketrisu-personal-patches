'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

if (process.env.POCKETRISU_D3_PROBE !== '1'
    || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-d3-'))) throw Error('Synthetic D3 probe only');

const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};

let providerCalls = 0;
globalThis.fetch = async (input, options) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
        providerCalls += 1;
        process.send?.({ event: 'provider', call: providerCalls, at: Date.now() });
        return Response.json({ id: `synthetic-d3-completion-${providerCalls}`, choices: [{ index: 0, finish_reason: 'stop',
            message: { role: 'assistant', content: `synthetic-d3-answer-${providerCalls}` } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    }
    if (url === 'https://synthetic.invalid/d3-post-response') {
        const body = typeof options?.body === 'string' ? options.body : Buffer.from(options?.body ?? '').toString('utf8');
        process.send?.({ event: 'post-response-backend', at: Date.now(), body });
        return new Response('backend-recorded', { status: 200 });
    }
    if (url === 'https://synthetic.invalid/d3-post-response-hang') {
        process.send?.({ event: 'post-response-hang', at: Date.now() });
        return new Promise((resolve, reject) => {
            const abort = () => {
                process.send?.({ event: 'post-response-hang-aborted', at: Date.now() });
                reject(new DOMException('Aborted', 'AbortError'));
            };
            if (options?.signal?.aborted) abort();
            else options?.signal?.addEventListener('abort', abort, { once: true });
        });
    }
    process.send?.({ event: 'denied-fetch', url });
    throw Error('Synthetic outbound request denied');
};
