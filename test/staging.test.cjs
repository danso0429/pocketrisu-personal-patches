'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_STAGING_RECEIPT_PATH,
    assertStagingBoundary,
    buildQualificationChecks,
    makeStagingReceipt,
    runQualificationChecks,
    writeStagingReceipt,
} = require('../src/staging.cjs')

function makeRoot(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writePackage(root, version = '1.8.1') {
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'pocketrisu',
            version,
            packageManager: 'pnpm@10.34.1',
            scripts: {
                test: 'vitest run',
                check: 'svelte-check',
                build: 'vite build',
            },
        }),
    )
}

test('staging requires a fresh source tree outside the live root', () => {
    const live = makeRoot('pocketrisu-live-')
    const candidate = makeRoot('pocketrisu-stage-')
    try {
        writePackage(live)
        writePackage(candidate)
        const boundary = assertStagingBoundary({
            liveRoot: live,
            candidateRoot: candidate,
        })
        assert.equal(boundary.target.packageVersion, '1.8.1')

        fs.mkdirSync(path.join(candidate, 'save/pocketrisu-patches'), { recursive: true })
        fs.writeFileSync(
            path.join(candidate, 'save/pocketrisu-patches/state.json'),
            '{}',
        )
        assert.throws(
            () => assertStagingBoundary({
                liveRoot: live,
                candidateRoot: candidate,
            }),
            (error) => error.code === 'DIRTY_STAGING_TARGET',
        )

        const nested = path.join(live, 'candidate')
        fs.mkdirSync(nested)
        writePackage(nested)
        assert.throws(
            () => assertStagingBoundary({
                liveRoot: live,
                candidateRoot: nested,
            }),
            (error) => error.code === 'STAGING_PATH_OVERLAP',
        )
    } finally {
        fs.rmSync(live, { recursive: true, force: true })
        fs.rmSync(candidate, { recursive: true, force: true })
    }
})

test('qualification checks are ordered and stop at the first failure', () => {
    const root = makeRoot('pocketrisu-stage-checks-')
    try {
        writePackage(root)
        fs.mkdirSync(path.join(root, 'server/node'), { recursive: true })
        fs.writeFileSync(path.join(root, 'server/node/bgOrchBundle.build.cjs'), '')
        const definitions = buildQualificationChecks(root, [{ id: 'bg-preserve' }])
        assert.deepEqual(
            definitions.map((check) => check.id),
            [
                'package-manager-version',
                'frozen-install',
                'target-tests',
                'target-diagnostics',
                'production-build',
                'bg-orchestration-bundle',
            ],
        )

        const invoked = []
        let clock = 0
        assert.throws(
            () => runQualificationChecks({
                root,
                checks: definitions,
                now: () => {
                    clock += 5
                    return clock
                },
                runner: (check) => {
                    invoked.push(check.id)
                    return {
                        status: check.id === 'target-diagnostics' ? 2 : 0,
                        signal: null,
                        stdout: check.expectedStdout === undefined
                            ? `${check.id}\n`
                            : `${check.expectedStdout}\n`,
                        stderr: '',
                    }
                },
            }),
            (error) => (
                error.code === 'CHECK_FAILED'
                && error.details.completed.length === 4
                && error.details.check.id === 'target-diagnostics'
            ),
        )
        assert.deepEqual(invoked, [
            'package-manager-version',
            'frozen-install',
            'target-tests',
            'target-diagnostics',
        ])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('a runner launch error is preserved even when stderr is empty', () => {
    assert.throws(
        () => runQualificationChecks({
            root: '/tmp',
            checks: [{
                id: 'launch',
                kind: 'check',
                command: 'missing',
                args: [],
            }],
            runner: () => ({
                status: 0,
                signal: null,
                stdout: '',
                stderr: '',
                error: new Error('launch denied'),
            }),
        }),
        (error) => (
            error.code === 'CHECK_FAILED'
            && error.details.check.stderrTail === 'launch denied'
        ),
    )
})

test('staging receipts are private and contain an explicit cutover gate', () => {
    const root = makeRoot('pocketrisu-stage-receipt-')
    try {
        writePackage(root)
        const receipt = makeStagingReceipt({
            status: 'ready',
            patcherVersion: '0.2.0-test',
            transition: {
                resolution: {
                    effectiveRequested: ['example'],
                    resolvedIds: ['example'],
                },
                packs: [{ id: 'example', version: '1.0.0', etag: 'etag' }],
                state: {
                    files: {
                        'src/example.ts': {
                            outputHash: 'hash',
                            outputMode: 0o644,
                        },
                    },
                },
            },
            compatibility: {
                target: {
                    packageName: 'pocketrisu',
                    packageVersion: '1.8.1',
                },
            },
            checks: [],
            now: new Date('2026-07-29T00:00:00.000Z'),
        })
        const written = writeStagingReceipt(root, receipt)
        const absolute = path.join(root, written.path)
        const saved = JSON.parse(fs.readFileSync(absolute, 'utf8'))

        assert.equal(written.path, DEFAULT_STAGING_RECEIPT_PATH)
        assert.equal(saved.readyForManualCutover, true)
        assert.equal(saved.liveSourceFilesChanged, false)
        assert.equal(fs.statSync(absolute).mode & 0o777, 0o600)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})
