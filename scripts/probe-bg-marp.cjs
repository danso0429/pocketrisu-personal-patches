'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const candidate = path.resolve(process.argv[2]);
const { createBgPluginHost } = require(candidate + '/server/node/bgPluginHost.cjs');
const source = fs.readFileSync(path.resolve(process.argv[3]), 'utf8');
// Source identity is printed for evidence, never used as an execution allowlist.

const input = [{ role: 'system', content: 'Synthetic observatory.' }, { role: 'user', content: 'A fictional visitor arrives.' }];
const vaultKey = 'risu_multiagent_lite_config_vault_v1';

async function runFixture({ response = 'success', requestTimeout = 1, analysisTimeout = 2, expired = false, nativeAdapter = null } = {}) {
    const plugin = { name: 'risu_multiagent', version: '3.0', enabled: true, script: source, realArg: {} };
    const config = { provider: 'openai', baseUrl: 'https://synthetic.invalid/v1', apiKey: 'synthetic-only', model: 'fixture-analysis',
        marpConfig: { request_timeout: requestTimeout, analysis_timeout: analysisTimeout } };
    let root = { plugins: [plugin], characters: [], pluginCustomStorage: { [vaultKey]: { config } } };
    const permissionKey = JSON.stringify([plugin.name, 'replacer']);
    const kv = new Map([['cache/plugin-permissions/state.json', JSON.stringify({ given: [permissionKey], denied: [],
        cache: [[permissionKey + '_lastGrantTime', Date.now() - (expired ? 4 * 86400000 : 0)]] })]]);
    const registry = { replacerbeforeRequest: new Set(), replacerafterRequest: new Set(), editinput: new Set(),
        editoutput: new Set(), editprocess: new Set(), editdisplay: new Set(), providers: new Map() };
    const notices = [], calls = [], effects = [], finalCalls = [], diagnostics = [];
    const operation = new AbortController();
    const storageOwner = { getRoot: async () => root, writeRoot: async fn => { root = fn(root); },
        kvGet: key => kv.get(key), kvSet: (key, value) => kv.set(key, value), kvDel: key => kv.delete(key),
        kvList: prefix => [...kv.keys()].filter(key => key.startsWith(prefix)), transaction: fn => fn() };
    async function syntheticFetch(url, options) {
            if (url === '/api/token/refresh' || url === '/api/test_auth') return Response.json({ status: 'success', token: 'synthetic' });
            if (url === '/proxy2') url = decodeURIComponent(options.headers['risu-url']);
            assert.equal(url, 'https://synthetic.invalid/v1/chat/completions');
            const body = JSON.parse(typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body));
            assert.equal(body.model, 'fixture-analysis');
            const row = { ordinal: finalCalls.length + 1, aborted: false };
            finalCalls.push(row);
            options.signal.addEventListener('abort', () => { row.aborted = true; }, { once: true });
            if (response === 'refused') throw Object.assign(new Error('synthetic connection refused'), { code: 'ECONNREFUSED' });
            if (response === 'slow-headers') {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 4000);
                    options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
                });
            }
            const data = response === 'http400' ? { error: { message: 'synthetic rejected' } }
                : { choices: [{ message: { content: response === 'empty' ? '' : 'Synthetic analysis note.' } }] };
            if (response === 'slow-body') {
                return new Response(new ReadableStream({ start(controller) {
                    const timer = setTimeout(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify(data))); controller.close(); }, 4000);
                    options.signal.addEventListener('abort', () => { clearTimeout(timer); controller.error(options.signal.reason); }, { once: true });
                } }), { headers: { 'Content-Type': 'application/json' } });
            }
            return Response.json(data, { status: response === 'http400' ? 400 : 200 });
    }
    globalThis.fetch = syntheticFetch;
    const bindings = { registry, allowedDbKeys: [], bodyInterceptors: [], async nativeFetch(url, options) {
        calls.push({ ordinal: calls.length + 1 });
        return nativeAdapter ? nativeAdapter(url, options) : syntheticFetch(url, options);
    } };
    let host;
    const started = performance.now();
    try {
        host = await createBgPluginHost({ database: root, getDatabase: () => root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
            hydrate: async x => x, storageOwner, beforeEffect: async () => effects.push('effect'),
            publishNotification: async event => { notices.push({ code: event.code, phase: event.phase, api: event.api }); return { status: 'stored' }; },
            publishDiagnostic: value => diagnostics.push(value),
            operation: { operationId: 'synthetic-operation', charId: 'synthetic-character', chatId: 'synthetic-chat' }, signal: operation.signal, bindings });
        const loadMs = performance.now() - started;
        const registrationCount = registry.replacerbeforeRequest.size;
        const hook = [...registry.replacerbeforeRequest][0];
        if (expired) {
            assert.equal(registrationCount, 0);
            assert.equal(notices[0]?.code, 'plugin_permission_missing');
            return { response, expired, loadMs, registrationCount, notices, calls: calls.length };
        }
        assert.equal(registrationCount, 1);
        assert.equal(notices.length, 0);
        const sub = await hook(structuredClone(input), 'submodel');
        assert.deepEqual(sub, input);
        assert.equal(calls.length, 0);
        const at = performance.now();
        const first = await hook(structuredClone(input), 'model');
        const firstMs = performance.now() - at;
        const firstCalls = calls.length;
        const blocks = first.flatMap(x => typeof x.content === 'string' ? x.content.match(/<!--MARP:v1:begin-->/g) ?? [] : []).length;
        assert.equal(firstCalls, 3);
        assert.equal(blocks, response === 'success' ? 1 : 0);
        const second = await hook(first, 'model');
        const secondCalls = calls.length - firstCalls;
        const secondBlocks = second.flatMap(x => typeof x.content === 'string' ? x.content.match(/<!--MARP:v1:begin-->/g) ?? [] : []).length;
        assert.equal(secondCalls, 3, 'A later native attempt must retain enabled analysis');
        assert.equal(secondBlocks, response === 'success' ? 1 : 0);
        return { response, loadMs, registrationCount, subCalls: 0, firstMs, firstCalls, secondCalls,
            blocks, secondBlocks, notices, finalCalls: finalCalls.length,
            disposedSignals: finalCalls.filter(x => x.aborted).length, effects: effects.length, diagnostics };
    } finally { await host?.close(); assert.equal(registry.replacerbeforeRequest.size, 0); }
}

module.exports = { runFixture, source };
if (require.main === module) (async () => {
    let nativeAdapter = null;
    if (process.argv.includes('--native')) {
        process.chdir(fs.mkdtempSync('/tmp/marp-native-probe-'));
        await import(pathToFileURL(candidate + '/node_modules/@huggingface/transformers/dist/transformers.node.mjs').href);
        await import(pathToFileURL(candidate + '/server/node/bgOrchBundle.mjs').href);
        globalThis.__bgOrch.dbmod.getDatabase().usePlainFetch = true;
        nativeAdapter = globalThis.__bgOrch.bgPluginBindings.nativeFetch;
    }
    const selected = process.argv.slice(4).filter(value => value !== '--native');
    const results = [];
    for (const response of selected.length ? selected : ['success', 'http400', 'empty', 'refused', 'slow-headers', 'slow-body']) {
        const result = await runFixture({ response, nativeAdapter }); results.push(result); console.log(JSON.stringify(result));
    }
    const permission = await runFixture({ expired: true }); results.push(permission); console.log(JSON.stringify(permission));
    console.log(JSON.stringify({
        scope: nativeAdapter ? 'real host/current nativeFetch/fake final fetch/manual hook invocation' : 'real host/fake binding/manual hook invocation',
        sourceBytes: Buffer.byteLength(source), sourceSha256: createHash('sha256').update(source).digest('hex'), results }));
})().catch(error => { console.error(error); process.exitCode = 1; });

