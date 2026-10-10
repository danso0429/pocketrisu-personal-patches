'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginSession } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSession.cjs');
const { createPluginPeer, stringJSONBytes, reservePluginStorage, reservedPluginValue } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');

function peers(t, dispatch, mutate = frame => frame, mutateParent = frame => [frame], timeouts = {}) {
    const frames = []; let parent, worker, fatal;
    parent = createPluginPeer({ timeoutMs:timeouts.parent??600000, retainContext:timeouts.retain??(()=>()=>{}),
        runContext:timeouts.runContext??((_context,task)=>task()), dispatch, send: frame => { for (const changed of mutateParent(frame)) queueMicrotask(() => worker.receive(changed)); }, onFatal: code => { fatal = code; worker.close(code); } });
    worker = createPluginPeer({ timeoutMs:timeouts.worker??600000, localCallLimits:timeouts.localCallLimits??false,
        dispatch: () => { throw Error('unexpected callback'); }, send: frame => {
        const changed = mutate(frame); frames.push(changed); queueMicrotask(() => parent.receive(changed));
    }, onFatal: code => { fatal = code; parent.close(code); } });
    t.after(() => { parent.close(); worker.close(); assert.equal(parent.stats().reservedLargeUnits, 0);assert.equal(parent.stats().storageCredits,0); });
    return { parent, worker, frames, get fatal() { return fatal; } };
}

test('string JSON measurement matches actual escaping without allocating the whole wire value',()=>{
    for(const value of ['','ascii','\t\n\u0000','"\\','한글😀','\ud800X\udfff','x'.repeat(65535)+'😀',String.fromCharCode(...Array.from({length:65536},(_,i)=>i))])
        assert.equal(stringJSONBytes(value),Buffer.byteLength(JSON.stringify(value)));
});

test('pre-decode refusal restores fresh exports and preserves previously accepted handles', async t => {
    let expired = false;
    const accepted = [];
    const p = peers(t, (_method, args) => { accepted.push(args[1]); }, undefined, undefined, { localCallLimits: true, runContext: (_context, task) => {
        if (expired) throw Object.assign(Error('expired'), { code: 'plugin_invocation_expired' });
        return task();
    } });
    const ordinary = new ReadableStream({ start(controller) { controller.enqueue('ordinary'); } });
    const existingFunction = value => 'callback-' + value, existingSignal = new AbortController().signal;
    await p.worker.call('api', ['register', [existingFunction, ordinary, existingSignal]]);
    expired = true;
    let cancelled = 0;
    const fresh = new ReadableStream({ start(controller) { controller.enqueue('fresh'); }, cancel() { cancelled++; } });
    await assert.rejects(p.worker.call('api', ['localPluginStorage.setItem', ['synthetic', 'x'.repeat(5 * 1024 * 1024),
        existingFunction, ordinary, existingSignal, value => 'fresh-' + value, fresh, new AbortController().signal]]), { code: 'plugin_invocation_expired' });
    assert.equal(accepted.length, 1);
    assert.equal(p.worker.stats().reservedLargeUnits, 0);
    assert.equal(p.worker.stats().largeReservations, 0);
    assert.equal(p.worker.stats().exports.streams, 1);
    assert.equal(p.worker.stats().exports.functions, 1);
    assert.equal(p.worker.stats().exports.signals, 1);
    assert.equal(fresh.locked, false); assert.equal(cancelled, 0);
    expired = false;
    assert.equal(await accepted[0][0]('still-live'), 'callback-still-live');
    const reader = accepted[0][1].getReader();
    assert.deepEqual(await reader.read(), { done: false, value: 'ordinary' });
    await reader.cancel();
    assert.equal(accepted[0][2].aborted, false);
    await p.worker.call('api', ['register', [value => 'fresh-' + value, fresh]]);
    assert.equal(await accepted[1][0]('usable'), 'fresh-usable');
    const freshReader = accepted[1][1].getReader();
    assert.deepEqual(await freshReader.read(), { done: false, value: 'fresh' }); await freshReader.cancel();
});

test('repeated pre-decode refusals do not accumulate new function, stream or signal exports', async t => {
    const p = peers(t, () => { throw Error('must not dispatch'); }, undefined, undefined,
        { localCallLimits: true, runContext: () => { throw Object.assign(Error('expired'), { code: 'plugin_invocation_expired' }); } });
    for (let index = 0; index < 80; index++) {
        const stream = new ReadableStream();
        await assert.rejects(p.worker.call('api', ['getArgument', ['ignored', () => index, stream, new AbortController().signal]]),
            { code: 'plugin_invocation_expired' });
        assert.equal(stream.locked, false);
    }
    assert.deepEqual(p.worker.stats().exports, { functions: 0, streams: 0, signals: 0 });
    assert.equal(p.fatal, undefined);
});

test('late small and large setItem refusals leave the actual OS session healthy past the idle deadline', async t => {
    const controls = [];
    for (const large of [false, true]) {
        let hook, writes = 0, late = 0;
        const session = await createPluginSession({ runtimeMs: 40000, script: `
            const storage=await Risuai.getLocalPluginStorage();let calls=0;
            await Risuai.addProvider('synthetic',async()=>{
                if(++calls===1)setTimeout(()=>storage.setItem('late',${large ? "'x'.repeat(5*1024*1024)" : "'small'"}).catch(()=>{}),50);
                return {success:true,content:'call-'+calls};
            });`, api(method, args) {
                if (method === 'addProvider') hook = args[1];
                else if (method === 'localPluginStorage.setItem') writes++;
                else throw Error('unexpected API');
            }, onLateCall: () => { late++; } });
        t.after(() => session.close());
        await session.load();
        assert.deepEqual(await hook({}), { success: true, content: 'call-1' });
        controls.push({ session, hook, writes: () => writes, late: () => late });
    }
    // Cross the documented 15s descriptor idle deadline, rather than shorten it.
    await new Promise(resolve => setTimeout(resolve, 16200));
    for (const control of controls) {
        assert.equal(control.writes(), 0);
        assert.equal(control.late(), 1);
        assert.equal(control.session.failure, null);
        assert.equal(control.session.activeScopes, 0);
        assert.deepEqual(await control.hook({}), { success: true, content: 'call-2' });
    }
});

test('storage credits reject before parsing and release after an inline reply',async t=>{
    const first=reservePluginStorage(32*1024*1024),second=reservePluginStorage(32*1024*1024);let parsed=0;
    try{assert.throws(()=>reservedPluginValue(()=>{parsed++;return 'no';},1),{code:'plugin_budget_exceeded'});assert.equal(parsed,0);}
    finally{first();second();}
    const p=peers(t,()=>reservedPluginValue(()=> 'small',7));
    assert.equal(await p.worker.call('api',['localPluginStorage.getItem',['synthetic']]),'small');assert.equal(p.parent.stats().storageCredits,0);
});

test('a stalled outgoing descriptor expires before the other peer RPC deadline',async t=>{
    let retained=0;
    const p=peers(t,()=>reservedPluginValue(()=> 'x'.repeat(5*1024*1024),5*1024*1024),undefined,
        frame=>frame.value?.[0]==='largeString'?[]:[frame],{parent:150,worker:2000,retain:()=>{retained++;return()=>{retained--;};}});
    const watchdog=setTimeout(()=>assert.fail('progress deadline did not fire'),1500);
    try{await assert.rejects(p.worker.call('api',['localPluginStorage.getItem',['synthetic']]),{code:'plugin_rpc_timeout'});assert.equal(p.fatal,'plugin_rpc_timeout');assert.equal(retained,0);}
    finally{clearTimeout(watchdog);}
});

test('large setItem descriptors stay top-level and each wire frame remains bounded', async t => {
    const source = 'x'.repeat(5 * 1024 * 1024); let stored;
    const p = peers(t, (method, args) => { assert.equal(method, 'api'); stored = args[1][1]; });
    await p.worker.call('api', ['localPluginStorage.setItem', ['synthetic', source]]);
    assert.equal(stored, source); assert.equal(p.parent.stats().reservedLargeUnits, 0);
    const first = p.frames.find(frame => frame.kind === 'call');
    assert.equal(first.args[1][1][1][1][0], 'largeString');
    assert.ok(p.frames.every(frame => Buffer.byteLength(JSON.stringify(frame)) < 512 * 1024));
    assert.equal(p.fatal, undefined);
});

for (const bad of ['length', 'chunk', 'empty', 'truncated', 'oversized-chunk', 'position']) test(`malformed large descriptor ${bad} cannot dispatch an API effect`, async t => {
    let effects = 0, changed = false;
    const p = peers(t, () => { effects++; }, frame => {
        frame = JSON.parse(JSON.stringify(frame));
        if (!changed && frame.kind === 'call' && frame.method === 'api') {
            changed = true;
            if (bad === 'length') frame.args[1][1][1][1][2]--;
            if (bad === 'position') frame.args[1][0][1] = 'pluginStorage.setItem';
        }
        if (['chunk','empty','truncated','oversized-chunk'].includes(bad) && frame.kind === 'return' && frame.ok && frame.value?.[0] === 'object') {
            const row = frame.value[1].find(row => row[0] === 'value');
            if (row) row[1] = ['value',bad==='chunk'?42:bad==='empty'?'':bad==='oversized-chunk'?'x'.repeat(65537):'x'];
            if(bad==='truncated')frame.value[1].find(row=>row[0]==='done')[1]=['value',true];
        }
        return frame;
    });
    await assert.rejects(p.worker.call('api', ['localPluginStorage.setItem', ['synthetic', 'x'.repeat(5 * 1024 * 1024)]]));
    assert.equal(effects, 0);
    assert.equal(p.fatal,'plugin_rpc_value_invalid');
});

test('duplicate large return while decoding closes both peers and releases reservations', async t => {
    const p = peers(t, () => 'x'.repeat(5 * 1024 * 1024), undefined,
        frame => frame.kind === 'return' && frame.value?.[0] === 'largeString' ? [frame,frame] : [frame]);
    await assert.rejects(p.worker.call('api',['localPluginStorage.getItem',['synthetic']]),{code:'plugin_rpc_protocol_invalid'});
    assert.equal(p.worker.stats().reservedLargeUnits,0);
});

test('over the large string reservation limit publishes no frame and acquires no resource', async t => {
    const p=peers(t,()=>{throw Error('unexpected effect');});
    await assert.rejects(p.worker.call('api',['localPluginStorage.setItem',['synthetic','x'.repeat(32*1024*1024+1)]]),{code:'plugin_rpc_value_limit'});
    assert.equal(p.frames.length,0);assert.equal(p.worker.stats().largeReservations,0);
});

test('a stalled large read cannot block a different live session small or bounded large read', async t => {
    let reads=0;
    const p=peers(t,()=>{reads++;return 'x'.repeat(5*1024*1024);},undefined,frame=>frame.value?.[0]==='largeString'?[]:[frame]);
    const first=p.worker.call('api',['localPluginStorage.getItem',['first']]);
    const rejected=assert.rejects(first);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);
    const next=peers(t,()=>{reads++;return 'small';});
    assert.equal(await next.worker.call('api',['localPluginStorage.getItem',['next']]),'small');assert.equal(reads,2);
    const large=peers(t,()=> 'y'.repeat(5*1024*1024));
    assert.equal((await large.worker.call('api',['localPluginStorage.getItem',['next']])).length,5*1024*1024);
    p.parent.close();p.worker.close();await rejected;
});

test('closing a stalled outbound descriptor releases its reservation without a write', async t => {
    const p = peers(t, () => { throw Error('must not dispatch'); });
    const original = p.parent.receive; p.parent.receive = () => {};
    const request = p.worker.call('api', ['localPluginStorage.setItem', ['synthetic', 'x'.repeat(5 * 1024 * 1024)]]);
    assert.equal(p.worker.stats().largeReservations, 1);
    p.worker.close(); await assert.rejects(request, { code: 'plugin_rpc_closed' });
    assert.equal(p.worker.stats().reservedLargeUnits, 0); p.parent.receive = original;
});

test('actual OS local storage transports large Unicode strings in both directions', async t => {
    let hook, stored;
    const source = 'x'.repeat(65535)+'😀'+'한글😀\ud800X\udfffY'.repeat(600_000);
    assert.ok(Buffer.byteLength(source) > 4 * 1024 * 1024);
    assert.equal(source.charCodeAt(65535),0xd83d);assert.equal(source.charCodeAt(65536),0xde00);
    assert.ok(source.includes('\ud800X'));assert.ok(source.includes('\udfffY'));
    const session = await createPluginSession({
        script: `await Risuai.addProvider('synthetic', async()=>{
            const storage=await Risuai.getLocalPluginStorage();
            const value=await storage.getItem('source');
            await storage.setItem('copy',value);
            return {success:true,content:String(value.length)};
        });`,
        api(method, args) {
            if (method === 'addProvider') hook = args[1];
            else if (method === 'localPluginStorage.getItem') return source;
            else if (method === 'localPluginStorage.setItem') stored = args[1];
            else throw Error('unexpected API');
        },
    });
    t.after(() => session.close()); await session.load();
    assert.deepEqual(await hook({}), { success: true, content: String(source.length) });
    assert.equal(stored, source); assert.equal(session.failure, null); assert.equal(session.activeScopes, 0);
});

test('ordinary root storage retains the small-value refusal and never writes', async t => {
    let hook, writes = 0, limits = 0;
    const session = await createPluginSession({
        script: `await Risuai.addProvider('synthetic', async()=>{
            try {await Risuai.pluginStorage.setItem('large','x'.repeat(9*1024*1024));}
            catch(e){return {success:false,content:e.code};}
        });`,
        api(method, args) { if (method === 'addProvider') hook = args[1]; else writes++; },
        onLocalLimit: () => { limits++; },
    });
    t.after(() => session.close()); await session.load();
    assert.deepEqual(await hook({}), { success: false, content: 'plugin_rpc_frame_limit' });
    assert.equal(writes, 0); assert.equal(limits, 1); assert.equal(session.failure, null);
});

test('actual OS escaped string and ignored extra getter/setter arguments never become an oversized frame',async t=>{
    let hook,stored;const source='\t'.repeat(4*1024*1024);
    const session=await createPluginSession({script:`await Risuai.addProvider('synthetic',async()=>{
        const s=await Risuai.getLocalPluginStorage(),v=await s.getItem('source','ignored');await s.setItem('copy',v,'ignored');return {success:true,content:String(v.length)};
    });`,api(method,args){if(method==='addProvider')hook=args[1];else if(method==='localPluginStorage.getItem')return source;else if(method==='localPluginStorage.setItem')stored=args[1];else throw Error('unexpected API');}});
    t.after(()=>session.close());await session.load();assert.deepEqual(await hook({}),{success:true,content:String(source.length)});
    assert.equal(stored,source);assert.equal(session.failure,null);assert.equal(session.activeScopes,0);
});

test('large getter drain retains actual invocation after the bounded callback settlement warning',async t=>{
    const Module=require('node:module'),load=Module._load;
    const sessionPath=require.resolve('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSession.cjs');
    delete require.cache[sessionPath];
    Module._load=function(name,...args){
        const value=load.call(this,name,...args);
        if(name!=='./bgPluginSandbox.cjs')return value;
        return {...value,createPluginSandbox:async options=>{
            const sandbox=await value.createPluginSandbox(options),timers=new Set();
            return {...sandbox,send(frame){
                const chunk=frame.value?.[0]==='object'?frame.value[1].find(row=>row[0]==='value')?.[1]:null;
                if(frame.kind==='return'&&chunk?.[0]==='value'&&typeof chunk[1]==='string'&&chunk[1].length===65536){
                    const timer=setTimeout(()=>{timers.delete(timer);sandbox.send(frame);},300);timers.add(timer);
                }else sandbox.send(frame);
            },stop(code){for(const timer of timers)clearTimeout(timer);timers.clear();sandbox.stop(code);}};
        }};
    };
    let createDelayed;
    try{createDelayed=require(sessionPath).createPluginSession;}finally{Module._load=load;delete require.cache[sessionPath];}
    let hook,warnings=0,late=0;
    const session=await createDelayed({runtimeMs:120000,script:`await Risuai.addProvider('synthetic',async()=>{
        const s=await Risuai.getLocalPluginStorage();void s.getItem('slow');return {success:true,content:'original result'};
    });`,api(method,args){if(method==='addProvider')hook=args[1];else if(method==='localPluginStorage.getItem')return 'x'.repeat(5*1024*1024);else throw Error('unexpected API');},onSettlementTimeout:()=>{warnings++;},onLateCall:()=>{late++;}});
    t.after(()=>session.close());await session.load();assert.deepEqual(await hook({}),{success:true,content:'original result'});
    assert.equal(warnings,1);assert.equal(session.activeScopes,1);assert.equal(late,0);
    const deadline=Date.now()+20000;while(session.activeScopes&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(session.activeScopes,0);assert.equal(late,0);assert.equal(session.failure,null);
});
