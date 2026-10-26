'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const manifest = require('../patches/kei-prompt-role-compat-core/manifest.cjs')
const meta = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog, resolveProfile } = require('../src/catalog.cjs')
const { packEtag, unitMatchesTarget } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')
const { evaluateTargetCompatibility } = require('../src/compatibility.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-prompt-role-compat-core')
const targetTest = fs.readFileSync(
    path.join(patchRoot, 'files/src/ts/storage/promptRoleCompatibility.test.ts'),
    'utf8',
)
const target1161 = { packageName: 'pocketrisu', packageVersion: '1.16.1' }
const unitText = (unit) => unit.managed ?? unit.content ?? ''

function withTarget(version, fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-role-target-'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pocketrisu', version }))
    try {
        return fn(root)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

test.describe('[E2-1c] Make the six E2-1b packs 1.16.1-only', () => {
    test('[new] K04 is version 0.1.3 with only unscoped 1.16.1 payload', () => {
        const catalog = loadCatalog()
        assert.equal(manifest.id, 'kei-prompt-role-compat-core')
        assert.equal(manifest.version, '0.1.3')
        assert.equal(manifest.userSelectable, false)
        assert.deepEqual(manifest.targets, {
            pocketrisu: {
                verified: [],
                reviewing: ['1.16.1'],
            },
        })
        assert.equal(manifest.units.every((unit) => !Object.hasOwn(unit, 'targetVersions')), true)
        assert.equal(meta.version, '0.13.0')
        assert.equal(meta.requires.includes(manifest.id), true)
        assert.equal(resolveProfile('all', catalog).defaults.includes(meta.id), true)

        const resolution = resolveSelection(catalog, [meta.id])
        assert.equal(resolution.dependencyAdded.includes(manifest.id), true)
        assert.equal(resolution.resolvedIds.includes(manifest.id), true)
        assert.throws(
            () => resolveSelection(catalog, [manifest.id]),
            (error) => error.code === 'INTERNAL_PACK_REQUESTED',
        )
    })

    test('[unchanged] K04 rejects 1.8.1 at pack level and selects its complete normalizer graph on 1.16.1', () => {
        withTarget('1.8.1', (root) => {
            const result = evaluateTargetCompatibility(root, [manifest])
            assert.equal(result.status, 'review-required')
            assert.deepEqual(result.reviewRequiredPacks.map(({ id }) => id), [manifest.id])
        })
        const active = manifest.units.filter((unit) => unitMatchesTarget(unit, target1161))
        assert.equal(active.length, 3)
        assert.deepEqual(
            [...new Set(active.map((unit) => unit.file))],
            [
                'src/ts/storage/database.svelte.ts',
                'src/ts/storage/promptRoleCompatibility.test.ts',
            ],
        )
        assert.equal(active.filter((unit) => unit.type === 'owned').length, 1)
        assert.equal(active.filter((unit) => unit.type === 'replace').length, 2)
    })
})

test('the compatibility branch gives non-null role2 strict precedence', () => {
    const combined = manifest.units.map(unitText).join('\n')

    assert.match(combined, /export function normalizePromptTemplate/)
    assert.match(combined, /if\(item\.role2 !== undefined && item\.role2 !== null\)/)
    assert.match(combined, /else if\(item\.role !== undefined && item\.role !== null\)/)
    assert.match(combined, /item\.role2 = normalizePromptRole\(item\.role2\) \?\? 'system'/)
    assert.match(combined, /item\.role2 = normalizePromptRole\(item\.role\) \?\? 'system'/)
    assert.equal(combined.indexOf('normalizePromptRole(item.role2)'), combined.lastIndexOf('normalizePromptRole(item.role2)'))
    assert.doesNotMatch(combined, /case 'lorebook'/)
    assert.doesNotMatch(combined, /item\.role\s*=/)
})

test('the target test covers native precedence, aliases, null fallback, and lorebook exclusion', () => {
    assert.match(targetTest, /prefers native role2 over legacy role/)
    assert.match(targetTest, /invalid but present native role2 does not fall through/)
    assert.match(targetTest, /\['assistant', 'bot'\]/)
    assert.match(targetTest, /\['char', 'bot'\]/)
    assert.match(targetTest, /uses frozen legacy role when role2 is absent or null/)
    assert.match(targetTest, /test\.each\(typedPromptTypes\)/)
    assert.match(targetTest, /lorebook role data remains outside typed-role normalization/)
    assert.match(targetTest, /not\.toHaveProperty\('role2'\)/)
})

test('K04 managed graph changes are reflected in its ETag', () => {
    const pack = loadCatalog().find((candidate) => candidate.id === manifest.id)
    const original = packEtag(pack)

    assert.notEqual(packEtag({
        ...pack,
        units: pack.units.map((unit, index) => index === 1
            ? { ...unit, managed: `${unit.managed}\n` }
            : unit),
    }), original)
    assert.equal(packEtag(pack), original)
})
