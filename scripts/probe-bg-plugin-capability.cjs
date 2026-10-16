'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');

const candidateRoot = process.argv[2];
if (!candidateRoot) {
    console.error('usage: node scripts/probe-bg-plugin-capability.cjs <candidate-root>');
    process.exitCode = 2;
    return;
}

const candidatePackage = path.resolve(candidateRoot, 'package.json');
if (!fs.existsSync(candidatePackage)) {
    console.error(`candidate root has no package.json: ${candidateRoot}`);
    process.exitCode = 2;
    return;
}

const targetRequire = createRequire(candidatePackage);
const ts = targetRequire('typescript');
const factoryPath = path.join(candidateRoot, 'src/ts/plugins/apiV3/factory.ts');
const registryPath = path.join(candidateRoot, 'src/ts/plugins/apiV3/v3.svelte.ts');

let transportConfig = null;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    if (request === './serverChatCommit.cjs') return {
        stableJSON: value => JSON.stringify(value, Object.keys(value ?? {}).sort()),
    };
    const value = originalLoad.call(this, request, ...args);
    if (request !== './bgPluginSandbox.cjs') return value;
    return { ...value, async createPluginSandbox(options) {
        const config = transportConfig;
        const sandbox = await value.createPluginSandbox({ ...options, onFrame(frame) {
            config?.observeUp?.(frame);
            const changed = config?.mutateUp ? config.mutateUp(frame, options.onFrame) : frame;
            if (changed !== undefined) options.onFrame(changed);
        } });
        return { ...sandbox, send(frame) {
            config?.observeDown?.(frame);
            const changed = config?.mutateDown ? config.mutateDown(frame, sandbox.send) : frame;
            if (changed !== undefined) sandbox.send(changed);
        } };
    } };
};

const Database = targetRequire('better-sqlite3');
const hostModule = targetRequire('./server/node/bgPluginHost.cjs');
const { createBgPluginHost } = hostModule;
const { createBgNotifications } = targetRequire('./server/node/bgNotifications.cjs');
Module._load = originalLoad;

const plugin = (name, script) => ({ name, script, version: '3.0', enabled: true, realArg: { sample: 'original' } });

function supportedRootMethods() {
    const candidates = Object.entries(hostModule).filter(([name, value]) =>
        /(?:supported.*root|root.*method)/i.test(name) && (Array.isArray(value) || value instanceof Set));
    assert.equal(candidates.length, 1,
        'behavior missing: bgPluginHost must export one supported-root-method collection');
    const values = [...candidates[0][1]];
    assert.ok(values.length > 0, 'supported-root-method collection must not be empty');
    assert.ok(values.every(value => typeof value === 'string' && value.length > 0));
    assert.equal(new Set(values).size, values.length, 'supported root methods must be unique');
    return values;
}

async function fixture(t, plugins, options = {}) {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT)');
    const kvGet = key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null;
    const kvSet = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value);
    const kvDel = key => db.prepare('DELETE FROM kv WHERE key=?').run(key);
    const kvList = prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=? ORDER BY key')
        .all(prefix.length, prefix).map(row => row.key);
    const notifications = createBgNotifications({ db, kvGet, kvSet, kvDel, kvList });
    let root = { plugins, pluginCustomStorage: {}, characters: [] };
    let writes = 0, effects = 0, host;
    const network = [], diagnostics = [];
    const registry = { replacerbeforeRequest: new Set(), replacerafterRequest: new Set(), editinput: new Set(),
        editoutput: new Set(), editprocess: new Set(), editdisplay: new Set(), providers: new Map() };
    const bindings = { registry, allowedDbKeys: ['characters', 'plugins', 'pluginCustomStorage'], bodyInterceptors: [],
        nativeFetch: async (url, init) => { network.push({ url, init }); return new Response('ok'); },
        risuFetch: async () => ({ ok: true }), requestChatDataMain: async () => ({ type: 'success', result: 'ok' }),
        installProvider(name, callback) { registry.providers.set(name, callback); return () => registry.providers.delete(name); } };
    const permissionKeys = plugins.flatMap(value => ['replacer', 'provider', 'db']
        .map(permission => JSON.stringify([value.name, permission])));
    kvSet('cache/plugin-permissions/state.json', JSON.stringify({ given: permissionKeys, denied: [],
        cache: permissionKeys.map(key => [key + '_lastGrantTime', Date.now()]) }));
    const owner = { kvGet, kvSet, kvDel, kvList, transaction: task => db.transaction(task)(), peekRoot: () => root,
        getRoot: async () => root, writeRoot: async mutate => { root = mutate(root); writes++; } };
    const controller = new AbortController();
    transportConfig = options.transport ?? null;
    try {
        host = await createBgPluginHost({ database: root, getDatabase: () => root,
            getSelection: () => ({ characterIndex: 0, chatIndex: 0 }), hydrate: async value => structuredClone(value),
            storageOwner: owner, beforeEffect: () => { effects++; },
            publishNotification: (event, identity) => identity
                ? notifications.publishPluginFailure(event, identity) : notifications.publish(event),
            publishDiagnostic: value => { diagnostics.push(value); },
            onCriticalFailure: error => controller.abort(error),
            operation: { operationId: 'g22a-probe', charId: 'character', chatId: 'chat', inputPreparedOnClient: false },
            signal: controller.signal, bindings });
    } finally { transportConfig = null; }
    let closed = false;
    const close = async () => { if (closed) return; closed = true; await host.close(); };
    t.after(async () => { await close(); db.close(); });
    return { host, close, registry, notifications, diagnostics, network, controller,
        get root() { return root; }, get writes() { return writes; }, get effects() { return effects; },
        notices: () => notifications.claim('g22a-probe-consumer', 2).map(row => row.event) };
}

function compileFactory(source) {
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS } }).outputText;
    const listeners = new Set();
    const hostWindow = { addEventListener(type, fn) { if (type === 'message') listeners.add(fn); },
        removeEventListener(type, fn) { if (type === 'message') listeners.delete(fn); } };
    class FakeIframe {}
    const context = vm.createContext({ module: { exports: {} }, exports: {}, require: targetRequire,
        console: { log() {}, warn() {}, error() {} }, window: hostWindow, document: {}, HTMLIFrameElement: FakeIframe,
        crypto: webcrypto, AbortController, AbortSignal, ReadableStream, WritableStream, TransformStream,
        Response, MessageChannel, MessagePort, ArrayBuffer, Uint8Array, ImageBitmap: class ImageBitmap {},
        OffscreenCanvas: undefined, setTimeout, clearTimeout, queueMicrotask });
    context.exports = context.module.exports;
    vm.runInContext(output, context, { filename: factoryPath });
    return { SandboxHost: context.module.exports.SandboxHost, FakeIframe, hostWindow, listeners };
}

async function waitFor(predicate, message) {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail(message);
}

async function foregroundHarness(apiFactory) {
    assert.ok(fs.existsSync(factoryPath), `missing candidate factory.ts: ${factoryPath}`);
    const compiled = compileFactory(fs.readFileSync(factoryPath, 'utf8'));
    const iframe = new compiled.FakeIframe();
    iframe.style = {};
    iframe.sandbox = { add() {} };
    iframe.setAttribute = () => {};
    iframe.remove = () => {};
    const guestListeners = new Set(), calls = [];
    const guestGlobal = { addEventListener(type, fn) { if (type === 'message') guestListeners.add(fn); },
        removeEventListener(type, fn) { if (type === 'message') guestListeners.delete(fn); } };
    iframe.contentWindow = { postMessage(data, _target, ports = []) {
        queueMicrotask(() => { for (const fn of [...guestListeners]) fn({ data, ports, source: compiled.hostWindow }); });
    } };
    guestGlobal.parent = { postMessage(data, _target, ports = []) {
        calls.push(data);
        queueMicrotask(() => { for (const fn of [...compiled.listeners]) fn({ data, ports,
            source: iframe.contentWindow }); });
    } };
    const host = new compiled.SandboxHost(apiFactory);
    host.run(iframe, '');
    const html = iframe.srcdoc;
    assert.equal(typeof html, 'string', 'SandboxHost.run did not build an iframe document');
    const script = html.match(/<script[^>]*>([\s\S]*)<\/script>/i)?.[1];
    assert.ok(script, 'SandboxHost.run generated no executable guest script');
    Object.assign(guestGlobal, { document: { querySelector: () => null },
        console: { log() {}, warn() {}, error() {} }, AbortController, AbortSignal, ReadableStream, WritableStream,
        TransformStream, Response, MessageChannel, MessagePort, ArrayBuffer, Uint8Array,
        ImageBitmap: class ImageBitmap {}, OffscreenCanvas: undefined, setTimeout, clearTimeout, queueMicrotask });
    const guest = vm.createContext(guestGlobal);
    guest.window = guest;
    vm.runInContext(script, guest, { filename: 'generated-plugin-bridge.js' });
    await waitFor(() => guest.risuai?.apiVersion !== undefined,
        'behavior missing: generated guest bridge did not finish initialization');
    return { ...compiled, host, iframe, html, guest, guestWindow: guest, calls };
}

function registryKeys() {
    assert.ok(fs.existsSync(registryPath), `missing candidate registry: ${registryPath}`);
    const source = fs.readFileSync(registryPath, 'utf8');
    const file = ts.createSourceFile(registryPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let object;
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'makeRisuaiAPIV3'
            && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            const body = node.initializer.body;
            if (ts.isBlock(body)) object = body.statements.find(ts.isReturnStatement)?.expression;
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    assert.ok(object && ts.isObjectLiteralExpression(object), 'could not statically extract makeRisuaiAPIV3 registry');
    const keys = object.properties.map(property => property.name && (ts.isIdentifier(property.name)
        || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) ? property.name.text : null).filter(Boolean);
    assert.ok(keys.length > 0, 'makeRisuaiAPIV3 registry extraction was empty');
    return [...new Set(keys)];
}

test('foreground bridge executes capability get/has, bootstrap surfaces, round trips, and raw rejection', async () => {
    const dangerous = 'dangerous</script><script>globalThis.injected=true</script>';
    const apiFactory = {
        _getPropertiesForInitialization: async () => ({ apiVersion: '3.0', apiVersionCompatibleWith: ['3.0'],
            list: ['apiVersion', 'apiVersionCompatibleWith', 'list'] }),
        _getAliases: async () => ({ pluginStorage: { getItem: 'aliasGet' },
            safeLocalStorage: { getItem: 'aliasGet' } }),
        _getOldKeys: async () => [], aliasGet: async key => `stored:${key}`, echo: async value => value,
        callbackRoundTrip: async callback => callback('host'),
        abortRoundTrip: async ({ signal }) => new Promise(resolve => {
            if (signal.aborted) resolve('aborted'); else signal.addEventListener('abort', () => resolve('aborted'), { once: true });
        }),
        streamRoundTrip: async () => new ReadableStream({ start(controller) {
            controller.enqueue('one'); controller.enqueue('two'); controller.close();
        } }),
        someString: 'not callable', someNull: null, [dangerous]: async () => 'safe',
    };
    const h = await foregroundHarness(apiFactory);
    const api = h.guestWindow.risuai;
    for (const name of Object.keys(apiFactory).filter(name => typeof apiFactory[name] === 'function')) {
        assert.equal(typeof api[name], 'function', `registered function ${name} is not exposed`);
        assert.equal(name in api, true, `registered function ${name} fails the in operator`);
    }
    for (const name of ['missingApi', 'someString', 'someNull', 'toString', 'constructor']) {
        assert.equal(api[name], undefined, `${name} must read as absent`);
        assert.equal(name in api, false, `${name} must fail the in operator`);
    }
    assert.equal(api.then, undefined);
    assert.equal('then' in api, false);
    assert.equal(api[Symbol.iterator], undefined);
    assert.equal(Symbol.iterator in api, false);
    assert.equal(await Promise.resolve(api), api);
    assert.equal(api.apiVersion, '3.0');
    assert.deepEqual([...api.apiVersionCompatibleWith], ['3.0']);
    assert.deepEqual([...api.list], ['apiVersion', 'apiVersionCompatibleWith', 'list']);
    assert.equal('apiVersion' in api, true);
    assert.equal(await api.pluginStorage.getItem('k'), 'stored:k');
    assert.equal(await api.safeLocalStorage.getItem('safe'), 'stored:safe');
    assert.equal('pluginStorage' in api, true);
    assert.equal(typeof api.unwarpSafeArray, 'function');
    assert.deepEqual([...await api.unwarpSafeArray({ length: async () => 2, at: async index => ['a', 'b'][index] })], ['a', 'b']);
    assert.equal(await api.echo('round-trip'), 'round-trip');
    assert.equal(await api.callbackRoundTrip(value => `${value}:guest`), 'host:guest');
    const controller = new AbortController();
    const aborting = api.abortRoundTrip({ signal: controller.signal });
    controller.abort();
    assert.equal(await aborting, 'aborted');
    const reader = (await api.streamRoundTrip()).getReader(), chunks = [];
    for (;;) { const item = await reader.read(); if (item.done) break; chunks.push(item.value); }
    assert.deepEqual(chunks, ['one', 'two']);
    const beforeAbsent = h.calls.filter(frame => frame.type === 'CALL_ROOT').length;
    assert.throws(() => api.missingApi(), TypeError);
    assert.equal(h.calls.filter(frame => frame.type === 'CALL_ROOT').length, beforeAbsent,
        'absent foreground calls must not emit CALL_ROOT');
    assert.equal(h.html.includes(dangerous), false, 'supported-name injection must not embed a script-closing key literally');

    const raw = new Promise(resolve => {
        const listener = event => { if (event.data?.reqId === 'raw-unknown') { h.guestWindow.removeEventListener('message', listener); resolve(event.data); } };
        h.guestWindow.addEventListener('message', listener);
    });
    for (const listener of [...h.listeners]) listener({ source: h.iframe.contentWindow,
        data: { type: 'CALL_ROOT', reqId: 'raw-unknown', method: 'missingApi', args: [] }, ports: [] });
    assert.match((await raw).error, /not found|unknown|unsupported/i);
    h.host.terminate();
});

test('foreground bridge exposes every statically extracted makeRisuaiAPIV3 key', async () => {
    const keys = registryKeys();
    const apiFactory = Object.fromEntries(keys.map(key => [key, async () => undefined]));
    apiFactory._getPropertiesForInitialization = async () => ({ apiVersion: '3.0', list: ['apiVersion'] });
    apiFactory._getAliases = async () => ({});
    apiFactory._getOldKeys = async () => [];
    const h = await foregroundHarness(apiFactory);
    for (const key of keys) {
        assert.equal(typeof h.guestWindow.risuai[key], 'function', `registry key ${key} is not exposed`);
        assert.equal(key in h.guestWindow.risuai, true, `registry key ${key} fails the in operator`);
    }
    h.host.terminate();
});

test('S1 worker exposure and parent dispatcher have behavioral parity, including forged default rejection', async t => {
    const supported = supportedRootMethods();
    let selected = 'getRuntimeInfo';
    const h = await fixture(t, [plugin('parity', `
        await Risuai.addRisuReplacer('beforeRequest', async value => { try { await Risuai.getRuntimeInfo(); } catch {} return value; });
        await Risuai.addRisuReplacer('afterRequest', async () => JSON.stringify({
            supported: Object.fromEntries(${JSON.stringify(supported)}.map(name => [name, [typeof Risuai[name], name in Risuai]])),
            absent: Object.fromEntries(['missingApi','toString','constructor']
                .map(name => [name, [typeof Risuai[name], name in Risuai]])),
        }));
    `)], { transport: { mutateUp(frame) {
        if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
            return { ...frame, args: ['array', [['value', selected], frame.args[1][1]]] };
        }
        return frame;
    } } });
    const exposure = JSON.parse(await [...h.registry.replacerafterRequest][0](''));
    for (const name of supported) assert.deepEqual(exposure.supported[name], ['function', true], `${name} is not exposed by worker`);
    for (const name of ['missingApi', 'toString', 'constructor']) {
        assert.deepEqual(exposure.absent[name], ['undefined', false]);
    }
    let rewritten = 0;
    for (const name of supported) {
        const g = await fixture(t, [plugin('parity-' + name, `await Risuai.addRisuReplacer('beforeRequest', async value => { try { await Risuai.getRuntimeInfo(); } catch {} return value; });`)],
            { transport: { mutateUp(frame) {
                if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'getRuntimeInfo') {
                    rewritten++; return { ...frame, args: ['array', [['value', name], frame.args[1][1]]] };
                }
                return frame;
            } } });
        try { await [...g.registry.replacerbeforeRequest][0]([]); } catch {}
        assert.equal(g.notices().some(row => row.code === 'plugin_api_unsupported'), false,
            `${name} was rejected by the parent default branch`);
        await g.close();
    }
    assert.equal(rewritten, supported.length);
    const callback = [...h.registry.replacerbeforeRequest][0];
    selected = 'forgedOutsideSupportedList';
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await callback(input), input);
    const notices = h.notices();
    assert.equal(notices.some(row => row.code === 'plugin_api_unsupported' && row.api === 'forged_outside_supported_list'), true);
    assert.equal(h.root.plugins.length, 1);
});

test('S2/S3/S4 parent pulls phase-attributed, deduped, bounded absent records', async t => {
    const upFrames = [], downFrames = [];
    const h = await fixture(t, [plugin('absent-summary', `
        for(let i=0;i<20;i++) void Risuai.missingLoadApi;
        await Risuai.addRisuReplacer('beforeRequest', async value => {
            for(let i=0;i<20;i++) void Risuai.missingHookApi;
            for(let i=0;i<40;i++) void Risuai['boundedAbsent'+i];
            return value;
        });
    `)], { transport: { observeUp: frame => upFrames.push(frame), observeDown: frame => downFrames.push(frame) } });
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input);
    await h.close();
    assert.equal(h.diagnostics.length, 1, 'absent-only plugin must publish a diagnostic summary');
    const summary = h.diagnostics[0];
    assert.equal(summary.absentApis.filter(row => row.api === 'missingLoadApi' && row.phase === 'load').length, 1);
    assert.equal(summary.absentApis.filter(row => row.api === 'missingHookApi' && row.phase === 'before_request').length, 1);
    assert.ok(summary.absentApis.length <= 32, 'absent API summary exceeded the 32-name bound');
    assert.equal(upFrames.some(frame => frame.kind === 'call' && /absent|missing/i.test(frame.method)), false,
        'absent reads emitted a worker-to-parent request');
    assert.ok(downFrames.some(frame => frame.kind === 'call' && /absent|missing/i.test(frame.method)),
        'parent never pulled absent records from worker');
    assert.match(JSON.stringify(upFrames), /overflow/i, 'bounded worker record did not report overflow on the wire');
});

test('D4 an absent-only plugin publishes a summary with zero transport calls', async t => {
    const h = await fixture(t, [plugin('absent-only', `void Risuai.onlyMissingApi;`)]);
    await h.close();
    assert.equal(h.diagnostics.length, 1);
    assert.equal(h.diagnostics[0].calls, 0);
    assert.deepEqual(h.diagnostics[0].absentApis, [{ api: 'onlyMissingApi', phase: 'load' }]);
});

test('S5 worker then/symbol/own reads stay local while inherited names are absent and recorded', async t => {
    const h = await fixture(t, [plugin('special-reads', `
        await Risuai.addRisuReplacer('beforeRequest', async value => {
            const resolved = await Promise.resolve(Risuai);
            const result = {
                same: resolved === Risuai,
                then: [Risuai.then, 'then' in Risuai],
                symbol: [Risuai[Symbol.iterator], Symbol.iterator in Risuai],
                own: [typeof Risuai.getLocalPluginStorage, 'getLocalPluginStorage' in Risuai],
                inherited: [Risuai.toString, 'toString' in Risuai, Risuai.constructor, 'constructor' in Risuai],
            };
            return [{role:'system',content:JSON.stringify(result)}];
        });
    `)]);
    const result = JSON.parse((await [...h.registry.replacerbeforeRequest][0]([]))[0].content);
    assert.deepEqual(result, { same: true, then: [null, false], symbol: [null, false],
        own: ['function', true], inherited: [null, false, null, false] });
    await h.close();
    const names = h.diagnostics[0].absentApis.map(row => row.api).sort();
    assert.deepEqual(names, ['constructor', 'toString']);
});

test('S7 caught and uncaught absent calls use normal hook outcomes and never plugin_api_unsupported', async t => {
    const caught = await fixture(t, [plugin('caught-absent', `await Risuai.addRisuReplacer('beforeRequest',async()=>{
        try{await Risuai.caughtMissingApi();}catch(e){if(!(e instanceof TypeError))throw e;}return [];});`)]);
    assert.deepEqual(await [...caught.registry.replacerbeforeRequest][0]([{ role: 'user', content: 'kept' }]), []);
    await caught.close();
    assert.equal(caught.root.plugins[0].enabled, true);
    assert.equal(caught.notices().some(row => row.code === 'plugin_api_unsupported'), false);
    assert.ok(caught.diagnostics[0].absentApis.some(row => row.api === 'caughtMissingApi' && row.phase === 'before_request'));

    const uncaught = await fixture(t, [plugin('uncaught-absent', `await Risuai.addRisuReplacer('beforeRequest',async()=>{
        await Risuai.uncaughtMissingApi();return [];});`)]);
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...uncaught.registry.replacerbeforeRequest][0](input), input);
    const notices = uncaught.notices();
    assert.equal(notices.some(row => row.code === 'plugin_hook_failed'), true);
    assert.equal(notices.some(row => row.code === 'plugin_api_unsupported'), false);
    assert.equal(uncaught.root.plugins.length, 1);
});

test('S8 absent reads consume no API, network, write, or pending-call budget', async t => {
    const up = [];
    const h = await fixture(t, [plugin('budgets', `
        await Risuai.addRisuReplacer('beforeRequest', async value => {
            for(let i=0;i<500;i++) {
                const name='budgetAbsent'+i;
                if(typeof Risuai[name] !== 'undefined' || name in Risuai) throw new Error('absent capability exposed');
            }
            await Risuai.getRuntimeInfo();
            await Risuai.nativeFetch('https://synthetic.invalid/ok',{});
            await Risuai.pluginStorage.setItem('written','yes');
            return value;
        });
    `)], { transport: { observeUp: frame => up.push(frame) } });
    const input = [{ role: 'user', content: 'kept' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input);
    assert.equal(h.network.length, 1);
    assert.equal(h.root.pluginCustomStorage.written, 'yes');
    assert.equal(h.writes, 1);
    assert.equal(h.root.plugins[0].enabled, true);
    assert.equal(up.filter(frame => frame.kind === 'call' && /absent|missing/i.test(frame.method)).length, 0);
});

test('S9 pull failure is swallowed and leaves the successful hook outcome unchanged', async t => {
    let faults = 0;
    const h = await fixture(t, [plugin('pull-failure', `await Risuai.addRisuReplacer('beforeRequest',async value=>{
        void Risuai.missingDuringPullFailure;await Risuai.getRuntimeInfo();return value.slice(0,1);});`)],
    { transport: { mutateDown(frame) {
        if (frame.kind === 'call' && /absent|missing/i.test(frame.method)) { faults++; return { ...frame, method: 'syntheticPullFailure' }; }
        return frame;
    } } });
    const input = [{ role: 'user', content: 'kept' }, { role: 'user', content: 'dropped' }];
    assert.deepEqual(await [...h.registry.replacerbeforeRequest][0](input), input.slice(0, 1));
    assert.ok(faults > 0, 'fault injection did not reach the parent pull');
    assert.equal(h.root.plugins[0].enabled, true);
    assert.equal(h.notices().some(row => row.code === 'plugin_api_unsupported'), false);
});

test('S11 a delayed pull response racing close is harmless and close remains bounded', async t => {
    const delayed = new Set();
    const h = await fixture(t, [plugin('close-race', `void Risuai.lateAbsentApi;`)], { transport: {
        mutateDown(frame) {
            if (frame.kind === 'call' && /absent|missing/i.test(frame.method)) delayed.add(frame.id);
            return frame;
        },
        mutateUp(frame, deliver) {
            if (frame.kind === 'return' && delayed.has(frame.id)) {
                setTimeout(() => deliver(frame), 25);
                return undefined;
            }
            return frame;
        },
    } });
    const started = Date.now();
    await h.close();
    assert.ok(delayed.size > 0, 'close-race injection did not observe an absent-record pull');
    assert.ok(Date.now() - started < 1500, 'absent pull race delayed close beyond the existing limit');
    assert.equal(h.controller.signal.aborted, false);
});

test('S10 malformed worker capability bootstrap is rejected before plugin code executes', async t => {
    const malformed = [
        { label: 'missing', encoded: undefined },
        { label: 'null', encoded: ['value', null] },
        { label: 'number', encoded: ['value', 123] },
        { label: 'object', encoded: ['object', []] },
        { label: 'mixed-array', encoded: ['array', [['value', 'valid'], ['value', 42], ['value', null], ['value', '']]] },
    ];
    for (const item of malformed) {
        let executed = false;
        const h = await fixture(t, [plugin(`malformed-${item.label}`, `
            await Risuai.addRisuReplacer('beforeRequest', value => value);
        `)], { transport: {
            mutateDown(frame) {
                if (frame.kind !== 'call' || frame.method !== 'load') return frame;
                const values = [...frame.args[1]];
                if (item.encoded === undefined) values.splice(1); else values[1] = item.encoded;
                return { ...frame, args: ['array', values] };
            },
            observeUp(frame) {
                if (frame.kind === 'call' && frame.method === 'api') executed = true;
            },
        } });
        assert.equal(executed, false, `${item.label} bootstrap executed plugin code`);
        assert.equal(h.registry.replacerbeforeRequest.size, 0, `${item.label} bootstrap registered a hook`);
        assert.equal(h.root.plugins.length, 1);
        assert.ok(h.notices().some(row => row.phase === 'load'), `${item.label} bootstrap had no load failure`);
    }
});
