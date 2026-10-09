'use strict';
// Synthetic transport and read-only observation around the actual host/storage.
const http = require('node:http');
const Module = require('node:module');
const { createHash } = require('node:crypto');
if (process.env.MARP_SETTINGS_PROBE !== '1' || !process.cwd().startsWith('/tmp/marp-settings-')) {
    throw Error('isolated settings probe only');
}
const emit = row => process.send?.({ ...row, at: performance.now() });
const digest = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    const value = originalLoad.call(this, request, ...args);
    if (request === './bgPluginHost.cjs') return { ...value, createBgPluginHost: async options => {
        emit({ event: 'host', operationId: options.operation.operationId,
            assembly: settings(options.database) });
        const getRoot = options.storageOwner.getRoot;
        return value.createBgPluginHost({ ...options, storageOwner: { ...options.storageOwner,
            getRoot: async () => {
                const root = await getRoot();
                emit({ event: 'root-read', operationId: options.operation.operationId, digest: digest(settings(root)) });
                return root;
            } } });
    } };
    if (request === './bgPluginStorage.cjs') return { ...value, createPluginStorage: options => {
        const storage = value.createPluginStorage(options);
        return Object.fromEntries(Object.entries(storage).map(([group, call]) => [group, async(method, args) => {
            const result = await call(method, args);
            if (method === 'getItem' || method === 'getArgument') emit({ event: 'read', group,
                key: args[0], digest: digest(result) });
            if (!released && process.env.MARP_SETTINGS_GATE === 'read' && group === 'root'
                && method === 'getItem' && args[0] === 'risu_multiagent_lite_config_vault_v1') {
                emit({ event: 'read-held' });
                await hold(null, 'vault-read');
            }
            return result;
        }]));
    } };
    return value;
};
function settings(db) {
    const raw = db.pluginCustomStorage?.risu_multiagent_lite_config_vault_v1;
    const vault = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { config: vault?.config, arguments: db.plugins.find(p => p.name === 'risu_multiagent')?.realArg };
}
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) {
    this.once('listening', () => emit({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};
let released = false, analyses = 0, mains = 0;
const waiting = new Set();
process.on('message', message => {
    if (message?.event !== 'release') return;
    released = true;
    for (const done of waiting) done();
    waiting.clear();
});
async function hold(signal, id) {
    if (signal?.aborted) { emit({ event: 'aborted', id }); throw signal.reason; }
    await new Promise((resolve, reject) => {
        const finish = () => { waiting.delete(finish); signal?.removeEventListener('abort', abort); resolve(); };
        const abort = () => { waiting.delete(finish); emit({ event: 'aborted', id }); reject(signal.reason); };
        waiting.add(finish); signal?.addEventListener('abort', abort, { once: true });
    });
}
globalThis.fetch = async(input, options = {}) => {
    const url = String(input);
    const analysis = url === 'https://analysis.example.test/v1/chat/completions';
    const main = url.startsWith('https://api.openai.com/v1/chat/completions')
        || url === 'https://native-input.example.test/v1/chat/completions';
    if (!analysis && !main) {
        let destination;
        try { const value = new URL(url); destination = value.origin + value.pathname; } catch { destination = typeof input; }
        emit({ event: 'denied', destination }); throw Error('synthetic outbound denied');
    }
    const body = JSON.parse(typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString());
    if (!Array.isArray(body.messages) || typeof body.model !== 'string') {
        emit({ event: 'validation-error' }); throw Error('invalid synthetic request');
    }
    const id = analysis ? ++analyses : ++mains;
    if (analysis && new Headers(options.headers).get('authorization') !== 'Bearer synthetic-only') {
        emit({ event: 'validation-error' }); throw Error('invalid synthetic authorization');
    }
    emit({ event: analysis ? 'analysis' : 'main', id, body });
    const gate = process.env.MARP_SETTINGS_GATE;
    if (!released && ((analysis && id === 1 && gate === 'analysis') || (main && id === 1 && gate === 'main'))) {
        await hold(options.signal, (analysis ? 'analysis:' : 'main:') + id);
    }
    if (main && id === 1 && process.env.MARP_SETTINGS_RETRY === '1') {
        return Response.json({ error: { message: 'synthetic retry' } }, { status: 500 });
    }
    return Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
        content: analysis ? 'Synthetic note ' + body.model : 'Synthetic settings answer' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3 } });
};
