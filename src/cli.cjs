'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_STATE_PATH,
    applyTransition,
    customIntent,
    loadIntent,
    loadState,
    normalizeIntentPolicy,
    packEtag,
    planTransition,
    presetIntent,
    restoreJournal,
    status,
    withRootLock,
} = require('./manager.cjs')
const {
    loadCatalog,
    resolveProfile,
    validateProfileSelection,
    validateProfileTransition,
} = require('./catalog.cjs')
const { resolveSelection } = require('./resolver.cjs')
const {
    assertTargetVerified,
    evaluateTargetCompatibility,
} = require('./compatibility.cjs')
const {
    makeConflictReport,
    writeConflictReport,
} = require('./report.cjs')
const {
    DEFAULT_RECEIVER_NAME,
    DELIVERY_CHANNELS,
    deliverConflictReport,
    loadConflictReport,
    reportContent,
} = require('./risu-report.cjs')
const defaultUpdateChannel = require('./update-channel.cjs')
const { checkForPatcherUpdate } = require('./update-feed.cjs')
const {
    assertFreshCandidate,
    assertPostCheckIntegrity,
    assertStagingBoundary,
    buildQualificationChecks,
    gitTrackedChanges,
    makeStagingReceipt,
    runQualificationChecks,
    writeStagingReceipt,
} = require('./staging.cjs')

function parseArgs(argv) {
    const options = {
        command: argv[2] ?? 'status',
        root: process.cwd(),
        candidate: null,
        all: false,
        reportTo: null,
        reportId: 'latest',
        risuUrl: null,
        json: false,
    }
    for (let index = 3; index < argv.length; index += 1) {
        const value = argv[index]
        if (
            value === '--root'
            || value === '--candidate'
            || value === '--report-to'
            || value === '--report-id'
            || value === '--risu-url'
        ) {
            const next = argv[++index]
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`${value} requires a value`)
            }
            if (value === '--root') options.root = next
            else if (value === '--candidate') options.candidate = next
            else if (value === '--report-to') options.reportTo = next
            else if (value === '--report-id') options.reportId = next
            else if (value === '--risu-url') options.risuUrl = next
            else throw new Error(`Unknown argument: ${value}`)
        }
        else if (value === '--packs' || value === '--preset' || value === '--profile') {
            throw new Error(
                `${value} was removed; this patcher applies or reverts the complete admitted set`,
            )
        }
        else if (value === '--all') options.all = true
        else if (value === '--json') options.json = true
        else throw new Error(`Unknown argument: ${value}`)
    }
    if (options.reportTo !== null && !DELIVERY_CHANNELS.has(options.reportTo)) {
        throw new Error('--report-to must be auto, persona, module, or character')
    }
    return options
}

function assertPocketRisuRoot(root) {
    const packagePath = path.join(root, 'package.json')
    if (!fs.existsSync(packagePath)) throw new Error(`No package.json under ${root}`)
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    if (pkg.name !== 'pocketrisu') {
        throw new Error(`Target is not a PocketRisu root: ${root}`)
    }
}

function print(value, json) {
    if (json) console.log(JSON.stringify(value, null, 2))
    else if (typeof value === 'string') console.log(value)
    else console.log(JSON.stringify(value, null, 2))
}

function summarizeTransition(transition) {
    return {
        profile: transition.profile,
        intent: transition.intent,
        selection: transition.resolution,
        compatibility: transition.compatibility,
        patcherUpdate: transition.patcherUpdate,
        packs: transition.packs,
        order: transition.order,
        collisions: transition.collisions,
        changedFiles: transition.changes.map((change) => change.path),
        skippedFiles: transition.skippedFiles,
    }
}

function printUpdateNotice(update, json) {
    if (json || !['available', 'unsupported'].includes(update.status)) return
    const label = update.status === 'unsupported'
        ? 'this patcher version is no longer supported'
        : 'a newer patcher is available'
    console.error(
        `[pocketrisu-patches] ${label}: ${update.currentVersion} → ${update.latest}`,
    )
    if (update.message) console.error(`[update] ${update.message}`)
    if (update.releasePage) console.error(`[release] ${update.releasePage}`)
}

function summarizeResolution(resolution) {
    return {
        requested: resolution.requested,
        effectiveRequested: resolution.effectiveRequested,
        resolved: resolution.resolvedIds,
        autoAdded: resolution.autoAdded,
        dependencyAdded: resolution.dependencyAdded,
        superseded: resolution.superseded,
    }
}

function resolveIntentPolicy(intent, catalog) {
    if (!intent) return null
    const normalized = intent.mode === 'legacy'
        ? customIntent(intent.requestedPacks ?? [], intent.preset ?? null)
        : normalizeIntentPolicy(intent)
    if (normalized.mode === 'custom' && normalized.requestedPacks.length === 0) {
        return customIntent([], 'all')
    }
    // Any non-empty legacy/custom/narrow policy means "enabled" at the
    // all-or-nothing boundary. The next successful write stores rolling all.
    return presetIntent('all')
}

function requestedPacksForIntent(intentPolicy, catalog) {
    if (!intentPolicy) return null
    if (intentPolicy.mode === 'preset') {
        return resolveProfile(intentPolicy.preset, catalog).defaults
    }
    return intentPolicy.requestedPacks
}

function resolveOperationIntent({
    options,
    catalog,
}) {
    const activePreset = resolveProfile('all', catalog)
    const intentPolicy = options.command === 'revert'
        ? customIntent([], activePreset.id)
        : presetIntent(activePreset.id)
    return {
        activePreset,
        intentPolicy,
        packIds: requestedPacksForIntent(intentPolicy, catalog),
    }
}

function reportFailure({
    reportRoot,
    inspectRoot,
    catalog,
    error,
    phase,
    packIds,
    resolution,
    patcherVersion,
    redactPaths = [],
    writeSafety,
    delivery = null,
}) {
    const report = makeConflictReport({
        root: inspectRoot,
        catalog,
        error,
        phase,
        requestedPacks: packIds ?? [],
        resolution,
        patcherVersion,
        redactPaths: [reportRoot, ...redactPaths],
        writeSafety,
    })
    error.report = writeConflictReport(reportRoot, report)
    error.conflictReport = report
    if (delivery) {
        error.reportDelivery = {
            root: reportRoot,
            report,
            channel: delivery.channel,
            serverUrl: delivery.serverUrl,
        }
    }
    return error
}

function checksForOutput(checks) {
    return checks.map(({
        stdoutTail,
        stderrTail,
        ...check
    }) => check)
}

async function runCli({
    argv = process.argv,
    catalog = null,
    fixedProfile = null,
    repositoryRoot,
    patcherVersion = 'development',
    updateChannel = defaultUpdateChannel,
    fetchImpl = globalThis.fetch,
    targetGate = assertTargetVerified,
    stagingCheckFactory = buildQualificationChecks,
    stagingCheckRunner,
    stagingNow = () => Date.now(),
    reportLoader = loadConflictReport,
    reportDeliverer = deliverConflictReport,
} = {}) {
    const options = parseArgs(argv)
    const loadedCatalog = catalog ?? loadCatalog(repositoryRoot)
    if (fixedProfile && fixedProfile !== 'all') {
        throw new Error(`Unsupported retired profile: ${fixedProfile}`)
    }
    const preset = resolveProfile('all', loadedCatalog)
    const delivery = options.reportTo === null
        ? null
        : {
            channel: options.reportTo,
            serverUrl: options.risuUrl,
        }
    const recordFailure = (details) => reportFailure({
        ...details,
        delivery,
    })
    if (options.command === 'list') {
        print(loadedCatalog.map((pack) => ({
            id: pack.id,
            title: pack.title ?? pack.id,
            version: pack.version,
            etag: packEtag(pack),
            units: pack.units.length,
            included: preset.defaults.includes(pack.id)
                || pack.userSelectable === false,
            internal: pack.userSelectable === false,
        })), options.json)
        return
    }

    assertPocketRisuRoot(options.root)
    if (options.command === 'report') {
        const report = reportLoader(options.root, options.reportId)
        if (options.reportTo === null) {
            print(options.json ? report : reportContent(report), options.json)
            return
        }
        const outcome = await reportDeliverer({
            root: options.root,
            report,
            channel: options.reportTo,
            serverUrl: options.risuUrl,
            fetchImpl,
        })
        print(outcome, options.json)
        return
    }
    const patcherUpdate = await checkForPatcherUpdate({
        root: options.root,
        currentVersion: patcherVersion,
        channel: updateChannel,
        fetchImpl,
    })
    printUpdateNotice(patcherUpdate, options.json)

    if (options.command === 'stage') {
        if (!options.candidate) {
            throw new Error('stage requires --candidate PATH')
        }
        const previous = loadState(options.root, DEFAULT_STATE_PATH)
        const selection = resolveOperationIntent({
            options,
            catalog: loadedCatalog,
        })
        const { activePreset, intentPolicy, packIds } = selection
        if (activePreset) {
            validateProfileTransition(activePreset, previous, loadedCatalog)
        }
        if (activePreset) validateProfileSelection(activePreset, packIds)

        let boundary
        try {
            boundary = assertStagingBoundary({
                liveRoot: options.root,
                candidateRoot: options.candidate,
            })
        } catch (error) {
            const candidateExists = fs.existsSync(options.candidate)
            throw recordFailure({
                reportRoot: options.root,
                inspectRoot: candidateExists ? options.candidate : options.root,
                catalog: loadedCatalog,
                error,
                phase: 'stage-preflight',
                packIds,
                resolution: null,
                patcherVersion,
                redactPaths: [options.candidate],
                writeSafety: {
                    stagingSourceFilesChanged: false,
                },
            })
        }

        return withRootLock(boundary.candidateRoot, async () => {
            let resolution = null
            let transition
            try {
                assertFreshCandidate(boundary.candidateRoot)
                resolution = resolveSelection(loadedCatalog, packIds)
                transition = planTransition({
                    root: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    packIds,
                    profile: activePreset?.id ?? 'custom',
                    persistIntent: true,
                    intentPolicy,
                })
            } catch (error) {
                throw recordFailure({
                    reportRoot: options.root,
                    inspectRoot: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    error,
                    phase: 'stage-plan',
                    packIds,
                    resolution,
                    patcherVersion,
                    writeSafety: {
                        stagingSourceFilesChanged: false,
                    },
                })
            }

            transition.compatibility = evaluateTargetCompatibility(
                boundary.candidateRoot,
                resolution.packs,
            )
            transition.patcherUpdate = patcherUpdate
            try {
                targetGate(transition.compatibility)
            } catch (error) {
                throw recordFailure({
                    reportRoot: options.root,
                    inspectRoot: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    error,
                    phase: 'qualification',
                    packIds,
                    resolution,
                    patcherVersion,
                    writeSafety: {
                        stagingSourceFilesChanged: false,
                    },
                })
            }

            let outcome
            try {
                outcome = applyTransition({
                    root: boundary.candidateRoot,
                    transition,
                    lockHeld: true,
                })
            } catch (error) {
                throw recordFailure({
                    reportRoot: options.root,
                    inspectRoot: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    error,
                    phase: 'stage-apply',
                    packIds,
                    resolution,
                    patcherVersion,
                    writeSafety: {
                        stagingSourceFilesChanged: 'unknown-after-rollback-attempt',
                    },
                })
            }

            let checks = []
            try {
                const trackedChangesBeforeChecks = gitTrackedChanges(
                    boundary.candidateRoot,
                )
                const definitions = stagingCheckFactory(
                    boundary.candidateRoot,
                    resolution.packs,
                )
                checks = runQualificationChecks({
                    root: boundary.candidateRoot,
                    checks: definitions,
                    runner: stagingCheckRunner,
                    now: stagingNow,
                    onProgress: options.json
                        ? undefined
                        : ({ status: checkStatus, check }) => {
                            console.error(`[stage:${checkStatus}] ${check.id}`)
                        },
                })
                assertPostCheckIntegrity({
                    root: boundary.candidateRoot,
                    expectedPackCount: resolution.packs.length,
                    trackedChangesBeforeChecks,
                })
            } catch (error) {
                checks = error.details?.completed ?? checks
                const receipt = makeStagingReceipt({
                    status: 'failed',
                    patcherVersion,
                    transition,
                    compatibility: transition.compatibility,
                    checks,
                    error,
                })
                try {
                    error.stagingReceipt = writeStagingReceipt(
                        boundary.candidateRoot,
                        receipt,
                    )
                } catch (receiptError) {
                    error.receiptError = receiptError.message
                }
                throw recordFailure({
                    reportRoot: options.root,
                    inspectRoot: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    error,
                    phase: 'stage-checks',
                    packIds,
                    resolution,
                    patcherVersion,
                    writeSafety: {
                        stagingSourceFilesChanged: outcome.files.some((file) =>
                            !file.startsWith('save/pocketrisu-patches/')
                        ),
                    },
                })
            }

            const receiptStatus = transition.compatibility.status === 'verified'
                ? 'ready'
                : 'review-passed'
            let receipt
            try {
                receipt = writeStagingReceipt(
                    boundary.candidateRoot,
                    makeStagingReceipt({
                        status: receiptStatus,
                        patcherVersion,
                        transition,
                        compatibility: transition.compatibility,
                        checks,
                    }),
                )
            } catch (error) {
                throw recordFailure({
                    reportRoot: options.root,
                    inspectRoot: boundary.candidateRoot,
                    catalog: loadedCatalog,
                    error,
                    phase: 'stage-receipt',
                    packIds,
                    resolution,
                    patcherVersion,
                    writeSafety: {
                        stagingSourceFilesChanged: outcome.files.some((file) =>
                            !file.startsWith('save/pocketrisu-patches/')
                        ),
                    },
                })
            }
            print({
                status: receiptStatus === 'ready'
                    ? 'ready-for-manual-cutover'
                    : 'maintainer-automated-review-passed',
                target: boundary.target,
                selection: summarizeResolution(resolution),
                compatibility: transition.compatibility,
                patcherUpdate,
                candidateChangedFiles: outcome.files,
                checks: checksForOutput(checks),
                receipt,
                liveSourceFilesChanged: false,
                manualQualificationRequired: receiptStatus !== 'ready',
                cutoverAllowed: receiptStatus === 'ready',
                manualCutoverRequired: true,
            }, options.json)
            return
        })
    }

    return withRootLock(options.root, () => {
        const recovered = restoreJournal(options.root)
        if (recovered.recovered) {
            console.error(`[pocketrisu-patches] recovered interrupted transaction ${recovered.transactionId}`)
        }

        if (options.command === 'status') {
            const current = status({ root: options.root })
            const intent = loadIntent(options.root)
            const intentPolicy = resolveIntentPolicy(intent, loadedCatalog)
            const currentEtags = new Map(loadedCatalog.map((pack) => [pack.id, packEtag(pack)]))
            current.packs = current.packs.map((pack) => ({
                ...pack,
                catalogStatus: !currentEtags.has(pack.id)
                    ? 'missing-from-catalog'
                    : (
                        currentEtags.get(pack.id) === pack.etag
                            ? 'current'
                            : 'update-available'
                    ),
            }))
            current.intent = intent
            current.intentPolicy = intentPolicy
            current.patcherUpdate = patcherUpdate
            const previousState = loadState(options.root, DEFAULT_STATE_PATH)
            const explicitlyDisabled = intentPolicy?.mode === 'custom'
                && intentPolicy.requestedPacks.length === 0
            const enabled = explicitlyDisabled
                ? false
                : Boolean(intentPolicy || previousState?.packs?.length)
            current.delivery = {
                mode: 'all-or-nothing',
                enabled,
            }
            const desiredPackIds = enabled
                ? preset.defaults
                : (explicitlyDisabled ? [] : null)
            if (desiredPackIds !== null) {
                let desired
                try {
                    desired = resolveSelection(
                        loadedCatalog,
                        desiredPackIds,
                    )
                } catch (error) {
                    throw recordFailure({
                        reportRoot: options.root,
                        inspectRoot: options.root,
                        catalog: loadedCatalog,
                        error,
                        phase: 'status-resolution',
                        packIds: desiredPackIds,
                        resolution: null,
                        patcherVersion,
                    })
                }
                current.desired = {
                    ...summarizeResolution(desired),
                    compatibility: evaluateTargetCompatibility(options.root, desired.packs),
                }
            } else {
                current.desired = null
            }
            print(current, options.json)
            return
        }

        if (!['plan', 'apply', 'revert'].includes(options.command)) {
            throw new Error('Usage: <plan|apply|revert|stage|status|list|report> [--root PATH] [--candidate PATH] [--all] [--report-to auto|persona|module|character] [--report-id ID] [--risu-url LOOPBACK_URL] [--json]')
        }

        const previous = loadState(options.root, DEFAULT_STATE_PATH)
        const selection = resolveOperationIntent({
            options,
            catalog: loadedCatalog,
        })
        const { activePreset, intentPolicy, packIds } = selection
        if (activePreset) {
            validateProfileTransition(activePreset, previous, loadedCatalog)
        }
        if (options.command !== 'revert' && activePreset) {
            validateProfileSelection(activePreset, packIds)
        }

        let transition
        let resolution = null
        try {
            resolution = resolveSelection(loadedCatalog, packIds)
            transition = planTransition({
                root: options.root,
                catalog: loadedCatalog,
                packIds,
                profile: activePreset?.id ?? 'custom',
                persistIntent: true,
                intentPolicy,
            })
        } catch (error) {
            if (!resolution) try {
                resolution = resolveSelection(loadedCatalog, packIds)
            } catch {
                // The original resolution error is the report authority.
            }
            throw recordFailure({
                reportRoot: options.root,
                inspectRoot: options.root,
                catalog: loadedCatalog,
                error,
                phase: options.command,
                packIds,
                resolution,
                patcherVersion,
            })
        }
        transition.compatibility = evaluateTargetCompatibility(
            options.root,
            resolution.packs,
        )
        transition.patcherUpdate = patcherUpdate
        if (options.command === 'plan') {
            print(summarizeTransition(transition), options.json)
            return
        }

        try {
            targetGate(transition.compatibility)
        } catch (error) {
            throw recordFailure({
                reportRoot: options.root,
                inspectRoot: options.root,
                catalog: loadedCatalog,
                error,
                phase: 'qualification',
                packIds,
                resolution,
                patcherVersion,
            })
        }

        let outcome
        try {
            outcome = applyTransition({
                root: options.root,
                transition,
                lockHeld: true,
            })
        } catch (error) {
            throw recordFailure({
                reportRoot: options.root,
                inspectRoot: options.root,
                catalog: loadedCatalog,
                error,
                phase: `${options.command}-write`,
                packIds,
                resolution,
                patcherVersion,
                writeSafety: {
                    liveSourceFilesChanged: error.code === 'STALE_TRANSITION'
                        ? false
                        : 'unknown-after-rollback-attempt',
                },
            })
        }
        print({ ...summarizeTransition(transition), outcome }, options.json)
    })
}

async function handleCliFailure(error, {
    fetchImpl = globalThis.fetch,
    reportDeliverer = deliverConflictReport,
    setExitCode = true,
} = {}) {
    console.error(`[pocketrisu-patches] ${error.message}`)
    if (error.code) console.error(`[${error.code}]`)
    if (error.report) {
        console.error(`[report] ${error.report.markdownPath}`)
        console.error(`[report-json] ${error.report.jsonPath}`)
    }
    if (error.reportDelivery) {
        try {
            const outcome = await reportDeliverer({
                ...error.reportDelivery,
                fetchImpl,
            })
            console.error(
                `[report-risu] delivered and verified in ${outcome.receiver.type} `
                + `"${outcome.receiverName}"`,
            )
        } catch (deliveryError) {
            console.error(`[report-risu-error] ${deliveryError.message}`)
            if (deliveryError.code) {
                console.error(`[${deliveryError.code}]`)
            }
            console.error(
                `[report-risu-help] create exactly one persona, module, or character `
                + `named "${DEFAULT_RECEIVER_NAME}", then run the report command again`,
            )
        }
    } else if (error.report) {
        console.error(
            `[report-risu-help] use "report --report-to auto" to copy the latest report `
            + `into the unique RisuAI object named "${DEFAULT_RECEIVER_NAME}"`,
        )
    }
    if (setExitCode) process.exitCode = 1
}

if (require.main === module) {
    runCli().catch(handleCliFailure)
}

module.exports = {
    handleCliFailure,
    parseArgs,
    requestedPacksForIntent,
    resolveIntentPolicy,
    resolveOperationIntent,
    runCli,
}
