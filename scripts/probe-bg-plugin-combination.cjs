'use strict';
// Linux/systemd integration probe. Original scripts and independent expectations
// are supplied privately; no original source or production settings are shipped.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const [targetArg, sourceArg, expectationArg, outputArg] = process.argv.slice(2);
const target = path.resolve(targetArg), directory = path.resolve(sourceArg);
const requireTarget = createRequire(path.join(target, 'package.json'));
const Database = requireTarget('better-sqlite3');
const { createBgPluginHost } = requireTarget('./server/node/bgPluginHost.cjs');
const { createBgNotifications } = requireTarget('./server/node/bgNotifications.cjs');
const inventory = JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json')));
const expected = JSON.parse(fs.readFileSync(path.resolve(expectationArg)));
assert.ok(Array.isArray(inventory) && inventory.length > 0 && inventory.length <= 16);
assert.equal(expected.sources.length, inventory.length);
const originals = inventory.map((row, index) => {
    assert.equal(row.index, index);
    assert.equal(path.basename(row.file), row.file);
    const bytes = fs.readFileSync(path.join(directory, row.file));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, expected.sources[index], 'original evidence identity changed');
    assert.equal(digest, row.sha256);
    const script = bytes.toString('utf8'); assert.ok(Buffer.from(script, 'utf8').equals(bytes), 'original source must roundtrip losslessly');
    return { name: row.name, version: row.apiVersion, enabled: true, script, realArg: {} };
});
const runtime = fs.mkdtempSync('/tmp/bg-plugin-combination-');
let db, notifications;
const kvGet = key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null;
const kvSet = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?)').run(key, value);
const kvDel = key => db.prepare('DELETE FROM kv WHERE key=?').run(key);
const kvList = prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=? ORDER BY key').all(prefix.length, prefix).map(row => row.key);
const rows = () => kvList('internal/bg-notifications/v1/').map(key => JSON.parse(kvGet(key)).event);
const receipts = () => kvList('internal/bg-plugin-failure-receipts/v1/').length;
function store(name) {
    db?.close();
    db = new Database(path.join(runtime, name + '.db'));
    db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT)');
    notifications = createBgNotifications({ db, kvGet, kvSet, kvDel, kvList });
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const active = new Set();
function resources() {
    const result = execFileSync('/usr/bin/systemctl', ['--user', 'show', 'pocketrisu-bg-plugin.slice',
        '-p', 'MemoryCurrent', '-p', 'TasksCurrent', '-p', 'MemoryMax', '-p', 'TasksMax'], {
        encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', XDG_RUNTIME_DIR: '/run/user/' + process.getuid(),
            DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/' + process.getuid() + '/bus' },
    });
    return Object.fromEntries(result.trim().split('\n').map(line => { const [key, value] = line.split('='); return [key, Number(value)]; }));
}
async function settledResources() {
    const started = performance.now(), samples = [];
    do {
        const sample = resources(); samples.push(sample);
        if (sample.TasksCurrent === 0) return { ...sample, settleMs: performance.now() - started, samples };
        await delay(25);
    } while (performance.now() - started < 5000);
    assert.fail('plugin slice tasks did not settle after host close: ' + JSON.stringify(samples));
}
async function open(profile) {
    const plugins = profile.indices.map(index => structuredClone(originals[index]));
    let root = { plugins, characters: [{ chaId: 'synthetic-character', name: 'Synthetic', chatPage: 0,
        chats: [{ id: 'synthetic-chat', message: [], scriptstate: {} }] }],
        pluginCustomStorage: structuredClone(expected.syntheticStorage) };
    const operationId = randomUUID(), network = [], writes = [], observed = [], transportErrors = [];
    const keys = plugins.flatMap(plugin => ['db', 'replacer', 'provider', 'mainDom'].map(permission => JSON.stringify([plugin.name, permission])));
    kvSet('cache/plugin-permissions/state.json', JSON.stringify({ given: keys, denied: [],
        cache: keys.map(key => [key + '_lastGrantTime', Date.now() - (profile.expired ? 4 * 86400000 : 0)]) }));
    const registry = Object.fromEntries(['replacerbeforeRequest', 'replacerafterRequest', 'editinput', 'editoutput', 'editprocess', 'editdisplay'].map(key => [key, new Set()]));
    registry.providers = new Map();
    const controller = new AbortController();
    let loading = true;
    const bindings = { registry, allowedDbKeys: ['characters', 'plugins', 'pluginCustomStorage'], bodyInterceptors: [],
        characterMetadata: value => ({ ...value, chats: [] }),
        nativeFetch: async (url, options) => {
            try {
            assert.equal(url, expected.analysisUrl);
            const body = JSON.parse(options.body);
            assert.ok(expected.analysisModels.includes(body.model));
            assert.equal(new Headers(options.headers).get('authorization'), 'Bearer synthetic-only');
            assert.equal(options.method, 'POST');
            assert.equal(options.signal.aborted, false);
            network.push({ loading, model: body.model });
            return Response.json({ choices: [{ message: { content: 'Synthetic ' + operationId + ' ' + body.model } }] });
            } catch (error) { transportErrors.push(error.message); throw error; }
        },
        risuFetch: async () => { transportErrors.push('unexpected risuFetch'); throw Error('unexpected risuFetch in original combination'); },
        requestChatDataMain: async () => { transportErrors.push('unexpected model call'); throw Error('unexpected host model call in registration fixture'); },
        installProvider(name, callback) { registry.providers.set(name, callback); return () => registry.providers.delete(name); },
    };
    const started = performance.now();
    const host = await createBgPluginHost({ database: root, getDatabase: () => root,
        getSelection: () => ({ characterIndex: 0, chatIndex: 0 }), hydrate: async value => structuredClone(value),
        storageOwner: { peekRoot: () => root, getRoot: async () => root,
            writeRoot: async mutate => { root = mutate(root); writes.push({ loading, group: 'root' }); },
            kvGet, kvSet: (key, value) => { kvSet(key, value); writes.push({ loading, group: 'local' }); }, kvDel, kvList,
            transaction: task => db.transaction(task)() },
        beforeEffect: () => {}, onCriticalFailure: error => controller.abort(error),
        publishNotification: (event, identity) => {
            observed.push({ index: inventory.findIndex(row => row.name === event.pluginName), code: event.code, phase: event.phase });
            return identity ? notifications.publishPluginFailure(event, identity) : notifications.publish(event);
        },
        operation: { operationId, charId: 'synthetic-character', chatId: 'synthetic-chat' }, signal: controller.signal, bindings,
    });
    loading = false;
    active.add(host);
    const registered = Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, key === 'providers' ? [...value.keys()] : value.size]));
    assert.deepEqual(registered, profile.registered);
    return { host, operationId, registry, bindings, network, writes, observed, transportErrors, profile, loadMs: performance.now() - started };
}
async function exercise(state) {
    // Original periodic activity is observed beyond its initialization boundary.
    await delay(expected.observationMs);
    const input = [{ role: 'system', content: 'Synthetic setting' }, { role: 'user', content: 'Synthetic visitor' }];
    let messages = structuredClone(input);
    for (const hook of state.registry.replacerbeforeRequest) messages = await hook(messages, 'model');
    assert.equal(state.network.length, state.profile.analysisCalls);
    assert.equal(state.network.filter(row => row.loading).length, 0);
    assert.equal(state.writes.length, 0);
    assert.deepEqual(state.transportErrors, [], 'original catches must not hide fixture transport failures');
    assert.equal(JSON.stringify(messages).includes(state.operationId), state.profile.analysisCalls > 0);
    if (state.profile.analysisCalls === 0) assert.deepEqual(messages, input);
    assert.deepEqual(state.observed, state.profile.notices);
    return messages;
}
async function close(state) {
    await state.host.close(); active.delete(state.host);
    for (const value of Object.values(state.registry)) assert.equal(value.size, 0);
    assert.equal(state.bindings.bodyInterceptors.length, 0);
}
async function cleanup(state) {
    try { await state.host.close(); }
    catch (error) { console.error('combination cleanup failure', error); process.exitCode = 1; }
    finally { active.delete(state.host); }
}
async function sequential(profile) {
    const state = await open(profile);
    try {
        await exercise(state);
        const loaded = resources();
        await close(state);
        const closed = await settledResources();
        assert.equal(closed.TasksCurrent, 0);
        return { name: profile.name, loadMs: state.loadMs, registered: profile.registered,
            analysisCalls: state.network.length, notices: state.observed, loaded, closed };
    } finally { await cleanup(state); }
}
async function main() {
    const baseline = resources(); assert.equal(baseline.TasksCurrent, 0, 'another worker would contaminate slice samples');
    const results = [];
    for (const [index, profile] of expected.individual.entries()) {
        store('individual-' + index); results.push(await sequential(profile));
        assert.equal(rows().length, profile.notices.length);
    }
    store('repeat-mixed');
    results.push(await sequential(expected.mixed));
    const afterMixed = rows().length;
    const afterReceipts = receipts();
    assert.equal(afterMixed, expected.mixed.notices.length);
    assert.equal(afterReceipts, expected.mixed.notices.length);
    results.push(await sequential(expected.mixed));
    assert.equal(rows().length, afterMixed, 'repeat failure receipts must suppress only the same failures');
    assert.equal(receipts(), afterReceipts);
    store('expired');
    results.push(await sequential(expected.expired));
    assert.equal(rows().length, expected.expired.notices.length);
    store('concurrent');
    const states = [];
    try {
        // Separate registries model independent hosts, not the native serialized
        // server route. Their aggregate OS slice is shared.
        const created = await Promise.allSettled([open(expected.mixed), open(expected.mixed)]);
        for (const result of created) if (result.status === 'fulfilled') states.push(result.value);
        const failed = created.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
        const loaded = resources();
        assert.ok(loaded.TasksCurrent > 0 && loaded.TasksCurrent <= loaded.TasksMax);
        assert.ok(loaded.MemoryCurrent > 0 && loaded.MemoryCurrent <= loaded.MemoryMax);
        const exercised = await Promise.allSettled(states.map(exercise));
        const failure = exercised.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
        for (let index = 0; index < states.length; index++) {
            assert.equal(JSON.stringify(exercised[index].value).includes(states[1 - index].operationId), false);
        }
        await Promise.all(states.map(close));
        const closed = await settledResources(); assert.equal(closed.TasksCurrent, 0);
        assert.equal(rows().length, expected.mixed.notices.length);
        assert.equal(receipts(), expected.mixed.notices.length);
        results.push({ name: 'independent-concurrent-hosts', hosts: states.length, loaded, closed,
            totalAnalysis: states.reduce((sum, state) => sum + state.network.length, 0) });
    } finally { await Promise.all(states.map(cleanup)); }
    const receipt = { runtime, baseline, sources: expected.sources, results, durableNoticeRows: rows().length,
        scope: 'original bytes / OS isolated hosts / synthetic settings / SQLite notices; not native browser send or real providers' };
    fs.writeFileSync(path.resolve(outputArg), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ profiles: results.length, notices: rows().length, tasksAfter: resources().TasksCurrent }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    await Promise.allSettled([...active].map(host => host.close())); db?.close();
});
