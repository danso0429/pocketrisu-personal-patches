'use strict';
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
if (process.env.POCKETRISU_PLUGIN_PROCESS_PROBE !== '1'
    || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-plugin-process-'))) throw Error('Synthetic probe only');
if (process.env.POCKETRISU_PLUGIN_PUBLICATION_FAULT === '1') {
    const load = Module._load;
    Module._load = function (name, parent, ...rest) {
        const value = load.call(this, name, parent, ...rest);
        if (name !== './serverChatInputOwner.cjs' || !parent?.filename.endsWith('/server/node/server.cjs')) return value;
        return { ...value, createServerChatInputOwner(deps) {
            let attaching = false;
            const owner = value.createServerChatInputOwner({ ...deps, cacheStrippedDatabase(...args) {
                if (attaching) {
                    process.send?.({ event: 'publication-fault' }); throw Error('synthetic publication failure');
                }
                return deps.cacheStrippedDatabase(...args);
            } });
            return { ...owner, async attachTransformed(...args) {
                attaching = true;
                try { return await owner.attachTransformed(...args); } finally { attaching = false; }
            } };
        } };
    };
}
if (process.env.POCKETRISU_PLUGIN_AFTER_ATTACH_FAULT === '1') {
    const load = Module._load;
    Module._load = function (name, parent, ...rest) {
        const value = load.call(this, name, parent, ...rest);
        if (process.env.POCKETRISU_PLUGIN_SETTLE_FAULT === '1') {
            if (name === './bgOrchestrationRunRegistry.cjs') return { ...value,
                createOrchestrationRunRegistry: options => value.createOrchestrationRunRegistry({ ...options, retainMs: 0 }) };
            if (name === './serverChatInputOwner.cjs' && parent?.filename.endsWith('/server/node/server.cjs')) return { ...value,
                createServerChatInputOwner: deps => ({ ...value.createServerChatInputOwner(deps), settleSynchronously() {
                    process.send?.({ event: 'settle-fault' }); throw Error('synthetic settlement failure');
                } }) };
        }
        if (name !== './serverChatCommitOwner.cjs' || !parent?.filename.endsWith('/server/node/server.cjs')) return value;
        return { ...value, createServerChatCommitOwner(deps) {
            const owner = value.createServerChatCommitOwner(deps); let first = true;
            return { ...owner, async readAssemblyContext(...args) {
                if (first) {
                    first = false;
                    if (process.env.POCKETRISU_PLUGIN_AFTER_ATTACH_KILL === '1') {
                        process.send?.({ event: 'after-attach-fault' }, () => process.kill(process.pid, 'SIGKILL'));
                        return new Promise(() => {});
                    }
                    process.send?.({ event: 'after-attach-fault' }); throw Error('synthetic after-attach failure');
                }
                return owner.readAssemblyContext(...args);
            } };
        } };
    };
}
const listen = http.Server.prototype.listen;
let analysisCount = 0;
let releaseFirst;
const firstAnalysis = new Promise(resolve => { releaseFirst = resolve; });
process.on('message', message => { if (message?.event === 'release-first-analysis') releaseFirst(); });
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1'; else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};
globalThis.fetch = async (input, options) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url === 'https://analysis.example.test/v1') {
        if (process.env.POCKETRISU_PLUGIN_CRASH === '1') {
            process.send?.({ event: 'analysis-crash' }, () => process.kill(process.pid, 'SIGKILL'));
            return new Promise(() => {});
        }
        process.send?.({ event: 'analysis', body: options?.body == null ? null : Buffer.from(options.body).toString('utf8'),
            headers: Object.fromEntries(new Headers(options?.headers)) });
        if (process.env.POCKETRISU_PLUGIN_TWO_CHAT === '1' && ++analysisCount === 1) await firstAnalysis;
        return new Response('analysis-ok');
    }
    if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
        const body = JSON.parse(typeof options?.body === 'string' ? options.body : Buffer.from(options.body).toString('utf8'));
        process.send?.({ event: 'provider', body });
        return Response.json({ id: 'synthetic-completion', choices: [{ index: 0, finish_reason: 'stop',
            message: { role: 'assistant', content: 'synthetic-answer' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    }
    process.send?.({ event: 'denied-fetch' });
    throw Error('Synthetic outbound request denied');
};
