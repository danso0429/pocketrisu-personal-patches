'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    applyTransition,
    loadState,
    planTransition,
    restoreJournal,
    resolveInside,
    status,
    withRootLock,
} = require('../src/manager.cjs')

function withRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-patches-'))
    try {
        return fn(root)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

function write(root, relative, content) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
}

function read(root, relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8')
}

function mode(root, relative) {
    return fs.statSync(path.join(root, relative)).mode & 0o7777
}

const packA = {
    id: 'a',
    version: '1',
    units: [
        {
            id: 'a:unrelated',
            file: 'src/unrelated.ts',
            type: 'insert',
            where: 'after',
            anchor: 'U\n',
            content: 'A1',
        },
        {
            id: 'a:shared',
            file: 'src/shared.ts',
            type: 'replace',
            anchor: 'BASE',
            content: 'const nested = INNER',
        },
    ],
}

const packB = {
    id: 'b',
    version: '1',
    units: [
        {
            id: 'b:shared',
            file: 'src/shared.ts',
            type: 'replace',
            anchor: 'INNER',
            content: '42',
        },
    ],
}

test('adding a colliding pack recomposes only the connected file', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')

    const first = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['a'],
        profile: 'features',
    })
    applyTransition({ root, transition: first })
    const unrelatedAfterA = read(root, 'src/unrelated.ts')
    const unrelatedMtime = fs.statSync(path.join(root, 'src/unrelated.ts')).mtimeMs

    const second = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['a', 'b'],
        profile: 'features',
    })
    assert.deepEqual(
        second.changes.map((change) => change.path).sort(),
        ['save/pocketrisu-patches/state.json', 'src/shared.ts'],
    )
    assert.deepEqual(second.order, ['a:shared', 'a:unrelated', 'b:shared'])
    applyTransition({ root, transition: second })

    assert.equal(read(root, 'src/unrelated.ts'), unrelatedAfterA)
    assert.equal(fs.statSync(path.join(root, 'src/unrelated.ts')).mtimeMs, unrelatedMtime)
    assert.match(read(root, 'src/shared.ts'), /42/)
    assert.equal(status({ root }).status, 'current')
}))

test('removing B restores A without removing unrelated A units', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const both = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['a', 'b'],
        profile: 'features',
    })
    applyTransition({ root, transition: both })

    const onlyA = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['a'],
        profile: 'features',
    })
    assert.deepEqual(
        onlyA.changes.map((change) => change.path).sort(),
        ['save/pocketrisu-patches/state.json', 'src/shared.ts'],
    )
    applyTransition({ root, transition: onlyA })
    assert.match(read(root, 'src/shared.ts'), /INNER/)
    assert.match(read(root, 'src/unrelated.ts'), /A1/)
    assert.deepEqual(loadState(root).packs.map((pack) => pack.id), ['a'])
}))

test('failed writes roll back every touched file and state', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const transition = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })
    assert.throws(
        () => applyTransition({ root, transition, injectFailureAfter: 1 }),
        /Injected transaction failure/,
    )
    assert.equal(read(root, 'src/unrelated.ts'), 'U\n')
    assert.equal(read(root, 'src/shared.ts'), 'const value = BASE\n')
    assert.equal(loadState(root), null)
    assert.equal(fs.existsSync(path.join(root, DEFAULT_JOURNAL_PATH)), false)
}))

test('a stale plan refuses every write after an external edit', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const transition = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })

    write(root, 'src/shared.ts', 'EXTERNAL\nconst value = BASE\n')
    assert.throws(
        () => applyTransition({ root, transition }),
        (error) => error.code === 'STALE_TRANSITION'
            && error.details.stale.some((entry) => entry.path === 'src/shared.ts'),
    )
    assert.equal(read(root, 'src/shared.ts'), 'EXTERNAL\nconst value = BASE\n')
    assert.equal(read(root, 'src/unrelated.ts'), 'U\n')
    assert.equal(fs.existsSync(path.join(root, DEFAULT_JOURNAL_PATH)), false)
}))

test('two plans from one baseline cannot overwrite the first applied transition', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const competingPack = {
        id: 'competing',
        version: '1',
        units: [{
            id: 'competing:shared',
            file: 'src/shared.ts',
            type: 'replace',
            anchor: 'BASE',
            content: '99',
        }],
    }
    const first = planTransition({
        root,
        catalog: [packA, competingPack],
        packIds: ['a'],
        profile: 'features',
    })
    const stale = planTransition({
        root,
        catalog: [packA, competingPack],
        packIds: ['competing'],
        profile: 'features',
    })

    applyTransition({ root, transition: first })
    assert.throws(
        () => applyTransition({ root, transition: stale }),
        (error) => error.code === 'STALE_TRANSITION',
    )
    assert.match(read(root, 'src/unrelated.ts'), /A1/)
    assert.match(read(root, 'src/shared.ts'), /INNER/)
    assert.deepEqual(loadState(root).packs.map((pack) => pack.id), ['a'])
}))

test('a root lock refuses an overlapping writer before any journal or host write', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const transition = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })

    withRootLock(root, () => {
        assert.throws(
            () => applyTransition({ root, transition }),
            (error) => error.code === 'PATCH_LOCKED',
        )
        assert.equal(read(root, 'src/unrelated.ts'), 'U\n')
        assert.equal(fs.existsSync(path.join(root, DEFAULT_JOURNAL_PATH)), false)
    })
    assert.equal(fs.existsSync(path.join(root, DEFAULT_LOCK_PATH)), false)
}))

test('a same-host lock owned by a dead process is recovered', () => withRoot((root) => {
    write(root, DEFAULT_LOCK_PATH, JSON.stringify({
        version: 1,
        token: 'stale',
        pid: 2147483647,
        hostname: os.hostname(),
        startedAt: '2000-01-01T00:00:00.000Z',
    }))

    let entered = false
    withRootLock(root, () => {
        entered = true
    })
    assert.equal(entered, true)
    assert.equal(fs.existsSync(path.join(root, DEFAULT_LOCK_PATH)), false)
}))

test('apply, failure recovery, and revert preserve existing POSIX modes', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    fs.chmodSync(path.join(root, 'src/unrelated.ts'), 0o755)
    fs.chmodSync(path.join(root, 'src/shared.ts'), 0o664)

    const failed = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })
    assert.throws(
        () => applyTransition({ root, transition: failed, injectFailureAfter: 1 }),
        /Injected transaction failure/,
    )
    assert.equal(mode(root, 'src/unrelated.ts'), 0o755)
    assert.equal(mode(root, 'src/shared.ts'), 0o664)

    const apply = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })
    applyTransition({ root, transition: apply })
    assert.equal(mode(root, 'src/unrelated.ts'), 0o755)
    assert.equal(mode(root, 'src/shared.ts'), 0o664)

    const revert = planTransition({
        root,
        catalog: [packA],
        packIds: [],
        profile: 'features',
    })
    applyTransition({ root, transition: revert })
    assert.equal(mode(root, 'src/unrelated.ts'), 0o755)
    assert.equal(mode(root, 'src/shared.ts'), 0o664)
}))

test('new owned files use the explicit default mode and state stays private', () => withRoot((root) => {
    const owned = {
        id: 'owned-pack',
        version: '1',
        units: [{
            id: 'owned-pack:new',
            file: 'src/new.ts',
            type: 'owned',
            content: 'owned\n',
        }],
    }
    const transition = planTransition({
        root,
        catalog: [owned],
        packIds: ['owned-pack'],
        profile: 'features',
    })
    applyTransition({ root, transition })

    assert.equal(mode(root, 'src/new.ts'), 0o644)
    assert.equal(mode(root, 'save/pocketrisu-patches/state.json'), 0o600)
    assert.equal(status({ root }).status, 'current')

    fs.chmodSync(path.join(root, 'src/new.ts'), 0o600)
    assert.equal(status({ root }).status, 'drifted')
}))

test('an interrupted journal is restored before another operation', () => withRoot((root) => {
    write(root, 'src/shared.ts', 'original\n')
    fs.chmodSync(path.join(root, 'src/shared.ts'), 0o755)
    write(root, DEFAULT_JOURNAL_PATH, JSON.stringify({
        format: 1,
        transactionId: 'test',
        originals: [{
            path: 'src/shared.ts',
            content: Buffer.from('original\n').toString('base64'),
            mode: 0o755,
        }],
    }))
    write(root, 'src/shared.ts', 'partial write\n')
    fs.chmodSync(path.join(root, 'src/shared.ts'), 0o600)

    assert.deepEqual(restoreJournal(root), { recovered: true, transactionId: 'test' })
    assert.equal(read(root, 'src/shared.ts'), 'original\n')
    assert.equal(mode(root, 'src/shared.ts'), 0o755)
}))

test('pack request order does not rewrite an otherwise current state', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const first = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['b', 'a'],
        profile: 'features',
    })
    applyTransition({ root, transition: first })
    const second = planTransition({
        root,
        catalog: [packA, packB],
        packIds: ['a', 'b'],
        profile: 'features',
    })
    assert.deepEqual(second.changes, [])
}))

test('managed paths cannot escape the target root', () => withRoot((root) => {
    assert.throws(() => resolveInside(root, '../outside'), /Unsafe managed path/)
    assert.throws(() => resolveInside(root, '/outside'), /Unsafe managed path/)
}))

test('a symlinked managed file is refused before any write', () => withRoot((root) => {
    write(root, 'outside.ts', 'outside\n')
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.symlinkSync(path.join(root, 'outside.ts'), path.join(root, 'src/shared.ts'))
    assert.throws(
        () => planTransition({
            root,
            catalog: [packA],
            packIds: ['a'],
            profile: 'features',
        }),
        (error) => error.code === 'SYMLINK_PATH',
    )
    assert.equal(read(root, 'outside.ts'), 'outside\n')
}))
