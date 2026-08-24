'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
    handleCliFailure,
    parseArgs,
    resolveIntentPolicy,
    runCli,
} = require('../src/cli.cjs')
const { assertTargetReviewable } = require('../src/compatibility.cjs')
const {
    customIntent,
    loadIntent,
    presetIntent,
    saveIntent,
} = require('../src/manager.cjs')
const { loadCatalog } = require('../src/catalog.cjs')

function withRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-cli-'))
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }),
    )
    return Promise.resolve()
        .then(() => fn(root))
        .finally(() => fs.rmSync(root, { recursive: true, force: true }))
}

function makeCandidate(version = '1.8.1', source = 'const upstream = 1\n') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-stage-cli-'))
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
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/example.ts'), source)
    return root
}

function qualifiedCatalog(anchor = 'const upstream = 1\n') {
    return [{
        id: 'qualified-pack',
        title: 'Qualified pack',
        version: '1.0.0',
        targets: {
            pocketrisu: {
                verified: ['1.8.1'],
            },
        },
        units: [{
            id: 'qualified-pack:value',
            file: 'src/example.ts',
            type: 'replace',
            anchor,
            content: 'const patched = 1\n',
        }],
    }]
}

test('--all remains a compatibility alias while selection flags are rejected', () => {
    const parsed = parseArgs([
        'node',
        'patcher',
        'apply',
        '--all',
        '--root',
        '/tmp/pocketrisu',
    ])
    assert.equal(parsed.all, true)
    for (const retired of ['--packs', '--preset', '--profile']) {
        assert.throws(() => parseArgs([
            'node',
            'patcher',
            'apply',
            retired,
            'legacy-value',
        ]), /complete admitted set/)
    }
})

async function capture(run) {
    const lines = []
    const originalLog = console.log
    console.log = (value) => lines.push(String(value))
    try {
        await run()
    } finally {
        console.log = originalLog
    }
    return JSON.parse(lines.join('\n'))
}

test('list reports complete-set inclusion without selection affordances', async () => {
    const catalog = [
        { id: 'bg-preserve', version: '1', units: [] },
        { id: 'lazy-chat-bg-adapter', version: '1', userSelectable: false, units: [] },
    ]
    const lines = []
    const originalLog = console.log
    console.log = (value) => lines.push(String(value))
    try {
        await runCli({
            argv: ['node', 'patcher', 'list', '--json'],
            catalog,
            fixedProfile: 'all',
        })
    } finally {
        console.log = originalLog
    }

    const listed = JSON.parse(lines.join('\n'))
    assert.deepEqual(
        listed.map((pack) => ({
            id: pack.id,
            included: pack.included,
            internal: pack.internal,
        })),
        [
            { id: 'bg-preserve', included: true, internal: false },
            { id: 'lazy-chat-bg-adapter', included: true, internal: true },
        ],
    )
})

test('configure command is retired without writing intent', () =>
    withRoot(async (root) => {
        await assert.rejects(
            runCli({
                argv: ['node', 'patcher', 'configure', '--root', root, '--json'],
                catalog: qualifiedCatalog(),
            }),
            /Usage: <plan\|apply\|revert/,
        )
        assert.equal(loadIntent(root), null)
    }))

test('every non-empty historical intent migrates to enabled complete delivery', () => {
    const catalog = loadCatalog()
    const currentAll = [
        'bg-preserve',
        'character-import-ux',
        'character-organizer',
        'charx-archive-integrity',
        'client-build-fence',
        'lazy-chat-sync',
        'parser-hardening',
        'persona-organizer',
        'personal-settings',
        'pocketrisu-kei',
        'preset-integrity',
        'toolchain-hardening',
    ]
    assert.deepEqual(resolveIntentPolicy({
        format: 1,
        mode: 'legacy',
        preset: 'all',
        requestedPacks: currentAll,
    }, catalog), presetIntent('all'))

    const olderAll = currentAll.filter((id) => id !== 'character-organizer')
    assert.deepEqual(resolveIntentPolicy({
        format: 1,
        mode: 'legacy',
        preset: 'all',
        requestedPacks: olderAll,
    }, catalog), presetIntent('all'))
    assert.deepEqual(resolveIntentPolicy({
        format: 2,
        mode: 'custom',
        preset: 'features',
        requestedPacks: [],
    }, catalog), customIntent([], 'all'))
})

test('complete delivery includes new packs and expands old partial intent', () =>
    withRoot(async (root) => {
        const catalog = [
            { id: 'existing-pack', version: '1', units: [] },
            { id: 'future-pack', version: '1', units: [] },
        ]
        saveIntent({
            root,
            intent: presetIntent('all'),
        })
        const rolling = await capture(() => runCli({
            argv: ['node', 'patcher', 'plan', '--root', root, '--json'],
            catalog,
        }))
        assert.deepEqual(rolling.selection.requested, [
            'existing-pack',
            'future-pack',
        ])
        assert.deepEqual(rolling.intent, presetIntent('all'))

        saveIntent({
            root,
            intent: customIntent(['existing-pack'], 'all'),
        })
        const migrated = await capture(() => runCli({
            argv: ['node', 'patcher', 'plan', '--root', root, '--json'],
            catalog,
        }))
        assert.deepEqual(migrated.selection.requested, [
            'existing-pack',
            'future-pack',
        ])
        assert.deepEqual(migrated.intent, presetIntent('all'))
    }))

test('revert disables delivery while an explicit later plan previews the complete set', () =>
    withRoot(async (root) => {
        const catalog = [
            { id: 'existing-pack', version: '1', units: [] },
            { id: 'future-pack', version: '1', units: [] },
        ]
        saveIntent({
            root,
            intent: presetIntent('all'),
        })
        await capture(() => runCli({
            argv: ['node', 'patcher', 'revert', '--root', root, '--json'],
            catalog,
            targetGate: () => {},
        }))
        assert.deepEqual(loadIntent(root), {
            format: 2,
            mode: 'custom',
            preset: 'all',
            requestedPacks: [],
        })

        const current = await capture(() => runCli({
            argv: ['node', 'patcher', 'status', '--root', root, '--json'],
            catalog,
        }))
        assert.deepEqual(current.delivery, {
            mode: 'all-or-nothing',
            enabled: false,
        })

        const planned = await capture(() => runCli({
            argv: ['node', 'patcher', 'plan', '--root', root, '--json'],
            catalog,
        }))
        assert.deepEqual(planned.selection.requested, [
            'existing-pack',
            'future-pack',
        ])
    }))

test('plain plan overrides an older saved partial intent', () =>
    withRoot(async (root) => {
        const allIds = [
            'bg-preserve',
            'character-organizer',
            'lazy-chat-sync',
            'parser-hardening',
            'persona-organizer',
            'preset-integrity',
            'toolchain-hardening',
        ]
        const catalog = allIds.map((id) => ({
            id,
            title: id,
            version: 'test',
            targets: {
                pocketrisu: {
                    verified: ['1.8.1'],
                },
            },
            units: [],
        }))
        saveIntent({
            root,
            intent: customIntent(['parser-hardening']),
        })

        const output = await capture(() => runCli({
            argv: [
                'node',
                'patcher',
                'plan',
                '--root',
                root,
                '--json',
            ],
            catalog,
        }))

        assert.deepEqual(output.selection.requested, allIds)
    }))

test('report command can print or deliver the latest report through the same artifact', () =>
    withRoot(async (root) => {
        const report = {
            schema: 1,
            incidentId: '20260729123456-abcdef1234',
            createdAt: '2026-07-29T12:34:56.000Z',
            patcherVersion: 'test',
            phase: 'plan',
            target: { packageName: 'pocketrisu', packageVersion: '1.8.1' },
            selection: { requested: [], resolved: [], autoAdded: [], superseded: [] },
            error: { code: 'TEST', message: 'test', cause: 'test', details: {} },
            packs: [],
            files: [],
            units: [],
            writeSafety: {
                liveSourceFilesChanged: false,
                stagingSourceFilesChanged: false,
            },
            maintainerAction: 'send',
        }
        let delivered = null
        const output = await capture(() => runCli({
            argv: [
                'node',
                'patcher',
                'report',
                '--root',
                root,
                '--report-to',
                'character',
                '--json',
            ],
            catalog: [],
            reportLoader: () => report,
            reportDeliverer: async (input) => {
                delivered = input
                return {
                    status: 'delivered',
                    incidentId: report.incidentId,
                    receiver: { type: input.channel },
                    verified: true,
                }
            },
        }))

        assert.equal(delivered.channel, 'character')
        assert.equal(delivered.report, report)
        assert.equal(output.status, 'delivered')
        assert.equal(output.receiver.type, 'character')
    }))

test('top-level conflict handling performs only explicitly requested RisuAI delivery', async () => {
    const report = {
        incidentId: '20260729123456-abcdef1234',
    }
    const error = Object.assign(new Error('blocked'), {
        code: 'PACK_CONFLICT',
        report: {
            markdownPath: 'save/reports/conflict.md',
            jsonPath: 'save/reports/conflict.json',
        },
        reportDelivery: {
            root: '/not/read/by-stub',
            report,
            channel: 'persona',
            serverUrl: null,
        },
    })
    let delivered = null
    const lines = []
    const originalError = console.error
    console.error = (value) => lines.push(String(value))
    try {
        await handleCliFailure(error, {
            setExitCode: false,
            reportDeliverer: async (input) => {
                delivered = input
                return {
                    receiver: { type: 'persona' },
                    receiverName: 'PocketRisu Patcher Report',
                }
            },
        })
    } finally {
        console.error = originalError
    }

    assert.equal(delivered.channel, 'persona')
    assert.equal(delivered.report, report)
    assert.equal(lines.some((line) => line.startsWith('[report-risu]')), true)
})

test('complete graph conflict is reported without saving intent', () =>
    withRoot(async (root) => {
        const catalog = [
            {
                id: 'a',
                version: '1.0.0',
                conflicts: ['b'],
                units: [],
            },
            {
                id: 'b',
                version: '1.0.0',
                units: [],
            },
        ]
        let failure
        try {
            await runCli({
                argv: [
                    'node',
                    'patcher',
                    'apply',
                    '--root',
                    root,
                    '--report-to',
                    'persona',
                    '--json',
                ],
                catalog,
                patcherVersion: '0.2.0-test',
            })
        } catch (error) {
            failure = error
        }

        assert.equal(failure.code, 'PACK_CONFLICT')
        assert.equal(failure.reportDelivery.channel, 'persona')
        assert.equal(failure.reportDelivery.report.incidentId, failure.conflictReport.incidentId)
        assert.equal(loadIntent(root), null)
        const report = JSON.parse(fs.readFileSync(
            path.join(root, failure.report.jsonPath),
            'utf8',
        ))
        assert.equal(report.phase, 'apply')
        assert.deepEqual(report.packs, ['a', 'b'])
    }))

test('a failed apply writes a maintainer report and leaves source and intent untouched', () =>
    withRoot(async (root) => {
        fs.mkdirSync(path.join(root, 'src'), { recursive: true })
        fs.writeFileSync(path.join(root, 'src/example.ts'), 'const upstream = 2\n')
        const catalog = [{
            id: 'broken-pack',
            title: 'Broken pack',
            version: '1.0.0',
            units: [{
                id: 'broken-pack:value',
                file: 'src/example.ts',
                type: 'replace',
                anchor: 'const upstream = 1\n',
                content: 'const patched = 1\n',
            }],
        }]

        let failure
        try {
            await runCli({
                argv: [
                    'node',
                    'patcher',
                    'apply',
                    '--root',
                    root,
                    '--json',
                ],
                catalog,
                patcherVersion: '0.2.0-test',
            })
        } catch (error) {
            failure = error
        }

        assert.equal(failure.code, 'ANCHOR_COUNT')
        assert.equal(
            fs.readFileSync(path.join(root, 'src/example.ts'), 'utf8'),
            'const upstream = 2\n',
        )
        assert.equal(loadIntent(root), null)
        assert.equal(
            fs.existsSync(path.join(root, 'save/pocketrisu-patches/state.json')),
            false,
        )
        assert.equal(fs.existsSync(path.join(root, failure.report.jsonPath)), true)
        const report = JSON.parse(fs.readFileSync(path.join(root, failure.report.jsonPath), 'utf8'))
        assert.deepEqual(report.packs, ['broken-pack'])
        assert.deepEqual(report.files, ['src/example.ts'])
        assert.equal(report.writeSafety.liveSourceFilesChanged, false)
    }))

test('an unqualified upstream target is reported after structural planning but before writes', () =>
    withRoot(async (root) => {
        fs.writeFileSync(
            path.join(root, 'package.json'),
            JSON.stringify({ name: 'pocketrisu', version: '1.8.2' }),
        )
        fs.mkdirSync(path.join(root, 'src'), { recursive: true })
        fs.writeFileSync(path.join(root, 'src/example.ts'), 'const upstream = 1\n')
        const catalog = [{
            id: 'qualified-pack',
            title: 'Qualified pack',
            version: '1.0.0',
            targets: {
                pocketrisu: {
                    verified: ['1.8.1'],
                },
            },
            units: [{
                id: 'qualified-pack:value',
                file: 'src/example.ts',
                type: 'replace',
                anchor: 'const upstream = 1\n',
                content: 'const patched = 1\n',
            }],
        }]

        let failure
        try {
            await runCli({
                argv: [
                    'node',
                    'patcher',
                    'apply',
                    '--root',
                    root,
                    '--json',
                ],
                catalog,
                patcherVersion: '0.2.0-test',
            })
        } catch (error) {
            failure = error
        }

        assert.equal(failure.code, 'TARGET_REVIEW_REQUIRED')
        assert.equal(
            fs.readFileSync(path.join(root, 'src/example.ts'), 'utf8'),
            'const upstream = 1\n',
        )
        assert.equal(loadIntent(root), null)
        const report = JSON.parse(fs.readFileSync(path.join(root, failure.report.jsonPath), 'utf8'))
        assert.deepEqual(report.packs, ['qualified-pack'])
        assert.equal(report.phase, 'qualification')
        assert.equal(report.writeSafety.liveSourceFilesChanged, false)
    }))

test('plan previews intent, state, and source writes without performing them', () =>
    withRoot(async (root) => {
        fs.mkdirSync(path.join(root, 'src'), { recursive: true })
        fs.writeFileSync(path.join(root, 'src/example.ts'), 'const upstream = 1\n')
        const output = await capture(() => runCli({
            argv: [
                'node',
                'patcher',
                'plan',
                '--root',
                root,
                '--json',
            ],
            catalog: qualifiedCatalog(),
        }))

        assert.deepEqual(output.changedFiles.sort(), [
            'save/pocketrisu-patches/intent.json',
            'save/pocketrisu-patches/state.json',
            'src/example.ts',
        ])
        assert.equal(loadIntent(root), null)
        assert.equal(
            fs.readFileSync(path.join(root, 'src/example.ts'), 'utf8'),
            'const upstream = 1\n',
        )
        assert.equal(
            fs.existsSync(path.join(root, 'save/pocketrisu-patches/state.json')),
            false,
        )
    }))

test('stage patches and validates an isolated candidate without changing live source', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate()
        try {
            const output = await capture(() => runCli({
                argv: [
                    'node',
                    'patcher',
                    'stage',
                    '--root',
                    live,
                    '--candidate',
                    candidate,
                    '--json',
                ],
                catalog: qualifiedCatalog(),
                patcherVersion: '0.2.0-test',
                stagingCheckFactory: () => [{
                    id: 'synthetic-check',
                    kind: 'check',
                    command: 'synthetic',
                    args: [],
                }],
                stagingCheckRunner: () => ({
                    status: 0,
                    signal: null,
                    stdout: '',
                    stderr: '',
                }),
            }))

            assert.equal(output.status, 'ready-for-manual-cutover')
            assert.equal(output.liveSourceFilesChanged, false)
            assert.equal(output.cutoverAllowed, true)
            assert.equal(output.manualCutoverRequired, true)
            assert.match(
                fs.readFileSync(path.join(candidate, 'src/example.ts'), 'utf8'),
                /POCKETRISU-PATCH:qualified-pack:value:START[\s\S]*const patched = 1/,
            )
            assert.equal(fs.existsSync(path.join(live, 'src/example.ts')), false)
            assert.equal(
                fs.existsSync(path.join(candidate, 'save/pocketrisu-patches/state.json')),
                true,
            )
            assert.deepEqual(loadIntent(candidate), {
                format: 2,
                mode: 'preset',
                preset: 'all',
            })
            const receipt = JSON.parse(fs.readFileSync(
                path.join(candidate, output.receipt.path),
                'utf8',
            ))
            assert.equal(receipt.status, 'ready')
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))

test('stage carries rolling all and a newly published pack into the candidate', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate()
        const catalog = [
            ...qualifiedCatalog(),
            {
                id: 'future-pack',
                version: '1.0.0',
                targets: {
                    pocketrisu: {
                        verified: ['1.8.1'],
                    },
                },
                units: [],
            },
        ]
        try {
            saveIntent({
                root: live,
                intent: presetIntent('all'),
            })
            const output = await capture(() => runCli({
                argv: [
                    'node',
                    'patcher',
                    'stage',
                    '--root',
                    live,
                    '--candidate',
                    candidate,
                    '--json',
                ],
                catalog,
                patcherVersion: '0.2.0-test',
                stagingCheckFactory: () => [{
                    id: 'synthetic-check',
                    kind: 'check',
                    command: 'synthetic',
                    args: [],
                }],
                stagingCheckRunner: () => ({
                    status: 0,
                    signal: null,
                    stdout: '',
                    stderr: '',
                }),
            }))

            assert.deepEqual(output.selection.requested, [
                'future-pack',
                'qualified-pack',
            ])
            assert.deepEqual(loadIntent(candidate), {
                format: 2,
                mode: 'preset',
                preset: 'all',
            })
            assert.equal(loadIntent(live).mode, 'preset')
            assert.equal(fs.existsSync(path.join(live, 'src/example.ts')), false)
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))

test('maintainer review checks do not mark an under-review target ready for cutover', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate('1.8.2')
        const catalog = qualifiedCatalog().map((pack) => ({
            ...pack,
            targets: {
                pocketrisu: {
                    verified: ['1.8.1'],
                    reviewing: ['1.8.2'],
                },
            },
        }))
        try {
            const output = await capture(() => runCli({
                argv: [
                    'node',
                    'qualifier',
                    'stage',
                    '--root',
                    live,
                    '--candidate',
                    candidate,
                    '--json',
                ],
                catalog,
                patcherVersion: '0.2.0-test-maintainer',
                targetGate: assertTargetReviewable,
                stagingCheckFactory: () => [],
            }))

            assert.equal(output.status, 'maintainer-automated-review-passed')
            assert.equal(output.compatibility.status, 'under-review')
            assert.equal(output.manualQualificationRequired, true)
            assert.equal(output.cutoverAllowed, false)
            const receipt = JSON.parse(fs.readFileSync(
                path.join(candidate, output.receipt.path),
                'utf8',
            ))
            assert.equal(receipt.status, 'review-passed')
            assert.equal(receipt.readyForManualCutover, false)
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))

test('stage reports a candidate conflict before writing candidate source or state', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate('1.8.1', 'const upstream = 2\n')
        try {
            let failure
            try {
                await runCli({
                    argv: [
                        'node',
                        'patcher',
                        'stage',
                        '--root',
                        live,
                        '--candidate',
                        candidate,
                        '--json',
                    ],
                    catalog: qualifiedCatalog(),
                    patcherVersion: '0.2.0-test',
                })
            } catch (error) {
                failure = error
            }

            assert.equal(failure.code, 'ANCHOR_COUNT')
            assert.equal(
                fs.readFileSync(path.join(candidate, 'src/example.ts'), 'utf8'),
                'const upstream = 2\n',
            )
            assert.equal(
                fs.existsSync(path.join(candidate, 'save/pocketrisu-patches/state.json')),
                false,
            )
            const report = JSON.parse(fs.readFileSync(
                path.join(live, failure.report.jsonPath),
                'utf8',
            ))
            assert.equal(report.phase, 'stage-plan')
            assert.deepEqual(report.files, ['src/example.ts'])
            assert.equal(report.writeSafety.liveSourceFilesChanged, false)
            assert.equal(report.writeSafety.stagingSourceFilesChanged, false)
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))

test('a failed staging check blocks cutover and records that only staging changed', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate()
        try {
            let failure
            try {
                await runCli({
                    argv: [
                        'node',
                        'patcher',
                        'stage',
                        '--root',
                        live,
                        '--candidate',
                        candidate,
                        '--json',
                    ],
                    catalog: qualifiedCatalog(),
                    patcherVersion: '0.2.0-test',
                    stagingCheckFactory: () => [{
                        id: 'synthetic-build',
                        kind: 'build',
                        command: 'synthetic',
                        args: [],
                    }],
                    stagingCheckRunner: () => ({
                        status: 1,
                        signal: null,
                        stdout: '',
                        stderr: 'synthetic failure',
                    }),
                })
            } catch (error) {
                failure = error
            }

            assert.equal(failure.code, 'BUILD_FAILED')
            assert.match(
                fs.readFileSync(path.join(candidate, 'src/example.ts'), 'utf8'),
                /POCKETRISU-PATCH:qualified-pack:value:START[\s\S]*const patched = 1/,
            )
            const report = JSON.parse(fs.readFileSync(
                path.join(live, failure.report.jsonPath),
                'utf8',
            ))
            assert.equal(report.phase, 'stage-checks')
            assert.equal(report.writeSafety.liveSourceFilesChanged, false)
            assert.equal(report.writeSafety.stagingSourceFilesChanged, true)
            const receipt = JSON.parse(fs.readFileSync(
                path.join(candidate, failure.stagingReceipt.path),
                'utf8',
            ))
            assert.equal(receipt.status, 'failed')
            assert.equal(receipt.readyForManualCutover, false)
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))

test('a passing check that mutates managed source is still blocked as staging drift', () =>
    withRoot(async (live) => {
        const candidate = makeCandidate()
        try {
            let failure
            try {
                await runCli({
                    argv: [
                        'node',
                        'patcher',
                        'stage',
                        '--root',
                        live,
                        '--candidate',
                        candidate,
                        '--json',
                    ],
                    catalog: qualifiedCatalog(),
                    patcherVersion: '0.2.0-test',
                    stagingCheckFactory: () => [{
                        id: 'mutating-check',
                        kind: 'check',
                        command: 'synthetic',
                        args: [],
                    }],
                    stagingCheckRunner: () => {
                        fs.appendFileSync(
                            path.join(candidate, 'src/example.ts'),
                            '\n// unexpected mutation\n',
                        )
                        return {
                            status: 0,
                            signal: null,
                            stdout: '',
                            stderr: '',
                        }
                    },
                })
            } catch (error) {
                failure = error
            }

            assert.equal(failure.code, 'STAGING_SOURCE_DRIFT')
            const report = JSON.parse(fs.readFileSync(
                path.join(live, failure.report.jsonPath),
                'utf8',
            ))
            assert.deepEqual(
                report.error.details.driftedManagedFiles,
                ['src/example.ts'],
            )
            assert.equal(report.writeSafety.liveSourceFilesChanged, false)
            assert.equal(report.writeSafety.stagingSourceFilesChanged, true)
            const receipt = JSON.parse(fs.readFileSync(
                path.join(candidate, failure.stagingReceipt.path),
                'utf8',
            ))
            assert.equal(receipt.status, 'failed')
            assert.equal(receipt.readyForManualCutover, false)
        } finally {
            fs.rmSync(candidate, { recursive: true, force: true })
        }
    }))
