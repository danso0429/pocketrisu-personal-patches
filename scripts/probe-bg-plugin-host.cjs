'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const targetRequire = createRequire(path.resolve(process.argv[2], 'package.json'));
const Database = targetRequire('better-sqlite3');
const { createBgPluginHost } = targetRequire('./server/node/bgPluginHost.cjs');
const { createPluginStorage, savedPluginPermission } = targetRequire('./server/node/bgPluginStorage.cjs');
const { createBgNotifications } = targetRequire('./server/node/bgNotifications.cjs');
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
        nativeFetch: async (url, options) => { network.push({ url, options }); return new Response('synthetic-response'); },
        risuFetch: async () => ({ ok: true, data: 'synthetic' }),
        requestChatDataMain: async (args, mode) => ({ type: 'success', result: JSON.stringify({ args, mode }) }),
        installProvider(name, callback) { registry.providers.set(name, callback); return () => registry.providers.delete(name); } };
    if (permissions) {
        const keys = plugins.flatMap(value => ['replacer', 'provider', 'db'].map(permission => JSON.stringify([value.name, permission])));
        kvSet('cache/plugin-permissions/state.json', JSON.stringify({ given: keys, denied: [], cache: keys.map(key => [key + '_lastGrantTime', Date.now()]) }));
    }
    const owner = { kvGet, kvSet, kvDel, kvList, transaction: task => { options.beforeLocalTransaction?.(); return db.transaction(task)(); },
        peekRoot: () => options.peekRoot ? options.peekRoot(root) : root,
        getRoot: async () => { options.onRootRead?.(); return options.getRoot ? options.getRoot(root) : root; },
        writeRoot: async mutate => { await options.beforeRootWrite?.(); root = mutate(root); writes++; } };
    t.after(async () => { await host?.close(); db.close(); });
    host = await createBgPluginHost({ database: options.separateRoot ? operationDb : root,
        getDatabase: () => options.separateRoot ? operationDb : root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
        hydrate: async value => structuredClone(value), storageOwner: owner, beforeEffect: () => { effects++; return options.beforeEffect?.(); },
        publishNotification: options.publishNotification ?? ((event, identity) => identity
            ? notifications.publishPluginFailure(event, identity) : notifications.publish(event)),
        publishDiagnostic: options.publishDiagnostic,
        onCriticalFailure: error => { options.onCriticalFailure?.(error); controller.abort(error); },
        operation: { operationId: 'synthetic-operation', charId: 'synthetic-character', chatId: 'synthetic-chat', inputPreparedOnClient: options.prepared === true },
        signal: controller.signal, bindings });
    return { host, registry, bindings, notifications, owner, network, get root() { return root; },
        set root(value) { root = value; }, get effects() { return effects; }, get writes() { return writes; },
        get operationDb() { return options.separateRoot ? operationDb : root; },
        swapOperationDb() { operationDb = structuredClone(root); },
        controller, notices: () => notifications.claim('synthetic-consumer', 2).map(row => row.event) };
}

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
    const hooks=[...h.registry.replacerbeforeRequest];assert.deepEqual(await hooks[0]([]),[]);
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
    const input=[{role:'user',content:'write'}];assert.deepEqual(await hook(input),input);
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
    await [...h.registry.replacerbeforeRequest][0]([]);
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
    let messages = [];
    for (const hook of h.registry.replacerbeforeRequest) messages = await hook(messages);
    assert.deepEqual(messages.map(message => message.content), ['first', 'third']);
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

test('unsupported API is recorded even when plugin catches the rejection', async t => {
    const h = await fixture(t, [plugin('unsupported', `await Risuai.addRisuReplacer('beforeRequest',async xs=>{
        try{await Risuai.setDatabase({plugins:[]});}catch{}return [];});`)]);
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input);
    assert.equal(h.root.plugins.length, 1);
    assert.equal(h.notices()[0].code, 'plugin_api_unsupported');
    assert.equal(h.notices()[0].api, 'set_database');
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
    assert.equal((await h.registry.providers.get('shared')({})).content, 'original');
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
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    assert.equal(h.notices()[0].code, 'plugin_hook_failed');
    assert.equal(h.notices()[0].effectsMayHaveOccurred, true);
});

test('short unsupported names still produce valid noncritical failure notices', async t => {
    const h = await fixture(t, [plugin('short-api', `await Risuai.x();`)]);
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
    assert.deepEqual(await hook([]), []); assert.deepEqual(await hook([]), []);
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
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]), []);
    assert.equal(h.controller.signal.aborted, false); assert.equal(h.network.length, 0);
    assert.deepEqual(h.notices().map(row=>row.code), ['plugin_host_limit','plugin_hook_failed']);
});

test('recoverable limit and terminal resource failure keep separate stored notices', async t => {
    const h=await fixture(t,[plugin('limit-then-resource',`await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        try{await Risuai.nativeFetch('https://synthetic.invalid/limit',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}
        await Risuai.getDatabase(['pluginCustomStorage']);return messages;
    });`)]);
    h.root.pluginCustomStorage.oversized='x'.repeat(4*1024*1024);
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0]([]),[]);
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
