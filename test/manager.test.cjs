'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_JOURNAL_PATH,
    DEFAULT_INTENT_PATH,
    DEFAULT_LOCK_PATH,
    applyTransition,
    createPackEtagCache,
    createStateEncodingCache,
    customIntent,
    loadIntent,
    loadState,
    packEtag,
    planTransition,
    presetIntent,
    restoreJournal,
    resolveInside,
    status,
    STATE_FORMAT,
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

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
    for (const child of Object.values(value)) deepFreeze(child)
    return Object.freeze(value)
}

test('pack ETag cache accepts only immutable definitions', () => {
    const cache = createPackEtagCache()
    const frozen = deepFreeze(structuredClone(packA))
    const first = packEtag(frozen, { cache })
    assert.equal(packEtag(frozen, { cache }), first)
    const changed = deepFreeze({
        ...structuredClone(packA),
        version: '2',
    })
    assert.notEqual(packEtag(changed, { cache }), first)
    assert.deepEqual(
        { hits: cache.hits, misses: cache.misses },
        { hits: 1, misses: 2 },
    )
    assert.throws(
        () => packEtag(packA, { cache }),
        (error) => error.code === 'PACK_ETAG_CACHE_REQUIRES_FROZEN_PACK',
    )
})

test('state encoding cache reuses only an exact state value', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const stateEncodingCache = createStateEncodingCache()
    const first = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
        stateEncodingCache,
    })
    first.state.profile = 'mutated-after-encoding'
    const repeated = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
        stateEncodingCache,
    })
    assert.equal(repeated.state.profile, 'features')
    planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'custom',
        stateEncodingCache,
    })
    assert.deepEqual(
        { hits: stateEncodingCache.hits, misses: stateEncodingCache.misses },
        { hits: 1, misses: 2 },
    )
}))

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

test('intent and applied state are committed in the same transition', () => withRoot((root) => {
    write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '9.9.9' }))
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')

    const apply = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'custom',
        persistIntent: true,
        intentPolicy: customIntent(['a']),
    })
    assert.equal(
        apply.changes.some((change) => change.path === DEFAULT_INTENT_PATH),
        true,
    )
    applyTransition({ root, transition: apply })

    assert.deepEqual(loadIntent(root), {
        format: 2,
        mode: 'custom',
        requestedPacks: ['a'],
        preset: null,
    })
    const state = loadState(root)
    assert.equal(state.format, STATE_FORMAT)
    assert.deepEqual(state.target, {
        packageName: 'pocketrisu',
        packageVersion: '9.9.9',
    })
    assert.deepEqual(state.selection.effectiveRequested, ['a'])

    const revert = planTransition({
        root,
        catalog: [packA],
        packIds: [],
        profile: 'custom',
        persistIntent: true,
        intentPolicy: customIntent([]),
    })
    applyTransition({ root, transition: revert })
    assert.equal(loadState(root), null)
    assert.deepEqual(loadIntent(root).requestedPacks, [])
    assert.equal(read(root, 'src/unrelated.ts'), 'U\n')
    assert.equal(read(root, 'src/shared.ts'), 'const value = BASE\n')
}))

const targetScopedPack = {
    id: 'target-scoped',
    version: '1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1'],
            reviewing: ['1.9.0'],
        },
    },
    units: [
        {
            id: 'target-scoped:common',
            file: 'src/common.ts',
            type: 'owned',
            content: 'common\n',
        },
        {
            id: 'target-scoped:search-1.9',
            file: 'src/search-1.9.ts',
            type: 'insert',
            where: 'after',
            anchor: 'BASE\n',
            content: 'search\n',
            targetVersions: {
                pocketrisu: ['1.9.0'],
            },
        },
    ],
}

test('target-scoped units stay out of older target plans and state', () =>
    withRoot((root) => {
        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }))
        const apply = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })
        assert.deepEqual(apply.order, ['target-scoped:common'])
        assert.deepEqual(apply.state.units.map((unit) => unit.id), ['target-scoped:common'])
        assert.equal(
            apply.changes.some((change) => change.path === 'src/search-1.9.ts'),
            false,
        )
        applyTransition({ root, transition: apply })
        assert.equal(read(root, 'src/common.ts'), 'common\n')
        assert.equal(fs.existsSync(path.join(root, 'src/search-1.9.ts')), false)

        const revert = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: [],
            profile: 'custom',
        })
        applyTransition({ root, transition: revert })
        assert.equal(fs.existsSync(path.join(root, 'src/common.ts')), false)
        assert.equal(status({ root }).status, 'clean')
    }))

test('target-scoped units apply and revert only on their exact target', () =>
    withRoot((root) => {
        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.9.0' }))
        write(root, 'src/search-1.9.ts', 'BASE\n')
        const apply = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })
        assert.deepEqual(apply.order, [
            'target-scoped:common',
            'target-scoped:search-1.9',
        ])
        applyTransition({ root, transition: apply })
        assert.match(
            read(root, 'src/search-1.9.ts'),
            /POCKETRISU-PATCH:target-scoped:search-1\.9:START[\s\S]*search/,
        )
        assert.equal(status({ root }).status, 'current')

        const repeated = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })
        assert.deepEqual(repeated.changes, [])

        const revert = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: [],
            profile: 'custom',
        })
        applyTransition({ root, transition: revert })
        assert.equal(read(root, 'src/search-1.9.ts'), 'BASE\n')
        assert.equal(fs.existsSync(path.join(root, 'src/common.ts')), false)
        assert.equal(status({ root }).status, 'clean')
    }))

test('target drift is reported and a new plan recomposes the exact target units', () =>
    withRoot((root) => {
        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }))
        const initial = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })
        applyTransition({ root, transition: initial })

        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.9.0' }))
        write(root, 'src/search-1.9.ts', 'BASE\n')
        const drifted = status({ root })
        assert.equal(drifted.status, 'drifted')
        assert.equal(drifted.targetStatus, 'drifted')
        assert.equal(drifted.target.packageVersion, '1.8.1')
        assert.equal(drifted.currentTarget.packageVersion, '1.9.0')

        const update = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })
        assert.deepEqual(update.order, [
            'target-scoped:common',
            'target-scoped:search-1.9',
        ])
        applyTransition({ root, transition: update })
        assert.equal(status({ root }).targetStatus, 'current')

        const revert = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: [],
            profile: 'custom',
        })
        applyTransition({ root, transition: revert })
        assert.equal(read(root, 'src/search-1.9.ts'), 'BASE\n')
        assert.equal(fs.existsSync(path.join(root, 'src/common.ts')), false)
    }))

test('target changes make a planned transition stale before any patch write', () =>
    withRoot((root) => {
        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.9.0' }))
        write(root, 'src/search-1.9.ts', 'BASE\n')
        const transition = planTransition({
            root,
            catalog: [targetScopedPack],
            packIds: ['target-scoped'],
            profile: 'custom',
        })

        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }))
        assert.throws(
            () => applyTransition({ root, transition }),
            (error) => error.code === 'STALE_TRANSITION'
                && error.details.stale.some((entry) =>
                    entry.path === 'package.json'
                    && entry.expectedTarget.packageVersion === '1.9.0'
                    && entry.actualTarget.packageVersion === '1.8.1'
                ),
        )
        assert.equal(read(root, 'src/search-1.9.ts'), 'BASE\n')
        assert.equal(fs.existsSync(path.join(root, 'src/common.ts')), false)
        assert.equal(fs.existsSync(path.join(root, DEFAULT_JOURNAL_PATH)), false)
        assert.equal(loadState(root), null)
    }))

test('target-scoped units cannot opt into undeclared or malformed versions', () =>
    withRoot((root) => {
        write(root, 'package.json', JSON.stringify({ name: 'pocketrisu', version: '1.9.0' }))
        for (const targetVersions of [
            { pocketrisu: ['1.9.1'] },
            { pocketrisu: [] },
            { pocketrisu: ['1.9.0', '1.9.0'] },
        ]) {
            assert.throws(
                () => planTransition({
                    root,
                    catalog: [{
                        ...targetScopedPack,
                        units: [{
                            ...targetScopedPack.units[1],
                            targetVersions,
                        }],
                    }],
                    packIds: ['target-scoped'],
                    profile: 'custom',
                }),
                (error) => error.code === 'INVALID_PACK',
            )
        }
    }))

test('Svelte markup insertions require exact managed text instead of executable wrappers', () =>
    withRoot((root) => {
        write(root, 'src/example.svelte', '<div>anchor</div>\n')
        const unsafe = {
            id: 'unsafe-svelte-markup',
            version: '1',
            units: [{
                id: 'unsafe-svelte-markup:block',
                file: 'src/example.svelte',
                type: 'insert',
                where: 'before',
                anchor: '<div>anchor</div>\n',
                content: '{#if enabled}\n',
            }],
        }
        assert.throws(
            () => planTransition({
                root,
                catalog: [unsafe],
                packIds: [unsafe.id],
                profile: 'custom',
            }),
            (error) => error.code === 'INVALID_PACK'
                && /must declare exact managed text/.test(error.message),
        )
        assert.equal(read(root, 'src/example.svelte'), '<div>anchor</div>\n')

        const safe = {
            ...unsafe,
            id: 'safe-svelte-markup',
            units: [{
                ...unsafe.units[0],
                id: 'safe-svelte-markup:block',
                managed: '<!-- safe-svelte-markup:block -->\n{#if enabled}\n',
                markerNeedle: 'safe-svelte-markup:block',
                content: undefined,
            }],
        }
        const apply = planTransition({
            root,
            catalog: [safe],
            packIds: [safe.id],
            profile: 'custom',
        })
        applyTransition({ root, transition: apply })
        assert.match(read(root, 'src/example.svelte'), /<!-- safe-svelte-markup:block -->/)
        const revert = planTransition({
            root,
            catalog: [safe],
            packIds: [],
            profile: 'custom',
        })
        applyTransition({ root, transition: revert })
        assert.equal(read(root, 'src/example.svelte'), '<div>anchor</div>\n')
    }))

test('format-1 applied state is upgraded without rewriting unchanged source', () => withRoot((root) => {
    write(root, 'src/unrelated.ts', 'U\n')
    write(root, 'src/shared.ts', 'const value = BASE\n')
    const initial = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'features',
    })
    applyTransition({ root, transition: initial })

    const legacy = loadState(root)
    legacy.format = 1
    delete legacy.target
    delete legacy.selection
    write(root, 'save/pocketrisu-patches/state.json', `${JSON.stringify(legacy, null, 2)}\n`)

    const upgrade = planTransition({
        root,
        catalog: [packA],
        packIds: ['a'],
        profile: 'custom',
        persistIntent: true,
        intentPolicy: customIntent(['a']),
    })
    assert.deepEqual(
        upgrade.changes.map((change) => change.path).sort(),
        [DEFAULT_INTENT_PATH, 'save/pocketrisu-patches/state.json'],
    )
    applyTransition({ root, transition: upgrade })
    assert.equal(loadState(root).format, STATE_FORMAT)
    assert.match(read(root, 'src/unrelated.ts'), /A1/)
    assert.match(read(root, 'src/shared.ts'), /INNER/)
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
    const stateMtime = fs.statSync(
        path.join(root, 'save/pocketrisu-patches/state.json'),
    ).mtimeMs
    assert.deepEqual(applyTransition({ root, transition: second }), {
        changed: false,
        files: [],
    })
    assert.equal(
        fs.statSync(path.join(root, 'save/pocketrisu-patches/state.json')).mtimeMs,
        stateMtime,
    )
    assert.equal(fs.existsSync(path.join(root, DEFAULT_JOURNAL_PATH)), false)
}))

test('one-time supersede input does not cause a follow-up state rewrite', () =>
    withRoot((root) => {
        write(root, 'src/shared.ts', 'const value = BASE\n')
        const narrow = {
            id: 'narrow',
            version: '1',
            units: [{
                id: 'narrow:shared',
                file: 'src/shared.ts',
                type: 'replace',
                anchor: 'BASE',
                content: 'NARROW',
            }],
        }
        const complete = {
            id: 'complete',
            version: '1',
            supersedes: ['narrow'],
            units: [{
                id: 'complete:shared',
                file: 'src/shared.ts',
                type: 'replace',
                anchor: 'BASE',
                content: 'COMPLETE',
            }],
        }
        const initial = planTransition({
            root,
            catalog: [narrow, complete],
            packIds: ['narrow', 'complete'],
            profile: 'custom',
            persistIntent: true,
            intentPolicy: customIntent(['narrow', 'complete']),
        })
        assert.deepEqual(initial.resolution.superseded, [{
            pack: 'narrow',
            by: 'complete',
        }])
        applyTransition({ root, transition: initial })

        const repeated = planTransition({
            root,
            catalog: [narrow, complete],
            packIds: loadIntent(root).requestedPacks,
            profile: 'custom',
            persistIntent: false,
        })
        assert.deepEqual(repeated.changes, [])
    }))

test('preset intent stores policy without freezing the current pack list', () => withRoot((root) => {
    const transition = planTransition({
        root,
        catalog: [{ id: 'a', version: '1', units: [] }],
        packIds: ['a'],
        profile: 'all',
        persistIntent: true,
        intentPolicy: presetIntent('all'),
    })
    applyTransition({ root, transition })
    assert.deepEqual(loadIntent(root), {
        format: 2,
        mode: 'preset',
        preset: 'all',
    })
}))

test('legacy intent remains readable for conservative CLI migration', () => withRoot((root) => {
    write(root, DEFAULT_INTENT_PATH, JSON.stringify({
        format: 1,
        requestedPacks: ['b', 'a', 'a'],
        preset: 'all',
    }))
    assert.deepEqual(loadIntent(root), {
        format: 1,
        mode: 'legacy',
        requestedPacks: ['a', 'b'],
        preset: 'all',
    })
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
