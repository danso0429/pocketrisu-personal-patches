'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const targetRequire = createRequire(path.resolve(process.argv[2], 'package.json'));
const Database = targetRequire('better-sqlite3');
const { createTransportCounter, createBgPluginDiagnostics, PREFIX, TTL_MS, MAX_ROWS } = targetRequire('./server/node/bgPluginDiagnostics.cjs');

function fixture(t) {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT)');
    t.after(() => db.close());
    let time = Date.now(), failWrite = false;
    const kvGet = key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null;
    const kvSet = (key, value) => {
        if (failWrite) throw new Error('synthetic storage failure');
        db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value);
    };
    const kvDel = key => db.prepare('DELETE FROM kv WHERE key=?').run(key);
    const kvList = prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=? ORDER BY key').all(prefix.length, prefix).map(row => row.key);
    const store = createBgPluginDiagnostics({ kvGet, kvSet, kvDel, kvList, transaction: task => db.transaction(task)(), now: () => time });
    const row = () => ({ version: 1, id: randomUUID(), createdAt: time, pluginName: 'synthetic', pluginVersion: '1',
        ...createTransportCounter().snapshot() });
    return { store, row, kvGet, kvSet, kvList, set failWrite(value) { failWrite = value; }, set time(value) { time = value; }, get time() { return time; } };
}

test('response identity and body remain untouched; status is a header fact', async () => {
    const counter = createTransportCounter();
    const response = new Response('private body', { status: 201 });
    assert.equal(await counter.observe('nativeFetch', [], () => response), response);
    assert.equal(response.bodyUsed, false);
    const value = counter.snapshot();
    assert.equal(value.calls, 1); assert.equal(value.http2xx, 1); assert.equal(value.pending, 0);
    assert.equal(JSON.stringify(value).includes('private body'), false);
});

test('a synchronous binding throw stays synchronous and preserves error identity', () => {
    const counter = createTransportCounter(), error = new Error('synthetic validation');
    assert.throws(() => counter.observe('nativeFetch', [], () => { throw error; }), value => value === error);
    assert.equal(counter.snapshot().rejected, 1); assert.equal(counter.snapshot().pending, 0);
});

test('an unreadable optional status cannot replace an otherwise valid result', async () => {
    const counter = createTransportCounter(), response = {};
    Object.defineProperty(response, 'status', { get() { throw Error('synthetic getter'); } });
    assert.equal(await counter.observe('risuFetch', [], () => response), response);
    assert.equal(counter.snapshot().resolvedWithoutStatus, 1); assert.equal(counter.snapshot().rejected, 0);
});

test('first fired abort owns classification and rejection identity survives', async () => {
    const scope = new AbortController(), operation = new AbortController(), request = new AbortController();
    const counter = createTransportCounter(), error = new Error('private failure');
    let reject;
    const task = counter.observe('nativeFetch', [['operationCancelled', operation.signal], ['scopeClosed', scope.signal],
        ['requestAborted', request.signal]], () => new Promise((_, no) => { reject = no; }));
    const before = counter.snapshot(); assert.equal(before.pending, 1);
    scope.abort(); operation.abort(); request.abort(new DOMException('timeout', 'TimeoutError')); reject(error);
    await assert.rejects(task, value => value === error);
    const after = counter.snapshot();
    assert.equal(after.scopeClosed, 1); assert.equal(after.operationCancelled, 0);
    assert.equal(before.pending, 1, 'a frozen summary is not changed by later settlement');
    assert.equal(after.pending, 0); assert.equal(after.rejected, 1);
});

test('request signal abort is counted without inferring its hidden reason', async () => {
    const counter = createTransportCounter();
    const request = new AbortController();
    request.abort(new DOMException('timeout', 'TimeoutError'));
    await assert.rejects(counter.observe('risuFetch', [['requestAborted', request.signal]], () => Promise.reject(Error('hidden'))));
    await assert.rejects(counter.observe('nativeFetch', [], () => Promise.reject(Error('hidden timeout-like text'))));
    assert.equal(Object.hasOwn(counter.snapshot(), 'explicitTimeout'), false); assert.equal(counter.snapshot().rejected, 2);
    assert.equal(counter.snapshot().requestAborted, 1);
});

test('separate rows survive upsert without altering failure receipts or accepting payload fields', async t => {
    const h = fixture(t), row = h.row();
    const failureKey = 'internal/bg-notifications/v1/frozen';
    h.kvSet(failureKey, 'unchanged');
    h.store.publish({ ...row, url: 'private URL', authorization: 'private key', body: 'private content' });
    h.store.publish(row);
    assert.equal(h.kvList(PREFIX).length, 1);
    assert.equal(h.kvGet(failureKey), 'unchanged');
    assert.deepEqual(h.store.list(), [row]);
    assert.equal(h.kvGet(PREFIX + row.id).includes('private'), false);
    assert.throws(() => h.store.publish({ ...row, calls: 129 }), /plugin_diagnostic_invalid/);
});

test('diagnostic capacity evicts oldest owned row while read-only expiry does not mutate', async t => {
    const h = fixture(t), first = h.row();
    h.store.publish(first);
    for (let index = 1; index <= MAX_ROWS; index++) { h.time++; h.store.publish(h.row()); }
    assert.equal(h.kvList(PREFIX).length, MAX_ROWS); assert.equal(h.kvGet(PREFIX + first.id), null);
    assert.equal(h.store.list().length, 50);
    h.time += TTL_MS;
    assert.deepEqual(h.store.list(), []);
    assert.equal(h.kvList(PREFIX).length, MAX_ROWS, 'GET/list must not write even at expiry');
    h.store.publish(h.row()); assert.equal(h.kvList(PREFIX).length, 1);
});

test('failed new write rolls back TTL cleanup in the same SQLite transaction', async t => {
    const h = fixture(t), first = h.row(); h.store.publish(first);
    h.time += TTL_MS; h.failWrite = true;
    assert.throws(() => h.store.publish(h.row()), /synthetic storage failure/);
    assert.notEqual(h.kvGet(PREFIX + first.id), null);
});

test('a backward clock step hides future rows without deleting their history on publish', async t => {
    const h = fixture(t), row = h.row(); h.store.publish(row);
    const original = h.time; h.time -= 10000;
    assert.deepEqual(h.store.list(), []);
    h.store.publish(h.row()); assert.notEqual(h.kvGet(PREFIX + row.id), null);
    h.time = original; assert.equal(h.store.list().length, 2);
});
