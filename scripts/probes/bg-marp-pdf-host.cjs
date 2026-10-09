'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { createPdfTransport, installPdfHttpTransport } = require('./bg-marp-pdf-transport.cjs');
const [target, original, casePath, output] = process.argv.slice(2);
async function main() {
    const fixture = JSON.parse(fs.readFileSync(casePath));
    process.chdir(fs.mkdtempSync('/tmp/marp-pdf-host-'));
    const requireTarget = createRequire(path.join(target, 'package.json'));
    const events = [], notices = [], diagnostics = [];
    const transport = createPdfTransport({ family: fixture.family, publicKey: fixture.publicKey, emit: row => events.push(row) });
    globalThis.fetch = transport; installPdfHttpTransport(transport, row => events.push(row));
    await import(pathToFileURL(requireTarget.resolve('@huggingface/transformers')).href);
    await import(pathToFileURL(path.join(target, 'server/node/bgOrchBundle.mjs')).href);
    const bg = globalThis.__bgOrch;
    globalThis.fetch = transport;
    const plugin = { name: 'risu_multiagent', version: '3.0', enabled: true, script: fs.readFileSync(original, 'utf8'), realArg: fixture.arguments };
    const root = { plugins: [plugin], characters: [], pluginCustomStorage: { risu_multiagent_lite_config_vault_v1: fixture.vault } };
    const permission = JSON.stringify([plugin.name, 'replacer']);
    const kv = new Map([['cache/plugin-permissions/state.json', JSON.stringify({ given: [permission], denied: [],
        cache: [[permission + '_lastGrantTime', Date.now()]] })]]);
    const { createBgPluginHost } = requireTarget('./server/node/bgPluginHost.cjs');
    const host = await createBgPluginHost({ database: root, getDatabase: () => root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
        hydrate: async v => v, bindings: bg.bgPluginBindings, signal: new AbortController().signal,
        storageOwner: { getRoot: async () => root, writeRoot: async () => { throw Error('unexpected write'); },
            kvGet: key => kv.get(key), kvSet: (key, value) => kv.set(key, value), kvDel: key => kv.delete(key),
            kvList: prefix => [...kv.keys()].filter(k => k.startsWith(prefix)), transaction: f => f() },
        beforeEffect: () => {}, publishNotification: row => { notices.push(row); return { status: 'stored' }; },
        publishDiagnostic: row => diagnostics.push(row), operation: { operationId: 'synthetic-pdf', charId: 'synthetic-character', chatId: 'synthetic-chat' } });
    try {
        assert.equal(bg.bgPluginBindings.registry.replacerbeforeRequest.size, 1);
        const hook = [...bg.bgPluginBindings.registry.replacerbeforeRequest][0];
        const result = await hook(structuredClone(fixture.input), 'model');
        assert.equal(events.filter(e => e.event === 'validation-error').length, 0);
        fs.writeFileSync(output, JSON.stringify({ events, result, notices, diagnostics }, null, 2));
    } finally { await host.close(); assert.equal(bg.bgPluginBindings.registry.replacerbeforeRequest.size, 0); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
