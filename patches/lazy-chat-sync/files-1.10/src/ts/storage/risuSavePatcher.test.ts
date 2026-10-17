import { describe, test, expect, vi } from 'vitest'

// Mock heavy deps so importing risuSave.ts doesn't pull the Svelte runtime
// or trigger module-level side effects. The patcher and the helper it
// delegates to are pure once `compare` is injected.
vi.mock('./database.svelte', () => ({}))
vi.mock('./chatStorage', () => ({
    // Identity stub — character path is exercised with empty `characters`
    // arrays in this suite, but the mock has to exist so import resolution
    // works.
    chatToStub: (c: any) => c,
}))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))

const { diffArrayWithIdGuard, RisuSavePatcher } = await import('./risuSave')
const { compare } = await import('fast-json-patch')

// ──────────────────────────────────────────────────────────────────────────
// diffArrayWithIdGuard — direct tests on the structural-vs-elementwise pivot.
//
// The bug this protects against: deleting an entry from the front of an
// array of deeply nested objects (e.g. local-Risu-imported modules in the
// modules[] array) makes fast-json-patch.compare emit hundreds of thousands
// of element-wise diff ops (every index shifts by one and each slot deep-
// diffs old[i] vs new[i+1]). The resulting `patch.push(...ops)` then trips
// V8's function-argument limit and throws RangeError.
// ──────────────────────────────────────────────────────────────────────────

describe('diffArrayWithIdGuard — id-based structural detection (modules)', () => {
    const A = { id: 'a', name: 'A', cjs: 'console.log("a")' }
    const B = { id: 'b', name: 'B', cjs: 'console.log("b")' }
    const C = { id: 'c', name: 'C', cjs: 'console.log("c")' }
    const D = { id: 'd', name: 'D', cjs: 'console.log("d")' }

    test('identical arrays → no ops', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C], [A, B, C], 'id')
        expect(ops).toEqual([])
    })

    test('delete from front (the cascade case) → single replace, NOT element-wise', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C, D], [B, C, D], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [B, C, D] }])
    })

    test('delete from middle → single replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C, D], [A, C, D], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, C, D] }])
    })

    test('delete from end → single replace (length change)', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C, D], [A, B, C], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, B, C] }])
    })

    test('append new item → single replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B], [A, B, C], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, B, C] }])
    })

    test('reorder (length unchanged, ids in different positions) → single replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C], [C, A, B], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [C, A, B] }])
    })

    test('same ids, one item internally changed → element-wise diff for that index only', () => {
        const Bx = { id: 'b', name: 'B-renamed', cjs: 'console.log("b")' }
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, B, C], [A, Bx, C], 'id')
        // Only /modules/1 path should be touched. Exact op shape depends on
        // fast-json-patch's diff strategy but it must be scoped to index 1.
        expect(ops.length).toBeGreaterThan(0)
        for (const op of ops) {
            expect(op.path.startsWith('/modules/1')).toBe(true)
        }
    })

    test('empty → empty: no ops', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [], [], 'id')
        expect(ops).toEqual([])
    })

    test('empty → non-empty: structural replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', [], [A], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A] }])
    })

    test('undefined lastArr (cold init) → treated as empty', () => {
        const ops = diffArrayWithIdGuard(compare, '/modules', undefined, [A, B], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, B] }])
    })
})

describe('diffArrayWithIdGuard — ID safety belt', () => {
    // The fix targets corrupted backups where modules may have missing or
    // duplicated ids. Element-wise diff in those states is unreliable, so we
    // force a structural replace instead.

    test('falsy id in current array → structural replace', () => {
        const A = { id: 'a', name: 'A' }
        const Bbad = { id: '', name: 'B' }
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, { id: 'b', name: 'B' }], [A, Bbad], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, Bbad] }])
    })

    test('missing id field entirely → structural replace', () => {
        const A = { id: 'a', name: 'A' }
        const Bbad = { name: 'B' } as any
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, { id: 'b', name: 'B' }], [A, Bbad], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, Bbad] }])
    })

    test('duplicate ids in current array → structural replace', () => {
        const A = { id: 'a', name: 'A' }
        const Adup = { id: 'a', name: 'A2' }
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, { id: 'b', name: 'B' }], [A, Adup], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, Adup] }])
    })

    test('null entry in array → structural replace (falsy id chain)', () => {
        const A = { id: 'a', name: 'A' }
        const ops = diffArrayWithIdGuard(compare, '/modules', [A, { id: 'b' }], [A, null as any], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/modules', value: [A, null] }])
    })
})

describe('diffArrayWithIdGuard — id-based mode (botPresets)', () => {
    // S3 (3966c178) added a stable string `id` field to botPresets and a boot
    // migration that backfills missing ids. The patcher now diffs botPresets
    // by id, matching modules: same-length internal edits emit a scoped
    // element-wise diff for that slot only, while add / delete / reorder all
    // trip structural detection and emit a single /botPresets replace. The
    // pre-S3 length-only mode could silently misalign slots on reorder; the
    // id-based mode forces a safe replace in that case.

    const P1 = { id: 'preset-1', name: 'GPT-4', temperature: 80, mainPrompt: 'You are...' }
    const P2 = { id: 'preset-2', name: 'Claude', temperature: 70, mainPrompt: 'You are...' }
    const P3 = { id: 'preset-3', name: 'Local', temperature: 60, mainPrompt: 'You are...' }

    test('identical → no ops', () => {
        expect(diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P1, P2], 'id')).toEqual([])
    })

    test('one preset internally changed → element-wise diff (only that slot)', () => {
        const P2x = { ...P2, temperature: 75 }
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P1, P2x], 'id')
        expect(ops.length).toBeGreaterThan(0)
        for (const op of ops) expect(op.path.startsWith('/botPresets/1')).toBe(true)
    })

    test('add preset → structural replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P1, P2, P3], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P1, P2, P3] }])
    })

    test('delete preset from middle → structural replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2, P3], [P1, P3], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P1, P3] }])
    })

    test('reorder presets → structural replace', () => {
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2, P3], [P3, P1, P2], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P3, P1, P2] }])
    })

    // Safety belt — backups predating S3 won't have ids until boot migration
    // runs. If the patcher is invoked before then (defensive), missing ids
    // force a structural replace rather than silently misaligning slots.
    test('missing id on any preset → structural replace (safety belt)', () => {
        const Pnoid = { name: 'Legacy', temperature: 50, mainPrompt: 'You are...' }
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P1, Pnoid], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P1, Pnoid] }])
    })

    test('duplicate ids → structural replace (safety belt)', () => {
        const Pdup = { ...P2, id: P1.id }
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P1, Pdup], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P1, Pdup] }])
    })

    test('reorder + internal edit → structural replace (id mismatch at index)', () => {
        // When ids don't line up at the same indices, structural replace wins —
        // we do not attempt to chase the moved entry's internal diff.
        const P2x = { ...P2, temperature: 75 }
        const ops = diffArrayWithIdGuard(compare, '/botPresets', [P1, P2], [P2x, P1], 'id')
        expect(ops).toEqual([{ op: 'replace', path: '/botPresets', value: [P2x, P1] }])
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Scale test — verify the helper does NOT trip the spread limit and does
// NOT explode the op count on the original bug's pathological input.
// ──────────────────────────────────────────────────────────────────────────

describe('diffArrayWithIdGuard — scale (regression)', () => {
    function makeModule(i: number) {
        // Each module is moderately deep — comparable to a real module with
        // a lorebook, regex list, and trigger list. The original bug's
        // cascade explosion happened because deep-diffing N shifted items
        // emitted O(N × deepFields) ops.
        return {
            id: `mod-${i}`,
            name: `Module ${i}`,
            description: `description for module ${i}`,
            lorebook: Array.from({ length: 20 }, (_, k) => ({
                key: `key-${i}-${k}`,
                content: `content for entry ${k} of module ${i}`,
                priority: k,
            })),
            regex: Array.from({ length: 10 }, (_, k) => ({
                pattern: `pattern-${i}-${k}`,
                replace: `replace-${i}-${k}`,
            })),
            cjs: `console.log("module ${i}");`.repeat(50),
        }
    }

    test('deleting front item of a 200-module array → 1 op, no spread crash', () => {
        const last = Array.from({ length: 200 }, (_, i) => makeModule(i))
        const cur = last.slice(1) // delete index 0
        const ops = diffArrayWithIdGuard(compare, '/modules', last, cur, 'id')
        expect(ops).toHaveLength(1)
        expect(ops[0].op).toBe('replace')
        expect(ops[0].path).toBe('/modules')
    })

    test('no-op on 200-module array → 0 ops (hot path)', () => {
        const arr = Array.from({ length: 200 }, (_, i) => makeModule(i))
        // Same reference, no change.
        const ops = diffArrayWithIdGuard(compare, '/modules', arr, arr, 'id')
        expect(ops).toEqual([])
    })

    test('original element-wise compare WOULD have produced very many ops on this input', () => {
        // Sanity check that our test input is actually pathological — if
        // this number ever drops to a small value, the regression test
        // above is no longer guarding the right thing.
        const last = Array.from({ length: 200 }, (_, i) => makeModule(i))
        const cur = last.slice(1)
        const legacyOps = compare({ modules: last }, { modules: cur })
        expect(legacyOps.length).toBeGreaterThan(1000)
    })
})

// ──────────────────────────────────────────────────────────────────────────
// RisuSavePatcher integration — exercise the full set() path.
// ──────────────────────────────────────────────────────────────────────────

function makeMod(id: string, extras: any = {}) {
    return { id, name: `mod-${id}`, description: '', ...extras }
}

const emptyToSave = () => ({
    character: [],
    chat: [] as [string, string][],
    root: false,
    botPreset: false,
    modules: false,
    plugins: false,
    pluginCustomStorage: false,
})

describe('RisuSavePatcher.set — modules path', () => {
    test('deleting a front-loaded module emits a single replace op, no RangeError', async () => {
        const patcher = new RisuSavePatcher()
        const initialModules = [makeMod('a'), makeMod('b'), makeMod('c'), makeMod('d')]
        await patcher.init({ characters: [], botPresets: [], modules: initialModules })

        const newDb = { characters: [], botPresets: [], modules: [makeMod('b'), makeMod('c'), makeMod('d')] }
        const { patch } = await patcher.set(newDb, { ...emptyToSave(), modules: true })

        const moduleOps = patch.filter((p: any) => p.path === '/modules' || p.path.startsWith('/modules/'))
        expect(moduleOps).toEqual([
            { op: 'replace', path: '/modules', value: newDb.modules },
        ])
    })

    test('internal edit only (same id order) → element-wise diff scoped to that index', async () => {
        const patcher = new RisuSavePatcher()
        await patcher.init({
            characters: [],
            botPresets: [],
            modules: [makeMod('a'), makeMod('b', { description: 'old' })],
        })

        const newDb = {
            characters: [],
            botPresets: [],
            modules: [makeMod('a'), makeMod('b', { description: 'new' })],
        }
        const { patch } = await patcher.set(newDb, { ...emptyToSave(), modules: true })

        const moduleOps = patch.filter((p: any) => p.path.startsWith('/modules/'))
        expect(moduleOps.length).toBeGreaterThan(0)
        for (const op of moduleOps) expect(op.path.startsWith('/modules/1')).toBe(true)
        // No structural replace under those circumstances.
        expect(patch.find((p: any) => p.path === '/modules')).toBeUndefined()
    })

    test('does not throw on a pathological array that would crash the original code path', async () => {
        // ~300 modules with non-trivial internals × front delete. Old behavior
        // would balloon the op count and trip `patch.push(...arr)` spread.
        const N = 300
        const big = Array.from({ length: N }, (_, i) => makeMod(`m${i}`, {
            description: 'x'.repeat(200),
            lorebook: Array.from({ length: 10 }, (_, k) => ({ key: `k${k}`, content: 'y'.repeat(100) })),
        }))

        const patcher = new RisuSavePatcher()
        await patcher.init({ characters: [], botPresets: [], modules: big })

        // Delete the very first module — worst-case index cascade.
        const next = big.slice(1)
        const newDb = { characters: [], botPresets: [], modules: next }

        await expect(patcher.set(newDb, { ...emptyToSave(), modules: true })).resolves.toBeTruthy()
    })

    test('subsequent set() picks up the new baseline after a structural change', async () => {
        // After the fix, a structural replace updates lastSyncedDb so the
        // following set() compares against the new baseline. This is what
        // keeps the patcher converged with the server.
        const patcher = new RisuSavePatcher()
        await patcher.init({
            characters: [],
            botPresets: [],
            modules: [makeMod('a'), makeMod('b'), makeMod('c')],
        })

        // First call: delete 'a'.
        await patcher.set(
            { characters: [], botPresets: [], modules: [makeMod('b'), makeMod('c')] },
            { ...emptyToSave(), modules: true },
        )

        // Second call: no further change. Should emit 0 module ops.
        const { patch } = await patcher.set(
            { characters: [], botPresets: [], modules: [makeMod('b'), makeMod('c')] },
            { ...emptyToSave(), modules: true },
        )
        const moduleOps = patch.filter((p: any) =>
            p.path === '/modules' || p.path.startsWith('/modules/'),
        )
        expect(moduleOps).toEqual([])
    })
})

describe('RisuSavePatcher.set — botPresets path', () => {
    // Each preset gets a stable id (S3) — patcher diffs botPresets by id,
    // same as modules. Reusing `name` as the id keeps fixtures terse.
    const preset = (name: string, extras: any = {}) => ({
        id: name, name, temperature: 80, mainPrompt: 'You are...', ...extras,
    })

    test('deleting a preset from the middle emits a single replace op', async () => {
        const patcher = new RisuSavePatcher()
        await patcher.init({
            characters: [],
            botPresets: [preset('p1'), preset('p2'), preset('p3')],
            modules: [],
        })

        const newDb = {
            characters: [],
            botPresets: [preset('p1'), preset('p3')],
            modules: [],
        }
        const { patch } = await patcher.set(newDb, { ...emptyToSave(), botPreset: true })
        const presetOps = patch.filter((p: any) =>
            p.path === '/botPresets' || p.path.startsWith('/botPresets/'),
        )
        expect(presetOps).toEqual([
            { op: 'replace', path: '/botPresets', value: newDb.botPresets },
        ])
    })

    test('editing one preset (length unchanged) emits scoped element-wise diff', async () => {
        const patcher = new RisuSavePatcher()
        await patcher.init({
            characters: [],
            botPresets: [preset('p1'), preset('p2', { temperature: 70 })],
            modules: [],
        })
        const newDb = {
            characters: [],
            botPresets: [preset('p1'), preset('p2', { temperature: 75 })],
            modules: [],
        }
        const { patch } = await patcher.set(newDb, { ...emptyToSave(), botPreset: true })
        const presetOps = patch.filter((p: any) => p.path.startsWith('/botPresets/'))
        expect(presetOps.length).toBeGreaterThan(0)
        for (const op of presetOps) expect(op.path.startsWith('/botPresets/1')).toBe(true)
        expect(patch.find((p: any) => p.path === '/botPresets')).toBeUndefined()
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Round-trip integrity — the strongest correctness invariant:
//
//   applyPatch(baseline, patcher.set(newState).patch) === normalize(newState)
//
// In production, the server applies these patches with fast-json-patch's
// applyPatch on its own copy of the DB. If our generated ops don't bring
// the server's baseline up to the same state the patcher computed
// internally, the next save/load round-trip will diverge and the user
// either sees stale data or silent loss. These tests exercise the
// scenarios the fix is meant to handle and verify byte-equivalent
// reconstruction.
// ──────────────────────────────────────────────────────────────────────────

const { applyPatch } = await import('fast-json-patch')
const { normalizeJSON } = await import('./risuSave')

function applyOpsTo(baseline: any, ops: any[]) {
    // fast-json-patch mutates by default; deep-clone first to keep tests
    // independent. Also matches how the server-side applyPatch wraps the
    // call in its own copy of the DB.
    const copy = JSON.parse(JSON.stringify(baseline))
    applyPatch(copy, ops)
    return copy
}

async function runRoundTrip(
    initial: any,
    next: any,
    toSave: any,
) {
    const patcher = new RisuSavePatcher()
    await patcher.init(initial)
    const { patch } = await patcher.set(next, toSave)
    // Simulate the server's pre-image: normalized initial state.
    const serverBaseline = normalizeJSON(initial)
    const afterApply = applyOpsTo(serverBaseline, patch)
    // Simulate what the server should end up with: normalized next state,
    // with chats stub-replaced on characters (mirroring patcher.set's diff
    // input). characters are out of scope for this suite (empty arrays),
    // so the transformation collapses to plain normalize.
    const expected = normalizeJSON(next)
    return { patch, afterApply, expected }
}

describe('round-trip — patcher ops reconstruct the new state on a baseline', () => {
    test('modules: delete from front', async () => {
        const modules = [
            { id: 'a', name: 'A', cjs: 'console.log("a")' },
            { id: 'b', name: 'B', cjs: 'console.log("b")' },
            { id: 'c', name: 'C', cjs: 'console.log("c")' },
        ]
        const initial = { characters: [], botPresets: [], modules }
        const next = { characters: [], botPresets: [], modules: modules.slice(1) }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: delete from middle', async () => {
        const modules = [
            { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
            { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
        ]
        const initial = { characters: [], botPresets: [], modules }
        const next = { characters: [], botPresets: [], modules: [modules[0], modules[2], modules[3]] }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: add to end', async () => {
        const modules = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
        const initial = { characters: [], botPresets: [], modules }
        const next = { characters: [], botPresets: [], modules: [...modules, { id: 'c', name: 'C' }] }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: reorder preserves all data', async () => {
        const modules = [
            { id: 'a', name: 'A', lorebook: [{ key: 'k1', content: 'v1' }] },
            { id: 'b', name: 'B', lorebook: [{ key: 'k2', content: 'v2' }] },
            { id: 'c', name: 'C', lorebook: [{ key: 'k3', content: 'v3' }] },
        ]
        const initial = { characters: [], botPresets: [], modules }
        const next = { characters: [], botPresets: [], modules: [modules[2], modules[0], modules[1]] }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: edit content of one (length unchanged, same ids)', async () => {
        const initial = {
            characters: [], botPresets: [],
            modules: [
                { id: 'a', name: 'A', description: 'old' },
                { id: 'b', name: 'B', description: 'untouched' },
            ],
        }
        const next = {
            characters: [], botPresets: [],
            modules: [
                { id: 'a', name: 'A', description: 'NEW VALUE' },
                { id: 'b', name: 'B', description: 'untouched' },
            ],
        }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: multi-level changes (add + edit at once)', async () => {
        const initial = {
            characters: [], botPresets: [],
            modules: [
                { id: 'a', name: 'A', description: 'v1' },
                { id: 'b', name: 'B', description: 'v1' },
            ],
        }
        const next = {
            characters: [], botPresets: [],
            modules: [
                { id: 'a', name: 'A', description: 'v2' },         // edited
                { id: 'b', name: 'B', description: 'v1' },
                { id: 'c', name: 'C', description: 'new' },        // added
            ],
        }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('modules: 200-module front-delete (the original bug scenario)', async () => {
        function makeMod(i: number) {
            return {
                id: `mod-${i}`,
                name: `Module ${i}`,
                description: `desc ${i}`,
                lorebook: Array.from({ length: 10 }, (_, k) => ({
                    key: `k-${i}-${k}`, content: `v-${i}-${k}`,
                })),
                cjs: `console.log("${i}")`.repeat(10),
            }
        }
        const big = Array.from({ length: 200 }, (_, i) => makeMod(i))
        const initial = { characters: [], botPresets: [], modules: big }
        const next = { characters: [], botPresets: [], modules: big.slice(1) }
        const { patch, afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        // Sanity: not exploding into hundreds of thousands of ops
        expect(patch.length).toBeLessThan(20)
        // Server side reconstructs exactly what the patcher computed
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('botPresets: delete from middle', async () => {
        const p = (name: string, temp = 80) => ({ name, temperature: temp, mainPrompt: 'You are...' })
        const initial = { characters: [], botPresets: [p('p1'), p('p2'), p('p3')], modules: [] }
        const next = { characters: [], botPresets: [p('p1'), p('p3')], modules: [] }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), botPreset: true })
        expect(afterApply.botPresets).toEqual(expected.botPresets)
    })

    test('botPresets: edit one (length unchanged)', async () => {
        const p = (name: string, temp = 80) => ({ name, temperature: temp, mainPrompt: 'You are...' })
        const initial = { characters: [], botPresets: [p('p1', 70), p('p2', 80)], modules: [] }
        const next = { characters: [], botPresets: [p('p1', 70), p('p2', 90)], modules: [] }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), botPreset: true })
        expect(afterApply.botPresets).toEqual(expected.botPresets)
    })

    test('combined: edit modules and botPresets in a single save', async () => {
        const p = (name: string) => ({ name, temperature: 80, mainPrompt: 'You are...' })
        const initial = {
            characters: [],
            botPresets: [p('p1'), p('p2')],
            modules: [{ id: 'a', name: 'A', description: 'old' }],
        }
        const next = {
            characters: [],
            botPresets: [p('p1'), p('p3')],
            modules: [
                { id: 'a', name: 'A', description: 'new' },
                { id: 'b', name: 'B', description: 'added' },
            ],
        }
        const { afterApply, expected } = await runRoundTrip(initial, next, {
            ...emptyToSave(), modules: true, botPreset: true,
        })
        expect(afterApply.modules).toEqual(expected.modules)
        expect(afterApply.botPresets).toEqual(expected.botPresets)
    })

    test('ID safety belt: duplicate ids still reconstruct correctly', async () => {
        // Pathological — duplicate ids in current state. The structural-replace
        // safety belt kicks in, and the server-side state should still match.
        const initial = {
            characters: [], botPresets: [],
            modules: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        }
        const next = {
            characters: [], botPresets: [],
            modules: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A-duplicate' }],
        }
        const { afterApply, expected } = await runRoundTrip(initial, next, { ...emptyToSave(), modules: true })
        expect(afterApply.modules).toEqual(expected.modules)
    })

    test('idempotency: second save with no further changes emits no module/preset ops', async () => {
        // If the patcher's lastSyncedDb gets out of sync with the server's
        // applied state, the next set() would emit extra ops. This is the
        // exact mode that produces stale data on the user's screen.
        const modules = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
        const patcher = new RisuSavePatcher()
        await patcher.init({ characters: [], botPresets: [], modules })

        // First save: delete one module.
        const after1 = { characters: [], botPresets: [], modules: [modules[1]] }
        await patcher.set(after1, { ...emptyToSave(), modules: true })

        // Second save: no change since after1.
        const { patch } = await patcher.set(after1, { ...emptyToSave(), modules: true })
        const moduleOrPresetOps = patch.filter((p: any) =>
            p.path === '/modules' || p.path.startsWith('/modules/') ||
            p.path === '/botPresets' || p.path.startsWith('/botPresets/'),
        )
        expect(moduleOrPresetOps).toEqual([])
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Cheap-pre-check fast path — state-transition regression suite.
//
// The change-detection fast path compares JSON.stringify(block) against a
// stored baseline string and, on a match, skips normalize + protocol hash +
// diff entirely. The danger is a baseline that drifts out of sync with
// `lastSyncedDb`/`hashBlocks` so that either (a) a real change is skipped
// (silent loss) or (b) `expectedHash` no longer matches what the server holds.
// Each transition below is followed by a no-op save: a correct baseline must
// make the second save emit an empty patch, and a real change after a skip
// must still be caught.
// ──────────────────────────────────────────────────────────────────────────

const chr = (chaId: string, fields: Record<string, any> = {}) => ({
    chaId,
    name: chaId.toUpperCase(),
    desc: '',
    firstMessage: '',
    chats: [{ id: 'chat-' + chaId, name: 'c', _stub: true }],
    chatPage: 0,
    ...fields,
})
const dbWith = (characters: any[], rest: Record<string, any> = {}) => ({
    formatversion: 4, username: 'u', personaPrompt: 'p', botPresets: [], modules: [], characters, ...rest,
})
const clone = (o: any) => JSON.parse(JSON.stringify(o))

describe('fast-path — no-op detection after each transition', () => {
    test('init → identical save is a no-op', async () => {
        const db = dbWith([chr('a'), chr('b')])
        const p = new RisuSavePatcher()
        await p.init(db)
        const { patch } = await p.set(clone(db), emptyToSave())
        expect(patch).toEqual([])
    })

    test('root change → saved, then identical re-save is a no-op', async () => {
        const db = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.personaPrompt = 'new persona'
        const r1 = await p.set(clone(changed), { ...emptyToSave(), root: true })
        expect(r1.patch.some((o: any) => o.path === '/personaPrompt')).toBe(true)

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })

    test('character field change → saved, then no-op (caught even with empty toSave.character)', async () => {
        const db = dbWith([chr('a'), chr('b')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.characters[1].desc = 'edited B'
        // Deliberately empty toSave.character: the change must be caught by the
        // JSON compare → protocol hash, not by the save-tracker hint.
        const r1 = await p.set(clone(changed), emptyToSave())
        expect(r1.patch.some((o: any) => o.path === '/characters/1/desc')).toBe(true)

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })

    test('character add → saved, then no-op', async () => {
        const db = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.characters.push(chr('b'))
        const r1 = await p.set(clone(changed), emptyToSave())
        expect(r1.patch.some((o: any) => o.path === '/characters')).toBe(true)

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })

    test('character delete → saved, then no-op', async () => {
        const db = dbWith([chr('a'), chr('b'), chr('c')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.characters.splice(1, 1) // remove b
        const r1 = await p.set(clone(changed), emptyToSave())
        expect(r1.patch.some((o: any) => o.path === '/characters')).toBe(true)

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })

    test('character reorder → saved, then no-op', async () => {
        const db = dbWith([chr('a'), chr('b'), chr('c')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.characters = [changed.characters[2], changed.characters[0], changed.characters[1]]
        const r1 = await p.set(clone(changed), emptyToSave())
        expect(r1.patch.some((o: any) => o.path === '/characters')).toBe(true)

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })
})

describe('fast-path — a skipped block still catches a later change', () => {
    test('no-op save (fast-path skip) does not blind the patcher to the next edit', async () => {
        const db = dbWith([chr('a'), chr('b')])
        const p = new RisuSavePatcher()
        await p.init(db)

        // First: identical save → fast path skips char 'a' and 'b'.
        expect((await p.set(clone(db), emptyToSave())).patch).toEqual([])

        // Then edit char 'a' (previously skipped). Must be caught.
        const edited = clone(db); edited.characters[0].firstMessage = 'hi'
        const { patch } = await p.set(clone(edited), emptyToSave())
        expect(patch.some((o: any) => o.path === '/characters/0/firstMessage')).toBe(true)
    })

    test('root no-op then root edit is caught', async () => {
        const db = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(db)
        expect((await p.set(clone(db), emptyToSave())).patch).toEqual([])

        const edited = clone(db); edited.username = 'renamed'
        const { patch } = await p.set(clone(edited), emptyToSave())
        expect(patch.some((o: any) => o.path === '/username')).toBe(true)
    })
})

describe('fast-path — shared (non-cyclic) references round-trip correctly', () => {
    // normalizeJSON uses path-based cycle detection: a shared (non-cyclic)
    // reference appearing twice is kept in BOTH places (only true cycles are
    // nulled). So raw JSON and the normalized baseline agree on shared-ref data
    // and the fast path is safe — no null to "recover". These pin that the
    // patcher neither corrupts shared-ref data nor emits spurious ops.
    test('character with a shared ref: round-trips without null corruption, then no-op', async () => {
        const { applyPatch: apply } = await import('fast-json-patch')
        const shared = { tag: 'v', n: 1 }
        const base = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(base)

        // Introduce a character that holds the same object under two keys.
        const withShared = dbWith([chr('a', { extA: shared, extB: shared })])
        const { patch } = await p.set(withShared, { ...emptyToSave(), character: ['a'] })

        // Server reconstruction must hold the full object in BOTH places (no null).
        const server = JSON.parse(JSON.stringify(normalizeJSON(base)))
        apply(server, patch)
        expect(server.characters[0].extA).toEqual({ tag: 'v', n: 1 })
        expect(server.characters[0].extB).toEqual({ tag: 'v', n: 1 })

        // Identical re-save is a clean no-op (baseline converged).
        expect((await p.set(withShared, emptyToSave())).patch).toEqual([])
    })

    test('un-sharing into deep-equal objects is a no-op (no spurious ops)', async () => {
        const shared = { tag: 'v', n: 1 }
        const p = new RisuSavePatcher()
        await p.init(dbWith([chr('a', { extA: shared, extB: shared })]))

        // Un-share: two independent but deep-equal objects — content unchanged.
        const unshared = dbWith([chr('a', { extA: { tag: 'v', n: 1 }, extB: { tag: 'v', n: 1 } })])
        const { patch } = await p.set(unshared, emptyToSave())
        expect(patch).toEqual([])
    })

    test('a real content change under a shared ref is still caught', async () => {
        const shared = { tag: 'v', n: 1 }
        const p = new RisuSavePatcher()
        await p.init(dbWith([chr('a', { extA: shared, extB: shared })]))

        // Now genuinely change extB's content.
        const changed = dbWith([chr('a', { extA: { tag: 'v', n: 1 }, extB: { tag: 'v', n: 2 } })])
        const { patch } = await p.set(changed, emptyToSave())
        expect(patch.some((o: any) => o.path.startsWith('/characters/0/extB'))).toBe(true)
    })

    test('root-level shared ref round-trips and converges to a no-op', async () => {
        const { applyPatch: apply } = await import('fast-json-patch')
        const shared = { theme: 'x' }
        const base = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(base)

        const withShared = dbWith([chr('a')], { sdProvider: shared, customCss: shared } as any)
        const { patch } = await p.set(withShared, { ...emptyToSave(), root: true })
        const server = JSON.parse(JSON.stringify(normalizeJSON(base)))
        apply(server, patch)
        expect(server.sdProvider).toEqual({ theme: 'x' })
        expect(server.customCss).toEqual({ theme: 'x' })

        expect((await p.set(withShared, emptyToSave())).patch).toEqual([])
    })
})

describe('fast-path — expectedHash stays protocol-consistent', () => {
    test('hash after N mutating saves equals a fresh init of the same data', async () => {
        const db = dbWith([chr('a'), chr('b')])
        const live = new RisuSavePatcher()
        await live.init(db)

        // Drive several transitions on the live patcher.
        const s1 = clone(db); s1.personaPrompt = 'x'; await live.set(clone(s1), { ...emptyToSave(), root: true })
        const s2 = clone(s1); s2.characters[0].desc = 'y'; await live.set(clone(s2), emptyToSave())
        const s3 = clone(s2); s3.characters.push(chr('c')); await live.set(clone(s3), emptyToSave())
        const s4 = clone(s3); s4.characters.splice(0, 1); await live.set(clone(s4), emptyToSave())

        // expectedHash of the live patcher's next save (pre-image = current state)
        const liveHash = (await live.set(clone(s4), emptyToSave())).expectedHash

        // A fresh patcher initialised directly to the final state must agree.
        const fresh = new RisuSavePatcher()
        await fresh.init(clone(s4))
        const freshHash = (await fresh.set(clone(s4), emptyToSave())).expectedHash

        expect(liveHash).toBe(freshHash)
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Fast-path granularity — per-ROOT-KEY and per-MODULE pre-checks.
//
// While typing into a root field (personaPrompt) or a module lorebook, that
// block changes on EVERY save, so a per-block pre-check never matches. The
// pre-check is therefore kept per root key / per module: only the changed
// entry pays normalize + protocol hash + diff. These suites pin (a) op scope,
// (b) no-op convergence, (c) protocol-hash parity with a fresh init, and
// (d) the prototype-pollution / key-type hazards of id-keyed caches.
// ──────────────────────────────────────────────────────────────────────────

describe('fast-path — per-root-key granularity', () => {
    test('personaPrompt edit emits ONLY /personaPrompt ops (other root keys untouched)', async () => {
        const db = dbWith([chr('a')], { customCSS: 'body{}'.repeat(100), loreBook: [{ key: 'x', content: 'y' }] } as any)
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.personaPrompt = 'edited'
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), root: true })
        expect(patch.length).toBeGreaterThan(0)
        for (const op of patch) {
            expect(op.path.startsWith('/personaPrompt')).toBe(true)
        }

        const r2 = await p.set(clone(changed), emptyToSave())
        expect(r2.patch).toEqual([])
    })

    test('root key added → add op; root key deleted → remove op; then no-op', async () => {
        const db = dbWith([chr('a')])
        const p = new RisuSavePatcher()
        await p.init(db)

        const added = clone(db); added.newSetting = { on: true }
        const r1 = await p.set(clone(added), { ...emptyToSave(), root: true })
        expect(r1.patch.some((o: any) => o.op === 'add' && o.path === '/newSetting')).toBe(true)
        expect((await p.set(clone(added), emptyToSave())).patch).toEqual([])

        const removed = clone(added); delete removed.newSetting
        const r2 = await p.set(clone(removed), { ...emptyToSave(), root: true })
        expect(r2.patch.some((o: any) => o.op === 'remove' && o.path === '/newSetting')).toBe(true)
        expect((await p.set(clone(removed), emptyToSave())).patch).toEqual([])
    })

    test('an own __proto__ root key never produces a forbidden patch op', async () => {
        // A db loaded from JSON can carry an own enumerable "__proto__" key.
        // The old whole-root normalizeJSON dropped it; the per-key path must
        // too, or it emits a /__proto__ op that the server's applyPatch rejects
        // (prototype-pollution guard) — failing every save.
        const { applyPatch: apply } = await import('fast-json-patch')
        const db: any = dbWith([chr('a')])
        Object.defineProperty(db, '__proto__', { value: { polluted: true }, enumerable: true, writable: true, configurable: true })
        expect(Object.keys(db)).toContain('__proto__')

        const p = new RisuSavePatcher()
        await p.init(db)
        const changed = clone(db); changed.personaPrompt = 'edited'
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), root: true })

        expect(patch.some((o: any) => o.path === '/__proto__' || o.path.startsWith('/__proto__/'))).toBe(false)
        expect(patch.some((o: any) => o.path === '/personaPrompt')).toBe(true)
        // The patch must apply cleanly on a normalized server baseline (no throw).
        const serverState = JSON.parse(JSON.stringify(normalizeJSON(db)))
        expect(() => apply(serverState, patch)).not.toThrow()
        // And converge to a no-op.
        expect((await p.set(clone(changed), emptyToSave())).patch).toEqual([])
    })

    test('a root value with toJSON()→undefined is kept, not removed', async () => {
        // normalizeJSON ignores toJSON and keeps {x:1}; the per-key path must
        // decide presence by the normalized result, not by JSON.stringify(raw)
        // (which is undefined here), or it would emit a spurious /weird remove.
        const db: any = dbWith([chr('a')])
        db.weird = { x: 1, toJSON() { return undefined } }
        const p = new RisuSavePatcher()
        await p.init(db)

        // Unchanged save: must be a pure no-op (no remove of /weird).
        const { patch } = await p.set(db, { ...emptyToSave(), root: true })
        expect(patch.some((o: any) => o.path === '/weird' || o.path.startsWith('/weird/'))).toBe(false)
        expect(patch).toEqual([])

        const liveHash = (await p.set(db, emptyToSave())).expectedHash
        const fresh = new RisuSavePatcher(); await fresh.init(db)
        expect(liveHash).toBe((await fresh.set(db, emptyToSave())).expectedHash)
    })

    test('a top-level bigint root value drops cleanly — no undefined baseline / hash stays consistent', async () => {
        // bigint: JSON.stringify throws and normalizeJSON maps it to undefined,
        // so its key is dropped. The patcher must not store an undefined
        // baseline/hash for it (which would diverge from a fresh init).
        const db: any = dbWith([chr('a')])
        db.bsig = 123n
        const p = new RisuSavePatcher()
        await p.init(db)
        await p.set(db, { ...emptyToSave(), root: true })

        const liveHash = (await p.set(db, emptyToSave())).expectedHash
        const fresh = new RisuSavePatcher(); await fresh.init(db)
        const freshHash = (await fresh.set(db, emptyToSave())).expectedHash
        expect(liveHash).toBe(freshHash)
    })

    test('per-key ops reconstruct the same server state as a whole-root diff would', async () => {
        const { applyPatch: apply } = await import('fast-json-patch')
        const db = dbWith([chr('a')], { sdProvider: { x: 1 }, themeList: ['a', 'b'] } as any)
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db)
        changed.personaPrompt = 'new'
        changed.sdProvider = { x: 2, y: 3 }
        delete changed.themeList
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), root: true })

        const serverState = JSON.parse(JSON.stringify(normalizeJSON(db)))
        apply(serverState, patch)
        expect(serverState).toEqual(normalizeJSON(clone(changed)))
    })
})

describe('fast-path — per-module granularity', () => {
    const mod = (id: string, content = '') => ({
        id, name: 'M' + id, lorebook: [{ key: 'k', comment: 'c', content }], regex: [], trigger: [],
    })

    test('editing one module emits ops only under that module index; then no-op', async () => {
        const db = dbWith([chr('a')], { } as any)
        db.modules = [mod('m1', 'aaa'), mod('m2', 'bbb'), mod('m3', 'ccc')]
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db); changed.modules[1].lorebook[0].content = 'edited'
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), modules: true })
        expect(patch.length).toBeGreaterThan(0)
        for (const op of patch) {
            expect(op.path.startsWith('/modules/1')).toBe(true)
        }

        const r2 = await p.set(clone(changed), { ...emptyToSave(), modules: true })
        expect(r2.patch).toEqual([])
    })

    test('module add/remove/reorder → single whole-array replace; then no-op', async () => {
        const db = dbWith([chr('a')], { } as any)
        db.modules = [mod('m1'), mod('m2')]
        const p = new RisuSavePatcher()
        await p.init(db)

        const added = clone(db); added.modules.push(mod('m3'))
        const r1 = await p.set(clone(added), { ...emptyToSave(), modules: true })
        expect(r1.patch).toEqual([{ op: 'replace', path: '/modules', value: normalizeJSON(clone(added)).modules }])
        expect((await p.set(clone(added), { ...emptyToSave(), modules: true })).patch).toEqual([])

        const reordered = clone(added); reordered.modules = [reordered.modules[2], reordered.modules[0], reordered.modules[1]]
        const r2 = await p.set(clone(reordered), { ...emptyToSave(), modules: true })
        expect(r2.patch.length).toBe(1)
        expect(r2.patch[0].path).toBe('/modules')
        expect((await p.set(clone(reordered), { ...emptyToSave(), modules: true })).patch).toEqual([])
    })

    test('per-module element-wise ops reconstruct the server state (applyPatch round-trip)', async () => {
        const { applyPatch: apply } = await import('fast-json-patch')
        const db = dbWith([chr('a')], { } as any)
        db.modules = [mod('m1', 'aaa'), mod('m2', 'bbb'), mod('m3', 'ccc')]
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db)
        changed.modules[0].lorebook[0].content = 'edit0'
        changed.modules[2].name = 'renamed'
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), modules: true })

        const serverState = JSON.parse(JSON.stringify(normalizeJSON(db)))
        apply(serverState, patch)
        expect(serverState.modules).toEqual(normalizeJSON(clone(changed)).modules)
    })

    test('modules protocol hash from cached item hashes equals a fresh full hash', async () => {
        const db = dbWith([chr('a')], { } as any)
        db.modules = [mod('m1', 'aaa'), mod('m2', 'bbb')]
        const live = new RisuSavePatcher()
        await live.init(db)

        // Mutate one module via the element-wise path, then another save.
        const s1 = clone(db); s1.modules[0].lorebook[0].content = 'x1'
        await live.set(clone(s1), { ...emptyToSave(), modules: true })
        const s2 = clone(s1); s2.modules[1].name = 'renamed'
        await live.set(clone(s2), { ...emptyToSave(), modules: true })

        const liveHash = (await live.set(clone(s2), emptyToSave())).expectedHash
        const fresh = new RisuSavePatcher()
        await fresh.init(clone(s2))
        const freshHash = (await fresh.set(clone(s2), emptyToSave())).expectedHash
        expect(liveHash).toBe(freshHash)
    })

    test('module id "__proto__" cannot poison the caches — protocol hash stays consistent', async () => {
        // Plain-object caches would silently hit the prototype setter for this
        // id (storing nothing / returning Object.prototype), corrupting the
        // skip check and the hash fold. Map caches must handle it strictly.
        const db = dbWith([chr('a')], { } as any)
        db.modules = [mod('__proto__', 'aaa'), mod('m2', 'bbb')]
        const live = new RisuSavePatcher()
        await live.init(db)

        const s1 = clone(db); s1.modules[0].lorebook[0].content = 'edited'
        const r1 = await live.set(clone(s1), { ...emptyToSave(), modules: true })
        expect(r1.patch.some((o: any) => o.path.startsWith('/modules/0'))).toBe(true)
        expect((await live.set(clone(s1), { ...emptyToSave(), modules: true })).patch).toEqual([])

        const liveHash = (await live.set(clone(s1), emptyToSave())).expectedHash
        const fresh = new RisuSavePatcher()
        await fresh.init(clone(s1))
        const freshHash = (await fresh.set(clone(s1), emptyToSave())).expectedHash
        expect(liveHash).toBe(freshHash)
    })

    test('character with a huge shifted lorebook does not trip the spread limit', async () => {
        // Regression for the last surviving `patch.push(...ops)` in the
        // per-character branch: deleting one entry from the front of a
        // multi-thousand-entry character lorebook shifts every index, and
        // fast-json-patch emits several ops per shifted entry. At ~30k
        // entries that exceeds V8's spread-argument limit, so the old code
        // threw RangeError before this was converted to an iterating push.
        const entries = Array.from({ length: 30000 }, (_, k) => ({
            key: `key-${k}`,
            secondkey: `second-${k}`,
            comment: `comment ${k}`,
            content: `content for entry ${k}`,
            insertorder: k,
        }))
        const db = dbWith([chr('a', { globalLore: entries })])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db)
        changed.characters[0].globalLore.splice(0, 1)
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), character: ['a'] })
        expect(patch.length).toBeGreaterThan(0)
        for (const op of patch) {
            expect(op.path.startsWith('/characters/0')).toBe(true)
        }
    }, 15_000)

    test('character lorebook edit round-trips through applyPatch', async () => {
        const { applyPatch: apply } = await import('fast-json-patch')
        const entries = Array.from({ length: 50 }, (_, k) => ({
            key: `key-${k}`, content: `content ${k}`, insertorder: k,
        }))
        const db = dbWith([chr('a', { globalLore: entries })])
        const p = new RisuSavePatcher()
        await p.init(db)

        const changed = clone(db)
        changed.characters[0].globalLore.splice(3, 1)
        changed.characters[0].globalLore[0].content = 'edited'
        const { patch } = await p.set(clone(changed), { ...emptyToSave(), character: ['a'] })

        const serverState = JSON.parse(JSON.stringify(normalizeJSON(db)))
        apply(serverState, patch)
        expect(serverState.characters[0].globalLore).toEqual(normalizeJSON(clone(changed)).characters[0].globalLore)
    })

    test('non-string module ids (1 vs "1") force the structural path — no key collision', async () => {
        const db = dbWith([chr('a')], { } as any)
        db.modules = [{ ...mod('x'), id: 1 as any }, { ...mod('y'), id: '1' }]
        const live = new RisuSavePatcher()
        await live.init(db)

        // Numeric id → structural fallback: whole-array replace, never element-wise.
        const s1 = clone(db); s1.modules[0].lorebook[0].content = 'edited'
        const r1 = await live.set(clone(s1), { ...emptyToSave(), modules: true })
        expect(r1.patch.length).toBe(1)
        expect(r1.patch[0].path).toBe('/modules')

        const liveHash = (await live.set(clone(s1), emptyToSave())).expectedHash
        const fresh = new RisuSavePatcher()
        await fresh.init(clone(s1))
        const freshHash = (await fresh.set(clone(s1), emptyToSave())).expectedHash
        expect(liveHash).toBe(freshHash)
    })
})

describe('RisuSavePatcher.set acknowledgement boundary', () => {
    test('rollback restores the previous hash and diff baseline after a rejected patch', async () => {
        const db = dbWith([chr('a')])
        const changed = clone(db)
        changed.personaPrompt = 'changed after the initial sync'

        const patcher = new RisuSavePatcher()
        await patcher.init(clone(db))

        const first = await patcher.set(clone(changed), { ...emptyToSave(), root: true })
        expect(first.patch.length).toBeGreaterThan(0)

        first.rollback()
        first.rollback() // idempotent for catch/finally callers

        const retry = await patcher.set(clone(changed), { ...emptyToSave(), root: true })
        expect(retry.expectedHash).toBe(first.expectedHash)
        expect(retry.patch).toEqual(first.patch)

        // Leaving the second prepared patch in place represents a successful
        // acknowledgement; the next identical save should then be a no-op.
        const afterAcknowledgement = await patcher.set(clone(changed), { ...emptyToSave(), root: true })
        expect(afterAcknowledgement.patch).toEqual([])
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Baseline restructure (see docs/POCKETRISU-SAVE-SYNC-BASELINE-RESTRUCTURE.md)
//
// Client/server hash agreement is the patch protocol: POST /api/patch is only
// accepted when patcher.hash() equals calculateHash() of the server document.
// These tests model the server with a document copy that applies every
// accepted patch exactly like server.cjs does (validating applyPatch, then
// normalizeJSON) and hashes it with the installed server/node/utils.cjs.
// ──────────────────────────────────────────────────────────────────────────

const { createRequire: baselineCreateRequire } = await import('module')
const serverUtils = baselineCreateRequire(import.meta.url)('../../../server/node/utils.cjs')

const serverHashOf = (doc: any): string => serverUtils.calculateHash(doc).toString(16)
const snapshotServerHash = (p: any): string =>
    serverUtils.calculateHash(serverUtils.normalizeJSON(p.baselineSnapshot())).toString(16)

class ServerCopy {
    doc: any
    constructor(patcher: any) {
        this.doc = structuredClone(patcher.baselineSnapshot())
    }
    hash() { return serverHashOf(this.doc) }
    /** Same call shape as server.cjs: validate, mutate, ban prototype edits. */
    apply(patch: any[]) {
        const snapshot = structuredClone(this.doc)
        // clone ops so server mutation can never alias patcher-owned values
        const result = applyPatch(snapshot, structuredClone(patch), true, true, true)
        this.doc = serverUtils.normalizeJSON(result.newDocument)
    }
}

const bsToSave = (over: any = {}) => ({ ...emptyToSave(), ...over })
const bsChar = (chaId: any, extra: any = {}) => ({ chaId, name: `n-${String(chaId)}`, chats: [], ...extra })
const rawLast = (p: any) => p.lastSyncedDb

/** Run one save against the server copy; returns what was observed. */
async function bsSave(p: any, srv: ServerCopy, data: any, toSave: any, accept = true) {
    const r = await p.set(structuredClone(data), toSave)
    const expectedMatchesServer = r.expectedHash === srv.hash()
    if (accept) {
        srv.apply(r.patch)
    } else {
        r.rollback()
    }
    return { ...r, expectedMatchesServer }
}

describe('baseline restructure — A: absent (undefined) keys', () => {
    test('A1 init with undefined-valued root keys: key absent, hash equals server hash', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, gone: undefined, characters: [], botPresets: undefined, modules: undefined })
        const db = rawLast(p)
        expect(Object.hasOwn(db, 'gone')).toBe(false)
        expect(Object.hasOwn(db, 'botPresets')).toBe(false)
        expect(Object.hasOwn(db, 'modules')).toBe(false)
        expect(p.hash()).toBe(snapshotServerHash(p))
        expect(p.hash()).not.toBe('0')
    })

    test('A1b after set() on a baseline without botPresets/modules the keys stay absent', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const srv = new ServerCopy(p)
        const r = await bsSave(p, srv, { a: 1, characters: [] }, bsToSave({ root: true }))
        expect(r.patch).toEqual([])
        const db = rawLast(p)
        expect(Object.hasOwn(db, 'botPresets')).toBe(false)
        expect(Object.hasOwn(db, 'modules')).toBe(false)
        expect(p.hash()).toBe(srv.hash())
        expect(p.hash()).toBe(snapshotServerHash(p))
        expect(p.hash()).not.toBe('0')
    })

    test('A2 (guard) root key changed to undefined keeps current behavior: replace with null, applies, hashes equal', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, b: 2, characters: [], botPresets: [], modules: [] })
        const srv = new ServerCopy(p)
        const r = await bsSave(p, srv, { a: 1, b: undefined, characters: [], botPresets: [], modules: [] }, bsToSave({ root: true }))
        expect(r.expectedMatchesServer).toBe(true)
        expect(r.patch).toEqual([{ op: 'replace', path: '/b', value: null }])
        expect(srv.doc.b).toBeNull()
        expect(p.hash()).toBe(srv.hash())
        expect(p.hash()).toBe(snapshotServerHash(p))
    })

    test('A3 (guard) undefined in baseline input and in data: stable across identical set() calls', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, x: undefined, characters: [], botPresets: [], modules: [] })
        const srv = new ServerCopy(p)
        const data = { a: 1, x: undefined, characters: [], botPresets: [], modules: [] }
        const toSave = bsToSave({ root: true })

        const r1 = await bsSave(p, srv, data, toSave)
        expect(r1.expectedMatchesServer).toBe(true)
        expect(r1.patch).toEqual([{ op: 'add', path: '/x', value: null }])
        expect(p.hash()).toBe(srv.hash())
        const hashAfterFirst = p.hash()

        const r2 = await bsSave(p, srv, data, toSave)
        expect(r2.expectedMatchesServer).toBe(true)
        expect(r2.expectedHash).toBe(hashAfterFirst)
        expect(r2.patch).toEqual([])
        expect(p.hash()).toBe(hashAfterFirst)
        expect(p.hash()).toBe(srv.hash())
        expect(p.hash()).toBe(snapshotServerHash(p))
    })

    test('A3b toSave flags on undefined botPresets/modules do not break the hash', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const before = p.hash()
        const srv = new ServerCopy(p)
        const r = await bsSave(
            p, srv,
            { a: 1, characters: [], botPresets: undefined, modules: undefined },
            bsToSave({ root: true, botPreset: true, modules: true }),
        )
        expect(p.hash()).toBe(srv.hash())
        expect(p.hash()).toBe(snapshotServerHash(p))
        expect(p.hash()).not.toBe('0')
        expect(r.expectedHash).toBe(before)
    })
})

describe('baseline restructure — B: character identity edge cases', () => {
    async function drive(initial: any, steps: { data: any; toSave: any }[]) {
        const p = new RisuSavePatcher()
        await p.init(structuredClone(initial))
        const srv = new ServerCopy(p)
        expect(p.hash()).toBe(srv.hash())
        for (const [i, s] of steps.entries()) {
            const r = await bsSave(p, srv, s.data, s.toSave)
            expect(r.expectedMatchesServer, `step ${i} expectedHash vs server`).toBe(true)
            expect(p.hash(), `step ${i} client vs server hash`).toBe(srv.hash())
            expect(p.hash(), `step ${i} client vs snapshot hash`).toBe(snapshotServerHash(p))
            expect(p.hash()).not.toBe('0')
        }
        return { p, srv }
    }

    test('B1 characters without chaId', async () => {
        const c = (name: string) => ({ name, chats: [] })
        await drive(
            { a: 1, botPresets: [], modules: [], characters: [c('x'), c('y')] },
            [
                { data: { a: 1, botPresets: [], modules: [], characters: [c('x2'), c('y')] }, toSave: bsToSave() },
                { data: { a: 1, botPresets: [], modules: [], characters: [c('x2'), c('y'), c('z')] }, toSave: bsToSave() },
                { data: { a: 1, botPresets: [], modules: [], characters: [c('y'), c('z')] }, toSave: bsToSave() },
            ],
        )
    })

    test('B2 duplicate chaId', async () => {
        await drive(
            { a: 1, botPresets: [], modules: [], characters: [bsChar('x', { name: '1' }), bsChar('x', { name: '2' })] },
            [
                {
                    data: { a: 1, botPresets: [], modules: [], characters: [bsChar('x', { name: '1' }), bsChar('x', { name: '2b' })] },
                    toSave: bsToSave({ character: ['x'] }),
                },
                {
                    data: { a: 1, botPresets: [], modules: [], characters: [bsChar('x', { name: '1b' }), bsChar('x', { name: '2b' })] },
                    toSave: bsToSave({ character: ['x'] }),
                },
                {
                    data: { a: 1, botPresets: [], modules: [], characters: [bsChar('x', { name: '2b' })] },
                    toSave: bsToSave(),
                },
            ],
        )
    })

    for (const name of ['formatversion', 'characters', 'modules']) {
        test(`B3 chaId equal to root key name "${name}"`, async () => {
            const root = { a: 1, formatversion: 3, modules: [{ id: 'm1', v: 1 }] }
            await drive(
                { ...root, characters: [bsChar(name), bsChar('k')] },
                [
                    { data: { ...root, characters: [bsChar(name, { name: 'edit' }), bsChar('k')] }, toSave: bsToSave({ character: [name] }) },
                    { data: { ...root, characters: [bsChar('k')] }, toSave: bsToSave() },
                    { data: { ...root, characters: [bsChar('k'), bsChar(name)] }, toSave: bsToSave() },
                ],
            )
        })
    }

    test('B4 reorder, middle delete, insert at front, all with unique ids', async () => {
        const A = bsChar('A'), B = bsChar('B'), C = bsChar('C'), D = bsChar('D')
        const N = bsChar('N')
        await drive(
            { a: 1, botPresets: [], modules: [], characters: [A, B, C, D] },
            [
                { data: { a: 1, botPresets: [], modules: [], characters: [D, C, B, A] }, toSave: bsToSave() },
                { data: { a: 1, botPresets: [], modules: [], characters: [D, B, A] }, toSave: bsToSave() },
                { data: { a: 1, botPresets: [], modules: [], characters: [N, D, B, A] }, toSave: bsToSave() },
                { data: { a: 1, botPresets: [], modules: [], characters: [N, D, bsChar('B', { name: 'edited' }), A] }, toSave: bsToSave({ character: ['B'] }) },
            ],
        )
    })
})

describe('baseline restructure — C: absent botPresets / modules', () => {
    test('C1 botPresets absent in baseline: patch uses add and applies cleanly', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const srv = new ServerCopy(p)
        const presets = [{ id: 'p1', v: 1 }]
        const r = await bsSave(p, srv, { a: 1, characters: [], botPresets: presets }, bsToSave({ botPreset: true }))
        expect(r.expectedMatchesServer).toBe(true)
        expect(r.patch).toEqual([{ op: 'add', path: '/botPresets', value: presets }])
        expect(srv.doc.botPresets).toEqual(presets)
        expect(p.hash()).toBe(srv.hash())
    })

    test('C1 modules absent in baseline: patch uses add and applies cleanly', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const srv = new ServerCopy(p)
        const mods = [{ id: 'm1', v: 1 }, { id: 'm2', v: 2 }]
        const r = await bsSave(p, srv, { a: 1, characters: [], modules: mods }, bsToSave({ modules: true }))
        expect(r.expectedMatchesServer).toBe(true)
        expect(r.patch).toEqual([{ op: 'add', path: '/modules', value: mods }])
        expect(srv.doc.modules).toEqual(mods)
        expect(p.hash()).toBe(srv.hash())
    })

    test('C1 both absent, added together; later edits patch element-wise', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const srv = new ServerCopy(p)
        const presets = [{ id: 'p1', v: 1 }]
        const mods = [{ id: 'm1', v: 1 }]
        const r1 = await bsSave(p, srv, { a: 1, characters: [], botPresets: presets, modules: mods }, bsToSave({ botPreset: true, modules: true }))
        expect(r1.patch.map((o: any) => o.op)).toEqual(['add', 'add'])
        expect(p.hash()).toBe(srv.hash())
        const r2 = await bsSave(
            p, srv,
            { a: 1, characters: [], botPresets: [{ id: 'p1', v: 2 }], modules: [{ id: 'm1', v: 2 }] },
            bsToSave({ botPreset: true, modules: true }),
        )
        expect(r2.expectedMatchesServer).toBe(true)
        expect(r2.patch).toEqual([
            { op: 'replace', path: '/botPresets/0/v', value: 2 },
            { op: 'replace', path: '/modules/0/v', value: 2 },
        ])
        expect(p.hash()).toBe(srv.hash())
    })

    test('C2 present keys: patch shape is unchanged (guard)', async () => {
        const base = {
            a: 1,
            characters: [],
            botPresets: [{ id: 'p1', v: 1 }],
            modules: [{ id: 'm1', v: 1 }],
        }
        const p = new RisuSavePatcher()
        await p.init(structuredClone(base))
        const srv = new ServerCopy(p)

        // same structure → element-wise
        const r1 = await bsSave(p, srv, { ...base, botPresets: [{ id: 'p1', v: 2 }], modules: [{ id: 'm1', v: 2 }] }, bsToSave({ botPreset: true, modules: true }))
        expect(r1.patch).toEqual([
            { op: 'replace', path: '/botPresets/0/v', value: 2 },
            { op: 'replace', path: '/modules/0/v', value: 2 },
        ])
        expect(p.hash()).toBe(srv.hash())

        // structural → whole-array replace (key present, so replace is valid)
        const r2 = await bsSave(
            p, srv,
            { ...base, botPresets: [{ id: 'p1', v: 2 }, { id: 'p2', v: 1 }], modules: [{ id: 'm1', v: 2 }, { id: 'm2', v: 1 }] },
            bsToSave({ botPreset: true, modules: true }),
        )
        expect(r2.patch).toEqual([
            { op: 'replace', path: '/botPresets', value: [{ id: 'p1', v: 2 }, { id: 'p2', v: 1 }] },
            { op: 'replace', path: '/modules', value: [{ id: 'm1', v: 2 }, { id: 'm2', v: 1 }] },
        ])
        expect(p.hash()).toBe(srv.hash())
    })

    test('C2 present but empty arrays: structural change still uses replace (guard)', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [], botPresets: [], modules: [] })
        const srv = new ServerCopy(p)
        const r = await bsSave(
            p, srv,
            { a: 1, characters: [], botPresets: [{ id: 'p1' }], modules: [{ id: 'm1' }] },
            bsToSave({ botPreset: true, modules: true }),
        )
        expect(r.patch).toEqual([
            { op: 'replace', path: '/botPresets', value: [{ id: 'p1' }] },
            { op: 'replace', path: '/modules', value: [{ id: 'm1' }] },
        ])
        expect(p.hash()).toBe(srv.hash())
    })

    test('C3 add then rollback: key absent, hash restored, next set emits add again', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1, characters: [] })
        const initialHash = p.hash()
        const initialSnapshot = p.baselineSnapshot()
        const data = { a: 1, characters: [], botPresets: [{ id: 'p1', v: 1 }], modules: [{ id: 'm1' }] }
        const toSave = bsToSave({ botPreset: true, modules: true })

        const first = await p.set(structuredClone(data), toSave)
        expect(first.patch.every((o: any) => o.op === 'add')).toBe(true)
        first.rollback()

        expect(Object.hasOwn(rawLast(p), 'botPresets')).toBe(false)
        expect(Object.hasOwn(rawLast(p), 'modules')).toBe(false)
        expect(p.hash()).toBe(initialHash)
        expect(p.baselineSnapshot()).toEqual(initialSnapshot)

        const second = await p.set(structuredClone(data), toSave)
        expect(second.patch).toEqual(first.patch)
        expect(second.expectedHash).toBe(first.expectedHash)
        expect(second.patch.every((o: any) => o.op === 'add')).toBe(true)
    })
})

describe('baseline restructure — D: rollback consistency', () => {
    const baseDb = () => ({
        a: 1,
        b: 'x',
        characters: [
            bsChar('c1', { name: 'one' }),
            bsChar('c2', { name: 'two' }),
            bsChar('c3', { name: 'three' }),
        ],
        botPresets: [{ id: 'p1', v: 1 }],
        modules: [{ id: 'm1', v: 1 }],
    })
    const composite = () => ({
        a: 2,
        b: 'x',
        c: 'new-root-key',
        characters: [
            bsChar('c1', { name: 'one-edited' }),
            bsChar('c3', { name: 'three' }),
            bsChar('c4', { name: 'four' }),
        ],
        botPresets: [{ id: 'p1', v: 5 }],
        modules: [{ id: 'm1', v: 5 }, { id: 'm2', v: 1 }],
    })
    const allSave = () => bsToSave({ root: true, botPreset: true, modules: true, character: ['c1'] })

    test('D1 composite set then rollback restores hash and snapshot; repeating is identical', async () => {
        const p = new RisuSavePatcher()
        await p.init(baseDb())
        const hash0 = p.hash()
        const snap0 = p.baselineSnapshot()

        const first = await p.set(composite(), allSave())
        expect(first.patch.length).toBeGreaterThan(0)
        expect(p.hash()).not.toBe(hash0)
        first.rollback()

        expect(p.hash()).toBe(hash0)
        expect(p.baselineSnapshot()).toEqual(snap0)

        const second = await p.set(composite(), allSave())
        expect(second.patch).toEqual(first.patch)
        expect(second.expectedHash).toBe(first.expectedHash)

        // and the accepted result is consistent with a server copy
        const srv = new ServerCopy(p)
        expect(p.hash()).toBe(snapshotServerHash(p))
        expect(p.hash()).toBe(srv.hash())
    })

    test('D3 save1 ok, save2 rolled back, save3 is based on save1 only', async () => {
        const p = new RisuSavePatcher()
        await p.init(baseDb())
        const srv = new ServerCopy(p)

        const data1 = { ...baseDb(), a: 10 }
        const s1 = await bsSave(p, srv, data1, bsToSave({ root: true }))
        expect(s1.expectedMatchesServer).toBe(true)
        expect(p.hash()).toBe(srv.hash())

        const s2 = await bsSave(p, srv, composite(), allSave(), false)
        expect(s2.patch.length).toBeGreaterThan(0)
        // server never saw save2
        expect(p.hash()).toBe(srv.hash())

        const final = { ...composite(), a: 11 }
        const s3 = await bsSave(p, srv, final, allSave())
        expect(s3.expectedHash).toBe(s2.expectedHash)
        expect(s3.expectedMatchesServer).toBe(true)
        expect(srv.doc).toEqual(serverUtils.normalizeJSON(final))
        expect(p.hash()).toBe(srv.hash())
        expect(p.hash()).toBe(snapshotServerHash(p))
    })
})

describe('baseline restructure — E: public surface', () => {
    test('E1 mutating baselineSnapshot() output does not change patcher state', async () => {
        const p = new RisuSavePatcher()
        const db = {
            a: { deep: [1, 2] },
            characters: [bsChar('c1', { chats: [{ id: 'x', name: 'chat', message: [] }] })],
            botPresets: [{ id: 'p1' }],
            modules: [{ id: 'm1' }],
        }
        await p.init(structuredClone(db))
        const hash0 = p.hash()
        const snap = p.baselineSnapshot()
        const pristine = structuredClone(snap)

        snap.a.deep.push(99)
        delete snap.modules
        snap.characters[0].name = 'tampered'
        snap.characters.push({ chaId: 'zzz' })
        snap.botPresets[0].id = 'tampered'
        snap.extra = true

        expect(p.hash()).toBe(hash0)
        expect(p.baselineSnapshot()).toEqual(pristine)
        const r = await p.set(structuredClone(db), bsToSave({ root: true, botPreset: true, modules: true, character: ['c1'] }))
        expect(r.patch).toEqual([])
    })

    test('E1 lastSyncedDb keeps the shape read by external code', async () => {
        const p = new RisuSavePatcher()
        const chat = { id: 'x', name: 'chat', message: [] }
        await p.init({
            a: 1,
            characters: [bsChar('c1', { chats: [chat] }), bsChar('c2')],
            botPresets: [{ id: 'p1' }],
            modules: [{ id: 'm1' }],
        })
        const check = (expectedA: number) => {
            const db = rawLast(p)
            expect(Array.isArray(db.characters)).toBe(true)
            expect(db.characters[0].chaId).toBe('c1')
            expect(Array.isArray(db.characters[0].chats)).toBe(true)
            expect(db.characters[0].chats[0].id).toBe('x')
            expect(Array.isArray(db.botPresets)).toBe(true)
            expect(Array.isArray(db.modules)).toBe(true)
            expect(db.a).toBe(expectedA)
            // personal-settings clones lastSyncedDb
            expect(() => structuredClone(db)).not.toThrow()
            expect(JSON.parse(JSON.stringify(db))).toEqual(p.baselineSnapshot())
        }
        check(1)
        await p.set(
            {
                a: 2,
                characters: [bsChar('c1', { name: 'edited', chats: [chat] }), bsChar('c2')],
                botPresets: [{ id: 'p1', v: 1 }],
                modules: [{ id: 'm1', v: 1 }],
            },
            bsToSave({ root: true, botPreset: true, modules: true, character: ['c1'] }),
        )
        expect(rawLast(p).a).toBe(2)
        expect(rawLast(p).characters[0].name).toBe('edited')
        check(2)
    })

    test('E1 lastSyncedDb characters is an array even when init data has none', async () => {
        const p = new RisuSavePatcher()
        await p.init({ a: 1 })
        expect(rawLast(p).characters).toEqual([])
        expect(Object.hasOwn(rawLast(p), 'botPresets')).toBe(false)
        expect(Object.hasOwn(rawLast(p), 'modules')).toBe(false)
    })
})

describe('baseline restructure — F: seeded fuzz equivalence with the server', () => {
    function mulberry32(seed: number) {
        let a = seed >>> 0
        return () => {
            a = (a + 0x6d2b79f5) >>> 0
            let t = a
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    function makeGen(R: () => number) {
        const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)]
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'formatversion', 'modules', 'characters']
        const genChar = () => {
            const m = R()
            const chaId = m < 0.1 ? undefined : m < 0.2 ? 'dup' : pick(ids)
            return {
                chaId,
                name: 'n' + Math.floor(R() * 3),
                chats: R() < 0.8 ? [{ id: 'c1', name: 'x', message: [{ d: Math.floor(R() * 3) }], lastDate: 1 }] : undefined,
            }
        }
        const genDb = () => {
            const d: any = {}
            if (R() < 0.85) d.characters = Array.from({ length: Math.floor(R() * 4) }, genChar)
            if (R() < 0.7) d.botPresets = Array.from({ length: Math.floor(R() * 3) }, (_, i) => ({ id: R() < 0.9 ? 'p' + i : '', v: Math.floor(R() * 3) }))
            if (R() < 0.7) d.modules = Array.from({ length: Math.floor(R() * 3) }, (_, i) => ({ id: R() < 0.9 ? 'm' + i : undefined, v: Math.floor(R() * 3) }))
            if (R() < 0.5) d.formatversion = pick([3, 4])
            for (const k of ['foo', 'bar', 'baz'])
                if (R() < 0.5) d[k] = pick<any>([1, 's', { a: 1 }, [1, 2], null, undefined, true, 2.5])
            return d
        }
        const genToSave = () => ({
            character: R() < 0.3 ? ['a', 'b', 'dup'] : [],
            chat: [] as [string, string][],
            root: R() < 0.5,
            botPreset: R() < 0.5,
            modules: R() < 0.5,
            plugins: false,
            pluginCustomStorage: false,
        })
        return { genDb, genToSave }
    }

    test('F1 2,000 seeded init/set/rollback sequences: hashes equal the server and patches apply', async () => {
        const SEQUENCES = 2000
        const failures: Record<string, number> = {}
        const samples: string[] = []
        const fail = (kind: string, seq: number, step: string, info = '') => {
            failures[kind] = (failures[kind] ?? 0) + 1
            if (samples.length < 8) samples.push(`${kind} seq=${seq} ${step} ${info}`)
        }

        for (let seq = 0; seq < SEQUENCES; seq++) {
            const R = mulberry32(0x5eed0000 + seq)
            const { genDb, genToSave } = makeGen(R)
            const base = genDb()
            const p = new RisuSavePatcher()
            await p.init(structuredClone(base))
            const srv = new ServerCopy(p)

            const check = (step: string) => {
                const client = p.hash()
                const viaSnapshot = snapshotServerHash(p)
                if (client !== viaSnapshot) fail('hash!=serverHash(baselineSnapshot)', seq, step, `${client} vs ${viaSnapshot}`)
                if (client === '0') fail('hash is "0"', seq, step)
                if (client !== srv.hash()) fail('client!=server copy', seq, step, `${client} vs ${srv.hash()}`)
            }
            check('init')

            const steps = 1 + Math.floor(R() * 4)
            for (let k = 0; k < steps; k++) {
                const data = R() < 0.5 ? structuredClone(base) : genDb()
                if (!data.characters) data.characters = []
                const toSave = genToSave()
                let r: any
                try {
                    r = await p.set(structuredClone(data), toSave)
                } catch (e: any) {
                    fail('set threw', seq, `set${k}`, String(e?.message ?? e).slice(0, 80))
                    break
                }
                if (r.expectedHash !== srv.hash()) fail('expectedHash!=server copy', seq, `set${k}`, `${r.expectedHash} vs ${srv.hash()}`)
                const rollbackIt = R() < 0.3
                if (rollbackIt) {
                    r.rollback()
                } else {
                    try {
                        srv.apply(r.patch)
                    } catch (e: any) {
                        fail('patch apply error', seq, `set${k}`, String(e?.message ?? e).slice(0, 80))
                        break
                    }
                }
                check(rollbackIt ? `rb${k}` : `set${k}`)
            }
        }

        expect({ failures, samples }).toEqual({ failures: {}, samples: [] })
    }, 60_000)
})
