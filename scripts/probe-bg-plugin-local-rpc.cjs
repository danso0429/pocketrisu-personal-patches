'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginPeer } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');
const cap = 8 * 1024 * 1024;
const failure = code => Object.assign(new Error(code), { code });
function pair(mode = 'bytes', workerDispatch) {
    const calls = [], refused = [], fatal = [], sent = [];
    let worker;
    const parent = createPluginPeer({ send: frame => queueMicrotask(() => worker.receive(frame)),
        getContext: () => 'active-scope',
        runContext: (context, task) => { assert.equal(context, 'active-scope'); return task(); },
        dispatch(method, args) {
            if (method === 'api_local_limit') { refused.push(args[0]); throw failure(args[0]); }
            calls.push(args); return 'ok';
        } });
    worker = createPluginPeer({ localCallLimits: true, dispatch: workerDispatch, getContext: () => 'active-scope', onFatal: code => fatal.push(code),
        send: frame => {
            const bytes = Buffer.byteLength(JSON.stringify(frame) + '\n'); sent.push({ kind:frame.kind,id: frame.id, method: frame.method, bytes });
            if (mode === 'backpressure') throw failure('plugin_rpc_frame_limit');
            if (bytes > (mode==='tiny'?1:cap)) throw Object.assign(failure('plugin_rpc_frame_limit'), { oversize: true });
            queueMicrotask(() => parent.receive(frame));
        } });
    return { parent, worker, calls, refused, fatal, sent, close() { worker.close(); parent.close(); } };
}
for (const delta of [-1, 0, 1]) test(`worker call frame boundary ${delta} preserves its one pending call`, async t => {
    const p = pair(); t.after(() => p.close());
    const overhead = Buffer.byteLength(JSON.stringify({ v: 1, kind: 'call', id: 1, method: 'api',
        args: ['array', [['value', '']]], context: 'active-scope' }) + '\n');
    const call = p.worker.call('api', ['x'.repeat(cap + delta - overhead)]);
    if (delta > 0) {
        await assert.rejects(call, { code: 'plugin_rpc_frame_limit' });
        assert.deepEqual(p.refused, ['plugin_rpc_frame_limit']); assert.equal(p.calls.length, 0);
        assert.deepEqual(p.sent.map(x => x.id), [1, 1]); assert.equal(p.sent[1].method, 'api_local_limit');
    } else { assert.equal(await call, 'ok'); assert.equal(p.calls.length, 1); assert.deepEqual(p.refused, []); }
    assert.equal(p.sent[0].bytes, cap + delta); assert.deepEqual(p.fatal, []);
    assert.equal(await p.worker.call('api', ['small']), 'ok'); assert.equal(p.worker.stats().pending, 0);
});
test('value packing refusal uses one id and preserves a later valid call', async t => {
    const p = pair(); t.after(() => p.close());
    await assert.rejects(p.worker.call('api', [Array(100001).fill(0)]), { code: 'plugin_rpc_value_limit' });
    assert.equal(p.sent.length, 1); assert.equal(p.sent[0].id, 1); assert.equal(p.sent[0].method, 'api_local_limit');
    assert.equal(p.calls.length, 0); assert.deepEqual(p.refused, ['plugin_rpc_value_limit']);
    assert.equal(await p.worker.call('api', ['small']), 'ok'); assert.deepEqual(p.fatal, []);
});
test('backpressure without a pre-write oversize marker remains fatal', async t => {
    const p = pair('backpressure'); t.after(() => p.close());
    await assert.rejects(p.worker.call('api', ['small']), { code: 'plugin_rpc_frame_limit' });
    assert.equal(p.sent.length, 1); assert.deepEqual(p.fatal, ['plugin_rpc_frame_limit']); assert.deepEqual(p.refused, []);
    await assert.rejects(p.worker.call('api', ['next']), { code: 'plugin_rpc_closed' });
});
test('large worker return keeps its existing small error reply without becoming a local-call report', async t => {
    const p = pair('bytes', () => 'x'.repeat(9 * 1024 * 1024)); t.after(() => p.close());
    await assert.rejects(p.parent.call('returnLarge', [], 'active-scope'), { code: 'plugin_rpc_frame_limit' });
    assert.deepEqual(p.refused, []); assert.deepEqual(p.fatal, []);
    assert.equal(await p.worker.call('api', ['small']), 'ok');
});

for(const kind of ['frame','value','type','getter'])test(`refused ${kind} serialization preserves new stream/response/callback/signal reuse`,async t=>{
    const p=pair();t.after(()=>p.close());let cancels=0;
    const response=new Response(new ReadableStream({pull(c){c.enqueue(new TextEncoder().encode('preserved'));c.close();},cancel(){cancels++;}},{highWaterMark:0}));
    const controller=new AbortController(),fn=value=>'callback:'+value;
    const handles={response,fn,signal:controller.signal};
    const tail=kind==='frame'?'x'.repeat(9*1024*1024):kind==='value'?Array(100001).fill(0):kind==='type'?new Map():Object.defineProperty({},'bad',{enumerable:true,get(){throw failure('plugin_synthetic_getter');}});
    await assert.rejects(p.worker.call('api',[handles,tail]),{code:kind==='frame'?'plugin_rpc_frame_limit':kind==='value'?'plugin_rpc_value_limit':kind==='type'?'plugin_rpc_type_unsupported':'plugin_synthetic_getter'});
    assert.deepEqual(p.worker.stats().exports,{functions:0,streams:0,signals:0});assert.equal(response.body.locked,false);assert.equal(response.bodyUsed,false);assert.equal(cancels,0);
    assert.equal(p.worker.stats().pending,0);assert.equal(p.calls.length,0);
    assert.equal(await p.worker.call('api',[handles]),'ok');const received=p.calls.at(-1)[0];
    assert.equal(await received.response.text(),'preserved');assert.equal(await received.fn('next'),'callback:next');
    controller.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(received.signal.aborted,true);
    assert.deepEqual(p.fatal,[]);assert.equal(cancels,0);
});
test('rejected Response can still be read locally without cancellation or disturbance',async t=>{
    const p=pair();t.after(()=>p.close());const response=new Response('local body');
    await assert.rejects(p.worker.call('api',[response,'x'.repeat(9*1024*1024)]),{code:'plugin_rpc_frame_limit'});
    assert.equal(response.body.locked,false);assert.equal(response.bodyUsed,false);assert.equal(await response.text(),'local body');
});
test('materialization failure restores earlier new handles and keeps an already locked reader',async t=>{
    const p=pair();t.after(()=>p.close());const first=new ReadableStream({pull(c){c.enqueue('first');c.close();}},{highWaterMark:0});
    const locked=new ReadableStream({pull(c){c.enqueue('locked');c.close();}},{highWaterMark:0}),reader=locked.getReader();
    await assert.rejects(p.worker.call('api',[()=>null,new AbortController().signal,first,locked]),TypeError);
    assert.equal(first.locked,false);assert.equal(locked.locked,true);assert.deepEqual(p.worker.stats().exports,{functions:0,streams:0,signals:0});
    assert.equal((await reader.read()).value,'locked');reader.releaseLock();assert.equal(await p.worker.call('api',[first,locked]),'ok');
    for(const [stream,expected] of [[p.calls.at(-1)[0],'first'],[p.calls.at(-1)[1],undefined]]){const r=stream.getReader();const value=await r.read();assert.equal(value.value,expected);if(!value.done)assert.equal((await r.read()).done,true);}
});
for(const nestedSuccess of [true,false])test(`nested getter publication survives outer refusal, nestedSuccess=${nestedSuccess}`,async t=>{
    const p=pair();t.after(()=>p.close());const stream=new ReadableStream({pull(c){c.enqueue('nested body');c.close();}},{highWaterMark:0});let nested;
    const value=Object.defineProperty({},'nested',{enumerable:true,get(){nested=p.worker.call('api',nestedSuccess?[stream]:[stream,'x'.repeat(9*1024*1024)]);return nestedSuccess?'x'.repeat(9*1024*1024):'small';}});
    const outer=p.worker.call('api',[stream,value]);
    if(nestedSuccess){await assert.rejects(outer,{code:'plugin_rpc_frame_limit'});assert.equal(await nested,'ok');}
    else{await assert.rejects(nested,{code:'plugin_rpc_frame_limit'});assert.equal(await outer,'ok');}
    assert.equal(p.worker.stats().exports.streams,1);const r=p.calls[0][0].getReader();assert.equal((await r.read()).value,'nested body');assert.equal((await r.read()).done,true);
    assert.deepEqual(p.fatal,[]);
});
for(const oversize of [false,true])test(`abort during pure encoding has no pre-publication frame, oversize=${oversize}`,async t=>{
    const p=pair();t.after(()=>p.close());const controller=new AbortController();
    const value=Object.defineProperty({},'abort',{enumerable:true,get(){controller.abort();return oversize?'x'.repeat(9*1024*1024):'small';}});
    const call=p.worker.call('api',[controller.signal,value]);
    if(oversize){await assert.rejects(call,{code:'plugin_rpc_frame_limit'});assert.equal(p.worker.stats().exports.signals,0);}
    else{assert.equal(await call,'ok');assert.equal(p.calls[0][0].aborted,true);}
    assert.equal(p.sent.filter(f=>f.kind==='abort').length,0);assert.deepEqual(p.fatal,[]);
});
test('instance overrides cannot acquire a fake reader or hide signal state',async t=>{
    const p=pair();t.after(()=>p.close());let overridden=0;
    const stream=new ReadableStream({pull(c){c.enqueue('native');c.close();}},{highWaterMark:0});
    stream.getReader=()=>{overridden++;throw Error('must not run');};const c=new AbortController();
    Object.defineProperty(c.signal,'aborted',{get(){overridden++;return false;}});c.signal.addEventListener=()=>{overridden++;};c.signal.removeEventListener=()=>{overridden++;};
    await assert.rejects(p.worker.call('api',[stream,c.signal,'x'.repeat(9*1024*1024)]),{code:'plugin_rpc_frame_limit'});assert.equal(stream.locked,false);
    c.abort();assert.equal(await p.worker.call('api',[stream,c.signal]),'ok');assert.equal(p.calls[0][1].aborted,true);
    const reader=p.calls[0][0].getReader();assert.equal((await reader.read()).value,'native');assert.equal((await reader.read()).done,true);p.close();assert.equal(overridden,0);
});
test('repeated refused function allocations preserve the next valid callback',async t=>{
    const p=pair();t.after(()=>p.close());const tail=Array(100001).fill(0);
    for(let i=0;i<260;i++)await assert.rejects(p.worker.call('api',[()=>i,tail]),{code:'plugin_rpc_value_limit'});
    assert.deepEqual(p.worker.stats().exports,{functions:0,streams:0,signals:0});assert.equal(await p.worker.call('api',[()=> 'next']),'ok');assert.equal(await p.calls[0][0](),'next');
});
test('refused stream near the64 cap preserves published streams and one remaining slot',async t=>{
    const p=pair();t.after(()=>p.close());const stream=i=>new ReadableStream({pull(c){c.enqueue(i);c.close();}},{highWaterMark:0});
    const first=stream(0);for(let i=0;i<63;i++)assert.equal(await p.worker.call('api',[i===0?first:stream(i)]),'ok');
    for(let i=0;i<3;i++){const next=stream(64);await assert.rejects(p.worker.call('api',[first,next,'x'.repeat(9*1024*1024)]),{code:'plugin_rpc_frame_limit'});assert.equal(next.locked,false);assert.equal(first.locked,true);assert.equal(p.worker.stats().exports.streams,63);}
    assert.equal(await p.worker.call('api',[stream(63)]),'ok');assert.equal(p.worker.stats().exports.streams,64);
    for(let i=0;i<64;i++){const r=p.calls[i][0].getReader();assert.equal((await r.read()).value,i);assert.equal((await r.read()).done,true);}assert.equal(p.worker.stats().exports.streams,0);
});
test('refused worker return rolls back its resources before the small error reply',async t=>{
    const stream=new ReadableStream({pull(c){c.enqueue('returned');c.close();}},{highWaterMark:0});let large=true;
    const p=pair('bytes',()=>[stream,large?'x'.repeat(9*1024*1024):'small']);t.after(()=>p.close());
    await assert.rejects(p.parent.call('returnHandles',[],'active-scope'),{code:'plugin_rpc_frame_limit'});assert.equal(stream.locked,false);assert.equal(p.worker.stats().exports.streams,0);
    large=false;const value=await p.parent.call('returnHandles',[],'active-scope');const r=value[0].getReader();assert.equal((await r.read()).value,'returned');assert.equal((await r.read()).done,true);assert.deepEqual(p.refused,[]);
});
test('parent-side pure packing failure leaves caller-owned body readable',async t=>{
    const p=pair();t.after(()=>p.close());const body=new Response('parent');
    await assert.rejects(p.parent.call('api',[body,new Map()],'active-scope'),{code:'plugin_rpc_type_unsupported'});assert.equal(body.body.locked,false);assert.equal(await body.text(),'parent');
});
test('unmarked transport failure remains fatal and cancels materialized stream',async t=>{
    const p=pair('backpressure');t.after(()=>p.close());let cancelled=0;
    const stream=new ReadableStream({cancel(){cancelled++;}},{highWaterMark:0});await assert.rejects(p.worker.call('api',[stream]),{code:'plugin_rpc_frame_limit'});
    assert.equal(p.worker.stats().closed,true);assert.equal(cancelled,1);assert.deepEqual(p.refused,[]);
});
for(const valueLimit of [false,true])test(`closure during a getter cannot acquire resources or leave pending, valueLimit=${valueLimit}`,async t=>{
    const p=pair();t.after(()=>p.close());const stream=new ReadableStream({},{highWaterMark:0});
    const value=Object.defineProperty({},'close',{enumerable:true,get(){p.worker.close();return 'closed';}});
    await assert.rejects(p.worker.call('api',[stream,value,valueLimit?Array(100001).fill(0):'small']),{code:'plugin_rpc_closed'});
    assert.equal(stream.locked,false);assert.equal(p.worker.stats().pending,0);assert.deepEqual(p.worker.stats().exports,{functions:0,streams:0,signals:0});
});
test('a refused tiny control frame keeps the original fatal code and no pending entry',async t=>{
    const p=pair('tiny');t.after(()=>p.close());await assert.rejects(p.worker.call('api',[Array(100001).fill(0)]),{code:'plugin_rpc_frame_limit'});
    assert.equal(p.worker.stats().pending,0);assert.deepEqual(p.fatal,['plugin_rpc_frame_limit']);
});
test('inherited JSON formatters cannot run between materialization and emission',async t=>{
    const p=pair();t.after(()=>p.close());let called=0;const oldArray=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON'),oldObject=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
    const stream=new ReadableStream({pull(c){c.enqueue('private wire');c.close();}},{highWaterMark:0});
    const value=Object.defineProperty({},'formatter',{enumerable:true,get(){
        Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value(){called++;return this;}});
        Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){called++;return this;}});
        return 'x'.repeat(9*1024*1024);
    }});
    try{
        await assert.rejects(p.worker.call('api',[stream,value]),{code:'plugin_rpc_frame_limit'});
        assert.equal(called,0);assert.equal(stream.locked,false);assert.deepEqual(p.fatal,[]);
        assert.equal(await p.worker.call('api',[stream]),'ok');const r=p.calls[0][0].getReader();assert.equal((await r.read()).value,'private wire');assert.equal((await r.read()).done,true);assert.equal(called,0);
    }finally{if(oldArray)Object.defineProperty(Array.prototype,'toJSON',oldArray);else delete Array.prototype.toJSON;
        if(oldObject)Object.defineProperty(Object.prototype,'toJSON',oldObject);else delete Object.prototype.toJSON;}
});
test('Response error/null bodies and repeated headers retain their native metadata',async t=>{
    let response=Response.error();const p=pair('bytes',()=>response);t.after(()=>p.close());
    let received=await p.parent.call('response',[],'active-scope');assert.equal(received.status,0);assert.equal(received.type,'error');assert.equal(received.body,null);
    response=new Response(null,{status:204,headers:[['set-cookie','a=1'],['set-cookie','b=2']]});
    Object.defineProperty(response,'url',{value:'https://synthetic.example.test/redirected'});Object.defineProperty(response,'redirected',{value:true});Object.defineProperty(response,'type',{value:'cors'});
    received=await p.parent.call('response',[],'active-scope');assert.equal(received.status,204);assert.equal(received.body,null);
    assert.equal(received.url,response.url);assert.equal(received.redirected,true);assert.equal(received.type,'cors');assert.deepEqual([...received.headers],[...response.headers]);
});
test('pre-aborted duplicate signals publish once and a later fresh abort sends one frame',async t=>{
    const p=pair();t.after(()=>p.close());const before=new AbortController();before.abort();
    assert.equal(await p.worker.call('api',[before.signal,before.signal]),'ok');assert.equal(p.calls[0][0],p.calls[0][1]);assert.equal(p.calls[0][0].aborted,true);
    assert.equal(p.worker.stats().exports.signals,1);assert.equal(p.sent.filter(f=>f.kind==='abort').length,0);
    const after=new AbortController();assert.equal(await p.worker.call('api',[after.signal]),'ok');after.abort();await new Promise(r=>setImmediate(r));
    assert.equal(p.calls[1][0].aborted,true);assert.equal(p.sent.filter(f=>f.kind==='abort').length,1);
});
test('byte-stream refusal leaves the first bytes readable on the next transfer',async t=>{
    const p=pair();t.after(()=>p.close());let cancels=0;
    const stream=new ReadableStream({type:'bytes',pull(c){c.enqueue(new Uint8Array([1,2,3]));c.close();},cancel(){cancels++;}},{highWaterMark:0});
    await assert.rejects(p.worker.call('api',[stream,'x'.repeat(9*1024*1024)]),{code:'plugin_rpc_frame_limit'});assert.equal(stream.locked,false);
    assert.equal(await p.worker.call('api',[stream]),'ok');const r=p.calls[0][0].getReader();assert.deepEqual([...((await r.read()).value)],[1,2,3]);assert.equal((await r.read()).done,true);assert.equal(cancels,0);
});
test('post-encoding pending cap recheck rolls back unpublished resources',async t=>{
    let worker,release;const held=new Promise(r=>release=r),nested=[];
    const parent=createPluginPeer({send:f=>queueMicrotask(()=>worker.receive(f)),dispatch:()=>held});
    worker=createPluginPeer({send:f=>queueMicrotask(()=>parent.receive(f))});t.after(()=>{worker.close();parent.close();});
    const stream=new ReadableStream({},{highWaterMark:0});const value=Object.defineProperty({},'nested',{enumerable:true,get(){for(let i=0;i<64;i++)nested.push(worker.call('hold',[i]));return 'small';}});
    await assert.rejects(worker.call('outer',[stream,value]),{code:'plugin_rpc_pending_limit'});assert.equal(stream.locked,false);assert.equal(worker.stats().exports.streams,0);assert.equal(worker.stats().pending,64);
    release('held');assert.deepEqual(await Promise.all(nested),Array(64).fill('held'));assert.equal(worker.stats().pending,0);
});

test.describe('[NF-1] BG plugin RPC carries non-finite numbers', () => {
    const special = [NaN, Infinity, -Infinity, -0];
    const sameNumbers = (actual, expected = special) => {
        assert.equal(actual.length, expected.length);
        for (let index = 0; index < expected.length; index++) assert.ok(Object.is(actual[index], expected[index]), `number ${index}`);
    };
    const jsonPair = (t, { parentDispatch = (_method, args) => args[0], workerDispatch = (_method, args) => args[0], capBytes = cap } = {}) => {
        const frames = { parentToWorker: [], workerToParent: [] };
        let parent, worker;
        const relay = (direction, target) => frame => {
            const json = JSON.stringify(frame) + '\n';
            frames[direction].push(json);
            if (Buffer.byteLength(json) > capBytes) throw Object.assign(failure('plugin_rpc_frame_limit'), { oversize: true });
            queueMicrotask(() => target().receive(JSON.parse(json)));
        };
        parent = createPluginPeer({ send: relay('parentToWorker', () => worker), dispatch: parentDispatch,
            getContext: () => 'active-scope', runContext: (_context, task) => task() });
        worker = createPluginPeer({ send: relay('workerToParent', () => parent), dispatch: workerDispatch,
            getContext: () => 'active-scope', runContext: (_context, task) => task(), workerSide: true });
        t.after(() => { worker.close(); parent.close(); });
        return { parent, worker, frames };
    };
    const decodeReturn = async (encoded, roundTrip = true) => {
        let emitted, fatal;
        const peer = createPluginPeer({ send: frame => { emitted = frame; }, dispatch: () => {}, onFatal: code => { fatal = code; } });
        const pending = peer.call('synthetic', []);
        const frame = { v: 1, kind: 'return', id: emitted.id, ok: true, value: encoded };
        peer.receive(roundTrip ? JSON.parse(JSON.stringify(frame)) : frame);
        await assert.rejects(pending, { code: 'plugin_rpc_value_invalid' });
        assert.equal(fatal, 'plugin_rpc_value_invalid');
    };

    test('[new] special numbers use explicit number tags and round-trip over JSON', async t => {
        const p = jsonPair(t);
        for (const value of special) assert.ok(Object.is(await p.worker.call('echo', [value]), value));
        const encoded = p.frames.workerToParent.filter(json => JSON.parse(json).kind === 'call')
            .map(json => JSON.parse(json).args[1][0]);
        assert.deepEqual(encoded, [['number', 'NaN'], ['number', 'Infinity'], ['number', '-Infinity'], ['number', '-0']]);
    });

    test('[unchanged] finite numbers and positive zero keep value tags', async t => {
        const values = [0, 1, -42.5, Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
        const p = jsonPair(t);
        for (const value of values) assert.ok(Object.is(await p.worker.call('echo', [value]), value));
        const encoded = p.frames.workerToParent.filter(json => JSON.parse(json).kind === 'call')
            .map(json => JSON.parse(json).args[1][0]);
        assert.deepEqual(encoded, values.map(value => ['value', value]));
        assert.ok(Object.is(encoded[0][1], +0));
    });

    test('[new] nested composites preserve special numbers beside dates and bytes', async t => {
        const p = jsonPair(t);
        const value = { top: NaN, nested: [Infinity, { negative: -Infinity, zero: -0 }],
            date: new Date('2026-10-22T00:00:00.000Z'), bytes: new Uint8Array([1, 2, 3]) };
        const received = await p.parent.call('echo', [value], 'active-scope');
        assert.ok(Object.is(received.top, NaN));
        assert.ok(Object.is(received.nested[0], Infinity));
        assert.ok(Object.is(received.nested[1].negative, -Infinity));
        assert.ok(Object.is(received.nested[1].zero, -0));
        assert.equal(received.date.toISOString(), value.date.toISOString());
        assert.deepEqual([...received.bytes], [1, 2, 3]);
    });

    test('[new] null and number-like strings remain distinct from special numbers', async t => {
        const p = jsonPair(t);
        const received = await p.worker.call('echo', [{ a: null, b: 'NaN', c: 'Infinity', d: '-0', e: NaN, f: -0 }]);
        assert.equal(received.a, null); assert.equal(received.b, 'NaN'); assert.equal(received.c, 'Infinity'); assert.equal(received.d, '-0');
        assert.ok(Object.is(received.e, NaN)); assert.ok(Object.is(received.f, -0));
    });

    test('[unchanged] forged number tags are rejected as invalid values', async () => {
        const forged = [
            ['number', '0'], ['number', '+0'], ['number', '+Infinity'], ['number', 'nan'], ['number', 'inf'],
            ['number', '1'], ['number', ''], ['number', 'NaN '], ['number', null], ['number', 0], ['number', {}],
            ['number', ['NaN']], ['number'], ['number', 'NaN', 'extra'], ['number', 'NaN', undefined],
        ];
        for (const value of forged) await decodeReturn(value);
    });

    test('[unchanged] value tags still reject JSON overflow and direct non-finite payloads', async () => {
        for (const json of ['["value",1e400]', '["value",-1e400]']) await decodeReturn(JSON.parse(json), false);
        for (const value of [NaN, Infinity, -Infinity]) await decodeReturn(['value', value], false);
        let emitted;
        const peer = createPluginPeer({ send: frame => { emitted = frame; }, dispatch: () => {} });
        const pending = peer.call('synthetic', []);
        peer.receive({ v: 1, kind: 'return', id: emitted.id, ok: true, value: ['value', null] });
        assert.equal(await pending, null);
        peer.close();
    });

    test('[unchanged] protocol numeric fields do not accept overflow or value tags', async () => {
        for (const id of [JSON.parse('1e400'), ['number', 'NaN'], ['number', '-0'], ['number', 'Infinity']]) {
            let fatal;
            const peer = createPluginPeer({ send: () => {}, dispatch: () => {}, onFatal: code => { fatal = code; } });
            peer.receive({ v: 1, kind: 'call', id, method: 'synthetic', args: ['array', []], context: null });
            assert.equal(fatal, 'plugin_rpc_protocol_invalid'); peer.close();
        }
        await decodeReturn(['response', JSON.parse('1e400'), '', [], '', false, 'default', ['value', null]], false);
        await decodeReturn(['largeString', 1, JSON.parse('1e400')], false);
        await decodeReturn(['stream', JSON.parse('1e400')], false);
        for (const encoded of [['number', 'NaN'], ['number', '-0'], ['number', 'Infinity']]) {
            await decodeReturn(['response', encoded, '', [], '', false, 'default', ['value', null]]);
            await decodeReturn(['largeString', 1, encoded]);
            await decodeReturn(['stream', encoded]);
        }
    });

    test('[new] number tags retain the existing node depth and wire byte limits', async t => {
        const exact = jsonPair(t);
        const values = Array(99_998).fill(NaN);
        const received = await exact.worker.call('echo', [values]);
        assert.equal(received.length, values.length); assert.ok(received.every(Number.isNaN));

        const tooMany = jsonPair(t);
        await assert.rejects(tooMany.worker.call('echo', [Array(99_999).fill(NaN)]), { code: 'plugin_rpc_value_limit' });

        let atDepth = -Infinity;
        for (let index = 0; index < 63; index++) atDepth = [atDepth];
        assert.ok(Object.is((await exact.worker.call('echo', [atDepth])).flat(63)[0], -Infinity));
        let tooDeep = -Infinity;
        for (let index = 0; index < 64; index++) tooDeep = [tooDeep];
        await assert.rejects(exact.worker.call('echo', [tooDeep]), { code: 'plugin_rpc_value_limit' });

        const oversized = jsonPair(t, { capBytes: 1024 });
        await assert.rejects(oversized.worker.call('echo', [NaN, 'x'.repeat(2048)]), { code: 'plugin_rpc_frame_limit' });
    });

    test('[new] calls preserve special arguments and return values in both directions', async t => {
        const p = jsonPair(t, { parentDispatch: (_method, args) => args, workerDispatch: (_method, args) => args });
        sameNumbers(await p.worker.call('guest-to-host', special));
        sameNumbers(await p.parent.call('host-to-guest', special, 'active-scope'));
    });

    test('[new] callback arguments and callback results preserve special numbers', async t => {
        const p = jsonPair(t, { parentDispatch: async (_method, [callback]) => callback(...special) });
        const seen = [];
        const result = await p.worker.call('callback', [(...values) => { seen.push(...values); return special; }]);
        sameNumbers(seen); sameNumbers(result);
    });

    test('[new] stream chunks preserve special numbers in order in both directions', async t => {
        const chunks = () => new ReadableStream({ start(controller) {
            for (const value of [NaN, -0, { score: Infinity, delta: -Infinity }, 'normal']) controller.enqueue(value);
            controller.close();
        } });
        const consume = async stream => { const result = [], reader = stream.getReader(); for (;;) {
            const item = await reader.read(); if (item.done) return result; result.push(item.value);
        } };
        const p = jsonPair(t, { parentDispatch: async (_method, [stream]) => consume(stream), workerDispatch: () => chunks() });
        const fromGuest = await p.worker.call('stream-to-host', [chunks()]);
        assert.ok(Object.is(fromGuest[0], NaN)); assert.ok(Object.is(fromGuest[1], -0));
        assert.ok(Object.is(fromGuest[2].score, Infinity)); assert.ok(Object.is(fromGuest[2].delta, -Infinity)); assert.equal(fromGuest[3], 'normal');
        const fromHost = await consume(await p.parent.call('stream-to-guest', [], 'active-scope'));
        assert.ok(Object.is(fromHost[0], NaN)); assert.ok(Object.is(fromHost[1], -0));
        assert.ok(Object.is(fromHost[2].score, Infinity)); assert.ok(Object.is(fromHost[2].delta, -Infinity)); assert.equal(fromHost[3], 'normal');
    });

    test('[new] concurrent calls and streams do not interleave special-number frames', async t => {
        const p = jsonPair(t, { parentDispatch: async (_method, args) => {
            if (args[0] instanceof ReadableStream) {
                const reader = args[0].getReader(), result = [];
                for (;;) { const item = await reader.read(); if (item.done) return result; result.push(item.value); }
            }
            await new Promise(resolve => setImmediate(resolve)); return args[0];
        } });
        const stream = new ReadableStream({ start(controller) { controller.enqueue(NaN); controller.enqueue(-0); controller.close(); } });
        const [nan, infinity, chunks] = await Promise.all([
            p.worker.call('one', [NaN]), p.worker.call('two', [Infinity]), p.worker.call('stream', [stream]),
        ]);
        assert.ok(Object.is(nan, NaN)); assert.ok(Object.is(infinity, Infinity)); sameNumbers(chunks, [NaN, -0]);
    });
});
