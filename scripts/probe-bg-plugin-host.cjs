'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const Module = require('node:module');
const path = require('node:path');
const targetRequire = createRequire(path.resolve(process.argv[2], 'package.json'));
let wireMutation = null;
let wireRuntimeMs = null;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    const value = originalLoad.call(this, request, ...args);
    if (request === './bgPluginSandbox.cjs') return { ...value, createPluginSandbox: options => {
        const mutation = wireMutation;
        // A mutation may return undefined to hold a frame and deliver it later.
        return value.createPluginSandbox({ ...options, ...(wireRuntimeMs == null ? {} : { runtimeMs: wireRuntimeMs }), onFrame: frame => {
            const next = mutation ? mutation(frame, options.onFrame) : frame;
            if (next !== undefined) options.onFrame(next);
        } });
    } };
    return value;
};
const Database = targetRequire('better-sqlite3');
const { createBgPluginHost } = targetRequire('./server/node/bgPluginHost.cjs');
const { createPluginStorage, savedPluginPermission } = targetRequire('./server/node/bgPluginStorage.cjs');
const { createBgNotifications } = targetRequire('./server/node/bgNotifications.cjs');
const { createPluginPeer } = targetRequire('./server/node/bgPluginWorker.cjs');
Module._load = originalLoad;
const plugin = (name, script) => ({ name, script, version: '3.0', enabled: true, realArg: { sample: 'original' } });

async function fixture(t, plugins, permissions = true, options = {}) {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT)');
    const kvGet = key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null;
    const kvSet = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value);
    const kvDel = key => db.prepare('DELETE FROM kv WHERE key=?').run(key);
    const kvList = prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=? ORDER BY key').all(prefix.length, prefix).map(row => row.key);
    const notifications = createBgNotifications({ db, kvGet, kvSet, kvDel, kvList });
    let root = { plugins, pluginCustomStorage: { existing: 'kept', zero: 0 }, unrelated: { preserved: true }, characters: [] };
    // Production has a captured operation DB and an independently current
    // canonical root. Keep old fixtures unchanged; epoch probes opt into both.
    let operationDb = structuredClone(root);
    let effects = 0, writes = 0, host;
    const network = [];
    const controller = options.controller ?? new AbortController();
    const registry = { replacerbeforeRequest: new Set(), replacerafterRequest: new Set(), editinput: new Set(),
        editoutput: new Set(), editprocess: new Set(), editdisplay: new Set(), providers: new Map() };
    const bindings = { registry, allowedDbKeys: ['characters', 'plugins', 'pluginCustomStorage'], bodyInterceptors: [],
        nativeFetch: async (url, init) => { network.push({ url, options:init }); return options.nativeFetch
            ? options.nativeFetch(url, init) : new Response('synthetic-response'); },
        risuFetch: async () => ({ ok: true, data: 'synthetic' }),
        requestChatDataMain: async (args, mode) => ({ type: 'success', result: JSON.stringify({ args, mode }) }),
        installProvider(name, callback) { registry.providers.set(name, callback); return () => registry.providers.delete(name); } };
    if (permissions) {
        const keys = plugins.flatMap(value => ['replacer', 'provider', 'db'].map(permission => JSON.stringify([value.name, permission])));
        kvSet('cache/plugin-permissions/state.json', JSON.stringify({ given: keys, denied: [], cache: keys.map(key => [key + '_lastGrantTime', Date.now()]) }));
    }
    if (options.permissionState) kvSet('cache/plugin-permissions/state.json', JSON.stringify(options.permissionState));
    const owner = { kvGet, kvSet, kvDel, kvList, transaction: task => { options.beforeLocalTransaction?.(); return db.transaction(task)(); },
        peekRoot: () => options.peekRoot ? options.peekRoot(root) : root,
        getRoot: async () => { options.onRootRead?.(); return options.getRoot ? options.getRoot(root) : root; },
        writeRoot: async mutate => { await options.beforeRootWrite?.(); root = mutate(root); writes++; } };
    t.after(async () => { await host?.close(); db.close(); });
    wireMutation = options.wireMutation ?? null;
    wireRuntimeMs = options.runtimeMs ?? null;
    host = await createBgPluginHost({ database: options.separateRoot ? operationDb : root,
        getDatabase: () => options.separateRoot ? operationDb : root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
        hydrate: options.hydrate ?? (async value => structuredClone(value)), storageOwner: owner, beforeEffect: () => { effects++; return options.beforeEffect?.(); },
        publishNotification: options.publishNotification ?? ((event, identity) => identity
            ? notifications.publishPluginFailure(event, identity) : notifications.publish(event)),
        publishDiagnostic: options.publishDiagnostic,
        onCriticalFailure: error => { options.onCriticalFailure?.(error); controller.abort(error); },
        operation: { operationId: options.operationId ?? 'synthetic-operation', charId: 'synthetic-character', chatId: 'synthetic-chat', inputPreparedOnClient: options.prepared === true },
        signal: controller.signal, bindings });
    wireMutation = null;
    wireRuntimeMs = null;
    return { host, registry, bindings, notifications, owner, network, get root() { return root; },
        set root(value) { root = value; }, get effects() { return effects; }, get writes() { return writes; },
        get operationDb() { return options.separateRoot ? operationDb : root; },
        swapOperationDb() { operationDb = structuredClone(root); },
        controller, notices: () => notifications.claim('synthetic-consumer', 2).map(row => row.event) };
}

for (const form of ['given','digest','given-and-denied','denied','missing-time','null-time','expired','digest-mismatch']) {
    test(`saved provider grant form ${form} never fabricates a permission answer`, async t => {
        const code=`await Risuai.addProvider('grant-provider',async()=>({success:true,content:'granted-answer'}));`;
        const p=plugin('grant-fixture',code),nameKey=JSON.stringify([p.name,'provider']);
        const digest=createHash('sha256').update(form==='digest-mismatch'?code+'\n// prior identity':code).digest('hex')+'_provider';
        const given=['given','given-and-denied','missing-time','null-time','expired'].includes(form)?[nameKey]:[];
        const denied=['denied','given-and-denied'].includes(form)?[nameKey]:[];
        const cache=[[digest,true],...(form==='missing-time'?[]:[[nameKey+'_lastGrantTime',form==='null-time'?null:Date.now()-(form==='expired'?4*86400000:0)]])];
        const h=await fixture(t,[p],false,{permissionState:{given,denied,cache}});
        const allowed=['given','digest','given-and-denied'].includes(form);
        assert.equal(h.host.hasProvider('grant-provider'),allowed);
        assert.equal(h.network.length,0);assert.equal(h.writes,0);
        if(allowed){assert.deepEqual(await h.registry.providers.get('grant-provider')({}),{success:true,content:'granted-answer'});assert.deepEqual(h.notices(),[]);}
        else{assert.equal(h.effects,0);assert.deepEqual(h.notices().map(n=>({code:n.code,phase:n.phase,effects:n.effectsMayHaveOccurred})),[{code:'plugin_permission_missing',phase:'load',effects:false}]);}
    });
}

test('actual settlement warnings retain distinct phases without aborting the operation', async t => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const h = await fixture(t, [plugin('settlement-phases', `
        await Risuai.addRisuReplacer('beforeRequest',async value=>{void Risuai.setArgument('held','before').catch(()=>{});return value;});
        await Risuai.addProvider('settlement-provider',async()=>{void Risuai.pluginStorage.setItem('held','provider').catch(()=>{});return {success:true,content:'original answer'};});
    `)], true, { beforeRootWrite: () => held });
    t.after(() => release());
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    assert.deepEqual(await h.registry.providers.get('settlement-provider')({}), { success: true, content: 'original answer' });
    assert.equal(h.controller.signal.aborted, false);
    assert.deepEqual(h.notices().map(row => row.phase).sort(), ['before_request', 'provider']);
    assert.ok(h.notices().every(row => row.eventKey.endsWith(':settlement-budget')));
});

test('same-phase settlement memo retains its first effects snapshot as later work changes it', async t => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const h = await fixture(t, [plugin('settlement-effects', `let calls=0;
        await Risuai.addRisuReplacer('beforeRequest',async value=>{
            if(++calls===1)void Risuai.getDatabase(['characters']).catch(()=>{});
            else void Risuai.pluginStorage.setItem('held','new').catch(()=>{});
            return value;
        });
    `)], true, { hydrate: async () => { await held; return []; }, beforeRootWrite: () => held });
    t.after(() => release());
    const callback = [...h.registry.replacerbeforeRequest][0];
    assert.deepEqual(await callback([]), []);
    assert.equal(h.effects, 0);
    assert.deepEqual(await callback([]), []);
    assert.ok(h.effects > 0);
    const notices = h.notices();
    assert.equal(notices.length, 1);
    assert.equal(notices[0].effectsMayHaveOccurred, false);
    assert.equal(h.controller.signal.aborted, false);
});

test('a callback finishing during unload cannot publish a result after host teardown starts', async t => {
    let release, entered;
    const held = new Promise(resolve => { release = resolve; });
    const began = new Promise(resolve => { entered = resolve; });
    const h = await fixture(t, [plugin('closing-result', `
        await Risuai.onUnload(()=>new Promise(resolve=>setTimeout(resolve,500)));
        await Risuai.addProvider('closing-provider',async()=>{
            await Risuai.nativeFetch('https://synthetic.invalid/held');return {success:true,content:'late answer'};
        });
    `)], true, { nativeFetch: async () => { entered(); await held; return new Response(null); } });
    t.after(() => release());
    const result = h.registry.providers.get('closing-provider')({});
    result.catch(() => {});
    await began;
    const closing = h.host.close();
    assert.equal(h.host.hasProvider('closing-provider'), false);
    release();
    try { await assert.rejects(result, { code: 'plugin_operation_closed' }); }
    finally { await closing; }
});

test('a pending large local write does not consume the ordinary API budget',async t=>{
    let effectCount=0,held,release,logged,store;
    const writing=new Promise(resolve=>{held=resolve;}),resume=new Promise(resolve=>{release=resolve;}),message=new Promise(resolve=>{logged=resolve;});
    t.after(()=>release());
    const h=await fixture(t,[plugin('large-pending',`await Risuai.addProvider('large-pending',async()=>{
        await Risuai.nativeFetch('https://synthetic.invalid/ready',{});
        const s=await Risuai.getLocalPluginStorage(),writing=s.setItem('large','x'.repeat(5*1024*1024));
        await Risuai.nativeFetch('https://synthetic.invalid/after-write',{});await Risuai.log('ordinary API kept');await writing;
        return {success:true,content:'kept'};
    });`)],true,{
        beforeEffect:async()=>{if(++effectCount===4){held();await resume;}},
        nativeFetch:async url=>{if(url.endsWith('/after-write'))await writing;return new Response('synthetic');},
        publishNotification:event=>{if(event.code==='plugin_message')logged();return store.publish(event);},
    });
    store=h.notifications;const result=h.registry.providers.get('large-pending')({});
    const watchdog=setTimeout(()=>release(),5000);
    try{await message;assert.equal(effectCount,4);assert.equal(h.owner.kvGet('cache/plugin-storage/'+Buffer.from('large').toString('base64url')+'.json'),null);
        assert.deepEqual(h.notices().map(row=>row.code),['plugin_message']);release();assert.deepEqual(await result,{success:true,content:'kept'});
    }finally{clearTimeout(watchdog);release();}
});

test('32MiB JSON local string boundary persists and cold-reads through actual SQLite and worker',async t=>{
    const size=32*1024*1024-2;
    const h=await fixture(t,[plugin('local-boundary',`await Risuai.addProvider('local-boundary',async()=>{
        const s=await Risuai.getLocalPluginStorage();await s.setItem('boundary','x'.repeat(${size}));
        const value=await s.getItem('boundary','ignored');return {success:true,content:String(value.length)};
    });`)]);
    assert.deepEqual(await h.registry.providers.get('local-boundary')({}),{success:true,content:String(size)});
    const row=h.owner.kvGet('cache/plugin-storage/'+Buffer.from('boundary').toString('base64url')+'.json');
    assert.equal(Buffer.byteLength(row),32*1024*1024);assert.equal(JSON.parse(row).length,size);assert.deepEqual(h.notices(),[]);
});

test('parallel large setters leave byte-rate room for a valid escaped ordinary frame',async t=>{
    const h=await fixture(t,[plugin('paced-large',`await Risuai.addProvider('paced-large',async()=>{
        const s=await Risuai.getLocalPluginStorage();await Promise.all([
            s.setItem('first','x'.repeat(5*1024*1024)),s.setItem('second','y'.repeat(5*1024*1024)),
            Risuai.nativeFetch('https://synthetic.invalid/ordinary',{method:'POST',body:'\\\\'.repeat(4*1024*1024-256)})
        ]);return {success:true,content:'kept'};
    });`)]);
    assert.deepEqual(await h.registry.providers.get('paced-large')({}),{success:true,content:'kept'});
    for(const key of ['first','second'])assert.equal(JSON.parse(h.owner.kvGet('cache/plugin-storage/'+Buffer.from(key).toString('base64url')+'.json')).length,5*1024*1024);
    assert.equal(h.network.length,1);assert.equal(h.network[0].options.body.length,4*1024*1024-256);assert.deepEqual(h.notices(),[]);
});

for(const publication of ['stored','exception','capacity'])test(`large decoder contention ${publication} awaits its mandatory notice before any later API effect`,async t=>{
    const holder=createPluginPeer({send:()=>{}});
    const held=holder.call('api',['localPluginStorage.setItem',['held','x'.repeat(5*1024*1024)]]);held.catch(()=>{});t.after(()=>holder.close());
    let store;
    const h=await fixture(t,[plugin('large-refusal',`await Risuai.addProvider('large-refusal',async()=>{
        const s=await Risuai.getLocalPluginStorage();let code;
        try{await s.setItem('refused','x'.repeat(28*1024*1024));}catch(e){code=e.code;}
        try{await Risuai.nativeFetch('https://synthetic.invalid/after-refusal',{});}catch{}
        return {success:true,content:code};
    });`)],true,{publishNotification:event=>{if(publication==='exception')throw Error('synthetic unavailable');if(publication==='capacity')return {status:'capacity'};return store.publish(event);}});
    store=h.notifications;
    const result=h.registry.providers.get('large-refusal')({});
    if(publication==='stored'){
        assert.deepEqual(await result,{success:true,content:'plugin_rpc_value_limit'});assert.equal(h.network.length,1);
        assert.deepEqual(h.notices().map(n=>({code:n.code,phase:n.phase,reason:n.reason})),[{code:'plugin_host_limit',phase:'provider',reason:'operation_budget'}]);
    }else{await assert.rejects(result,{code:'plugin_notification_unavailable'});assert.equal(h.controller.signal.aborted,true);assert.equal(h.network.length,0);}
    assert.equal(h.owner.kvGet('cache/plugin-storage/'+Buffer.from('refused').toString('base64url')+'.json'),null);assert.equal(h.writes,0);
});

for(const mode of ['caught','uncaught','notice-exception','notice-capacity'])test(`local compare conflict ${mode} preserves competing data and original callback handling`,async t=>{
    const key='cache/plugin-storage/'+Buffer.from('shared').toString('base64url')+'.json';let h,store;
    h=await fixture(t,[plugin('local-cas',`await Risuai.addProvider('local-cas',async()=>{
        const s=await Risuai.getLocalPluginStorage();await s.getItem('shared');await Risuai.nativeFetch('https://synthetic.invalid/barrier',{});
        try{await s.setItem('shared',1);}catch(e){${mode==='uncaught'?'throw e;':`if(e.code!=='plugin_storage_conflict')throw e;`}}
        await Risuai.nativeFetch('https://synthetic.invalid/after',{});return {success:true,content:'kept'};
    });`)],true,{
        nativeFetch:async url=>{if(url.endsWith('/barrier'))h.owner.kvSet(key,JSON.stringify(9));return new Response('synthetic');},
        publishNotification:event=>{if(mode==='notice-exception')throw Error('synthetic unavailable');if(mode==='notice-capacity')return {status:'capacity'};return store.publish(event);},
    });
    store=h.notifications;const result=h.registry.providers.get('local-cas')({});
    if(mode==='caught'){
        assert.deepEqual(await result,{success:true,content:'kept'});assert.equal(h.network.length,2);
        assert.deepEqual(h.notices().map(n=>({code:n.code,phase:n.phase,effects:n.effectsMayHaveOccurred})),[{code:'plugin_message',phase:'provider',effects:true}]);
    }else if(mode==='uncaught'){
        await assert.rejects(result,{code:'plugin_provider_failed'});assert.equal(h.network.length,1);
        assert.deepEqual(h.notices().map(n=>n.code).sort(),['plugin_message','plugin_provider_failed']);
    }else{
        await assert.rejects(result,{code:'plugin_notification_unavailable'});assert.equal(h.controller.signal.aborted,true);assert.equal(h.network.length,1);
    }
    assert.equal(JSON.parse(h.owner.kvGet(key)),9);assert.equal(h.writes,0);
});

test('a new operation receives its local conflict warning after the prior operation warning was ACKed',async t=>{
    const shared=await fixture(t,[]),consumer='synthetic-conflict-consumer';let h;
    const key='cache/plugin-storage/'+Buffer.from('shared').toString('base64url')+'.json';
    const p=plugin('per-operation-cas',`await Risuai.addProvider('per-operation-cas',async()=>{
        const s=await Risuai.getLocalPluginStorage();await s.getItem('shared');await Risuai.nativeFetch('https://synthetic.invalid/barrier',{});
        try{await s.setItem('shared',1);}catch(e){if(e.code!=='plugin_storage_conflict')throw e;}return {success:true,content:'kept'};
    });`);
    const ids=[];
    for(const operationId of ['synthetic-conflict-one','synthetic-conflict-two']){
        h=await fixture(t,[p],true,{operationId,publishNotification:(event,identity)=>identity?shared.notifications.publishPluginFailure(event,identity):shared.notifications.publish(event),
            nativeFetch:async()=>{h.owner.kvSet(key,JSON.stringify(9));return new Response('synthetic');}});
        assert.deepEqual(await h.registry.providers.get('per-operation-cas')({}),{success:true,content:'kept'});
        const rows=shared.notifications.claim(consumer,2);assert.equal(rows.length,1);assert.equal(rows[0].event.operationId,operationId);
        assert.ok(rows[0].event.eventKey.endsWith(':local-conflict'));ids.push(rows[0].id);
        assert.deepEqual(shared.notifications.acknowledge(consumer,rows.map(row=>({id:row.id,token:row.token}))),[rows[0].id]);await h.host.close();
    }
    assert.notEqual(ids[0],ids[1]);
});

test('a native value growing during effect preparation is charged before comparison parsing',async t=>{
    const Database=targetRequire('better-sqlite3'),db=new Database(':memory:');db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());
    const key='cache/plugin-storage/'+Buffer.from('growth').toString('base64url')+'.json',charges=[],released=[];
    const kvGet=key=>db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value??null;
    const kvSet=(key,value)=>db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?)').run(key,value);
    const storage=createPluginStorage({plugin:plugin('growth',''),getRoot:async()=>({}),writeRoot:async()=>{},kvGet,kvSet,kvDel:()=>{},kvList:()=>[],transaction:task=>db.transaction(task)(),
        beforeEffect:async()=>kvSet(key,JSON.stringify('x'.repeat(5*1024*1024))),
        reserveLocal:bytes=>{charges.push(bytes);return()=>released.push(bytes);}});
    assert.equal(await storage.local('getItem',['growth']),null);
    await assert.rejects(storage.local('setItem',['growth','small']),{code:'plugin_storage_conflict'});
    assert.ok(charges.some(bytes=>bytes>=5*1024*1024));assert.deepEqual([...released].sort((a,b)=>a-b),[...charges].sort((a,b)=>a-b));
    assert.equal(JSON.parse(kvGet(key)).length,5*1024*1024);
});

test('ACKed operation conflict warnings exceed the failure-pool capacity without consuming terminal receipts',async t=>{
    const h=await fixture(t,[]),consumer='synthetic-warning-capacity-consumer';
    for(let index=0;index<1100;index++){
        const event={operationId:'synthetic-warning-'+index,charId:'synthetic-character',chatId:'synthetic-chat',createdAt:Date.now(),
            pluginName:'synthetic',pluginVersion:'1',phase:'provider',effectsMayHaveOccurred:true,code:'plugin_message',level:'error',
            eventKey:'plugin:synthetic:provider:local-conflict',message:'Synthetic protected write warning'};
        assert.equal(h.notifications.publish(event).status,'stored');const rows=h.notifications.claim(consumer,2);assert.equal(rows.length,1);
        assert.equal(rows[0].event.operationId,event.operationId);assert.deepEqual(h.notifications.acknowledge(consumer,rows.map(row=>({id:row.id,token:row.token}))),[rows[0].id]);
    }
    assert.equal(h.owner.kvList('internal/bg-plugin-failure-receipts/v1/').length,0);
    // Existing v2 reclamation is capacity-triggered, not eager after ACK.
    assert.equal(h.owner.kvList('internal/bg-notifications/v1/').length,1024);
    assert.equal(h.notifications.publish({operationId:'synthetic-terminal-after-warnings',charId:'synthetic-character',chatId:'synthetic-chat',createdAt:Date.now(),
        eventKey:'input-host-unsupported',code:'input_host_unsupported',effectsMayHaveOccurred:true,api:'interactive_ui'}).status,'stored');
    const terminal=h.notifications.claim(consumer,2);assert.equal(terminal.length,1);assert.equal(terminal[0].event.code,'input_host_unsupported');
});

test('unACKed guest message quota cannot consume mandatory protected-write warning admission',async t=>{
    const h=await fixture(t,[]),base={charId:'synthetic-character',chatId:'synthetic-chat',pluginName:'synthetic',pluginVersion:'1',
        phase:'provider',effectsMayHaveOccurred:true,code:'plugin_message',level:'error',message:'Synthetic message'};
    for(let index=0;index<256;index++)assert.equal(h.notifications.publish({...base,createdAt:Date.now(),operationId:'synthetic-guest-'+index,eventKey:'plugin:0:message:1'}).status,'stored');
    assert.equal(h.notifications.publish({...base,createdAt:Date.now(),operationId:'synthetic-guest-overflow',eventKey:'plugin:0:message:1'}).status,'capacity');
    assert.equal(h.notifications.publish({...base,createdAt:Date.now(),operationId:'synthetic-parent-conflict',eventKey:'plugin:0:provider:local-conflict'}).status,'stored');
    assert.equal(h.owner.kvList('internal/bg-notifications/v1/').length,257);assert.equal(h.owner.kvList('internal/bg-plugin-failure-receipts/v1/').length,0);
});

describe('[NF-1] BG plugin RPC carries non-finite numbers', () => {
    const input = [{ role: 'user', content: 'synthetic' }];
    const specialExpressions = [['nan', 'NaN'], ['infinity', 'Infinity'], ['negative-infinity', '-Infinity']];

    test('[unchanged] negative-zero indexes select character and chat zero', async t => {
        const h = await fixture(t, [plugin('nf-negative-zero-index', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            const character=await Risuai.getCharacterFromIndex(-0);const chat=await Risuai.getChatFromIndex(-0,-0);
            return [...messages,{role:'system',content:character.name+':'+chat.name}];
        });`)]);
        h.operationDb.characters.push({ name: 'character-zero', chats: [{ name: 'chat-zero' }] });
        assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input),
            [...input, { role: 'system', content: 'character-zero:chat-zero' }]);
        assert.deepEqual(h.notices(), []);
    });

    test('[new] non-finite indexes reach host validation and disable each fresh plugin session', async t => {
        for (const method of ['getCharacterFromIndex', 'getChatFromIndex']) for (const [label, expression] of specialExpressions) {
            const name = `nf-${method === 'getCharacterFromIndex' ? 'character' : 'chat'}-index-${label}`;
            const invocation = method === 'getCharacterFromIndex'
                ? `Risuai.getCharacterFromIndex(${expression})` : `Risuai.getChatFromIndex(0,${expression})`;
            let apiFrame;
            const h = await fixture(t, [plugin(name, `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                if(messages[0].content==='again')await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});
                else await ${invocation};
                return messages;
            });`)], true, { wireMutation: frame => {
                if (frame.kind === 'call' && frame.args?.[1]?.[0]?.[1] === method) apiFrame = frame;
                return frame;
            } });
            const hook = [...h.registry.replacerbeforeRequest][0];
            await assert.rejects(hook(input), { code: 'plugin_before_request_failed' });
            await assert.rejects(hook([{ role: 'user', content: 'again' }]), { code: 'plugin_before_request_failed' });
            assert.equal(h.network.length, 0);
            const argumentIndex = method === 'getCharacterFromIndex' ? 0 : 1;
            assert.deepEqual(apiFrame.args[1][1][1][argumentIndex],
                ['number', label === 'nan' ? 'NaN' : label === 'infinity' ? 'Infinity' : '-Infinity']);
            const notices = h.notices(); assert.equal(notices.length, 1); assert.equal(notices[0].code, 'plugin_hook_failed');
            assert.equal(notices[0].phase, 'before_request');
        }
    });

    test('[new] setArgument rejects every special number at the host and disables the session', async t => {
        for (const [label, expression] of [...specialExpressions, ['negative-zero', '-0']]) {
            let apiFrame;
            const h = await fixture(t, [plugin(`nf-argument-${label}`, `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                if(messages[0].content==='again')await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});
                else await Risuai.setArgument('sample',${expression});return messages;
            });`)], true, { wireMutation: frame => {
                if (frame.kind === 'call' && frame.args?.[1]?.[0]?.[1] === 'setArgument') apiFrame = frame;
                return frame;
            } });
            const hook = [...h.registry.replacerbeforeRequest][0];
            await assert.rejects(hook(input), { code: 'plugin_before_request_failed' });
            await assert.rejects(hook([{ role: 'user', content: 'again' }]), { code: 'plugin_before_request_failed' });
            assert.equal(h.network.length, 0); assert.equal(h.writes, 0);
            assert.equal(apiFrame.args[1][1][1][1][0], 'number');
            const notices = h.notices(); assert.equal(notices.length, 1); assert.equal(notices[0].code, 'plugin_hook_failed');
            assert.equal(notices[0].phase, 'before_request');
        }
    });

    test('[new] numeric permission names are rejected and disable each fresh plugin session', async t => {
        for (const [label, expression] of [...specialExpressions, ['negative-zero', '-0']]) {
            let apiFrame;
            const h = await fixture(t, [plugin(`nf-permission-${label}`, `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                if(messages[0].content==='again')await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});
                else await Risuai.requestPluginPermission(${expression});return messages;
            });`)], true, { wireMutation: frame => {
                if (frame.kind === 'call' && frame.args?.[1]?.[0]?.[1] === 'requestPluginPermission') apiFrame = frame;
                return frame;
            } });
            const hook = [...h.registry.replacerbeforeRequest][0];
            await assert.rejects(hook(input), { code: 'plugin_before_request_failed' });
            await assert.rejects(hook([{ role: 'user', content: 'again' }]), { code: 'plugin_before_request_failed' });
            assert.equal(h.network.length, 0);
            assert.equal(apiFrame.args[1][1][1][0][0], 'number');
            const notices = h.notices(); assert.equal(notices.length, 1); assert.equal(notices[0].code, 'plugin_permission_missing');
            assert.equal(notices[0].phase, 'before_request');
        }
    });

    test('[new] getCharacter returns nested special numbers without disabling the plugin', async t => {
        const h = await fixture(t, [plugin('nf-character-return', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            const value=await Risuai.getCharacter();return [...messages,{role:'system',content:JSON.stringify([
                Object.is(value.metadata.nan,NaN),Object.is(value.metadata.infinity,Infinity),
                Object.is(value.metadata.negativeInfinity,-Infinity),Object.is(value.metadata.negativeZero,-0)])}];
        });`)]);
        h.operationDb.characters.push({ name: 'special', chats: [], metadata: {
            nan: NaN, infinity: Infinity, negativeInfinity: -Infinity, negativeZero: -0,
        } });
        assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input),
            [...input, { role: 'system', content: '[true,true,true,true]' }]);
        assert.deepEqual(h.notices(), []);
    });

    test('[new] nativeFetch and risuFetch preserve every requestTimeoutMs value to their shared helper boundary', async t => {
        const h = await fixture(t, [plugin('nf-timeout-forwarding', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            for(const requestTimeoutMs of [Infinity,NaN,-Infinity,-0]){
                await Risuai.nativeFetch('https://synthetic.invalid/native',{requestTimeoutMs});
                await Risuai.risuFetch('https://synthetic.invalid/risu',{requestTimeoutMs});
            }return messages;
        });`)]);
        const risu = [];
        h.bindings.risuFetch = async (_url, options) => { risu.push(options.requestTimeoutMs); return { ok: true, data: 'synthetic' }; };
        assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input);
        assert.equal(h.network.length, 4);
        const native = h.network.map(row => row.options.requestTimeoutMs);
        assert.ok(Object.is(native[0], Infinity)); assert.ok(Object.is(native[1], NaN));
        assert.ok(Object.is(native[2], -Infinity)); assert.ok(Object.is(native[3], -0));
        assert.equal(risu.length, 4); assert.ok(Object.is(risu[0], Infinity)); assert.ok(Object.is(risu[1], NaN));
        assert.ok(Object.is(risu[2], -Infinity)); assert.ok(Object.is(risu[3], -0));
        assert.deepEqual(h.notices(), []);
    });

    test('[new] plugin storage keeps its existing JSON normalization after transport succeeds', async t => {
        const h = await fixture(t, [plugin('nf-storage-normalization', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            await Risuai.pluginStorage.setItem('nf',{nan:NaN,infinity:Infinity,negativeInfinity:-Infinity,negativeZero:-0,finite:42});
            const value=await Risuai.pluginStorage.getItem('nf');return [...messages,{role:'system',content:JSON.stringify(value)}];
        });`)]);
        assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), [...input,
            { role: 'system', content: '{"nan":null,"infinity":null,"negativeInfinity":null,"negativeZero":0,"finite":42}' }]);
        assert.deepEqual(h.root.pluginCustomStorage.nf,
            { nan: null, infinity: null, negativeInfinity: null, negativeZero: 0, finite: 42 });
        assert.ok(Object.is(h.root.pluginCustomStorage.nf.negativeZero, +0));
        assert.deepEqual(h.notices(), []);
    });
});

for (const prepared of [false,true])for(const loadFailure of [false,true])test(`conflicting provider names cannot dispatch the first owner, prepared=${prepared}, loadFailure=${loadFailure}`,async t=>{
    const h=await fixture(t,[
        plugin('first-owner',`await Risuai.addProvider('shared',async()=>{await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});return {success:true,content:'first'};});`),
        plugin('second-owner',`await Risuai.addProvider('shared',async()=>({success:true,content:'second'}));${loadFailure?'throw Error("Synthetic registration load failure");':''}`),
        plugin('healthy-owner',`await Risuai.addProvider('healthy',async()=>({success:true,content:'healthy'}));`),
    ],true,{prepared});
    assert.equal(h.host.hasProvider('shared'),false);
    assert.equal(h.host.hasProvider('healthy'),true);
    assert.equal(h.host.hasProvider('absent'),false);
    await assert.rejects(h.registry.providers.get('shared')({}),/plugin_provider_failed/);
    assert.equal(h.network.length,0);assert.equal(h.effects,0);
    assert.deepEqual(await h.registry.providers.get('healthy')({}),{success:true,content:'healthy'});
    assert.equal(h.effects,1);
    assert.deepEqual(h.notices().map(n=>[n.pluginName,n.phase,n.code]),[
        ['second-owner','load','plugin_hook_failed'],['first-owner','provider','plugin_provider_failed'],
    ]);
    await h.host.close();assert.equal(h.host.hasProvider('healthy'),false);assert.equal(h.registry.providers.size,0);
});

for (const prepared of [false,true])test(`mid-callback identity invalidation preserves issued effects and prior input, prepared=${prepared}`,async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('mid-callback',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/first',{});
        await Risuai.nativeFetch('https://synthetic.invalid/must-not-dispatch',{});return [...x,{role:'system',content:'stale'}];});`)],true,{separateRoot:true,prepared});
    let calls=0;h.bindings.nativeFetch=async()=>{calls++;entered();await held;return new Response('first');};
    const input=[{role:'user',content:'kept'}],hook=[...h.registry.replacerbeforeRequest][0],pending=hook(input);
    await started;h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,script:p.script+'\n// changed'}))};release();
    assert.deepEqual(await pending,input);assert.equal(calls,1);assert.equal(h.effects,1);
    assert.deepEqual(h.notices().map(n=>[n.code,n.phase,n.effectsMayHaveOccurred]),[['plugin_hook_failed','before_request',true]]);
    assert.deepEqual(await hook(input),input);assert.equal(calls,1);assert.equal(h.notices().length,1);assert.equal(h.controller.signal.aborted,false);
});

test('a callback return is rechecked before a stale transformation can replace its input',async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('return-check',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/first',{});return [...x,{role:'system',content:'stale'}];});`)],true,{separateRoot:true});
    h.bindings.nativeFetch=async()=>{entered();await held;return new Response('first');};
    const input=[{role:'user',content:'kept'}],pending=[...h.registry.replacerbeforeRequest][0](input);
    await started;h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,enabled:false}))};release();
    assert.deepEqual(await pending,input);assert.equal(h.notices().length,1);assert.equal(h.effects,1);
});

test('identity is rechecked after the effect-intent await before network dispatch',async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('effect-check',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/must-not-dispatch',{});return x;});`)],true,
        {separateRoot:true,beforeEffect:()=>{entered();return held;}});
    const input=[{role:'user',content:'kept'}],pending=[...h.registry.replacerbeforeRequest][0](input);
    await started;h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,enabled:false}))};release();
    assert.deepEqual(await pending,input);assert.equal(h.network.length,0);
    assert.equal(h.effects,1);assert.equal(h.notices()[0].effectsMayHaveOccurred,false);
});

test('the latest canonical root mutator refuses a write after identity changes while queued',async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('queued-write',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.pluginStorage.setItem('must-not-write','stale');return x;});`)],true,
        {separateRoot:true,beforeRootWrite:()=>{entered();return held;}});
    const input=[{role:'user',content:'kept'}],pending=[...h.registry.replacerbeforeRequest][0](input);
    await started;h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,script:p.script+'\n// changed'}))};release();
    assert.deepEqual(await pending,input);assert.equal(h.writes,0);assert.equal(h.root.pluginCustomStorage['must-not-write'],undefined);
    assert.equal(h.notices()[0].effectsMayHaveOccurred,true);
});

test('local KV transactions check canonical identity synchronously before committing',async t=>{
    let h,transactions=0;h=await fixture(t,[plugin('local-write',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        const local=await Risuai.getLocalPluginStorage();await local.setItem('must-not-write','stale');return x;});`)],true,
        {separateRoot:true,beforeLocalTransaction:()=>{transactions++;h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,enabled:false}))};}});
    const input=[{role:'user',content:'kept'}];assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input),input);
    assert.equal(transactions,1);assert.deepEqual(h.owner.kvList('cache/plugin-storage/'),[]);assert.equal(h.notices().length,1);
});

test('relative reorder omits only inverted contexts and preserves a later unrelated hook',async t=>{
    const h=await fixture(t,['first','second','last'].map(name=>plugin(name,`await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'${name}'}]);`)),true,{separateRoot:true});
    const hooks=[...h.registry.replacerbeforeRequest];h.root={...h.root,plugins:[h.root.plugins[1],h.root.plugins[0],h.root.plugins[2]]};
    assert.deepEqual(await hooks[0]([]),[]);assert.deepEqual(await hooks[1]([]),[]);assert.deepEqual(await hooks[2]([]),[{role:'system',content:'last'}]);
    assert.deepEqual(h.notices().map(n=>n.pluginName).sort(),['first','second']);
});

test('a committed argument write does not recreate or dereference an absent snapshot plugin',async t=>{
    const h=await fixture(t,[plugin('missing-shadow',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.setArgument('sample','canonical');return [...x,{role:'system',content:await Risuai.getArgument('sample')}];});`)],true,{separateRoot:true});
    h.operationDb.plugins=[];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[{role:'system',content:'canonical'}]);
    assert.equal(h.writes,1);assert.equal(h.root.plugins[0].realArg.sample,'canonical');assert.deepEqual(h.operationDb.plugins,[]);assert.deepEqual(h.notices(),[]);
});

test('script-digest permission remains bound to the loaded code when the snapshot script differs',async t=>{
    const {createHash}=require('node:crypto');const p=plugin('pinned-permission',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.getDatabase(['plugins']);return x;});`);
    const h=await fixture(t,[p],true,{separateRoot:true});
    h.owner.kvSet('cache/plugin-permissions/state.json',JSON.stringify({given:[],denied:[],cache:[
        [JSON.stringify([p.name,'db'])+'_lastGrantTime',Date.now()],[createHash('sha256').update(p.script).digest('hex')+'_db',true]]}));
    h.operationDb.plugins[0].script+='\n// snapshot only';assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[]);
    assert.deepEqual(h.notices(),[]);assert.equal(h.effects,0);
});

test('constructor canonical failure is classified before any guest initialization effect',async t=>{
    let critical=0,intents=0,notices=0;
    await assert.rejects(fixture(t,[plugin('constructor-root',`await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});`)],true,
        {peekRoot:()=>null,getRoot:async()=>{throw Error('synthetic read failure');},onCriticalFailure:()=>critical++,
            beforeEffect:()=>intents++,publishNotification:()=>{notices++;return {status:'stored'};}}),{code:'plugin_identity_unavailable'});
    assert.equal(critical,1);assert.equal(intents,0);assert.equal(notices,0);
});

test('malformed latest-root validation latches the same authority failure as a failed peek',async t=>{
    let h,failures=0;h=await fixture(t,[plugin('bad-latest',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.pluginStorage.setItem('must-not-write','bad');return x;});`)],true,
        {beforeRootWrite:()=>{h.root=null;},onCriticalFailure:()=>failures++});
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]),{code:'plugin_identity_unavailable'});
    assert.equal(h.writes,0);assert.equal(failures,1);assert.equal(h.controller.signal.aborted,true);
});

test('cancellation during a cold identity reload cannot issue the waiting network effect',async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('cancel-cold',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{});return x;});`)],true);
    h.owner.peekRoot=()=>null;h.owner.getRoot=async()=>{entered();await held;return h.root;};
    const pending=[...h.registry.replacerbeforeRequest][0]([]);await started;h.controller.abort();release();await assert.rejects(pending);
    assert.equal(h.network.length,0);assert.equal(h.effects,0);assert.deepEqual(h.notices(),[]);
});

test('an empty identity cache reloads once without disabling an unchanged hook',async t=>{
    let reads=0;const h=await fixture(t,[plugin('cold-identity',`await Risuai.addRisuReplacer('beforeRequest',x=>x);`)],true,{separateRoot:true});
    let missing=true;h.owner.peekRoot=()=>missing?undefined:h.root;h.owner.getRoot=async()=>{reads++;missing=false;return h.root;};
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[]);assert.equal(reads,1);assert.deepEqual(h.notices(),[]);
    assert.equal(h.controller.signal.aborted,false);
});

test('a local transaction cache miss reloads outside the transaction and commits once without replaying intent',async t=>{
    let h,missing=false,transactions=0,reloads=0;
    h=await fixture(t,[plugin('local-cache',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        const local=await Risuai.getLocalPluginStorage();await local.setItem('kept','value');return x;});`)],true,
        {separateRoot:true,onRootRead:()=>{reloads++;missing=false;},beforeLocalTransaction:()=>{if(++transactions===1)missing=true;}});
    h.owner.peekRoot=()=>missing?undefined:h.root;
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[]);assert.equal(transactions,2);assert.equal(reloads,1);
    assert.equal(h.owner.kvList('cache/plugin-storage/').length,1);assert.equal(h.effects,1);assert.deepEqual(h.notices(),[]);
});

test('a second local cache eviction omits only that context without replay or a false operation failure',async t=>{
    let h,missing=false,transactions=0,reloads=0;
    h=await fixture(t,[plugin('unstable-local',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        const local=await Risuai.getLocalPluginStorage();await local.setItem('must-not-write','value');return x;});`),
        plugin('stable-local',`await Risuai.addRisuReplacer('beforeRequest',x=>x);`)],true,
        {onRootRead:()=>{reloads++;missing=false;},beforeLocalTransaction:()=>{transactions++;missing=true;}});
    h.owner.peekRoot=()=>missing?undefined:h.root;
    const hooks=[...h.registry.replacerbeforeRequest],input=[{role:'user',content:'kept'}];assert.deepEqual(await hooks[0](input),input);
    assert.equal(transactions,2);assert.equal(reloads,1);assert.equal(h.effects,1);assert.deepEqual(h.owner.kvList('cache/plugin-storage/'),[]);
    assert.deepEqual(h.notices().map(n=>[n.code,n.api]),[['plugin_api_unsupported','plugin_identity_cache_unstable']]);
    assert.equal(h.controller.signal.aborted,false);assert.deepEqual(await hooks[1](input),input);assert.equal(reloads,2);
});

test('moving an already-failed context does not invalidate a remaining healthy hook',async t=>{
    const h=await fixture(t,[plugin('failed-order',`await Risuai.addRisuReplacer('beforeRequest',()=>{throw Error('fixture failure');});`),
        plugin('healthy-order',`await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'kept'}]);`)],true,{separateRoot:true});
    const hooks=[...h.registry.replacerbeforeRequest];await assert.rejects(hooks[0]([]),{code:'plugin_before_request_failed'});
    h.root={...h.root,plugins:[h.root.plugins[1],h.root.plugins[0]]};assert.deepEqual(await hooks[1]([]),[{role:'system',content:'kept'}]);
    assert.equal(h.notices().length,1);
});

test('identity checks do not enter the queued getRoot path for plain callbacks',async t=>{
    const h=await fixture(t,[plugin('no-queue-read',`await Risuai.addRisuReplacer('beforeRequest',x=>x);`)],true,{separateRoot:true});
    h.owner.getRoot=()=>{throw Error('queue must not be acquired');};
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[]);assert.deepEqual(h.notices(),[]);
});

test('a failed identity peek ends the operation once without blaming a plugin or issuing effects',async t=>{
    let failures=0;const h=await fixture(t,[plugin('peek-failure',`await Risuai.addRisuReplacer('beforeRequest',x=>x);`)],true,
        {separateRoot:true,onCriticalFailure:()=>failures++});
    h.owner.peekRoot=()=>{throw Error('synthetic canonical failure');};
    const hook=[...h.registry.replacerbeforeRequest][0];await assert.rejects(hook([]),{code:'plugin_identity_unavailable'});
    await assert.rejects(hook([]),{code:'plugin_identity_unavailable'});await assert.rejects(h.host.assertNotifications(),{code:'plugin_identity_unavailable'});
    assert.equal(failures,1);assert.equal(h.controller.signal.aborted,true);assert.equal(h.effects,0);assert.deepEqual(h.notices(),[]);
});

test('a disabled hook awaits its mandatory notice before passing through',async t=>{
    let entered,release;const started=new Promise(r=>entered=r),held=new Promise(r=>release=r);
    const h=await fixture(t,[plugin('notice-wait',`await Risuai.addRisuReplacer('beforeRequest',x=>x);`)],true,
        {separateRoot:true,publishNotification:async()=>{entered();await held;return {status:'stored'};}});
    const hook=[...h.registry.replacerbeforeRequest][0];h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,enabled:false}))};
    let done=0;const first=hook([]).then(()=>done++);await started;const second=hook([]).then(()=>done++);
    assert.equal(done,0);release();await Promise.all([first,second]);assert.equal(done,2);
});

for (const mutation of ['script', 'name', 'version', 'disable', 'remove', 'reorder']) {
    for (const initialized of [false, true]) test(`attached-boundary ${mutation} keeps prior effects=${initialized} without reloading`, async t => {
        const script = `${initialized ? "await Risuai.nativeFetch('https://synthetic.invalid/init',{});" : ''}
            await Risuai.addRisuReplacer('beforeRequest',async x=>{
                await Risuai.nativeFetch('https://synthetic.invalid/old-hook',{});return x;
            });`;
        const h = await fixture(t, [plugin('changing', script), plugin('healthy',
            `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'healthy'}]);`)], true, { separateRoot: true });
        const hooks = [...h.registry.replacerbeforeRequest]; assert.equal(hooks.length, 2);
        const next = structuredClone(h.root);
        if (mutation === 'script') next.plugins[0].script += "\nawait Risuai.nativeFetch('https://synthetic.invalid/new-init',{});";
        if (mutation === 'name') next.plugins[0].name = 'replacement';
        if (mutation === 'version') next.plugins[0].version = '3.1';
        if (mutation === 'disable') next.plugins[0].enabled = false;
        if (mutation === 'remove') next.plugins.shift();
        if (mutation === 'reorder') next.plugins.reverse();
        h.root = next;
        // A root-only update is not an operation DB swap. No refresh authority
        // is fabricated from getRoot's newer value.
        await h.host.refreshIdentity(); assert.deepEqual(h.notices(), []);
        h.swapOperationDb(); await h.host.refreshIdentity();
        const input = [{role:'user',content:'kept'}];
        assert.deepEqual(await hooks[0](input), input);
        const cascade = mutation === 'reorder';
        assert.deepEqual(await hooks[1](input), cascade ? input : [...input,{role:'system',content:'healthy'}]);
        assert.equal(h.network.length, Number(initialized)); assert.equal(h.effects, Number(initialized));
        const notices = h.notices(), old = notices.find(n => n.pluginName === 'changing');
        assert.ok(old); assert.equal(old.effectsMayHaveOccurred, initialized);
        assert.equal(old.code, 'plugin_hook_failed');
        assert.equal(notices.filter(n => n.pluginName === 'healthy').length, Number(cascade));
        assert.equal(notices.filter(n => n.pluginName === 'replacement').length, Number(mutation === 'name'));
        await h.host.refreshIdentity(); assert.equal(h.notices().length, notices.length, 'durable receipt deduplicates refresh');
        await h.host.close(); assert.equal(h.registry.replacerbeforeRequest.size, 0);
    });
}

test('tail append warns without running new initialization or changing the existing chain', async t => {
    const h = await fixture(t, [plugin('original', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`)], true, {separateRoot:true});
    const hook = [...h.registry.replacerbeforeRequest][0];
    h.root = {...h.root,plugins:[...h.root.plugins,plugin('appended',`await Risuai.nativeFetch('https://synthetic.invalid/new-init',{});`)]};
    h.swapOperationDb(); await h.host.refreshIdentity();
    assert.deepEqual(await hook([]), []); assert.equal(h.network.length,0); assert.equal(h.effects,0);
    assert.equal(h.registry.replacerbeforeRequest.size,1);
    assert.deepEqual(h.notices().map(n=>[n.pluginName,n.code,n.api,n.effectsMayHaveOccurred]),
        [['appended','plugin_api_unsupported','plugin_set_changed',false]]);
});

test('live argument reads change without reinitialization while conditional roles stay at load epoch', async t => {
    const script = `const registered=await Risuai.getArgument('sample');let calls=0;
        if(registered==='enabled')await Risuai.addRisuReplacer('beforeRequest',async x=>
            [...x,{role:'system',content:registered+':'+(++calls)+':'+await Risuai.getArgument('sample')}]);`;
    const h = await fixture(t,[{...plugin('conditional-epoch',script),realArg:{sample:'enabled'}}],true,{separateRoot:true});
    const hook = [...h.registry.replacerbeforeRequest][0]; assert.equal(typeof hook,'function');
    h.root = {...h.root,plugins:h.root.plugins.map(p=>({...p,realArg:{sample:'disabled'}}))};
    assert.equal(h.operationDb.plugins[0].realArg.sample,'enabled');
    assert.deepEqual(await hook([]),[{role:'system',content:'enabled:1:disabled'}]);
    h.swapOperationDb(); await h.host.refreshIdentity();
    assert.deepEqual(await hook([]),[{role:'system',content:'enabled:2:disabled'}]);
    assert.deepEqual(h.notices(),[]); assert.equal(h.network.length,0);
    await h.host.close();
    const fresh=await fixture(t,structuredClone(h.root.plugins),true,{separateRoot:true});
    assert.equal(fresh.registry.replacerbeforeRequest.size,0); assert.deepEqual(fresh.notices(),[]);
});

test('disabled same-name duplicate refuses argument access without writing or replaying initialization', async t => {
    const h=await fixture(t,[plugin('duplicate-root',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.getArgument('sample');return x;});`)],true,{separateRoot:true});
    const hook=[...h.registry.replacerbeforeRequest][0];
    h.root={...h.root,plugins:[...h.root.plugins,{...h.root.plugins[0],enabled:false}]};
    // The operation snapshot remains unique; canonical argument identity does not.
    await h.host.refreshIdentity(); assert.deepEqual(h.notices(),[]);
    const input=[{role:'user',content:'kept'}]; assert.deepEqual(await hook(input),input);
    assert.equal(h.writes,0); assert.equal(h.network.length,0);
    assert.deepEqual(h.notices().map(n=>[n.pluginName,n.effectsMayHaveOccurred]),[['duplicate-root',false]]);
});

test('canonical script replacement is caught before the next callback can issue network calls', async t => {
    const h=await fixture(t,[plugin('post-boundary',`await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/issued-before-read',{});
        await Risuai.getArgument('sample');return x;});`)],true,{separateRoot:true});
    await h.host.refreshIdentity();
    h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,script:p.script+'\n// canonical update'}))};
    const input=[{role:'user',content:'kept'}]; assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input),input);
    assert.equal(h.network.length,0); assert.equal(h.effects,0); assert.equal(h.writes,0);
    assert.deepEqual(h.notices().map(n=>[n.code,n.phase,n.effectsMayHaveOccurred]),[['plugin_hook_failed','before_request',false]]);
});

test('identity-disabled provider throws while its prior registered entry stays owned until close', async t => {
    const h=await fixture(t,[plugin('provider-epoch',`await Risuai.addProvider('epoch-model',async()=>({success:true,content:'old'}));`)],true,{separateRoot:true});
    const provider=h.registry.providers.get('epoch-model'); assert.equal(typeof provider,'function');
    h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,script:p.script+'\n// replacement'}))};
    h.swapOperationDb(); await h.host.refreshIdentity();
    await assert.rejects(provider({}),{code:'plugin_provider_failed'});
    assert.equal(h.registry.providers.get('epoch-model'),provider); assert.equal(h.effects,0);
    assert.equal(h.notices().length,1); await h.host.close(); assert.equal(h.registry.providers.size,0);
});

for (const grant of ['given','digest']) test(`provider ${grant} permission works normally but canonical replacement blocks future effects`, async t => {
    const {createHash}=require('node:crypto');
    const p=plugin('grant-epoch',`await Risuai.addProvider('grant-model',async()=>({success:true,content:'owned'}));
        await Risuai.addRisuReplacer('beforeRequest',async x=>{await Risuai.getArgument('sample');return x;});`);
    const h=await fixture(t,[p],true,{separateRoot:true});
    const permissions=['provider','replacer'],cache=[];
    for(const name of permissions){cache.push([JSON.stringify([p.name,name])+'_lastGrantTime',Date.now()]);
        if(grant==='digest')cache.push([createHash('sha256').update(p.script).digest('hex')+'_'+name,true]);}
    h.owner.kvSet('cache/plugin-permissions/state.json',JSON.stringify({
        given:grant==='given'?permissions.map(name=>JSON.stringify([p.name,name])):[],denied:[],cache}));
    assert.deepEqual(await h.registry.providers.get('grant-model')({}),{success:true,content:'owned'});
    assert.equal(h.effects,1);assert.deepEqual(h.notices(),[]);
    h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,script:p.script+'\n// persisted replacement'}))};
    await assert.rejects(h.registry.providers.get('grant-model')({}),{code:'plugin_provider_failed'});
    const input=[{role:'user',content:'kept'}];assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input),input);
    assert.deepEqual(h.notices().map(n=>[n.code,n.effectsMayHaveOccurred]),[['plugin_provider_failed',true]]);
    await assert.rejects(h.registry.providers.get('grant-model')({}),{code:'plugin_provider_failed'});
    assert.equal(h.effects,1);assert.equal(h.network.length,0);
});

test('canonical argument conflict preserves the external value and rejects a stale setter', async t => {
    const h=await fixture(t,[plugin('argument-cas',`let observed;
        await Risuai.addRisuReplacer('beforeRequest',async x=>{
            if(x[0].content==='read') observed=await Risuai.getArgument('sample');
            else await Risuai.setArgument('sample','guest-write');return x;});`)],true,{separateRoot:true});
    const hook=[...h.registry.replacerbeforeRequest][0];await hook([{role:'user',content:'read'}]);
    h.root={...h.root,plugins:h.root.plugins.map(p=>({...p,realArg:{sample:'external-edit'}}))};
    const input=[{role:'user',content:'write'}];await assert.rejects(hook(input),{code:'plugin_before_request_failed'});
    assert.equal(h.root.plugins[0].realArg.sample,'external-edit');assert.equal(h.writes,0);
    assert.equal(h.operationDb.plugins[0].realArg.sample,'original');
    // effect() is a conservative intent latch; a rejected transaction can still
    // report effectsMayHaveOccurred=true without a durable write.
    assert.equal(h.effects,1);assert.deepEqual(h.notices().map(n=>[n.code,n.effectsMayHaveOccurred]),[['plugin_hook_failed',true]]);
});

for(const position of [0,1])test(`insertion at enabled index ${position} records addition and preserves the original relative hook order`,async t=>{
    const originals=['first','second'].map(name=>plugin(name,`await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'${name}'}]);`));
    const h=await fixture(t,originals,true,{separateRoot:true}),hooks=[...h.registry.replacerbeforeRequest];
    const plugins=structuredClone(h.root.plugins);plugins.splice(position,0,plugin('inserted',`await Risuai.nativeFetch('https://synthetic.invalid/new-init',{});`));
    h.root={...h.root,plugins};h.swapOperationDb();await h.host.refreshIdentity();
    for(let index=0;index<hooks.length;index++)assert.deepEqual(await hooks[index]([]),[{role:'system',content:originals[index].name}]);
    assert.equal(h.network.length,0);assert.equal(h.effects,0);
    const notices=h.notices();assert.deepEqual(notices.map(n=>n.pluginName),['inserted']);
    assert.equal(notices.find(n=>n.pluginName==='inserted').api,'plugin_set_changed');
    assert.ok(notices.every(n=>n.effectsMayHaveOccurred===false));
});

test('two enabled same-name entries are omitted before either initialization effect',async t=>{
    const h=await fixture(t,[plugin('enabled-duplicate',`await Risuai.nativeFetch('https://synthetic.invalid/first-init',{});
        await Risuai.addRisuReplacer('beforeRequest',async x=>{await Risuai.getArgument('sample');return x;});`),
        plugin('enabled-duplicate',`await Risuai.nativeFetch('https://synthetic.invalid/second-init',{});`)],true,{separateRoot:true});
    assert.equal(h.network.length,0);assert.equal(h.registry.replacerbeforeRequest.size,0);assert.equal(h.writes,0);
    assert.deepEqual(h.notices().map(n=>[n.pluginName,n.code,n.api,n.effectsMayHaveOccurred]),
        [['enabled-duplicate','plugin_api_unsupported','plugin_identity_ambiguous',false]]);
});

test('successful argument write mirrors into operation DB and survives later swap/refresh without identity failure',async t=>{
    const h=await fixture(t,[plugin('argument-success',`let count=0;await Risuai.addRisuReplacer('beforeRequest',async x=>{
        if(++count===1)await Risuai.setArgument('sample','guest-write');
        return [...x,{role:'system',content:await Risuai.getArgument('sample')}];});`)],true,{separateRoot:true});
    const hook=[...h.registry.replacerbeforeRequest][0];assert.deepEqual(await hook([]),[{role:'system',content:'guest-write'}]);
    assert.equal(h.writes,1);assert.equal(h.root.plugins[0].realArg.sample,'guest-write');assert.equal(h.operationDb.plugins[0].realArg.sample,'guest-write');
    h.swapOperationDb();await h.host.refreshIdentity();assert.deepEqual(await hook([]),[{role:'system',content:'guest-write'}]);
    assert.equal(h.writes,1);assert.deepEqual(h.notices(),[]);assert.equal(h.network.length,0);
});

for (const kind of ['frame', 'value']) test(`caught local RPC ${kind} refusal is durable and preserves the next valid call`, async t => {
    const h = await fixture(t, [plugin('local-' + kind, `
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{
            if(xs[0].content==='large') {
                try { await Risuai.nativeFetch('https://synthetic.invalid', {method:'POST',body:
                    ${kind === 'frame' ? "'x'.repeat(9*1024*1024)" : 'Array(100001).fill(0)'}}); } catch {}
            } else await Risuai.nativeFetch('https://synthetic.invalid', {method:'POST',body:'small'});
            return xs;
        });
    `)]);
    const hook = [...h.registry.replacerbeforeRequest][0];
    await hook([{ role: 'user', content: 'large' }]);
    assert.equal(h.network.length, 0); assert.equal(h.effects, 0);
    const notices = h.notices(); assert.equal(notices.length, 1);
    assert.equal(notices[0].code, 'plugin_host_limit'); assert.ok(notices[0].eventKey.endsWith(':limit'));
    assert.equal(notices[0].effectsMayHaveOccurred, false);
    await hook([{ role: 'user', content: 'small' }]);
    assert.equal(h.network.length, 1); assert.equal(h.effects, 1);
});

test('parallel local frame refusals await one immutable notification', async t => {
    let entered = 0, release, notified;
    const noticeStarted = new Promise(resolve => { notified = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const h = await fixture(t, [plugin('parallel-local', `
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{
            await Promise.all([1,2].map(async()=>{try {await Risuai.nativeFetch('https://synthetic.invalid',
                {method:'POST',body:'x'.repeat(9*1024*1024)});}catch{}})); return xs;
        });
    `)], true, { publishNotification: async event => {
        assert.equal(event.code, 'plugin_host_limit'); entered++; notified(); await held; return { status: 'stored' };
    } });
    let done = false;
    const pending = [...h.registry.replacerbeforeRequest][0]([]).then(() => { done = true; });
    await noticeStarted; assert.equal(done, false); assert.equal(entered, 1); assert.equal(h.effects, 0);
    release(); await pending; assert.equal(entered, 1); assert.equal(h.network.length, 0);
});

test('local frame refusal publication failure remains mandatory despite a caught guest error', async t => {
    const h = await fixture(t, [plugin('local-publication', `
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{try {await Risuai.nativeFetch('https://synthetic.invalid',
            {method:'POST',body:'x'.repeat(9*1024*1024)});}catch{}return xs;});
    `)], true, { publishNotification: () => { throw Error('synthetic store failure'); } });
    await [...h.registry.replacerbeforeRequest][0]([]).catch(() => {});
    await assert.rejects(h.host.assertNotifications(), { code: 'plugin_notification_unavailable' });
    assert.equal(h.network.length, 0); assert.equal(h.effects, 0); assert.equal(h.controller.signal.aborted, true);
});

for(const kind of ['frame','value'])test(`real guest reuses refused ${kind} stream/response/callback/signal without API effects`,async t=>{
    const observed=[];
    const h=await fixture(t,[plugin('handle-reuse',`
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{
            const stream=new ReadableStream({pull(c){c.enqueue('stream-kept');c.close();}},{highWaterMark:0});
            const response=new Response('response-kept');const controller=new AbortController();const fn=x=>'callback-'+x;
            const handles={extraStream:stream,extraResponse:response,extraFn:fn,extraSignal:controller.signal};
            try{await Risuai.nativeFetch('https://synthetic.invalid/must-not-run',{...handles,bad:${kind==='frame'?"'x'.repeat(9*1024*1024)":"Array(100001).fill(0)"}});}catch{}
            if(stream.locked||response.body.locked||response.bodyUsed)throw Error('refused body was consumed or locked');
            const result=await Risuai.nativeFetch('https://synthetic.invalid/next',handles);
            controller.abort();return [...xs,{role:'system',content:await result.text()}];
        });
    `)],true,{nativeFetch:async(url,init)=>{
        assert.equal(url,'https://synthetic.invalid/next');const reader=init.extraStream.getReader();
        assert.equal((await reader.read()).value,'stream-kept');assert.equal((await reader.read()).done,true);
        assert.equal(await init.extraResponse.text(),'response-kept');assert.equal(await init.extraFn('kept'),'callback-kept');
        observed.push(init.extraSignal);return new Response('handles reused');
    }});
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[{role:'system',content:'handles reused'}]);
    assert.equal(h.network.length,1);assert.equal(h.effects,1);assert.equal(observed.length,1);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(observed[0].aborted,true);
    const notices=h.notices();assert.equal(notices.length,1);assert.equal(notices[0].code,'plugin_host_limit');
    assert.equal(notices[0].phase,'before_request');assert.equal(notices[0].effectsMayHaveOccurred,false);
    await h.host.close();assert.equal(h.registry.replacerbeforeRequest.size,0);
});

test('local frame refusal during initialization settles before ready without disabling a later hook', async t => {
    const h = await fixture(t, [plugin('local-load', `
        try {await Risuai.nativeFetch('https://synthetic.invalid',{method:'POST',body:'x'.repeat(9*1024*1024)});}catch{}
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{await Risuai.nativeFetch('https://synthetic.invalid',{method:'POST',body:'small'});return xs;});
    `)]);
    assert.equal(h.registry.replacerbeforeRequest.size, 1); assert.equal(h.network.length, 0);
    const notices = h.notices(); assert.equal(notices.length, 1); assert.equal(notices[0].phase, 'load');
    await [...h.registry.replacerbeforeRequest][0]([]); assert.equal(h.network.length, 1);
});
test('local refusal notification capacity remains an operation failure', async t => {
    const h = await fixture(t, [plugin('local-capacity', `
        await Risuai.addRisuReplacer('beforeRequest',async xs=>{try {await Risuai.nativeFetch('https://synthetic.invalid',
            {method:'POST',body:'x'.repeat(9*1024*1024)});}catch{}return xs;});
    `)], true, { publishNotification: () => ({ status: 'capacity' }) });
    await [...h.registry.replacerbeforeRequest][0]([]).catch(() => {});
    await assert.rejects(h.host.assertNotifications(), { code: 'plugin_notification_unavailable' });
    assert.equal(h.controller.signal.aborted, true); assert.equal(h.effects, 0); assert.equal(h.network.length, 0);
});
test('uncaught local frame refusal retains separate API and terminal resource notices', async t => {
    const h = await fixture(t, [plugin('uncaught-local', `
        await Risuai.addRisuReplacer('beforeRequest',async()=>Risuai.nativeFetch('https://synthetic.invalid',
            {method:'POST',body:'x'.repeat(9*1024*1024)}));
    `)]);
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]), { code: 'plugin_before_request_failed' });
    const notices = h.notices(); assert.equal(notices.length, 2);
    assert.ok(notices.every(n => n.code === 'plugin_host_limit' && n.effectsMayHaveOccurred === false));
    assert.deepEqual(notices.map(n => n.eventKey.split(':').at(-1)).sort(), ['failure', 'limit']);
    assert.equal(h.network.length, 0);
});

test('generic before/after/script/body/provider APIs install and clean up', async t => {
    const h = await fixture(t, [plugin('generic', `
        await Risuai.addRisuReplacer('beforeRequest',async xs=>[...xs,{role:'system',content:await Risuai.getArgument('sample')}]);
        await Risuai.addRisuReplacer('afterRequest',async text=>text+'!');
        await Risuai.addRisuScriptHandler('input',async text=>text+' input');
        await Risuai.addRisuScriptHandler('output',async()=>null);
        await Risuai.registerBodyIntercepter(async body=>body);
        await Risuai.addProvider('generic',async args=>({success:true,content:args.mode}));
        await Risuai.onUnload(async()=>Risuai.hideContainer());
    `)]);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), [{ role: 'system', content: 'original' }]);
    assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer!');
    assert.equal(await [...h.registry.editinput][0]('text'), 'text input');
    assert.equal(await [...h.registry.editoutput][0]('text'), null);
    assert.deepEqual(await h.registry.providers.get('generic')({ mode: 'model' }), { success: true, content: 'v3' });
    assert.equal(h.bindings.bodyInterceptors.length, 1);
    await h.host.close();
    for (const value of Object.values(h.registry)) assert.equal(value.size, 0);
    assert.equal(h.bindings.bodyInterceptors.length, 0);
});

test('missing permission has no effect and creates one durable refusal', async t => {
    const h = await fixture(t, [plugin('denied', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`)], false);
    assert.equal(h.registry.replacerbeforeRequest.size, 0);
    assert.equal(h.effects, 0);
    assert.equal(h.notices().length, 1);
    assert.equal(h.notices()[0].code, 'plugin_permission_missing');
    assert.equal(h.notices()[0].effectsMayHaveOccurred, false);
});

test('failed hook keeps previous chain value and disables only its plugin', async t => {
    const h = await fixture(t, [plugin('first', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'first'}]);`),
        plugin('second', `await Risuai.addRisuReplacer('beforeRequest',x=>{x.length=0;throw Error('private text');});`),
        plugin('third', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'third'}]);`)]);
    let messages = [], ran = 0, failure;
    for (const hook of h.registry.replacerbeforeRequest) {
        ran++;
        try { messages = await hook(messages); } catch (error) { failure = error; break; }
    }
    assert.equal(failure?.code, 'plugin_before_request_failed');
    assert.equal(ran, 2, 'the third hook never runs');
    assert.deepEqual(messages.map(message => message.content), ['first']);
    assert.equal(h.notices().length, 1);
    assert.equal(h.notices()[0].code, 'plugin_hook_failed');
    assert.equal(JSON.stringify(h.notices()).includes('private text'), false);
});

test('network preserves arbitrary target payload and shared effect gate', async t => {
    const h = await fixture(t, [plugin('generic-network', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        const r=await Risuai.nativeFetch('http://127.0.0.1:43210/custom',{method:'PUT',headers:{'x-custom':'value'},body:'payload'});
        return [...xs,{role:'system',content:await r.text()}];});`)]);
    const result = await [...h.registry.replacerbeforeRequest][0]([]);
    assert.equal(result[0].content, 'synthetic-response');
    assert.equal(h.network.length, 1);
    assert.equal(h.network[0].url, 'http://127.0.0.1:43210/custom');
    assert.equal(h.network[0].options.body, 'payload');
    assert.equal(h.network[0].options.headers['x-custom'], 'value');
    assert.ok(h.network[0].options.signal instanceof AbortSignal);
    assert.equal(h.effects, 1);
});

test('caught absent API call stays enabled, uses the hook result, and is diagnostic-only', async t => {
    const diagnostics = [];
    const h = await fixture(t, [plugin('unsupported', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        try{await Risuai.setDatabase({plugins:[]});}catch{}return [];});`)], true,
        { publishDiagnostic: value => diagnostics.push(value) });
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), []);
    assert.equal(h.root.plugins.length, 1);
    assert.equal(h.root.plugins[0].enabled, true);
    assert.deepEqual(h.notices(), []);
    await h.host.close();
    assert.deepEqual(diagnostics[0].absentApis, [{ api: 'setDatabase', phase: 'before_request' }]);
});

test('forged unknown root RPC bypassing the proxy keeps plugin_api_unsupported behavior', async t => {
    const h = await fixture(t, [plugin('forged-unknown', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        await Risuai.getRuntimeInfo();return [];});`)], true, { wireMutation: frame => {
        if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
            return { ...frame, args: ['array', [['value', 'forgedUnknownRoot'], frame.args[1][1]]] };
        }
        return frame;
    } });
    const input = [{ role: 'user', content: 'kept' }];
    await assert.rejects([...h.registry.replacerbeforeRequest][0](input), { code: 'plugin_before_request_failed' });
    assert.equal(h.root.plugins.length, 1);
    assert.equal(h.notices()[0].code, 'plugin_api_unsupported');
    assert.equal(h.notices()[0].api, 'forged_unknown_root');
});

test('exposed method rejected by parent policy keeps plugin_api_unsupported behavior', async t => {
    const h = await fixture(t, [plugin('policy-rejected', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        await Risuai.getArg('another-plugin::sample');return [];});`)]);
    const input = [{ role: 'user', content: 'kept' }];
    await assert.rejects([...h.registry.replacerbeforeRequest][0](input), { code: 'plugin_before_request_failed' });
    assert.equal(h.root.plugins.length, 1);
    assert.equal(h.notices()[0].code, 'plugin_api_unsupported');
    assert.equal(h.notices()[0].api, 'get_arg');
});

test('root and local writes preserve shared keys and ownership sidecars', async t => {
    const p = plugin('storage', `await Risuai.pluginStorage.setItem('new', {value:1});
        await Risuai.setArgument('sample','changed');
        const local=await Risuai.getLocalPluginStorage();await local.setItem('local',{value:2});
        await Risuai.log(await Risuai.pluginStorage.getItem('zero'));`);
    const h = await fixture(t, [p, plugin('untouched', '')]);
    assert.deepEqual(h.root.pluginCustomStorage, { existing: 'kept', zero: 0, new: { value: 1 } });
    assert.equal(h.root.plugins[0].realArg.sample, 'changed');
    assert.deepEqual(h.root.plugins[1], plugin('untouched', ''));
    assert.equal(h.root.pluginStorageMeta.new.plugin, 'storage');
    assert.equal(JSON.parse(h.owner.kvGet('cache/plugin-storage/bG9jYWw.json')).value, 2);
    assert.equal(JSON.parse(h.owner.kvGet('cache/plugin-storage-meta/bG9jYWw.json')).plugin, 'storage');
    assert.equal(h.notices()[0].message, 'null');
    assert.equal(h.notifications.claim('old-consumer').length, 0, 'old clients cannot claim v2 messages');
});

test('per-key compare-and-swap preserves a concurrent canonical edit', async t => {
    const h = await fixture(t, []);
    const storage = createPluginStorage({ ...h.owner, plugin: plugin('cas', ''), beforeEffect: () => {} });
    assert.equal(await storage.root('getItem', ['existing']), 'kept');
    h.root = { ...h.root, pluginCustomStorage: { existing: 'concurrent' } };
    await assert.rejects(storage.root('setItem', ['existing', 'overwrite']), { code: 'plugin_storage_conflict' });
    assert.equal(h.root.pluginCustomStorage.existing, 'concurrent');
});

test('periodic permission expiry defeats both saved given and hash grants', async t => {
    const h = await fixture(t, []);
    const p = plugin('permission', 'original');
    const key = JSON.stringify([p.name, 'replacer']);
    h.owner.kvSet('cache/plugin-permissions/state.json', JSON.stringify({ given: [key], denied: [], cache: [] }));
    assert.equal(savedPluginPermission(h.owner.kvGet, p, 'replacer', true), false);
    assert.equal(savedPluginPermission(h.owner.kvGet, p, 'replacer', false), true);
});

test('storage indices cannot return inherited array functions or object prototypes', async t => {
    const h = await fixture(t, []);
    const storage = createPluginStorage({ ...h.owner, plugin: plugin('keys', ''), beforeEffect: () => {} });
    for (const method of [storage.root, storage.local]) {
        await assert.rejects(method('key', ['constructor']), { code: 'plugin_storage_index_invalid' });
        await assert.rejects(method('key', ['__proto__']), { code: 'plugin_storage_index_invalid' });
    }
    assert.equal(await storage.root('getItem', ['constructor']), null);
    assert.equal(await storage.root('getItem', ['__proto__']), null);
});

test('valid provider failures remain retryable through the native caller policy', async t => {
    const h = await fixture(t, [plugin('retryable', `let calls=0;
        await Risuai.addProvider('retryable',async()=>({success:++calls>1,content:calls===1?'temporary':'answer'}));`)]);
    const provider = h.registry.providers.get('retryable');
    assert.deepEqual(await provider({}), { success: false, content: 'temporary' });
    assert.deepEqual(await provider({}), { success: true, content: 'answer' });
    assert.deepEqual(h.notices().map(event => event.code), ['plugin_provider_failed']);
});

test('provider name collision cannot overwrite or resurrect another plugin', async t => {
    const h = await fixture(t, [plugin('original', `await Risuai.addProvider('shared',async()=>({success:true,content:'original'}));`),
        plugin('conflict', `await Risuai.addProvider('shared',async()=>({success:true,content:'changed'}));`)]);
    assert.equal(h.host.hasProvider('shared'), false);
    await assert.rejects(h.registry.providers.get('shared')({}), /plugin_provider_failed/);
    assert.equal(h.effects, 0);
    assert.deepEqual(h.notices().map(event => event.code), ['plugin_hook_failed', 'plugin_provider_failed']);
    await h.host.close();
    assert.equal(h.registry.providers.size, 0);
});

test('debug logs are not notifications and explicit log overflow does not disable hooks', async t => {
    const h = await fixture(t, [plugin('logs', `for(let i=0;i<1000;i++)console.log('debug');
        for(let i=0;i<100;i++)await Risuai.log('explicit');
        await Risuai.addRisuReplacer('beforeRequest',x=>x);`)]);
    assert.equal(h.registry.replacerbeforeRequest.size, 1);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    const rows = h.owner.kvList('internal/bg-notifications/v1/').map(key => JSON.parse(h.owner.kvGet(key)));
    assert.equal(rows.length, 33);
    assert.ok(rows.every(row => row.event.code === 'plugin_message'));
    assert.equal(rows.filter(row => row.event.message.includes('생략')).length, 1);
});

test('cancelling the operation does not report plugin failures', async t => {
    const h = await fixture(t, [plugin('cancelled', `await Risuai.addProvider('wait',async(_,signal)=>{
        await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return {success:false,content:'cancelled'};
    });`)]);
    const response = h.registry.providers.get('wait')({}, h.controller.signal);
    h.controller.abort();
    await assert.rejects(response);
    await h.host.close();
    assert.deepEqual(h.notices(), []);
});

test('oversized plugin record is isolated from the next plugin', async t => {
    const h = await fixture(t, [plugin('oversized', ' '.repeat(4 * 1024 * 1024 + 1)),
        plugin('healthy', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`)]);
    assert.equal(h.registry.replacerbeforeRequest.size, 1);
    assert.equal(h.notices().length, 1);
    assert.equal(h.notices()[0].pluginName, 'oversized');
});

test('a replacement plugin at a failed load position has a distinct notice identity', async t => {
    const h = await fixture(t, [plugin('original', 'await Risuai.unsupportedMethod();')]);
    h.root = { ...h.root, plugins: [plugin('replacement', '')] };
    await h.host.refreshIdentity();
    assert.equal(h.controller.signal.aborted, false);
    const notices = h.notices();
    assert.equal(notices.length, 2);
    assert.equal(new Set(notices.map(notice => notice.eventKey)).size, 2);
    assert.deepEqual(new Set(notices.map(notice => notice.pluginName)), new Set(['original', 'replacement']));
});

test('one notice-store failure aborts once without blaming healthy plugins', async t => {
    let attempts = 0, failures = 0;
    await assert.rejects(fixture(t, [plugin('first', `await Risuai.log('notice');`), plugin('healthy', '')], true, {
        publishNotification: () => { attempts++; throw new Error('injected store failure'); },
        onCriticalFailure: () => { failures++; },
    }), { code: 'plugin_notification_unavailable' });
    assert.equal(attempts, 1); assert.equal(failures, 1);
});

test('informational message capacity does not abort generation', async t => {
    let failures = 0;
    const h = await fixture(t, [plugin('capacity', `await Risuai.log('notice');await Risuai.addRisuReplacer('beforeRequest',x=>x);`)], true, {
        publishNotification: () => ({ status: 'capacity' }), onCriticalFailure: () => { failures++; },
    });
    assert.equal(failures, 0); assert.equal(h.controller.signal.aborted, false);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
});

test('parallel writes queue under the in-flight limit rather than failing a plugin', async t => {
    const h = await fixture(t, [plugin('parallel', `await Promise.all(['one','two','three','four'].map(key=>Risuai.pluginStorage.setItem(key,key)));
        await Risuai.addRisuReplacer('beforeRequest',x=>x);`)]);
    assert.equal(h.registry.replacerbeforeRequest.size, 1);
    for (const key of ['one', 'two', 'three', 'four']) assert.equal(h.root.pluginCustomStorage[key], key);
    assert.deepEqual(h.notices(), []);
});

test('permission denial after an input effect is not labelled as never applied', async t => {
    const h = await fixture(t, [plugin('partial', `await Risuai.addRisuScriptHandler('input',x=>x+' changed');
        await Risuai.addRisuReplacer('beforeRequest',async x=>{await Risuai.requestPluginPermission('sendChat');return x;});`)]);
    assert.equal(await [...h.registry.editinput][0]('input'), 'input changed');
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]), { code: 'plugin_before_request_failed' });
    assert.equal(h.notices()[0].code, 'plugin_hook_failed');
    assert.equal(h.notices()[0].effectsMayHaveOccurred, true);
});

test('short unsupported names still produce valid noncritical failure notices', async t => {
    const h = await fixture(t, [plugin('short-api', `await Risuai.getRuntimeInfo();`)], true, { wireMutation: frame => {
        if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
            return { ...frame, args: ['array', [['value', 'x'], frame.args[1][1]]] };
        }
        return frame;
    } });
    assert.equal(h.controller.signal.aborted, false);
    assert.equal(h.notices()[0].code, 'plugin_api_unsupported');
    assert.equal(h.notices()[0].api, 'unsupported_x');
});

test('interceptor identifiers stay unique after remove and re-register', async t => {
    const h = await fixture(t, [plugin('interceptors', `
        const first=await Risuai.registerBodyIntercepter(x=>x);
        await Risuai.registerBodyIntercepter(x=>x);
        await Risuai.unregisterBodyIntercepter(first.id);
        await Risuai.registerBodyIntercepter(x=>x);
    `)]);
    const ids = h.bindings.bodyInterceptors.map(row => row.id);
    assert.equal(ids.length, 2); assert.equal(new Set(ids).size, 2);
    for (const id of ids) assert.match(id, /^[a-f0-9-]{36}$/);
});

test('parallel reentrant model calls do not hold the slots needed by nested APIs', async t => {
    const h = await fixture(t, [plugin('reentrant', `
        await Risuai.registerBodyIntercepter(async body=>{await Risuai.pluginStorage.getItem('existing');return body;});
        await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            await Promise.all(Array.from({length:16},()=>Risuai.runLLMModel({messages,mode:'model',allowPlugins:true})));
            return messages;
        });
    `)]);
    let calls = 0;
    h.bindings.requestChatDataMain = async () => {
        calls++;
        for (const row of h.bindings.bodyInterceptors) await row.callback('body', 'synthetic');
        return { type: 'success', result: 'answer' };
    };
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    assert.equal(calls, 16);
    assert.deepEqual(h.notices(), []);
});

test('scope cleanup of an already-issued request is not a late API call', async t => {
    const h = await fixture(t, [plugin('abandoned-fetch', `
        await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            void Risuai.nativeFetch('https://synthetic.invalid/slow',{method:'GET'}).catch(()=>{});
            await new Promise(resolve=>setTimeout(resolve,30));
            return messages;
        });
    `)]);
    let issued = 0, cleaned = 0;
    const settled = [];
    h.bindings.nativeFetch = async (_, { signal }) => {
        issued++;
        let done;
        settled.push(new Promise(resolve => { done = resolve; }));
        try {
            return await new Promise((_, reject) => {
                const abort = () => reject(signal.reason);
                if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
            });
        } finally { cleaned++; done(); }
    };
    const hook = [...h.registry.replacerbeforeRequest][0];
    const messages = [{ role: 'user', content: 'preserved' }];
    for (let attempt = 0; attempt < 2; attempt++) {
        assert.deepEqual(await hook(messages), messages);
        await Promise.all(settled);
        await new Promise(resolve => setImmediate(resolve));
        await h.host.assertNotifications();
    }
    assert.equal(issued, 2);
    assert.equal(cleaned, 2);
    assert.deepEqual(h.notices(), []);
});

test('a new API call after callback completion remains blocked and reported', async t => {
    const h = await fixture(t, [plugin('late-api', `
        await Risuai.addRisuReplacer('beforeRequest',messages=>{
            setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/late',{method:'GET'}).catch(()=>{}),30);
            return messages;
        });
    `)]);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    await new Promise(resolve => setTimeout(resolve,100));
    await h.host.assertNotifications();
    assert.equal(h.network.length, 0);
    assert.deepEqual(h.notices().map(event => event.code), ['plugin_late_call']);
});

test('one final diagnostic excludes payload and storage failure cannot fail generation', async t => {
    const summaries = [];
    const h = await fixture(t, [plugin('diagnostic', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        await Risuai.nativeFetch('https://synthetic.invalid/private-target',{method:'POST',body:'private payload'});
        return messages;
    });`)], true, { publishDiagnostic: value => { summaries.push(value); throw new Error('private store failure'); } });
    const hook = [...h.registry.replacerbeforeRequest][0];
    assert.deepEqual(await hook([]), []); assert.deepEqual(await hook([]), []);
    assert.equal(summaries.length, 0);
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings++; throw new Error('synthetic logger failure'); };
    try { await h.host.close(); await h.host.close(); }
    finally { console.warn = warn; }
    assert.equal(warnings, 1);
    assert.equal(summaries.length, 1); assert.equal(summaries[0].calls, 2); assert.equal(summaries[0].http2xx, 2);
    assert.equal(JSON.stringify(summaries).includes('private'), false);
    assert.equal(h.controller.signal.aborted, false); assert.deepEqual(h.notices(), []);
});

test('constructor failure still summarizes load effects after worker cleanup', async t => {
    const summaries = [];
    await assert.rejects(fixture(t, [plugin('load-effect', `
        await Risuai.nativeFetch('https://synthetic.invalid/load',{method:'GET'});
        await Risuai.log('synthetic notice');
    `)], true, { publishDiagnostic: value => summaries.push(value),
        publishNotification: () => { throw Error('synthetic unavailable'); } }), { code: 'plugin_notification_unavailable' });
    assert.equal(summaries.length, 1); assert.equal(summaries[0].calls, 1); assert.equal(summaries[0].http2xx, 1);
    assert.equal(summaries[0].pending, 0);
});

test('observing a synchronous binding failure preserves the existing disabled-entry notice', async t => {
    const h = await fixture(t, [plugin('sync-binding', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/sync',{method:'GET'});}catch{}return messages;
    });`)]);
    h.bindings.nativeFetch = () => { throw Error('synthetic validation'); };
    const hook = [...h.registry.replacerbeforeRequest][0];
    await assert.rejects(hook([]), { code: 'plugin_before_request_failed' }); await assert.rejects(hook([]), { code: 'plugin_before_request_failed' });
    assert.deepEqual(h.notices().map(value => value.code), ['plugin_hook_failed']);
});

test('operation cancellation reaches the model API transport, beyond ending its callback', async t => {
    const h = await fixture(t, [plugin('model-cancel', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        await Risuai.runLLMModel({messages,mode:'model'});return messages;
    });`)]);
    let start, release, aborted = false;
    const started = new Promise(resolve => { start = resolve; });
    h.bindings.requestChatDataMain = async (_, mode, signal = new AbortController().signal) => {
        assert.equal(mode, 'model'); start();
        return await new Promise(resolve => {
            release = () => resolve({ type: 'success', result: 'synthetic' });
            signal.addEventListener('abort', () => { aborted = true; resolve({ type: 'fail', result: 'aborted' }); }, { once: true });
        });
    };
    const task = [...h.registry.replacerbeforeRequest][0]([]);
    const result = assert.rejects(task);
    await started; h.controller.abort(); await result;
    release();
    assert.equal(aborted, true);
    assert.deepEqual(h.notices(), []);
});

test('UI registration callbacks do not run while request and display roles remain independent', async t => {
    const h = await fixture(t, [plugin('ui-only', `
        await Risuai.registerSetting('Synthetic',async()=>{
            await Risuai.nativeFetch('https://synthetic.invalid/ui-only',{});
            await Risuai.addRisuReplacer('beforeRequest',x=>[]);
        });
        await Risuai.registerButton({name:'Synthetic'},async()=>Risuai.pluginStorage.setItem('ui-write',true));
    `), plugin('request', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'request'}]);`),
    plugin('display', `await Risuai.addRisuScriptHandler('display',x=>x+' display');`)]);
    assert.equal(h.registry.replacerbeforeRequest.size, 1);
    assert.equal(h.registry.editdisplay.size, 1);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), [{role:'system',content:'request'}]);
    assert.equal(await [...h.registry.editdisplay][0]('visible'), 'visible display');
    assert.equal(h.network.length, 0); assert.equal(h.writes, 0);
    assert.deepEqual(h.notices(), []);
    // This does not qualify plugins whose request hooks depend on a UI callback.
});

test('settings-dependent roles use synthetic arguments and shared root storage', async t => {
    const script = `if(await Risuai.getArgument('sample')==='enabled'&&await Risuai.pluginStorage.getItem('existing')==='kept'){
        await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'enabled'}]);
    }`;
    const enabled = {...plugin('conditional',script),realArg:{sample:'enabled'}};
    const h = await fixture(t, [enabled]);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), [{role:'system',content:'enabled'}]);
    await h.host.close();
    const disabled = await fixture(t, [{...enabled,realArg:{sample:'disabled'}}]);
    assert.equal(disabled.registry.replacerbeforeRequest.size, 0);
    assert.equal(disabled.network.length, 0); assert.deepEqual(disabled.notices(), []);
});

test('initialization effects occur once per operation and repeat in a new host', async t => {
    const script = `await Risuai.nativeFetch('https://synthetic.invalid/init',{});
        await Risuai.pluginStorage.setItem('initialized',true);
        await Risuai.addRisuReplacer('beforeRequest',x=>x);`;
    for (let operation = 0; operation < 2; operation++) {
        const h = await fixture(t, [plugin('initializer',script)]);
        const hook = [...h.registry.replacerbeforeRequest][0];
        assert.deepEqual(await hook([]), []); assert.deepEqual(await hook([]), []);
        assert.equal(h.network.length, 1); assert.equal(h.writes, 1);
        assert.equal(h.root.pluginCustomStorage.initialized, true);
        await h.host.close();
        assert.equal(h.registry.replacerbeforeRequest.size, 0);
    }
});

test('partial initialization is reported before a healthy following plugin issues its request', async t => {
    const reported = [];
    const h = await fixture(t, [plugin('partial-initializer', `
        await Risuai.nativeFetch('https://synthetic.invalid/init',{});
        await Risuai.pluginStorage.setItem('partial',true);
        throw Error('private initialization detail');
    `), plugin('healthy', `await Risuai.addRisuReplacer('beforeRequest',async x=>{
        await Risuai.nativeFetch('https://synthetic.invalid/request',{});return x;
    });`)], true, {publishNotification:async event=>{
        await new Promise(resolve=>setImmediate(resolve));reported.push(event);return {status:'stored'};
    }});
    assert.equal(reported.length, 1); assert.equal(reported[0].effectsMayHaveOccurred, true);
    assert.equal(reported[0].phase, 'load'); assert.equal(reported[0].code, 'plugin_hook_failed');
    assert.equal(JSON.stringify(reported).includes('private initialization detail'), false);
    assert.equal(h.root.pluginCustomStorage.partial, true); assert.equal(h.network.length, 1);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    assert.equal(h.network.length, 2); assert.equal(reported.length, 1);
});

test('closing a host refuses unload writes while retaining prior committed effects', async t => {
    const h = await fixture(t, [plugin('unload-effect', `
        await Risuai.pluginStorage.setItem('load-effect',true);
        await Risuai.onUnload(async()=>{try{await Risuai.pluginStorage.setItem('unload-effect',true);}catch{}});
    `)]);
    await h.host.close(); await h.host.close();
    assert.equal(h.root.pluginCustomStorage['load-effect'], true);
    assert.equal(h.root.pluginCustomStorage['unload-effect'], undefined);
    assert.equal(h.writes, 1); assert.deepEqual(h.notices(), []);
});

test('caught value-limit refusals are reported once and a later small request still runs', async t => {
    const h = await fixture(t, [plugin('value-budget', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:messages[0].content==='large'?'x'.repeat(4*1024*1024):'small'});}catch{}
        return messages;
    });`)]);
    const hook = [...h.registry.replacerbeforeRequest][0];
    for (let count = 0; count < 2; count++) assert.deepEqual(await hook([{role:'user',content:'large'}]), [{role:'user',content:'large'}]);
    assert.equal(h.network.length, 0); assert.equal(h.effects, 0);
    assert.deepEqual(await hook([{role:'user',content:'small'}]), [{role:'user',content:'small'}]);
    assert.equal(h.network.length, 1); assert.equal(h.effects, 1);
    const notices = h.notices(); assert.equal(notices.length, 1);
    assert.equal(notices[0].code, 'plugin_host_limit'); assert.equal(notices[0].reason, 'operation_budget');
    assert.equal(notices[0].phase, 'before_request'); assert.equal(notices[0].effectsMayHaveOccurred, false);
});

test('limit warning does not conflict with a later terminal failure in the same phase', async t => {
    const h = await fixture(t, [plugin('limit-then-failure', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}
        throw Error('private terminal failure');
    });`)]);
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]), { code: 'plugin_before_request_failed' });
    assert.equal(h.controller.signal.aborted, false); assert.equal(h.network.length, 0);
    assert.deepEqual(h.notices().map(row=>row.code), ['plugin_host_limit','plugin_hook_failed']);
});

test('recoverable limit and terminal resource failure keep separate stored notices', async t => {
    const h=await fixture(t,[plugin('limit-then-resource',`await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}
        await Risuai.getDatabase(['pluginCustomStorage']);return messages;
    });`)]);
    h.root.pluginCustomStorage.oversized='x'.repeat(4*1024*1024);
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]),{code:'plugin_before_request_failed'});
    assert.equal(h.controller.signal.aborted,false);assert.equal(h.network.length,0);assert.equal(h.effects,0);
    const notices=h.notices();assert.equal(notices.length,2);
    assert.ok(notices.every(row=>row.code==='plugin_host_limit'&&row.reason==='operation_budget'&&!row.effectsMayHaveOccurred));
    assert.deepEqual(notices.map(row=>row.eventKey.slice(row.eventKey.lastIndexOf(':')+1)).sort(),['failure','limit']);
});

for (const result of ['exception', 'capacity']) test(`limit notification ${result} preserves mandatory failure before outbound`, async t => {
    const h = await fixture(t, [plugin('limit-publication', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}
        try{await Risuai.nativeFetch('https://synthetic.invalid/next',{method:'POST',body:'small'});}catch{}
        return messages;
    });`)], true, {publishNotification:()=>{
        if(result==='exception')throw Error('synthetic publication unavailable');
        return {status:'capacity'};
    }});
    await assert.rejects([...h.registry.replacerbeforeRequest][0]([]), {code:'plugin_notification_unavailable'});
    assert.equal(h.controller.signal.aborted, true); assert.equal(h.network.length, 0);
    assert.deepEqual(h.root.pluginCustomStorage,{existing:'kept',zero:0});
});

test('write quota refusal reports load phase without disabling the installed request hook', async t => {
    const h = await fixture(t, [plugin('write-budget', `
        for(let i=0;i<65;i++){try{await Risuai.pluginStorage.setItem('synthetic-'+i,i);}catch{}}
        await Risuai.addRisuReplacer('beforeRequest',messages=>messages);
    `)]);
    assert.equal(h.writes, 64); assert.equal(h.root.pluginCustomStorage['synthetic-64'], undefined);
    assert.equal(h.registry.replacerbeforeRequest.size, 1);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    const notices=h.notices();assert.equal(notices.length,1);
    assert.equal(notices[0].code,'plugin_host_limit');assert.equal(notices[0].phase,'load');
    assert.equal(notices[0].effectsMayHaveOccurred,true);
});

test('parallel pending-byte refusals await one stored notice and release their own charges', {timeout:15000}, async t => {
    let startFirst, releaseFirst, startNotice, releaseNotice, finishRefusals;
    const firstStarted=new Promise(resolve=>{startFirst=resolve;});
    const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
    const noticeStarted=new Promise(resolve=>{startNotice=resolve;});
    const noticeGate=new Promise(resolve=>{releaseNotice=resolve;});
    const refusalsReady=new Promise(resolve=>{finishRefusals=resolve;});
    let h, published=0, issued=0;
    h=await fixture(t,[plugin('pending-budget',`await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        const first=Risuai.nativeFetch('https://synthetic.invalid/first',{method:'POST',body:'x'.repeat(3*1024*1024)});
        await Risuai.runLLMModel({messages:[],mode:'model'});
        let refused=0;
        await Promise.all([1,2].map(()=>Risuai.nativeFetch('https://synthetic.invalid/refused',{method:'POST',body:'x'.repeat(3*1024*1024)}).catch(()=>{refused++;})));
        await Risuai.setArgument('sample',String(refused));
        await Risuai.runLLMModel({messages:[{role:'user',content:String(refused)}],mode:'model'});await first;
        await Risuai.nativeFetch('https://synthetic.invalid/small',{method:'POST',body:'small'});return messages;
    });`)],true,{publishNotification:async(event,identity)=>{
        startNotice();await noticeGate;published++;
        return h.notifications.publishPluginFailure(event,identity);
    }});
    t.after(()=>{releaseFirst();releaseNotice();});
    h.bindings.requestChatDataMain=async args=>{
        if(args.formated.length)finishRefusals(args.formated[0].content);
        else await firstStarted;
        return{type:'success',result:'synthetic barrier'};
    };
    h.bindings.nativeFetch=async(url)=>{issued++;if(url.endsWith('/first')){startFirst();await firstGate;}return new Response('synthetic');};
    const task=[...h.registry.replacerbeforeRequest][0]([]);
    task.catch(()=>{});
    await noticeStarted;assert.equal(issued,1);assert.equal(published,0);assert.equal(h.root.plugins[0].realArg.sample,'original');
    releaseNotice();assert.equal(await refusalsReady,'2');
    assert.equal(h.root.plugins[0].realArg.sample,'2');releaseFirst();assert.deepEqual(await task,[]);
    assert.equal(issued,2);assert.equal(published,1);assert.equal(h.root.plugins[0].realArg.sample,'2');
    const notices=h.notices();assert.equal(notices.length,1);assert.equal(notices[0].code,'plugin_host_limit');
    assert.equal(notices[0].effectsMayHaveOccurred,true);assert.equal(notices[0].phase,'before_request');
});

test('an absent-API pull answered after the host wait still records its names', async t => {
    // The worker drains its record when it answers; a response that arrives after
    // the host stopped waiting must still be merged while the run is alive.
    const diagnostics = [];
    let held = 0;
    const h = await fixture(t, [plugin('late-absent', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        void Risuai.lateAbsentApi;return xs;});`)], true, { publishDiagnostic: value => diagnostics.push(value),
        wireMutation: (frame, deliver) => {
            if (held || frame.kind !== 'return' || !JSON.stringify(frame).includes('lateAbsentApi')) return frame;
            held++; setTimeout(() => deliver(frame), 1500); return undefined;
        } });
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input);
    await new Promise(resolve => setTimeout(resolve, 800));
    await h.host.close();
    assert.equal(held, 1, 'the pull response was not delayed past the host wait');
    assert.deepEqual(diagnostics[0]?.absentApis, [{ api: 'lateAbsentApi', phase: 'before_request' }]);
    assert.equal(h.root.plugins[0].enabled, true);
    assert.deepEqual(h.notices(), []);
});

test('a .catch()-only call of an absent API throws before .catch attaches and follows the hook failure path', async t => {
    // Before G2.2a the absent name was an RPC function, so .catch() received the
    // rejection. It now reads as undefined; calling it throws a synchronous
    // TypeError inside the hook before any .catch() can attach.
    const diagnostics = [];
    const h = await fixture(t, [plugin('catch-only-absent', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        Risuai.absentName().catch(()=>{});return [];});`)], true, { publishDiagnostic: value => diagnostics.push(value) });
    const input = [{ role: 'user', content: 'kept' }];
    await assert.rejects([...h.registry.replacerbeforeRequest][0](input), { code: 'plugin_before_request_failed' });
    assert.equal(h.root.plugins.length, 1);
    const notices = h.notices();
    assert.deepEqual(notices.map(row => [row.code, row.phase]), [['plugin_hook_failed', 'before_request']]);
    await h.host.close();
    assert.deepEqual(diagnostics[0].absentApis, [{ api: 'absentName', phase: 'before_request' }]);
});

test('forged inherited object names are not dispatcher handlers', async t => {
    for (const forged of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
        const h = await fixture(t, [plugin('forged-inherited', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
            await Risuai.getRuntimeInfo();return [];});`)], true, { wireMutation: frame => {
            if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
                return { ...frame, args: ['array', [['value', forged], frame.args[1][1]]] };
            }
            return frame;
        } });
        const input = [{ role: 'user', content: 'kept' }];
        await assert.rejects([...h.registry.replacerbeforeRequest][0](input), { code: 'plugin_before_request_failed' }, forged);
        assert.equal(h.notices()[0].code, 'plugin_api_unsupported', forged);
    }
});

// Holds the two API call frames and delivers them to the parent in one tick.
const sameTick = (first, second) => {
    const held = [];
    return (frame, deliver) => {
        const api = frame.kind === 'call' && frame.method === 'api' ? frame.args?.[1]?.[0]?.[1] : null;
        if (api !== first && api !== second) return frame;
        held.push(frame);
        if (held.length === 2) for (const item of held.splice(0)) deliver(item);
        return undefined;
    };
};

describe('[D1a-1] BG beforeRequest failure fails the request', () => {
    const beforeRequest = h => {
        assert.equal(h.registry.replacerbeforeRequest.size, 1, 'expected one beforeRequest hook');
        return [...h.registry.replacerbeforeRequest][0];
    };
    const expectBeforeRequestFailure = promise => assert.rejects(promise, { code: 'plugin_before_request_failed' });

    test('rejects synchronous throws, rejected promises, and every non-array result', async t => {
        const cases = [
            ['synchronous throw', `throw Error('synthetic sync failure')`],
            ['async rejection', `await Promise.reject(Error('synthetic async failure'))`],
            ['null', `return null`], ['undefined', `return undefined`], ['string', `return 'invalid'`],
            ['number', `return 123`], ['object', `return {invalid:true}`],
        ];
        for (const [name, outcome] of cases) await t.test(name, async t => {
            const h = await fixture(t, [plugin('direct-' + name.replaceAll(' ', '-'),
                `await Risuai.addRisuReplacer('beforeRequest',async()=>{${outcome};});`)]);
            await expectBeforeRequestFailure(beforeRequest(h)([]));
            const notices = h.notices();
            assert.equal(notices.length, 1);
            assert.equal(notices[0].code, 'plugin_hook_failed');
            assert.equal(notices[0].phase, 'before_request');
            assert.equal(notices[0].effectsMayHaveOccurred, false);
        });
    });

    test('rejects fatal API failures even when guest code catches the API rejection', async t => {
        const cases = [
            ['synchronous binding failure', `try{await Risuai.nativeFetch('https://synthetic.invalid/fatal',{});}catch{}return messages;`,
                { nativeFetch: () => { throw Error('synthetic binding failure'); } }, true],
            ['uncaught local CAS conflict', `const local=await Risuai.getLocalPluginStorage();await local.setItem('key','value');return messages;`,
                { beforeLocalTransaction: () => { throw Error('synthetic CAS conflict'); } }, true],
            ['fatal host value limit', `await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(9*1024*1024)});return messages;`, {}, true],
            ['worker sandbox timeout', `await new Promise(()=>{});return messages;`, { runtimeMs: 500 }, true],
            ['runtime permission denial', `await Risuai.getDatabase(['characters']);return messages;`, { permissionState: {
                given: [JSON.stringify(['fatal-runtime-permission-denial','replacer'])], denied: [],
                cache: [[JSON.stringify(['fatal-runtime-permission-denial','replacer']) + '_lastGrantTime', Date.now()]],
            } }, false],
        ];
        for (const [name, body, options, permissions] of cases) await t.test(name, async t => {
            const h = await fixture(t, [plugin('fatal-' + name.replaceAll(' ', '-'),
                `await Risuai.addRisuReplacer('beforeRequest',async messages=>{${body}});`)], permissions, options);
            if (options.nativeFetch) h.bindings.nativeFetch = options.nativeFetch;
            await expectBeforeRequestFailure(beforeRequest(h)([{ role: 'user', content: 'kept' }]));
            const notices = h.notices();
            if (name === 'fatal host value limit') {
                assert.equal(notices.length, 2);
                assert.ok(notices.every(row => row.code === 'plugin_host_limit' && row.phase === 'before_request'));
                assert.deepEqual(notices.map(row => row.eventKey.split(':').at(-1)).sort(), ['failure', 'limit']);
            } else {
                assert.equal(notices.length, 1);
                assert.equal(notices[0].phase, 'before_request');
            }
        });
    });

    test('preserves a recoverable warning before the terminal beforeRequest notice', async t => {
        const h = await fixture(t, [plugin('warning-then-failure', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}
            throw Error('synthetic terminal failure');
        });`)]);
        await expectBeforeRequestFailure(beforeRequest(h)([]));
        assert.deepEqual(h.notices().map(row => row.code), ['plugin_host_limit', 'plugin_hook_failed']);
    });

    test('rejects an installed beforeRequest after input, prior beforeRequest, or provider execution disablement without a duplicate notice', async t => {
        const cases = [
            ['input', `await Risuai.addRisuScriptHandler('input',()=>{throw Error('input failed')});`,
                async h => assert.equal(await [...h.registry.editinput][0]('kept'), 'kept')],
            ['prior beforeRequest', '', async h => expectBeforeRequestFailure(beforeRequest(h)([]))],
            ['provider', `await Risuai.addProvider('failing-provider',()=>({success:true,content:123}));`,
                async h => assert.rejects(h.registry.providers.get('failing-provider')({}), { code: 'plugin_provider_failed' })],
        ];
        for (const [name, registration, disable] of cases) await t.test(name, async t => {
            const h = await fixture(t, [plugin('prior-' + name, `${registration}
                await Risuai.addRisuReplacer('beforeRequest',()=>{throw Error('must not run after disable')});`)]);
            await disable(h);
            const noticeCount = h.notices().length;
            await expectBeforeRequestFailure(beforeRequest(h)([{ role: 'user', content: 'kept' }]));
            assert.equal(h.notices().length, noticeCount);
        });
        await t.test('provider plugin_execution_failed leaves beforeRequest enabled', async t => {
            const h = await fixture(t, [plugin('provider-execution-stays-enabled', `
                await Risuai.addProvider('execution-provider',()=>{throw Error('provider execution failed')});
                await Risuai.addRisuReplacer('beforeRequest',messages=>[...messages,{role:'system',content:'continued'}]);
            `)]);
            await assert.rejects(h.registry.providers.get('execution-provider')({}), { code: 'plugin_execution_failed' });
            const noticeCount = h.notices().length;
            assert.deepEqual(await beforeRequest(h)([]), [{ role: 'system', content: 'continued' }]);
            assert.equal(h.notices().length, noticeCount);
        });
    });

    test('stops a multi-plugin pipeline at the failing plugin', async t => {
        const calls = [];
        const h = await fixture(t, [
            plugin('pipeline-a', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'A'}]);`),
            plugin('pipeline-b', `await Risuai.addRisuReplacer('beforeRequest',()=>{throw Error('stop')});`),
            plugin('pipeline-c', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'C'}]);`),
        ]);
        let messages = [];
        for (const [index, hook] of [...h.registry.replacerbeforeRequest].entries()) {
            calls.push(index);
            try { messages = await hook(messages); } catch (error) {
                assert.equal(error.code, 'plugin_before_request_failed');
                break;
            }
        }
        assert.deepEqual(calls, [0, 1]);
        assert.deepEqual(messages.map(row => row.content), ['A']);
        assert.deepEqual(h.notices().map(row => row.pluginName), ['pipeline-b']);
    });

    test('does not install hooks excluded during load while a valid hook still runs', async t => {
        const invalidRegistration = plugin('invalid-registration', `await Risuai.addRisuReplacer('not-a-phase',x=>x);`);
        const loadFailure = plugin('load-failure', `throw Error('synthetic load failure');`);
        const valid = plugin('valid-load', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'valid'}]);`);
        const h = await fixture(t, [invalidRegistration, loadFailure, valid]);
        assert.equal(h.registry.replacerbeforeRequest.size, 1);
        assert.deepEqual(await beforeRequest(h)([]), [{ role: 'system', content: 'valid' }]);
        const noPermission = await fixture(t, [plugin('no-permission', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`)], false);
        assert.equal(noPermission.registry.replacerbeforeRequest.size, 0);
    });

    test('identity edits, disablement, reorder, append, duplicate name, and cache instability remain fail-open', async t => {
        const mutations = {
            edit: plugins => plugins.map((p, i) => i ? p : { ...p, script: p.script + '\n// edited' }),
            disable: plugins => plugins.map((p, i) => i ? p : { ...p, enabled: false }),
            reorder: plugins => [plugins[1], plugins[0]],
            append: plugins => [...plugins, plugin('appended', '')],
            duplicate: plugins => [...plugins, { ...plugins[0] }],
        };
        for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async t => {
            const h = await fixture(t, [
                plugin('identity-target', `await Risuai.addRisuReplacer('beforeRequest',x=>[...x,{role:'system',content:'stale'}]);`),
                plugin('identity-peer', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`),
            ], true, { separateRoot: true });
            const input = [{ role: 'user', content: 'kept' }];
            h.root = { ...h.root, plugins: mutate(structuredClone(h.root.plugins)) };
            h.swapOperationDb(); await h.host.refreshIdentity();
            assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), name === 'append'
                ? [...input, { role: 'system', content: 'stale' }] : input);
        });
        await t.test('identity cache instability', async t => {
            let unstable = false;
            const h = await fixture(t, [plugin('identity-cache', `await Risuai.addRisuReplacer('beforeRequest',x=>x);`)], true,
                { separateRoot: true, getRoot: root => unstable ? { ...root, plugins: [] } : root });
            unstable = true;
            const input = [{ role: 'user', content: 'kept' }];
            assert.deepEqual(await beforeRequest(h)(input), input);
        });
    });

    test('the first recorded disable cause controls identity versus execution handling', async t => {
        await t.test('identity recorded before a later worker failure returns the original input', async t => {
            let entered, release;
            const started = new Promise(resolve => { entered = resolve; });
            const held = new Promise((_, reject) => { release = () => reject(Error('late worker failure')); });
            const h = await fixture(t, [plugin('identity-first', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                await Risuai.nativeFetch('https://synthetic.invalid/held',{});return messages;
            });`)], true, { separateRoot: true, nativeFetch: async () => { entered(); return held; } });
            const input = [{ role: 'user', content: 'kept' }];
            const pending = beforeRequest(h)(input);
            await started;
            h.root = { ...h.root, plugins: h.root.plugins.map(p => ({ ...p, enabled: false })) };
            h.swapOperationDb();
            await h.host.refreshIdentity();
            release();
            assert.deepEqual(await pending, input);
            assert.deepEqual(h.notices().map(row => row.code), ['plugin_hook_failed']);
        });

        await t.test('API failure recorded before a pending plugin-set change rejects', async t => {
            let entered, release;
            const started = new Promise(resolve => { entered = resolve; });
            const held = new Promise((_, reject) => { release = () => reject(Error('API failure recorded first')); });
            const h = await fixture(t, [plugin('execution-first', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                await Risuai.nativeFetch('https://synthetic.invalid/held',{});return messages;
            });`)], true, { separateRoot: true, nativeFetch: async () => { entered(); return held; } });
            const pending = beforeRequest(h)([{ role: 'user', content: 'kept' }]);
            await started;
            h.root = { ...h.root, plugins: h.root.plugins.map(p => ({ ...p, enabled: false })) };
            h.swapOperationDb();
            release();
            await expectBeforeRequestFailure(pending);
        });

        await t.test('a guest-thrown plugin_identity_changed code is still an execution failure', async t => {
            const h = await fixture(t, [plugin('guest-identity-code', `await Risuai.addRisuReplacer('beforeRequest',()=>{
                throw Object.assign(Error('guest forged identity code'),{code:'plugin_identity_changed'});
            });`)]);
            await expectBeforeRequestFailure(beforeRequest(h)([]));
        });

        await t.test('storage-detected script mismatch during getArgument remains an identity skip', async t => {
            let h;
            h = await fixture(t, [plugin('storage-identity-change', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                await Risuai.getArgument('sample');return [...messages,{role:'system',content:'must-not-publish'}];
            });`)], true, { separateRoot: true, wireMutation: frame => {
                if (frame.kind === 'call' && frame.method === 'api'
                    && frame.args?.[1]?.[0]?.[1] === 'getArgument') {
                    h.root = { ...h.root, plugins: h.root.plugins.map(p => ({ ...p, script: p.script + '\n// changed' })) };
                }
                return frame;
            } });
            const input = [{ role: 'user', content: 'kept' }];
            assert.deepEqual(await beforeRequest(h)(input), input);
            const notices = h.notices();
            assert.equal(notices.length, 1);
            assert.equal(notices[0].code, 'plugin_hook_failed');
            assert.deepEqual(await beforeRequest(h)(input), input);
            assert.equal(h.notices().length, 1);
        });
    });

    test('gives storage failure priority over cancellation and execution failure', async t => {
        const controller = new AbortController();
        const h = await fixture(t, [plugin('storage-priority', `await Risuai.addRisuReplacer('beforeRequest',()=>{throw Error('hook failure')});`)], true,
            { controller, publishNotification: async () => { controller.abort(); throw Object.assign(Error('notice store failed'), { code: 'plugin_notification_unavailable' }); } });
        await assert.rejects(beforeRequest(h)([]), { code: 'plugin_notification_unavailable' });
    });

    test('gives operation closure priority while execution or identity notice settlement is pending', async t => {
        for (const cause of ['execution', 'identity']) await t.test(cause, async t => {
            let noticeStarted, release;
            const started = new Promise(resolve => { noticeStarted = resolve; });
            const held = new Promise(resolve => { release = resolve; });
            const controller = new AbortController();
            const h = await fixture(t, [plugin('close-priority-' + cause,
                `await Risuai.addRisuReplacer('beforeRequest',${cause === 'execution' ? "()=>{throw Error('failure')}" : 'x=>x'});`)], true,
                { controller, separateRoot: cause === 'identity', publishNotification: async () => { noticeStarted(); await held; return { status: 'stored' }; } });
            if (cause === 'identity') {
                h.root = { ...h.root, plugins: h.root.plugins.map(p => ({ ...p, enabled: false })) };
                h.swapOperationDb();
            }
            const pending = beforeRequest(h)([]);
            await started; controller.abort(); release();
            await assert.rejects(pending, { code: 'plugin_operation_closed' });
        });
    });

    test('gives operation closure priority to an in-flight worker rejection', async t => {
        let entered, rejectWork;
        const started = new Promise(resolve => { entered = resolve; });
        const controller = new AbortController();
        const h = await fixture(t, [plugin('in-flight-close', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
            await Risuai.nativeFetch('https://synthetic.invalid/held',{});return messages;
        });`)], true, { controller, nativeFetch: async () => { entered(); return new Promise((_, reject) => { rejectWork = reject; }); } });
        const pending = beforeRequest(h)([]);
        await started; controller.abort(); rejectWork(Error('worker ended'));
        await assert.rejects(pending, { code: 'plugin_operation_closed' });
    });

    test('rechecks disable cause and cancellation after final notice settlement', async t => {
        for (const cause of ['execution', 'identity', 'cancellation']) await t.test(cause, async t => {
            let noticeStarted, releaseNotice, callbackReturned, failureInjected;
            const noticePending = new Promise(resolve => { noticeStarted = resolve; });
            const noticeGate = new Promise(resolve => { releaseNotice = resolve; });
            const callbackDone = new Promise(resolve => { callbackReturned = resolve; });
            const failureFrame = new Promise(resolve => { failureInjected = resolve; });
            const controller = new AbortController();
            let h;
            h = await fixture(t, [plugin('final-settlement-' + cause, `
                await Risuai.addRisuReplacer('beforeRequest',messages=>{
                    ${cause === 'execution' ? "setTimeout(()=>Risuai.getRuntimeInfo().catch(()=>{}),100);" : ''}
                    return [...messages,{role:'system',content:'final-settlement-result'}];
                });
            `)], true, {
                controller, separateRoot: cause === 'identity',
                publishNotification: async (event, identity) => {
                    noticeStarted(); await noticeGate;
                    return identity ? h.notifications.publishPluginFailure(event, identity) : h.notifications.publish(event);
                },
                wireMutation: frame => {
                    const encoded = JSON.stringify(frame);
                    if (frame.kind === 'return' && encoded.includes('final-settlement-result')) {
                        h.root = { ...h.root, plugins: [...h.root.plugins, plugin('final-settlement-appended-' + cause, '')] };
                        h.swapOperationDb(); callbackReturned();
                    }
                    if (cause === 'execution' && frame.kind === 'call' && frame.method === 'api'
                        && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
                        failureInjected(); return { ...frame, v: 0 };
                    }
                    return frame;
                },
            });
            t.after(() => releaseNotice());
            const input = [{ role: 'user', content: 'kept' }];
            const pending = beforeRequest(h)(input);
            pending.catch(() => {});
            await Promise.all([noticePending, callbackDone]);

            let refresh;
            if (cause === 'execution') {
                await failureFrame;
                await new Promise(resolve => setImmediate(resolve));
            }
            if (cause === 'identity') {
                h.root = { ...h.root, plugins: h.root.plugins.map(p => ({ ...p, enabled: false })) };
                h.swapOperationDb();
                refresh = h.host.refreshIdentity();
                refresh.catch(() => {});
                await new Promise(resolve => setImmediate(resolve));
            }
            if (cause === 'cancellation') controller.abort();
            releaseNotice();
            await refresh;

            if (cause === 'execution') await expectBeforeRequestFailure(pending);
            else if (cause === 'identity') assert.deepEqual(await pending, input);
            else await assert.rejects(pending, { code: 'plugin_operation_closed' });
        });
    });

    test('continues after caught non-fatal absent, limit, and local CAS rejections while the entry stays enabled', async t => {
        const cases = [
            ['absent', `try{await Risuai.setDatabase({plugins:[]});}catch{}`],
            ['limit', `try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}`],
        ];
        for (const [name, action] of cases) await t.test(name, async t => {
            const h = await fixture(t, [plugin('caught-' + name, `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                ${action}return [...messages,{role:'system',content:'continued'}];
            });`)]);
            assert.deepEqual(await beforeRequest(h)([]), [{ role: 'system', content: 'continued' }]);
        });
        await t.test('local CAS', async t => {
            const key = 'cache/plugin-storage/' + Buffer.from('d1a-cas').toString('base64url') + '.json';
            let h;
            h = await fixture(t, [plugin('caught-local-cas', `await Risuai.addRisuReplacer('beforeRequest',async messages=>{
                const local=await Risuai.getLocalPluginStorage();await local.getItem('d1a-cas');
                await Risuai.nativeFetch('https://synthetic.invalid/cas-barrier',{});
                try{await local.setItem('d1a-cas','guest');}catch(error){if(error.code!=='plugin_storage_conflict')throw error;}
                return [...messages,{role:'system',content:'continued'}];
            });`)], true, { nativeFetch: async () => { h.owner.kvSet(key, JSON.stringify('external')); return new Response('ok'); } });
            assert.deepEqual(await beforeRequest(h)([]), [{ role: 'system', content: 'continued' }]);
            assert.equal(JSON.parse(h.owner.kvGet(key)), 'external');
        });
    });

    test('leaves body, afterRequest, input/output script, and provider failure handling unchanged', async t => {
        const h = await fixture(t, [plugin('unchanged-contracts', `
            await Risuai.registerBodyIntercepter(()=>{throw Error('body failure')});
            await Risuai.addRisuReplacer('afterRequest',()=>{throw Error('after failure')});
            await Risuai.addRisuScriptHandler('input',()=>{throw Error('input failure')});
            await Risuai.addRisuScriptHandler('output',()=>{throw Error('output failure')});
            await Risuai.addProvider('unchanged-provider',()=>{throw Error('provider failure')});
        `)]);
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        assert.equal(await [...h.registry.editinput][0]('input'), 'input');
        assert.equal(await [...h.registry.editoutput][0]('output'), 'output');
        await assert.rejects(h.registry.providers.get('unchanged-provider')({}), { code: 'plugin_provider_failed' });
        assert.equal(h.bindings.bodyInterceptors.length, 1);
        const body = { kept: true };
        assert.deepEqual(await h.bindings.bodyInterceptors[0].callback(body), body);
        assert.equal(h.notices().some(row => row.code === 'plugin_before_request_failed'), false);
    });
});

test('a synchronous registration refusal disables before a same-tick log is published', async t => {
    const h = await fixture(t, [plugin('same-tick-log', `
        Risuai.addRisuScriptHandler('bad',()=>{}).catch(()=>{});
        Risuai.log('after-invalid').catch(()=>{});`)], true, { wireMutation: sameTick('addRisuScriptHandler', 'log') });
    const notices = h.notices();
    assert.equal(notices.some(row => row.code === 'plugin_message'), false);
    assert.deepEqual(notices.map(row => [row.code, row.phase]), [['plugin_hook_failed', 'load']]);
});

test('a synchronous registration refusal wins over a same-tick policy-rejected getArg', async t => {
    const h = await fixture(t, [plugin('same-tick-arg', `
        Risuai.addRisuScriptHandler('bad',()=>{}).catch(()=>{});
        Risuai.getArg('other::key').catch(()=>{});`)], true, { wireMutation: sameTick('addRisuScriptHandler', 'getArg') });
    assert.deepEqual(h.notices().map(row => [row.code, row.phase]), [['plugin_hook_failed', 'load']]);
});

describe('[D3-1] Post-commit continuation for afterRequest timers', () => {
    const d3Host = h => {
        assert.equal(typeof h.host.handOver, 'function', 'host.handOver must exist');
        assert.equal(typeof h.host.openPostResponse, 'function', 'host.openPostResponse must exist');
        return h.host;
    };

    test('[new] seals bare and window one-shot timers with arguments, normalization, and FIFO order', async t => {
        const h = await fixture(t, [plugin('d3-timer-parity', `
            await Risuai.addRisuReplacer('afterRequest',async value=>{
                const send=async(name,...args)=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/'+name,{method:'POST',body:JSON.stringify(args)});await response.text();};
                setTimeout(send,-100,'negative');window.setTimeout(send,NaN,'nan');setTimeout(send,0,'zero');
                setTimeout(send,80,'same-a','arg1',42);window.setTimeout(send,80,'same-b',{a:1});return value;
            });
        `)]);
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        assert.equal(h.network.length, 0, 'sealed timers must not run before the post-response window');
        const host = d3Host(h);
        assert.deepEqual(await host.handOver(), { participants: [{ index: 0, pluginName: 'd3-timer-parity', pluginVersion: '3.0' }] });
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }),
            { status: 'drained' });
        assert.deepEqual(h.network.map(row => [new URL(row.url).pathname, JSON.parse(row.options.body)]), [
            ['/negative', []], ['/nan', []], ['/zero', []], ['/same-a', ['arg1', 42]], ['/same-b', [{ a: 1 }]],
        ]);
    });

    test('[new] seals only timers still pending when an async afterRequest callback returns', async t => {
        const h = await fixture(t, [plugin('d3-hook-boundary', `
            await Risuai.addRisuReplacer('afterRequest',async value=>{
                setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/short'),20);
                setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/long');await response.text();},250);
                await new Promise(resolve=>setTimeout(resolve,100));return value;
            });
        `)]);
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        assert.deepEqual(h.network.map(row => new URL(row.url).pathname), ['/short']);
        const host = d3Host(h);
        assert.equal((await host.handOver()).participants.length, 1);
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }),
            { status: 'drained' });
        assert.deepEqual(h.network.map(row => new URL(row.url).pathname), ['/short', '/long']);
    });

    for (const [name, beforeOpen, minimum, maximum] of [
        ['fast snapshot', 30, 70, 240],
        ['slow snapshot', 180, 0, 80],
    ]) test(`[new] runs at max(original schedule, snapshot ready) without restarting delay: ${name}`, async t => {
        let firedAt = 0;
        const h = await fixture(t, [plugin('d3-original-deadline-' + name, `
            await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/timing');await response.text();},120);return value;});
        `)], true, { nativeFetch: async () => { firedAt = performance.now(); return new Response('ok'); } });
        const armedAt = performance.now();
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h); await host.handOver();
        await new Promise(resolve => setTimeout(resolve, beforeOpen));
        const openedAt = performance.now();
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'drained' });
        assert.ok(firedAt >= armedAt + 100, `timer fired too early: ${firedAt - armedAt}`);
        assert.ok(firedAt - openedAt >= minimum && firedAt - openedAt <= maximum,
            `timer delay was restarted or not released at snapshot: ${firedAt - openedAt}`);
    });

    test('[new] treats clear-before-seal as none and clear-from-first-callback as drained', async t => {
        const cleared = await fixture(t, [plugin('d3-cleared-in-hook', `
            await Risuai.addRisuReplacer('afterRequest',value=>{const id=setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/no'),50);clearTimeout(id);return value;});
        `)]);
        assert.equal(await [...cleared.registry.replacerafterRequest][0]('answer'), 'answer');
        const clearedHost = d3Host(cleared);
        assert.deepEqual(await clearedHost.handOver(), { participants: [] });
        assert.deepEqual(await clearedHost.openPostResponse({ deadline: performance.now() + 100, signal: new AbortController().signal }), { status: 'none' });

        const during = await fixture(t, [plugin('d3-cleared-in-window', `
            await Risuai.addRisuReplacer('afterRequest',value=>{let second;
                setTimeout(async()=>{clearTimeout(second);const response=await Risuai.nativeFetch('https://synthetic.invalid/first');await response.text();},20);
                second=setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/second'),500);return value;});
        `)]);
        assert.equal(await [...during.registry.replacerafterRequest][0]('answer'), 'answer');
        const duringHost = d3Host(during); await duringHost.handOver();
        assert.deepEqual(await duringHost.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'drained' });
        assert.deepEqual(during.network.map(row => new URL(row.url).pathname), ['/first']);
    });

    test('[new] reports none when a sealed candidate is cleared after hand-over but before opening', async t => {
        const h = await fixture(t, [plugin('d3-clear-sealed', `let held;
            await Risuai.addRisuReplacer('afterRequest',value=>{held=setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/cleared-sealed'),200);return value;});
            await Risuai.addRisuScriptHandler('output',value=>{clearTimeout(held);return value;});
        `)]);
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h);
        assert.equal((await host.handOver()).participants.length, 1);
        assert.equal(await [...h.registry.editoutput][0]('answer'), 'answer');
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'none' });
        assert.deepEqual(h.network, []);
    });

    test('[new] seals at most sixteen timers, seals no timer from a rejected hook, and includes a plugin-owned race timer', async t => {
        const limited = await fixture(t, [plugin('d3-seal-limit', `
            await Risuai.addRisuReplacer('afterRequest',value=>{for(let i=0;i<18;i++)setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/t'+i);await response.text();},100);return value;});
        `)]);
        assert.equal(await [...limited.registry.replacerafterRequest][0]('answer'), 'answer');
        const limitedHost = d3Host(limited);
        assert.equal(typeof targetRequire('./server/node/bgPluginWorker.cjs').POST_RESPONSE_TIMER_LIMIT, 'number', 'POST_RESPONSE_TIMER_LIMIT must be exported');
        assert.equal(targetRequire('./server/node/bgPluginWorker.cjs').POST_RESPONSE_TIMER_LIMIT, 16);
        await limitedHost.handOver();
        assert.deepEqual(await limitedHost.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'drained' });
        assert.equal(limited.network.length, 16);

        const rejected = await fixture(t, [plugin('d3-rejected-hook', `
            await Risuai.addRisuReplacer('afterRequest',()=>{setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/rejected'),50);throw Error('rejected');});
        `)]);
        assert.equal(await [...rejected.registry.replacerafterRequest][0]('answer'), 'answer');
        assert.deepEqual(await d3Host(rejected).handOver(), { participants: [] });

        const race = await fixture(t, [plugin('d3-plugin-race-timer', `
            await Risuai.addRisuReplacer('afterRequest',async value=>{const request=Risuai.nativeFetch('https://synthetic.invalid/rpc');
                setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/plugin-timeout');await response.text();},200);await request;return value;});
        `)]);
        assert.equal(await [...race.registry.replacerafterRequest][0]('answer'), 'answer');
        const raceHost = d3Host(race); assert.equal((await raceHost.handOver()).participants.length, 1);
        assert.deepEqual(await raceHost.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'drained' });
        assert.deepEqual(race.network.map(row => new URL(row.url).pathname), ['/rpc', '/plugin-timeout']);
    });

    test('[new] waits for response-body EOF and nested timers while treating a read HTTP 500 as drained', async t => {
        let finishBody;
        const bodyGate = new Promise(resolve => { finishBody = resolve; });
        const h = await fixture(t, [plugin('d3-body-eof', `
            await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{
                const response=await Risuai.nativeFetch('https://synthetic.invalid/stream');await response.text();
                setTimeout(async()=>{const failed=await Risuai.nativeFetch('https://synthetic.invalid/status-500');await failed.text();},20);
            },10);return value;});
        `)], true, { nativeFetch: async url => url.endsWith('/stream') ? new Response(new ReadableStream({
            async pull(controller) { await bodyGate; controller.enqueue(new TextEncoder().encode('body')); controller.close(); },
        })) : new Response('read-to-eof', { status: 500 }) });
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h); await host.handOver();
        let settled = false;
        const opened = host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }).then(value => { settled = true; return value; });
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal(settled, false, 'headers and callback return must not drain before EOF');
        finishBody();
        assert.deepEqual(await opened, { status: 'drained' });
        assert.deepEqual(h.network.map(row => new URL(row.url).pathname), ['/stream', '/status-500']);
    });

    test('[new] keeps a detached response-body read in the window through EOF or deadline', async t => {
        const detachedReadScript = name => `
            await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{
                const response=await Risuai.nativeFetch('https://synthetic.invalid/${name}');
                void response.text().then(body=>Risuai.setArgument('detachedBody',body)).catch(()=>{});
            },5);return value;});
        `;

        const finiteOrder = [];
        let finishFiniteBody, finitePullStarted;
        const finiteBodyGate = new Promise(resolve => { finishFiniteBody = resolve; });
        const finitePull = new Promise(resolve => { finitePullStarted = resolve; });
        let finiteCancelled = false;
        const finite = await fixture(t, [plugin('d3-detached-body-eof', detachedReadScript('detached-eof'))], true, {
            beforeRootWrite: () => finiteOrder.push('body-read-complete'),
            nativeFetch: async () => {
                finiteOrder.push('headers');
                return new Response(new ReadableStream({
                    async pull(controller) {
                        finiteOrder.push('body-read-started'); finitePullStarted();
                        await finiteBodyGate;
                        controller.enqueue(new TextEncoder().encode('first-'));
                        finiteOrder.push('chunk-1');
                        controller.enqueue(new TextEncoder().encode('second'));
                        finiteOrder.push('chunk-2'); controller.close(); finiteOrder.push('body-eof');
                    },
                    cancel() { finiteCancelled = true; finiteOrder.push('body-cancelled'); },
                }));
            },
        });
        assert.equal(await [...finite.registry.replacerafterRequest][0]('answer'), 'answer');
        const finiteHost = d3Host(finite); await finiteHost.handOver();
        const finiteOpened = finiteHost.openPostResponse({ deadline: performance.now() + 1000,
            signal: new AbortController().signal }).then(value => { finiteOrder.push('window-outcome'); return value; });
        await finitePull;
        assert.equal(await Promise.race([
            finiteOpened.then(() => 'settled'), new Promise(resolve => setImmediate(() => resolve('pending'))),
        ]), 'pending', 'callback return and response headers must not drain an open body');
        finishFiniteBody();
        assert.deepEqual(await finiteOpened, { status: 'drained' });
        assert.equal(finite.root.plugins[0].realArg.detachedBody, 'first-second');
        assert.equal(finiteCancelled, false);
        assert.ok(finiteOrder.indexOf('body-eof') < finiteOrder.indexOf('window-outcome'), finiteOrder.join(','));

        const hangingOrder = [];
        let hangingPullStarted;
        const hangingPull = new Promise(resolve => { hangingPullStarted = resolve; });
        let hangingCancelled = false;
        const hanging = await fixture(t, [plugin('d3-detached-body-deadline', detachedReadScript('detached-hang'))], true, {
            nativeFetch: async () => {
                hangingOrder.push('headers');
                return new Response(new ReadableStream({
                    pull() { hangingOrder.push('body-read-started'); hangingPullStarted(); },
                    cancel() { hangingCancelled = true; hangingOrder.push('body-aborted'); },
                }));
            },
        });
        assert.equal(await [...hanging.registry.replacerafterRequest][0]('answer'), 'answer');
        const hangingHost = d3Host(hanging); await hangingHost.handOver();
        const hangingOpened = hangingHost.openPostResponse({ deadline: performance.now() + 100,
            signal: new AbortController().signal }).then(value => { hangingOrder.push('window-outcome'); return value; });
        await hangingPull;
        assert.deepEqual(await hangingOpened, { status: 'uncertain', reason: 'deadline' });
        assert.equal(hangingCancelled, true);
        assert.ok(hangingOrder.indexOf('body-aborted') < hangingOrder.indexOf('window-outcome'), hangingOrder.join(','));
    });

    for (const mode of ['callback-throw', 'network-error']) test(`[new] returns uncertain error for an abnormal post-response ${mode}`, async t => {
        const script = mode === 'callback-throw'
            ? `await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(()=>{throw Error('timer failed');},5);return value;});`
            : `await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{await Risuai.nativeFetch('https://synthetic.invalid/fail');},5);return value;});`;
        const h = await fixture(t, [plugin('d3-abnormal-' + mode, script)], true, {
            nativeFetch: async () => { throw new Error('synthetic network failure'); },
        });
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h); await host.handOver();
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }),
            { status: 'uncertain', reason: 'error' });
    });

    test('[new] shares the 128 HTTP counter and refuses runLLMModel without letting an interval extend the window', async t => {
        const h = await fixture(t, [plugin('d3-window-budget', `
            await Risuai.addRisuReplacer('afterRequest',async value=>{
                for(let i=0;i<126;i++){
                    const response=await Risuai.nativeFetch('https://synthetic.invalid/pre-'+i);await response.text();
                }
                setTimeout(async()=>{let modelError,thirdError;try{await Risuai.runLLMModel({});}catch(e){modelError=e.code;}
                    setInterval(()=>{},10);
                    const first=await Risuai.nativeFetch('https://synthetic.invalid/127');await first.text();
                    const second=await Risuai.nativeFetch('https://synthetic.invalid/128');await second.text();
                    try{await Risuai.nativeFetch('https://synthetic.invalid/129');}catch(e){thirdError=e.code;}
                    await Risuai.setArgument('d3Budget',modelError+':'+thirdError);
                },10);return value;});
        `)]);
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h); await host.handOver();
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }), { status: 'drained' });
        assert.equal(h.network.length, 128);
        assert.match(h.root.plugins[0].realArg.d3Budget, /.+:plugin_budget_exceeded$/);
    });

    test('[new] aborts an in-flight response body at the caller absolute deadline without retrying it', async t => {
        let cancelled = false;
        const h = await fixture(t, [plugin('d3-deadline-body', `
            await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/hanging');await response.text();},5);return value;});
        `)], true, { nativeFetch: async () => new Response(new ReadableStream({ pull() {}, cancel() { cancelled = true; } })) });
        assert.equal(await [...h.registry.replacerafterRequest][0]('answer'), 'answer');
        const host = d3Host(h); await host.handOver();
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 40, signal: new AbortController().signal }),
            { status: 'uncertain', reason: 'deadline' });
        assert.equal(cancelled, true);
        assert.equal(h.network.length, 1);
    });

    test('[new] keeps MARP and PageFold-style load, interval, and beforeRequest timers out of a mixed continuation', async t => {
        const h = await fixture(t, [
            plugin('synthetic-marp', `setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/marp-load'),5000);setInterval(()=>{},100);
                await Risuai.addRisuReplacer('afterRequest',value=>value);`),
            plugin('synthetic-pagefold', `await Risuai.addRisuReplacer('beforeRequest',value=>{setTimeout(()=>Risuai.nativeFetch('https://synthetic.invalid/pagefold-before'),5000);return value;});`),
            plugin('synthetic-output-sync', `await Risuai.addRisuReplacer('afterRequest',value=>{setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/output-sync');await response.text();},20);return value;});`),
        ]);
        assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
        for (const callback of h.registry.replacerafterRequest) assert.equal(await callback('answer'), 'answer');
        const host = d3Host(h);
        assert.deepEqual(await host.handOver(), { participants: [
            { index: 2, pluginName: 'synthetic-output-sync', pluginVersion: '3.0' },
        ] });
        assert.deepEqual(await host.openPostResponse({ deadline: performance.now() + 1000, signal: new AbortController().signal }),
            { status: 'drained' });
        assert.deepEqual(h.network.map(row => new URL(row.url).pathname), ['/output-sync']);
    });

});
