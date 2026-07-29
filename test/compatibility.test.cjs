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

test('revert with no selected packs is not blocked by target qualification', () =>
    withRoot('9.0.0', (root) => {
        const result = evaluateTargetCompatibility(root, [])
        assert.equal(result.status, 'verified')
    }))
