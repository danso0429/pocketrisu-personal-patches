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
    saveIntent,
    status,
    withRootLock,
} = require('./manager.cjs')
const {
    PROFILES,
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
        preset: null,
        packIds: null,
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
            || value === '--profile'
            || value === '--preset'
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
            else options.preset = next
        }
        else if (value === '--packs') {
            const raw = argv[++index]
            if (raw === undefined || raw.startsWith('--')) {
                throw new Error('--packs requires a comma-separated value')
            }
            options.packIds = raw === 'none'
                ? []
                : raw.split(',').map((id) => id.trim()).filter(Boolean)
        }
        else if (value === '--all') options.all = true
        else if (value === '--json') options.json = true
        else throw new Error(`Unknown argument: ${value}`)
    }
    if (options.all && options.preset) {
        throw new Error('--all and --preset cannot be combined')
    }
    if (options.all && options.packIds !== null) {
        throw new Error('--all and --packs cannot be combined')
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

function inferRequestedPacks(state, catalog) {
    if (!state) return null
    const byId = new Map(catalog.map((pack) => [pack.id, pack]))
    return state.packs
        .map((pack) => pack.id)
        .filter((id) => !byId.has(id) || byId.get(id).userSelectable !== false)
        .sort()
}

function samePackIds(left, right) {
    const sortedLeft = [...left].sort()
    const sortedRight = [...right].sort()
    return (
        sortedLeft.length === sortedRight.length
        && sortedLeft.every((id, index) => id === sortedRight[index])
    )
}

function resolveIntentPolicy(intent, catalog) {
    if (!intent) return null
    if (intent.mode !== 'legacy') return normalizeIntentPolicy(intent)
    if (!intent.preset) return customIntent(intent.requestedPacks)

    const profile = resolveProfile(intent.preset, catalog)
    const defaults = resolveSelection(catalog, profile.defaults, {
        allowedIds: profile.allowed,
    }).effectiveRequested
    return samePackIds(intent.requestedPacks, defaults)
        ? presetIntent(profile.id)
        : customIntent(intent.requestedPacks, profile.id)
}

function requestedPacksForIntent(intentPolicy, catalog) {
    if (!intentPolicy) return null
    if (intentPolicy.mode === 'preset') {
        return resolveProfile(intentPolicy.preset, catalog).defaults
    }
    return intentPolicy.requestedPacks
}

function selectActivePreset({
    explicitPreset,
    intentPolicy,
    previous,
    explicitPacks,
    catalog,
}) {
    if (explicitPreset) return explicitPreset
    if (intentPolicy?.preset) return resolveProfile(intentPolicy.preset, catalog)
    if (!explicitPacks && previous?.profile && PROFILES[previous.profile]) {
        return resolveProfile(previous.profile, catalog)
    }
    return null
}

function resolveOperationIntent({
    options,
    catalog,
    explicitPreset,
    intent,
    previous,
}) {
    const savedPolicy = resolveIntentPolicy(intent, catalog)
    const activePreset = selectActivePreset({
        explicitPreset,
        intentPolicy: savedPolicy,
        previous,
        explicitPacks: options.packIds !== null,
        catalog,
    })

    let intentPolicy = null
    if (options.command === 'revert') {
        intentPolicy = customIntent([], activePreset?.id ?? null)
    } else if (options.all) {
        if (!activePreset) throw new Error('--all requires an active preset')
        intentPolicy = presetIntent(activePreset.id)
    } else if (options.packIds !== null) {
        intentPolicy = customIntent(options.packIds, activePreset?.id ?? null)
    } else if (savedPolicy) {
        intentPolicy = savedPolicy
    } else {
        const inferred = inferRequestedPacks(previous, catalog)
        if (inferred !== null) {
            intentPolicy = customIntent(inferred, activePreset?.id ?? null)
        } else if (activePreset) {
            intentPolicy = presetIntent(activePreset.id)
        }
    }

    if (intentPolicy?.mode === 'custom' && activePreset) {
        intentPolicy = customIntent(intentPolicy.requestedPacks, activePreset.id)
    }
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

async function promptForSelection({
    catalog,
    current = [],
    presetId = null,
    input = process.stdin,
    output = process.stdout,
}) {
    if (!input.isTTY || !output.isTTY) {
        throw new Error('Interactive configure requires a terminal; pass --packs a,b instead')
    }
    const readline = require('node:readline/promises')
    const interface_ = readline.createInterface({ input, output })
    const selected = new Set(current)

    async function choose(question, allowed, fallback) {
        while (true) {
            const answer = (await interface_.question(question)).trim().toLowerCase()
            if (!answer) return fallback
            if (allowed.includes(answer)) return answer
            output.write(`Choose ${allowed.join(', ')}.\n`)
        }
    }

    async function toggle(pack) {
        const enabled = selected.has(pack.id)
        const answer = await choose(
            `${pack.title ?? pack.id} [${enabled ? 'Y/n' : 'y/N'}]: `,
            ['y', 'yes', 'n', 'no'],
            enabled ? 'y' : 'n',
        )
        if (answer === 'y' || answer === 'yes') selected.add(pack.id)
        else selected.delete(pack.id)
    }

    try {
        output.write([
            'Selection mode:',
            '  a) All available capabilities',
            '  c) Customize capabilities',
            '  n) None (revert all managed patches)',
            '',
        ].join('\n'))
        const mode = await choose(
            'Selection mode [c]: ',
            ['a', 'all', 'c', 'customize', 'n', 'none'],
            'c',
        )
        if (mode === 'a' || mode === 'all') {
            return presetIntent(presetId ?? 'all')
        }
        if (mode === 'n' || mode === 'none') return customIntent([], presetId)

        const storageDefault = selected.has('lazy-chat-sync')
            ? '2'
            : (selected.has('startup-cache') ? '1' : '0')
        output.write([
            'Storage mode:',
            '  0) Standard PocketRisu storage',
            '  1) Startup cache only',
            '  2) Lazy chat synchronization (includes startup cache)',
            '',
        ].join('\n'))
        const storage = await choose(
            `Storage mode [${storageDefault}]: `,
            ['0', '1', '2'],
            storageDefault,
        )
        selected.delete('startup-cache')
        selected.delete('lazy-chat-sync')
        if (storage === '1') selected.add('startup-cache')
        if (storage === '2') selected.add('lazy-chat-sync')

        for (const pack of catalog) {
            if (
                pack.userSelectable === false
                || pack.id === 'startup-cache'
                || pack.id === 'lazy-chat-sync'
            ) continue
            await toggle(pack)
        }
        return customIntent([...selected], presetId)
    } finally {
        interface_.close()
    }
}

async function runCli({
    argv = process.argv,
    catalog = null,
    fixedProfile = null,
    repositoryRoot,
    promptSelection = promptForSelection,
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
    const presetId = fixedProfile ?? (options.all ? 'all' : options.preset)
    if (fixedProfile && options.preset && options.preset !== fixedProfile) {
        throw new Error(`This artifact is fixed to the ${fixedProfile} profile`)
    }
    const preset = presetId ? resolveProfile(presetId, loadedCatalog) : null
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
            selectable: pack.userSelectable !== false
                && (preset ? preset.allowed.includes(pack.id) : true),
            default: preset ? preset.defaults.includes(pack.id) : false,
            required: preset ? preset.required.includes(pack.id) : false,
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

    if (options.command === 'configure') {
        const previousIntent = loadIntent(options.root)
        const previousPolicy = resolveIntentPolicy(previousIntent, loadedCatalog)
        const previousState = loadState(options.root, DEFAULT_STATE_PATH)
        if (preset) validateProfileTransition(preset, previousState, loadedCatalog)
        const inferred = previousIntent
            ? null
            : inferRequestedPacks(previousState, loadedCatalog)
        const currentPolicy = previousPolicy
            ?? (inferred === null ? null : customIntent(inferred, preset?.id ?? null))
        let intentPolicy
        if (options.all) {
            intentPolicy = presetIntent(preset.id)
        } else if (options.packIds !== null) {
            intentPolicy = customIntent(options.packIds, preset?.id ?? null)
        } else {
            const prompted = await promptSelection({
                    catalog: loadedCatalog.filter((pack) =>
                        !preset || pack.userSelectable === false || preset.allowed.includes(pack.id)
                    ),
                    current: requestedPacksForIntent(currentPolicy, loadedCatalog)
                        ?? preset?.defaults
                        ?? [],
                    presetId: preset?.id ?? null,
                })
            intentPolicy = Array.isArray(prompted)
                ? customIntent(prompted, preset?.id ?? null)
                : normalizeIntentPolicy(prompted)
        }
        const requested = requestedPacksForIntent(intentPolicy, loadedCatalog)
        if (preset) validateProfileSelection(preset, requested)
        let resolution
        try {
            resolution = resolveSelection(loadedCatalog, requested, {
                allowedIds: preset?.allowed ?? null,
            })
        } catch (error) {
            throw recordFailure({
                reportRoot: options.root,
                inspectRoot: options.root,
                catalog: loadedCatalog,
                error,
                phase: 'configure',
                packIds: requested,
                resolution: null,
                patcherVersion,
            })
        }
        const persistedIntent = intentPolicy.mode === 'preset'
            ? intentPolicy
            : customIntent(resolution.effectiveRequested, intentPolicy.preset)
        const outcome = saveIntent({
            root: options.root,
            intent: persistedIntent,
        })
        print({
            preset: preset?.id ?? null,
            intent: persistedIntent,
            ...summarizeResolution(resolution),
            compatibility: evaluateTargetCompatibility(options.root, resolution.packs),
            patcherUpdate,
            outcome,
            sourceFilesChanged: false,
        }, options.json)
        return
    }

    if (options.command === 'stage') {
        if (!options.candidate) {
            throw new Error('stage requires --candidate PATH')
        }
        const intent = loadIntent(options.root)
        const previous = loadState(options.root, DEFAULT_STATE_PATH)
        const selection = resolveOperationIntent({
            options,
            catalog: loadedCatalog,
            explicitPreset: preset,
            intent,
            previous,
        })
        const { activePreset, intentPolicy, packIds } = selection
        if (activePreset) {
            validateProfileTransition(activePreset, previous, loadedCatalog)
        }
        if (!packIds) {
            throw new Error('No saved selection; run configure or pass --packs a,b')
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
            const inferred = intent
                ? null
                : inferRequestedPacks(loadState(options.root, DEFAULT_STATE_PATH), loadedCatalog)
            current.inferredIntent = inferred
            const desiredPolicy = intentPolicy
                ?? (inferred === null ? null : customIntent(inferred))
            const desiredPackIds = requestedPacksForIntent(desiredPolicy, loadedCatalog)
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
            throw new Error('Usage: <configure|plan|apply|revert|stage|status|list|report> [--root PATH] [--candidate PATH] [--preset NAME|--all] [--packs a,b|none] [--report-to auto|persona|module|character] [--report-id ID] [--risu-url LOOPBACK_URL] [--json]')
        }

        const intent = loadIntent(options.root)
        const previous = loadState(options.root, DEFAULT_STATE_PATH)
        const selection = resolveOperationIntent({
            options,
            catalog: loadedCatalog,
            explicitPreset: preset,
            intent,
            previous,
        })
        const { activePreset, intentPolicy, packIds } = selection
        if (activePreset) {
            validateProfileTransition(activePreset, previous, loadedCatalog)
        }
        if (!packIds) {
            throw new Error('No saved selection; run configure or pass --packs a,b')
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
    inferRequestedPacks,
    parseArgs,
    promptForSelection,
    requestedPacksForIntent,
    resolveIntentPolicy,
    resolveOperationIntent,
    runCli,
    selectActivePreset,
}
