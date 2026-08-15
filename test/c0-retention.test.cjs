'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    sealDocument,
    verifyDocumentIntegrity,
} = require('../src/verification-receipts.cjs')
const {
    evidenceObjectBytes,
    loadEvidenceObject,
    objectPath,
    planC0EvidenceRetention,
    publishEvidenceObject,
} = require('../src/c0-retention.cjs')

function temporaryStore(t, prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    return root
}

function receipt(label) {
    return sealDocument({
        schema: 'patch-verification-execution-receipt-v2',
        disposition: 'current-active',
        label,
    })
}

function bundle(globalReceiptSha256, disposition = 'current-active') {
    return sealDocument({
        schema: 'patch-c0-evidence-bundle-v1',
        disposition,
        globalReceipt: { objectSha256: globalReceiptSha256 },
        gates: {
            focused: [],
            global: {
                receiptObjectSha256: globalReceiptSha256,
                detailsSha256: null,
            },
            product: [],
        },
    })
}

function cohortLedger(bundleSha256) {
    return sealDocument({
        schema: 'patch-c0-cohort-ledger-v1',
        ledgerKind: 'cohort',
        baseLedgerObjectSha256: null,
        entries: [{ objectSha256: bundleSha256 }],
    })
}

test('content-addressed publication is immutable and deduplicates exact bytes', (t) => {
    const store = temporaryStore(t, 'c0-cas-known-answer-')
    const document = receipt('same')
    const first = publishEvidenceObject(store, document)
    const second = publishEvidenceObject(store, document)
    assert.equal(first.created, true)
    assert.ok(first.newPhysicalBytes > 0)
    assert.equal(second.created, false)
    assert.equal(second.newPhysicalBytes, 0)
    assert.equal(first.objectSha256, second.objectSha256)
    assert.equal(first.bytes, evidenceObjectBytes(document).length)
    assert.equal(fs.lstatSync(first.path).mode & 0o777, 0o444)
    assert.deepEqual(loadEvidenceObject(store, first.objectSha256).document, document)
    const reordered = publishEvidenceObject(store, {
        integrity: document.integrity,
        label: document.label,
        disposition: document.disposition,
        schema: document.schema,
    })
    assert.notEqual(first.objectSha256, reordered.objectSha256)
})

test('corrupt, truncated, or noncanonical evidence objects fail closed', (t) => {
    const store = temporaryStore(t, 'c0-cas-corrupt-')
    const published = publishEvidenceObject(store, receipt('corrupt-me'))
    fs.chmodSync(published.path, 0o600)
    fs.writeFileSync(published.path, '{}')
    assert.throws(() => loadEvidenceObject(store, published.objectSha256), /hash mismatch/)

    const otherStore = temporaryStore(t, 'c0-cas-noncanonical-')
    const document = { z: 1, a: 2 }
    const canonical = publishEvidenceObject(otherStore, document)
    fs.chmodSync(canonical.path, 0o600)
    fs.writeFileSync(canonical.path, JSON.stringify(document, null, 2))
    assert.throws(() => loadEvidenceObject(otherStore, canonical.objectSha256), /hash mismatch/)
})

test('dry-run retention follows ledger references and protects negative evidence', (t) => {
    const store = temporaryStore(t, 'c0-retention-known-answer-')
    const positiveReceipt = publishEvidenceObject(store, receipt('positive'))
    const positiveBundle = publishEvidenceObject(store, bundle(positiveReceipt.objectSha256))
    const ledger = publishEvidenceObject(store, cohortLedger(positiveBundle.objectSha256))

    const negativeReceipt = publishEvidenceObject(store, receipt('negative'))
    const negativeBundle = publishEvidenceObject(store, bundle(
        negativeReceipt.objectSha256,
        'defect-reproduction',
    ))
    const orphan = publishEvidenceObject(store, sealDocument({ schema: 'fixture-orphan-v1' }))

    const plan = planC0EvidenceRetention({
        storeRoot: store,
        rootObjectSha256s: [ledger.objectSha256],
        generatedAt: '2000-01-01T00:00:00.000Z',
    })
    assert.equal(verifyDocumentIntegrity(plan), true)
    assert.equal(plan.dryRun, true)
    assert.equal(plan.summary.deletedObjects, 0)
    assert.equal(plan.summary.deletedBytes, 0)
    for (const hash of [ledger.objectSha256, positiveBundle.objectSha256, positiveReceipt.objectSha256]) {
        const entry = plan.objects.find((value) => value.sha256 === hash)
        assert.equal(entry.referenced, true)
        assert.equal(entry.action, 'retain')
    }
    for (const hash of [negativeBundle.objectSha256, negativeReceipt.objectSha256]) {
        const entry = plan.objects.find((value) => value.sha256 === hash)
        assert.equal(entry.protected, true)
        assert.equal(entry.action, 'retain')
    }
    const orphanEntry = plan.objects.find((value) => value.sha256 === orphan.objectSha256)
    assert.equal(orphanEntry.action, 'eligible-for-future-review')
    assert.ok(plan.rollbackManifest.includes(orphan.objectSha256))
    assert.equal(fs.existsSync(objectPath(store, orphan.objectSha256)), true)
})

test('retention planning rejects missing references instead of hiding them', (t) => {
    const store = temporaryStore(t, 'c0-retention-missing-')
    publishEvidenceObject(store, bundle('f'.repeat(64)))
    assert.throws(
        () => planC0EvidenceRetention({ storeRoot: store }),
        /missing reference/,
    )
})
