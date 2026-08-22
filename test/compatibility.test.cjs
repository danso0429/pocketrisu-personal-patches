'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    assertTargetReviewable,
    assertTargetVerified,
    evaluateTargetCompatibility,
} = require('../src/compatibility.cjs')
const { loadCatalog } = require('../src/catalog.cjs')

function withRoot(version, fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-target-'))
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'pocketrisu', version }),
    )
    try {
        return fn(root)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

const pack = {
    id: 'example',
    version: '1.0.0',
    targets: {
        pocketrisu: {
            verified: ['1.8.1'],
        },
    },
    units: [],
}

test('exactly qualified targets are verified', () => withRoot('1.8.1', (root) => {
    const result = evaluateTargetCompatibility(root, [pack])
    assert.equal(result.status, 'verified')
    assert.doesNotThrow(() => assertTargetVerified(result))
}))

test('a structurally plausible new target still requires maintainer review', () =>
    withRoot('1.8.2', (root) => {
        const result = evaluateTargetCompatibility(root, [pack])
        assert.equal(result.status, 'review-required')
        assert.throws(
            () => assertTargetVerified(result),
            (error) => error.code === 'TARGET_REVIEW_REQUIRED'
                && error.details.packs[0] === 'example',
        )
    }))

test('only the private maintainer gate may stage an explicitly reviewing target', () =>
    withRoot('1.8.2', (root) => {
        const result = evaluateTargetCompatibility(root, [{
            ...pack,
            targets: {
                pocketrisu: {
                    verified: ['1.8.1'],
                    reviewing: ['1.8.2'],
                },
            },
        }])
        assert.equal(result.status, 'under-review')
        assert.throws(
            () => assertTargetVerified(result),
            (error) => error.code === 'TARGET_REVIEW_REQUIRED',
        )
        assert.doesNotThrow(() => assertTargetReviewable(result))
    }))

test('packs qualified on PocketRisu 1.9.0 remain explicitly verified', () =>
    withRoot('1.9.0', (root) => {
        const catalog = loadCatalog()
        const eligible = catalog.filter((entry) =>
            entry.targets.pocketrisu.verified.includes('1.9.0')
            || entry.targets.pocketrisu.reviewing.includes('1.9.0')
        )
        const expectedVerified = eligible
            .filter((entry) => entry.targets.pocketrisu.verified.includes('1.9.0'))
            .map((entry) => entry.id)
        const expectedReviewing = eligible
            .filter((entry) => entry.targets.pocketrisu.reviewing.includes('1.9.0'))
            .map((entry) => entry.id)
        const result = evaluateTargetCompatibility(root, eligible)
        assert.deepEqual(expectedReviewing, [])
        assert.equal(result.status, 'verified')
        assert.deepEqual(
            result.verifiedPacks.map((entry) => entry.id),
            expectedVerified,
        )
        assert.deepEqual(
            result.underReviewPacks.map((entry) => entry.id),
            expectedReviewing,
        )
        assert.deepEqual(result.reviewRequiredPacks, [])
        assert.doesNotThrow(() => assertTargetVerified(result))
        assert.doesNotThrow(() => assertTargetReviewable(result))

        const rollingCatalog = evaluateTargetCompatibility(root, catalog)
        assert.equal(rollingCatalog.status, 'review-required')
        assert.deepEqual(
            rollingCatalog.reviewRequiredPacks.map((entry) => entry.id),
            ['charx-archive-integrity'],
        )
    }))

test('an unlisted PocketRisu patch release remains outside the maintainer gate', () =>
    withRoot('1.9.1', (root) => {
        const catalog = loadCatalog()
        const result = evaluateTargetCompatibility(root, catalog)
        assert.equal(result.status, 'review-required')
        assert.equal(result.underReviewPacks.length, 0)
        assert.deepEqual(
            result.reviewRequiredPacks.map((entry) => entry.id),
            catalog.map((entry) => entry.id),
        )
        assert.throws(
            () => assertTargetReviewable(result),
            (error) => error.code === 'TARGET_REVIEW_REQUIRED'
                && error.details.packs.length === catalog.length,
        )
    }))

test('revert with no selected packs is not blocked by target qualification', () =>
    withRoot('9.0.0', (root) => {
        const result = evaluateTargetCompatibility(root, [])
        assert.equal(result.status, 'verified')
    }))
