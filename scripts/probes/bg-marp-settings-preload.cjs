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
let contextOwner, failIdentity = process.env.MARP_CONTEXT_SCENARIO === 'constructor-failure';
process.on('message', async row => {
    if (row?.event !== 'context-mutate') return;
    try {
        if (!contextOwner || !process.env.MARP_CONTEXT_SCENARIO) throw Error('context mutation outside fixture');
        if (row.kind === 'root-failure') failIdentity = true;
        else await contextOwner.writeRoot(root => {
            const plugins = root.plugins.map(p => ({ ...p }));
            const name = row.kind === 'nonselected-provider' || row.kind === 'selected-provider' ? 'synthetic-provider' : 'risu_multiagent';
            if (row.kind === 'script' || row.kind.endsWith('-provider')) {
                const target = plugins.find(p => p.name === name); if (!target) throw Error('synthetic entry missing');
                target.script += '\n// synthetic canonical replacement';
            } else if (row.kind === 'insert') plugins.unshift({name:'synthetic-added',version:'3.0',enabled:true,realArg:{},
                script:`await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});`});
            else if (row.kind !== 'value-copy') throw Error('unknown synthetic mutation');
            return {...root,plugins};
        });
        emit({event:'context-mutated',kind:row.kind});
    } catch { emit({event:'validation-error'}); }
});
Module._load = function(request, ...args) {
    const value = originalLoad.call(this, request, ...args);
    if (request === './bgPluginSession.cjs') return {...value,createPluginSession:options=>{
        emit({event:'session-create',sourceHash:createHash('sha256').update(options.script).digest('hex')});
        return value.createPluginSession(options);
    }};
    if (request === './bgPluginHost.cjs') return { ...value, createBgPluginHost: async options => {
        if(process.env.MARP_AUX_CALLER_PROBE==='1'){
            const set=options.bindings.registry.replacerbeforeRequest;
            if(!set.__auxObserved){
                const add=set.add,remove=set.delete,wrapped=new WeakMap();
                set.add=function(callback){
                    if(typeof callback!=='function')return add.call(this,callback);
                    if(!wrapped.has(callback))wrapped.set(callback,(...args)=>{emit({event:'actual-request-role',role:args[1]??null});return callback(...args);});
                    return add.call(this,wrapped.get(callback));
                };
                set.delete=function(callback){return remove.call(this,wrapped.get(callback)??callback);};
                Object.defineProperty(set,'__auxObserved',{value:true});
            }
        }
        emit({ event: 'host', operationId: options.operation.operationId,
            assembly: settings(options.database) });
        const getRoot = options.storageOwner.getRoot;
        contextOwner = options.storageOwner;
        const host = await value.createBgPluginHost({ ...options,
            publishNotification: (...args) => {
                emit({event:'host-notice',code:args[0].code,pluginName:args[0].pluginName,
                    phase:args[0].phase,api:args[0].api,effectsMayHaveOccurred:args[0].effectsMayHaveOccurred});
                return options.publishNotification(...args);
            }, storageOwner: { ...options.storageOwner,
            peekRoot: () => {
                const root = failIdentity ? null : options.storageOwner.peekRoot();
                if (root == null) emit({event:'identity-peek-miss'});
                return root;
            },
            getRoot: async () => {
                if (failIdentity) throw Error('synthetic canonical reload failure');
                const root = await getRoot();
                emit({ event: 'root-read', operationId: options.operation.operationId, digest: digest(settings(root)) });
                return root;
            } } });
        const refreshIdentity = host.refreshIdentity.bind(host);
        host.refreshIdentity = async () => {
            emit({ event: 'identity-refresh-start', operationId: options.operation.operationId,
                assembly: settings(options.getDatabase()) });
            const result = await refreshIdentity();
            emit({ event: 'identity-refresh-end', operationId: options.operation.operationId });
            return result;
        };
        return host;
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
    try {
    const raw = db.pluginCustomStorage?.risu_multiagent_lite_config_vault_v1;
    const vault = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { config: vault?.config, arguments: db.plugins?.find(p => p.name === 'risu_multiagent')?.realArg };
    } catch {
        // Observation cannot skip the real host/refresh on malformed fixtures.
        // The runner rejects this event independently from product failures.
        emit({event:'observation-error'});return null;
    }
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
    // These native best-effort relative calls have no Node HTTP origin. Keep
    // their real refusal (do not fake persistence), separate from external IO.
    if (url === '/api/logs' || url === '/api/pending-sends/synthetic-chat') {
        emit({event:'internal-relative-refused',path:url,method:options.method??'GET'});
        throw Error('relative URL has no server origin');
    }
    const analysis = url === 'https://analysis.example.test/v1/chat/completions';
    const main = url.startsWith('https://api.openai.com/v1/chat/completions')
        || url === 'https://native-input.example.test/v1/chat/completions';
    if (!analysis && !main) {
        let destination;
        try { const value = new URL(url); destination = value.origin + value.pathname; } catch { destination = url.startsWith('/') ? url.slice(0,160) : typeof input; }
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
    if (main && contextOwner) emit({event:'notices-before-main',events:contextOwner.kvList('internal/bg-notifications/v1/')
        .map(key=>JSON.parse(String(contextOwner.kvGet(key))).event).filter(Boolean)});
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
// Close the actual HTTP/TCP/WS routes as well as fetch; never use real providers.
let socketControl=true;
require('./bg-marp-pdf-transport.cjs').installPdfHttpTransport(globalThis.fetch,
    process.env.MARP_INSTALLED_PROBE==='1'?row=>emit({...row,control:socketControl}):emit);
socketControl=false;
