'use strict'

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
    canonicalJsonBytes,
    parseJsonStrict,
    sha256,
} = require('../src/qualification-object-store.cjs')
const { parseArgs } = require('../scripts/register-toolchain-shadow-qualification.cjs')
const {
    BUILD_BOUNDARY_CLASS,
    CANONICAL_TARGET_TREE_SHA256,
    COMPILED_DECLARATION_SHA256,
    CONTRACT_SHA256,
    POLICY_SHA256,
    QUARANTINE_MANIFEST_SHA256,
    SUBJECT_IMPLEMENTATION_COMMIT,
    TARGET_COMMIT,
    buildMachineClosureReceipt,
    buildSupportRecord,
    deriveFixtureIdentity,
    evaluateFocusedTestExecution,
    validateReceiptPair,
} = require('../src/toolchain-shadow-qualification.cjs')
const { runChild } = require('../src/verification-evidence.cjs')

const repositoryRoot = path.resolve(__dirname, '..')
const registrationScript = path.join(repositoryRoot, 'scripts/register-toolchain-shadow-qualification.cjs')
const initializerScript = path.join(repositoryRoot, 'scripts/init-qualification-evidence-store.cjs')
const subjectRoot = '/home/ubuntu/nai-studio-2/.worktrees/toolchain-hardening-shadow-pilot'
const targetRoot = '/tmp/pocketrisu-v190-audit'
const quarantineRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine'
const closureQuarantineRoot = path.join(quarantineRoot, 'toolchain-shadow-closure-54c8307f87354ba1')
const disposableRootBase = '/home/ubuntu/.local/state/pocketrisu-patcher/qualification-parser-tests'
const realStoreRoot = '/home/ubuntu/.local/share/pocketrisu-patcher/evidence'
const localBytes = fs.readFileSync(path.join(closureQuarantineRoot, 'local-synthetic-known-answer.json'))
const globalBytes = fs.readFileSync(path.join(closureQuarantineRoot, 'global-synthetic-known-answer.json'))
const receiptPair = validateReceiptPair(localBytes, globalBytes)

const valueOptions = [
    '--store',
    '--support',
    '--closure',
    '--local-receipt',
    '--global-synthetic-receipt',
    '--closure-narrative',
    '--source-event',
    '--environment-narrative',
    '--reason',
    '--tool-root',
    '--subject-root',
]

const requiredOptions = [
    '--store',
    '--support',
    '--closure',
    '--local-receipt',
    '--global-synthetic-receipt',
    '--reason',
    '--subject-root',
]

function currentToolCommit() {
    return execFileSync('git', ['--no-pager', '-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function optionValues(root = '/fixture') {
    return new Map([
        ['--store', path.join(root, 'store')],
        ['--support', path.join(root, 'support.json')],
        ['--closure', path.join(root, 'closure.json')],
        ['--local-receipt', path.join(root, 'local.json')],
        ['--global-synthetic-receipt', path.join(root, 'global.json')],
        ['--closure-narrative', path.join(root, 'closure.md')],
        ['--source-event', path.join(root, 'source-event.jsonl')],
        ['--environment-narrative', path.join(root, 'environment.md')],
        ['--reason', 'reviewed parser regression'],
        ['--tool-root', repositoryRoot],
        ['--subject-root', subjectRoot],
    ])
}

function argvFor(flags = valueOptions, root = '/fixture') {
    const values = optionValues(root)
    return ['node', registrationScript, ...flags.flatMap((flag) => [flag, values.get(flag)])]
}

function omitPair(argv, flag) {
    const result = [...argv]
    const index = result.indexOf(flag)
    result.splice(index, 2)
    return result
}

function receiptIdentity(bytes, receipt, kind) {
    return {
        kind,
        rawSha256: sha256(bytes),
        rawBytes: bytes.length,
        schema: receipt.schema,
        semanticSha256: sha256(canonicalJsonBytes(receipt)),
        payloadIntegritySha256: receipt.integrity.payloadSha256,
    }
}

function machineSupport(toolCommit) {
    return buildSupportRecord({
        recordedAt: '2026-08-15T14:00:00.000Z',
        authority: {
            governanceRepository: 'danso0429/patch-verification-governance',
            governanceCommit: '49d891b12a51745b9da91bf23105d78869cf8664',
            governanceStatusVersion: 12,
            subjectImplementationCommit: SUBJECT_IMPLEMENTATION_COMMIT,
            subjectBranch: 'codex/toolchain-hardening-shadow-pilot',
            qualificationToolCommit: toolCommit,
            qualificationToolClean: true,
            policySha256: POLICY_SHA256,
        },
        sourceIdentity: {
            sourcePreSha256: '1'.repeat(64),
            sourcePostSha256: '1'.repeat(64),
            catalogSha256: '2'.repeat(64),
            subjectSchemasSha256: '3'.repeat(64),
            qualificationSchemasSha256: '4'.repeat(64),
            localRouteSha256: '5'.repeat(64),
            globalProjectionRouteSha256: '6'.repeat(64),
            contractSha256: CONTRACT_SHA256,
            compiledDeclarationSha256: COMPILED_DECLARATION_SHA256,
        },
        targetIdentity: {
            role: 'canonical-audited-target',
            commit: TARGET_COMMIT,
            applicationTreeSha256: CANONICAL_TARGET_TREE_SHA256,
            targetPreSha256: '7'.repeat(64),
            targetPostSha256: '7'.repeat(64),
        },
        environment: {
            admittedBoundary: { ...BUILD_BOUNDARY_CLASS },
            libcVersionRuntime: '2.39',
            pnpmExecutable: '/isolated/task/node_modules/.bin/pnpm',
            pnpmExecutableSha256: '8'.repeat(64),
            provisioning: {
                method: 'unique-task-scoped-temporary-installation',
                command: { executable: 'npm', args: ['install', 'pnpm@10.34.1'] },
                installStdoutSha256: '9'.repeat(64),
                installStderrSha256: 'a'.repeat(64),
                installExitCode: 0,
                repositoryMutationAllowed: false,
                lockfileMutationAllowed: false,
                cleanupRequired: true,
            },
        },
        fixtureDerivation: deriveFixtureIdentity(subjectRoot),
        receiptValidation: {
            quarantineManifestRawSha256: QUARANTINE_MANIFEST_SHA256,
            quarantineAuthoritative: false,
            local: {
                ...receiptIdentity(localBytes, receiptPair.localReceipt, 'synthetic-known-answer'),
                localMasks: 2,
                boundaryClasses: 4,
                expectedExecutions: 8,
                processedExecutions: 8,
                freshIsolation: true,
            },
            globalSynthetic: {
                ...receiptIdentity(globalBytes, receiptPair.globalReceipt, 'synthetic-projection'),
                sourceKind: 'synthetic-projection',
                processedMasks: 4096,
                mismatches: 0,
                canonicalGlobalExhaustiveExecuted: false,
            },
            pairLinked: true,
        },
        focusedTests: evaluateFocusedTestExecution({
            exitCode: 0,
            signal: null,
            spawnError: null,
            outputError: null,
            stdout: 'TAP version 13\n1..2\n# tests 2\n# pass 2\n# fail 0\n',
            stderr: '',
        }),
        integrityChecks: {
            subjectCleanBefore: true,
            subjectCleanAfter: true,
            sourcePrePostMatched: true,
            targetPrePostMatched: true,
            repositoryFilesUnchanged: true,
            lockfileUnchanged: true,
            targetClean: true,
            receiptIntegrityPassed: true,
        },
    })
}

async function requireSuccessfulJsonChild(child, label) {
    assert.equal(child.spawnError, null, `${label} spawn error`)
    assert.equal(child.outputError, null, `${label} output error`)
    assert.equal(child.signal, null, `${label} signal`)
    assert.equal(child.exitCode, 0, child.stderr)
    assert.notEqual(child.stdout.trim(), '', `${label} empty stdout`)
    return parseJsonStrict(child.stdout, `${label} output`)
}

test('original double-increment token shape consumes every adjacent flag and value exactly once', () => {
    const parsed = parseArgs(argvFor())
    const values = optionValues()
    assert.equal(parsed.storeRoot, values.get('--store'))
    assert.equal(parsed.supportFile, values.get('--support'))
    assert.equal(parsed.closureFile, values.get('--closure'))
    assert.equal(parsed.localReceiptFile, values.get('--local-receipt'))
    assert.equal(parsed.globalReceiptFile, values.get('--global-synthetic-receipt'))
    assert.equal(parsed.narrativeFile, values.get('--closure-narrative'))
    assert.equal(parsed.sourceEventFile, values.get('--source-event'))
    assert.equal(parsed.environmentNarrativeFile, values.get('--environment-narrative'))
    assert.equal(parsed.reason, values.get('--reason'))
    assert.equal(parsed.toolRoot, values.get('--tool-root'))
    assert.equal(parsed.subjectRoot, values.get('--subject-root'))
})

test('required options parse in canonical and reordered forms with the final value at argv end', () => {
    const canonical = parseArgs(argvFor(requiredOptions))
    assert.equal(canonical.reason, 'reviewed parser regression')
    const reordered = [
        '--reason',
        '--subject-root',
        '--local-receipt',
        '--store',
        '--global-synthetic-receipt',
        '--support',
        '--closure',
    ]
    const parsed = parseArgs(argvFor(reordered))
    assert.equal(parsed.closureFile, '/fixture/closure.json')
    assert.equal(parsed.supportFile, '/fixture/support.json')
})

test('every value option rejects a missing value or a following option token', () => {
    for (const flag of valueOptions) {
        const withoutPair = omitPair(argvFor(), flag)
        assert.throws(() => parseArgs([...withoutPair, flag]), new RegExp(`Missing value for ${flag}`))
        assert.throws(() => parseArgs([...withoutPair, flag, '']), new RegExp(`Missing value for ${flag}`))
        assert.throws(() => parseArgs([...withoutPair, flag, '--store', '/other']), new RegExp(`Missing value for ${flag}`))
    }
})

test('unknown, positional, duplicate, malformed, and unsupported Boolean-shaped input fail closed', () => {
    assert.throws(() => parseArgs([...argvFor(), '--unknown', 'value']), /Unknown option: --unknown/)
    assert.throws(() => parseArgs(['node', registrationScript, 'positional', ...argvFor().slice(2)]), /Unknown option: positional/)
    assert.throws(() => parseArgs([...argvFor(), '--store', '/duplicate']), /Duplicate option: --store/)
    assert.throws(() => parseArgs([...argvFor(), 'orphan']), /Unknown option: orphan/)
    assert.throws(() => parseArgs([...argvFor(), '--require-current-ref']), /Unknown option: --require-current-ref/)
    assert.throws(() => parseArgs([...argvFor(), '--require-current-ref', 'true']), /Unknown option: --require-current-ref/)
})

test('every required option is independently required', () => {
    for (const flag of requiredOptions) {
        assert.throws(() => parseArgs(omitPair(argvFor(), flag)), /Missing required option:/)
    }
})

test('actual registration CLI accepts the formerly failing invocation and uses only a disposable external store', async (t) => {
    assert.equal(fs.existsSync(realStoreRoot), false, 'real accepted store must remain absent')
    fs.mkdirSync(disposableRootBase, { recursive: true, mode: 0o700 })
    fs.chmodSync(disposableRootBase, 0o700)
    const parent = fs.mkdtempSync(path.join(disposableRootBase, 'parser-'))
    let cleanupComplete = false
    t.after(() => {
        fs.rmSync(parent, { recursive: true, force: true })
        cleanupComplete = !fs.existsSync(parent)
        assert.equal(cleanupComplete, true, `disposable parser store was not removed: ${parent}`)
    })
    const storeRoot = path.join(parent, 'store')
    const initialized = await runChild(process.execPath, [
        initializerScript,
        '--store', storeRoot,
        '--subject-root', subjectRoot,
        '--target-root', targetRoot,
        '--quarantine-root', quarantineRoot,
        '--implementation-root', repositoryRoot,
    ], { cwd: repositoryRoot, maxOutputBytes: 4 * 1024 * 1024 })
    const initialization = await requireSuccessfulJsonChild(initialized, 'store initializer')
    assert.equal(initialization.store, storeRoot)

    const toolCommit = currentToolCommit()
    const support = machineSupport(toolCommit)
    const closure = buildMachineClosureReceipt({
        supportRecord: support,
        localReceipt: receiptPair.localReceipt,
        globalReceipt: receiptPair.globalReceipt,
        recordedAt: '2026-08-15T14:00:01.000Z',
    })
    const files = {
        support: path.join(parent, 'support.json'),
        closure: path.join(parent, 'closure.json'),
        local: path.join(parent, 'local.json'),
        global: path.join(parent, 'global.json'),
        narrative: path.join(parent, 'closure.md'),
        event: path.join(parent, 'source-event.jsonl'),
        environment: path.join(parent, 'environment.md'),
    }
    fs.writeFileSync(files.support, canonicalJsonBytes(support), { mode: 0o600 })
    fs.writeFileSync(files.closure, canonicalJsonBytes(closure), { mode: 0o600 })
    fs.writeFileSync(files.local, localBytes, { mode: 0o600 })
    fs.writeFileSync(files.global, globalBytes, { mode: 0o600 })
    fs.writeFileSync(files.narrative, '# Supporting narrative\n', { mode: 0o600 })
    fs.writeFileSync(files.event, '{"event":"supporting-source"}\n', { mode: 0o600 })
    fs.writeFileSync(files.environment, 'task-scoped fixture environment\n', { mode: 0o600 })

    const registered = await runChild(process.execPath, [
        registrationScript,
        '--store', storeRoot,
        '--support', files.support,
        '--closure', files.closure,
        '--local-receipt', files.local,
        '--global-synthetic-receipt', files.global,
        '--closure-narrative', files.narrative,
        '--source-event', files.event,
        '--environment-narrative', files.environment,
        '--tool-root', repositoryRoot,
        '--subject-root', subjectRoot,
        '--reason', 'qualification parser production-path regression',
    ], { cwd: repositoryRoot, maxOutputBytes: 32 * 1024 * 1024 })
    const report = await requireSuccessfulJsonChild(registered, 'qualification registration')
    assert.equal(report.registered, true)
    assert.equal(report.subjectImplementationCommit, SUBJECT_IMPLEMENTATION_COMMIT)
    assert.equal(report.qualificationToolCommit, toolCommit)
    assert.equal(report.operatingLedgerChanged, false)
    assert.deepEqual(report.operatingCounts, {
        materialOperatingCohort: false,
        stableRelease: false,
        productionDefectYield: false,
        candidateOperatingSample: false,
    })
    assert.equal(fs.existsSync(path.join(storeRoot, 'v2/refs/qualification/current.json')), true)
    assert.equal(fs.existsSync(realStoreRoot), false, 'registration must not initialize the real accepted store')
})
