'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const manifest = require('../patches/bg-preserve/manifest.cjs')
const importedManifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../patches/bg-preserve.json'),
    'utf8',
))
const { unitMatchesTarget } = require('../src/manager.cjs')

const target181 = { packageName: 'pocketrisu', packageVersion: '1.8.1' }
const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }
const targetTestPath = path.join(
    __dirname,
    '../patches/bg-preserve/files/src/ts/process/regexImportMultiplicity.test.ts',
)
const targetTest = fs.readFileSync(targetTestPath, 'utf8')

function unit(id) {
    const found = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('K23-F01 versions the existing BG regex owner without a new pack or schema', () => {
    assert.equal(manifest.id, 'bg-preserve')
    assert.equal(manifest.version, 'v1.0.1-patcher.2')

    const merge181 = unit('bg-preserve:hook:regex-import-merge')
    const merge190 = unit('bg-preserve:hook:regex-import-merge:1.9')
    assert.equal(unitMatchesTarget(merge181, target181), true)
    assert.equal(unitMatchesTarget(merge181, target190), false)
    assert.equal(unitMatchesTarget(merge190, target181), false)
    assert.equal(unitMatchesTarget(merge190, target190), true)
    assert.equal(merge190.file, 'src/ts/process/scripts.ts')
    const importedMerge = importedManifest.units.find(
        (candidate) => candidate.id === 'bg-preserve:hook:regex-import-merge',
    )
    assert.ok(importedMerge, 'missing imported 1.8.1 regex merge unit')
    const { targetVersions, ...merge181Payload } = merge181
    assert.deepEqual(merge181Payload, importedMerge)
    assert.deepEqual(targetVersions, { pocketrisu: ['1.8.1'] })
    assert.match(merge181.managed, /new Map<string, customscript>\(\)/)
    assert.doesNotMatch(merge181.managed, /candidates\.find/)
    assert.match(merge190.managed, /new Map<string, customscript\[\]>\(\)/)
    assert.match(merge190.managed, /candidates\.find/)
    assert.match(merge190.managed, /every\(\(mode\) => !incomingSet\.has\(mode\)\)/)
    assert.match(merge190.managed, /candidates\.push\(copy\)/)
    assert.doesNotMatch(merge190.managed, /groupId|identity|multi-object/)
})

test('K23-F01 keeps types[] canonical and leaves export splitting unchanged', () => {
    const merge = unit('bg-preserve:hook:regex-import-merge:1.9')
    const exportSplit = unit('bg-preserve:hook:regex-export-split')

    assert.match(merge.managed, /existing\.types = merged/)
    assert.match(merge.managed, /copy\.types = incoming/)
    assert.match(exportSplit.managed, /delete copy\.types/)
    assert.match(exportSplit.managed, /flat\.push\(\{ \.\.\.copy, type: m \}\)/)
})

test('K23-F01 target fixture covers disjoint merge, overlap split, order, and export', () => {
    const ownedTest = unit('bg-preserve:owned:src/ts/process/regexImportMultiplicity.test.ts:1.9')

    assert.equal(ownedTest.type, 'owned')
    assert.equal(unitMatchesTarget(ownedTest, target181), false)
    assert.equal(unitMatchesTarget(ownedTest, target190), true)
    assert.deepEqual(ownedTest.requires, ['bg-preserve:hook:regex-import-merge:1.9'])
    assert.equal(ownedTest.content, targetTest)
    assert.match(targetTest, /merges equal-key records only when their directions are disjoint/)
    assert.match(targetTest, /keeps same-direction duplicates as separate canonical rows/)
    assert.match(targetTest, /starts a new row when any incoming direction overlaps/)
    assert.match(targetTest, /preserves multiplicity through vanilla export/)
    assert.match(targetTest, /expect\(roundTrip\)\.toEqual\(result\)/)
    assert.match(targetTest, /executes every preserved same-direction row exactly once/)
    assert.match(targetTest, /expect\(processed\.data\)\.toBe\('aaaa'\)/)
    assert.match(targetTest, /does not merge into pre-existing target rows or across different keys/)
})
