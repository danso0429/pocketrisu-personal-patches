'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createRequire } = Module;
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { createPdfTransport, installPdfHttpTransport } = require('./probes/bg-marp-pdf-transport.cjs');
const [target, original, output] = process.argv.slice(2);
const source = fs.readFileSync(original, 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'), 'b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132');
const MiB = 1024 * 1024, marker = 'M3_INPUT ';
const small = marker + 'A synthetic observatory. '.repeat(100);
const input = text => [{ role: 'system', content: 'Synthetic setting.' }, { role: 'user', content: text }];
function glyphInput(wanted) {
    const fixed = new Set(('[2 user]\n' + marker + '\n\n').replaceAll('\n', '')).size;
    const chars = [];
    for (let cp = 0x1000; chars.length < wanted - fixed; cp++) if (cp < 0xD800 || cp > 0xDFFF) chars.push(String.fromCodePoint(cp));
    const text = marker + chars.join('');
    assert.equal(new Set(('[2 user]\n' + text + '\n\n').replaceAll('\n', '')).size, wanted);
    return text;
}
async function main() {
    process.chdir(fs.mkdtempSync('/tmp/marp-pdf-limits-'));
    const requireTarget = createRequire(path.join(target, 'package.json'));
    const scratch = [], transport = createPdfTransport({ family: 'openai', emit: row => scratch.push(row) });
    globalThis.fetch = transport; installPdfHttpTransport(transport, row => scratch.push(row));
    await import(pathToFileURL(requireTarget.resolve('@huggingface/transformers')).href);
    await import(pathToFileURL(path.join(target, 'server/node/bgOrchBundle.mjs')).href);
    globalThis.fetch = transport;
    const bg = globalThis.__bgOrch;
    const nativeLoad = Module._load, sessions = [];
    Module._load = function(request, ...args) {
        const value = nativeLoad.call(this, request, ...args);
        if (request === './bgPluginSession.cjs') return { ...value, createPluginSession: async options => {
            const session = await value.createPluginSession(options); sessions.push(session); return session;
        } };
        return value;
    };
    const { createBgPluginHost } = requireTarget('./server/node/bgPluginHost.cjs');
    const cases = [
        { name: 'source-under', text: marker + 'x'.repeat(MiB - 12 - marker.length), expected: 'api-refused' },
        { name: 'source-exact', text: marker + 'x'.repeat(MiB - 11 - marker.length), expected: 'api-refused' },
        { name: 'source-over', text: marker + 'x'.repeat(MiB - 10 - marker.length), expected: 'text' },
        { name: 'utf8-over', text: marker + '한'.repeat(Math.ceil(MiB / 3)), expected: 'text' },
        { name: 'glyph-exact', text: glyphInput(65534), expected: 'pdf' },
        { name: 'glyph-over', text: glyphInput(65535), expected: 'text' },
        { name: 'line-pdf-over', text: marker + '\n'.repeat(500000), expected: 'text' },
        { name: 'line-api-refused', text: marker + '\n'.repeat(350000), expected: 'api-refused' },
        { name: 'line-frame-over', text: marker + '\n'.repeat(400000), expected: 'api-refused' },
        { name: 'fresh-after-frame', text: small, expected: 'pdf' },
        { name: 'conversion-timeout', text: marker + 'x'.repeat(MiB - 64 - marker.length), expected: 'timeout', timeout: 0.02 },
        { name: 'operation-cancel', text: marker + 'x'.repeat(MiB - 64 - marker.length), expected: 'cancel' },
        { name: 'fresh-after-cancel', text: small, expected: 'pdf' },
    ];
    const results = [];
    for (const test of cases) {
        const plugin = { name: 'risu_multiagent', version: '3.0', enabled: true, script: source, realArg: {} };
        const config = { provider: 'openai', baseUrl: 'https://analysis.example.test/v1', apiKey: 'synthetic-only', model: 'fixture-worldbuilding',
            pdfMode: 'standard', marpConfig: { request_timeout: test.timeout ?? 60, analysis_timeout: 120 },
            agents: { worldbuilding: { enabled: true, userPromptTemplate: '{{user_input}}', systemPrompt: 'Synthetic world agent.' },
                plot: { enabled: false }, character: { enabled: false } } };
        const root = { plugins: [plugin], characters: [], pluginCustomStorage: { risu_multiagent_lite_config_vault_v1: { config } } };
        const permission = JSON.stringify([plugin.name, 'replacer']);
        const kv = new Map([['cache/plugin-permissions/state.json', JSON.stringify({ given: [permission], denied: [],
            cache: [[permission + '_lastGrantTime', Date.now()]] })]]);
        const notices = [], abort = new AbortController(); let reads = 0, cancelTimer;
        const before = scratch.length, sessionStart = sessions.length;
        const host = await createBgPluginHost({ database: root, getDatabase: () => root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
            hydrate: async v => v, bindings: bg.bgPluginBindings, signal: abort.signal,
            storageOwner: { getRoot: async () => {
                if (++reads === 18 && test.expected === 'cancel') cancelTimer = setTimeout(() => abort.abort(Error('synthetic operation cancel')), 50);
                return root;
            }, writeRoot: async () => { throw Error('unexpected write'); }, kvGet: k => kv.get(k), kvSet: (k, v) => kv.set(k, v),
                kvDel: k => kv.delete(k), kvList: p => [...kv.keys()].filter(k => k.startsWith(p)), transaction: f => f() },
            beforeEffect: () => {}, publishNotification: row => { notices.push(row); return { status: 'stored' }; },
            operation: { operationId: 'synthetic-' + test.name, charId: 'synthetic-character', chatId: 'synthetic-chat' } });
        let result, error;
        const started = performance.now();
        try {
            const hook = [...bg.bgPluginBindings.registry.replacerbeforeRequest][0]; assert.equal(typeof hook, 'function');
            try { result = await hook(input(test.text), 'model'); } catch (e) { error = e.code ?? e.message; }
            const first = scratch.slice(before).filter(e => e.event === 'analysis');
            const injection = JSON.stringify(result ?? []).includes('<!--MARP:v1:begin-->');
            assert.equal(scratch.slice(before).filter(e => e.event === 'validation-error').length, 0);
            const encoded = first[0]?.body.messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
                .map(p => p.file?.file_data).find(Boolean);
            if (test.expected === 'api-refused') {
                assert.equal(first.length, 0); assert.equal(injection, false);
                assert.ok(notices.some(n => n.code === 'plugin_host_limit' && n.eventKey.endsWith(':limit')));
            } else if (test.expected === 'timeout' || test.expected === 'cancel') {
                assert.equal(first.length, 0); assert.equal(injection, false);
                if (test.expected === 'cancel') { assert.equal(abort.signal.aborted, true); assert.equal(reads, 18); }
            } else {
                assert.equal(first.length, 1); assert.equal(injection, true);
                assert.equal(Boolean(encoded), test.expected === 'pdf');
                if (test.name === 'glyph-exact') {
                    const raw = Buffer.from(encoded.split(',')[1], 'base64').toString();
                    const blocks = [...raw.matchAll(/beginbfchar\n([\s\S]*?)endbfchar/g)];
                    assert.equal(blocks.reduce((n, block) => n + [...block[1].matchAll(/<[0-9A-F]{4}> <[0-9A-F]+>/g)].length, 0), 65534);
                }
                if (!encoded) assert.equal(first[0].body.messages.find(m => m.role === 'user').content, test.text);
            }
            const elapsedMs = performance.now() - started;
            let nextNormal = false;
            if (test.expected !== 'cancel') {
                config.marpConfig.request_timeout = 60;
                const nextBefore = scratch.length, next = await hook(input(small), 'model');
                assert.equal(scratch.slice(nextBefore).filter(e => e.event === 'analysis').length, 1);
                assert.equal(JSON.stringify(next).match(/<!--MARP:v1:begin-->/g)?.length, 1); nextNormal = true;
            }
            results.push({ name: test.name, expected: test.expected, elapsedMs, textCodeUnits: test.text.length,
                textUtf8Bytes: Buffer.byteLength(test.text), analysis: first.length, pdf: Boolean(encoded), injection, error,
                nextNormalSameHost: nextNormal, notices: notices.map(n => ({ code: n.code, phase: n.phase, reason: n.reason })) });
            console.log(JSON.stringify(results.at(-1)));
        } finally {
            clearTimeout(cancelTimer); await host.close();
            assert.equal(bg.bgPluginBindings.registry.replacerbeforeRequest.size, 0);
            assert.ok(sessions.slice(sessionStart).every(s => s.activeScopes === 0));
        }
    }
    assert.equal(scratch.filter(row => row.event === 'node-request').length, 0,
        'M3 validates direct parent broker and OS cancellation, not the happy-path Node HTTP double');
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'limits.json'), JSON.stringify({ results,
        scope: 'actual isolated original hook, parent broker limits/timeout/cancel/cleanup; not native browser size parity or Send/store' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
