'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_JOURNAL_PATH,
    applyTransition,
    loadState,
    planTransition,
    restoreJournal,
    resolveInside,
    status,
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

test('an interrupted journal is restored before another operation', () => withRoot((root) => {
    write(root, 'src/shared.ts', 'original\n')
    write(root, DEFAULT_JOURNAL_PATH, JSON.stringify({
        format: 1,
        transactionId: 'test',
        originals: [{
            path: 'src/shared.ts',
            content: Buffer.from('original\n').toString('base64'),
        }],
    }))
    write(root, 'src/shared.ts', 'partial write\n')

    assert.deepEqual(restoreJournal(root), { recovered: true, transactionId: 'test' })
    assert.equal(read(root, 'src/shared.ts'), 'original\n')
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
