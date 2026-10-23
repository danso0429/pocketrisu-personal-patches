'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

if (process.env.POCKETRISU_NF_PROBE !== '1'
    || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-nf-'))) throw Error('Synthetic NF probe only');

const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};

globalThis.fetch = async (input, options) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url.startsWith('https://synthetic.invalid/nf-timeout')) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { cleanup(); resolve(new Response('slow', { status: 200 })); }, 80);
            const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
            const cleanup = () => { clearTimeout(timer); options?.signal?.removeEventListener('abort', abort); };
            if (options?.signal?.aborted) abort();
            else options?.signal?.addEventListener('abort', abort, { once: true });
        });
    }
    if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
        const body = JSON.parse(typeof options?.body === 'string' ? options.body : Buffer.from(options?.body ?? '').toString('utf8'));
        const text = JSON.stringify(body.messages ?? []);
        process.send?.({ event: 'provider', observedNaN: text.includes('nf-rpc-observed:true') });
        return Response.json({ id: 'synthetic-nf-completion', choices: [{ index: 0, finish_reason: 'stop',
            message: { role: 'assistant', content: 'synthetic-answer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    }
    process.send?.({ event: 'denied-fetch', url });
    throw Error('Synthetic outbound request denied');
};
