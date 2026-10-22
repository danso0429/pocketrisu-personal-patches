'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

if (process.env.POCKETRISU_D1A_PROBE !== '1'
    || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-d1a-'))) throw Error('Synthetic D1a probe only');

const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};

const retryAttempts = new Map();
globalThis.fetch = async (input, options) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
        const body = JSON.parse(typeof options?.body === 'string' ? options.body : Buffer.from(options?.body ?? '').toString('utf8'));
        const text = JSON.stringify(body.messages ?? []);
        const marker = ['d1a-first', 'd1a-effect', 'd1a-input', 'd1a-retry', 'd1a-aux'].find(value => text.includes(value)) ?? 'unknown';
        const attempt = (retryAttempts.get(marker) ?? 0) + 1;
        retryAttempts.set(marker, attempt);
        process.send?.({ event: 'provider', marker, attempt });
        if (process.env.POCKETRISU_D1A_RETRY === '1' && marker === 'd1a-retry' && attempt === 1) {
            return Response.json({ error: { message: 'synthetic retryable provider failure' } }, { status: 500 });
        }
        const content = 'synthetic-answer';
        return Response.json({ id: 'synthetic-completion', choices: [{ index: 0, finish_reason: 'stop',
            message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    }
    process.send?.({ event: 'denied-fetch', url });
    throw Error('Synthetic outbound request denied');
};
