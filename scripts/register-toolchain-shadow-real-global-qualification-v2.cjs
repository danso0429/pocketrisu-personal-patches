#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    loadStoreIdentity,
    parseJsonStrict,
    publishEvidenceBatch,
    sha256,
} = require('../src/qualification-object-store.cjs')
const {
    REAL_GLOBAL_QUALIFICATION_TYPE,
    appendRegistryEntry,
    buildContentManifestV2,
    buildCurrentRef,
    buildQualificationManifest,
    publishRegistrySnapshot,
    resolveVerifiedQualificationRegistryHead,
    updateCurrentRef,
    validateValidationResultV2,
} = require('../src/qualification-registry.cjs')
const {
    fullSchemaRegistry,
} = require('../src/qualification-verifier.cjs')
const {
    buildRealGlobalQualificationRecord,
    validateProvisioningReceipt,
} = require('../src/toolchain-shadow-real-global-qualification.cjs')
const { QUALIFICATION_TYPE } = require('../src/toolchain-shadow-qualification.cjs')
const { validateLocalShadowReceipt } = require('../src/toolchain-shadow-local.cjs')
const { evaluateExecutionReceipt } = require('../src/verification-receipts.cjs')
const { runChild } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { toolRoot: path.resolve(__dirname, '..') }
    const mapping = {
        '--store': 'storeRoot', '--subject': 'subjectFile',
        '--source-identity': 'sourceIdentityFile', '--provisioning': 'provisioningFile',
        '--local-receipt': 'localReceiptFile', '--global-receipt': 'globalReceiptFile',
        '--reason': 'reason', '--tool-root': 'toolRoot', '--subject-root': 'subjectRoot',
    }
    const seen = new Set()
    for (let index = 2; index < argv.length; index += 2) {
        const flag = argv[index]
        const key = mapping[flag]
        if (!key || seen.has(flag) || index + 1 >= argv.length) {
            throw new Error(`Unknown, duplicate or incomplete option: ${flag}`)
        }
        options[key] = argv[index + 1]
        seen.add(flag)
    }
    for (const key of [
        'storeRoot', 'subjectFile', 'sourceIdentityFile', 'provisioningFile',
        'localReceiptFile', 'globalReceiptFile', 'reason', 'subjectRoot',
    ]) if (!options[key]) throw new Error(`Missing required option: ${key}`)
    for (const key of Object.keys(options)) {
        if (key.endsWith('Root') || key.endsWith('File')) options[key] = path.resolve(options[key])
    }
    return options
}

async function gitCommit(root) {
    const result = await runChild('git', ['--no-pager', '-C', root, 'rev-parse', 'HEAD'], {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxOutputBytes: 1024 * 1024,
    })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || !/^[0-9a-f]{40}\n?$/.test(result.stdout)) {
        throw new Error('Cannot resolve v2 qualification tool commit')
    }
    return result.stdout.trim()
}

function directoryIdentity(root) {
    if (!fs.existsSync(root)) return sha256(canonicalJsonBytes({ exists: false, entries: [] }))
    const entries = []
    function walk(directory, relative) {
        for (const name of fs.readdirSync(directory).sort()) {
            const absolute = path.join(directory, name)
            const child = relative === '' ? name : `${relative}/${name}`
            const stat = fs.lstatSync(absolute)
            if (stat.isDirectory()) walk(absolute, child)
            else if (stat.isFile()) entries.push({ path: child, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) })
            else if (stat.isSymbolicLink()) entries.push({ path: child, symlink: fs.readlinkSync(absolute) })
            else throw new Error(`Unsupported operating evidence entry: ${absolute}`)
        }
    }
    walk(root, '')
    return sha256(canonicalJsonBytes({ exists: true, entries }))
}

function writePrivateFile(file, bytes) {
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY)
    try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

async function runIndependentVerifier(args) {
    const result = await runChild(process.execPath, [
        path.join(__dirname, 'verify-qualification-evidence.cjs'), ...args,
    ], { cwd: path.resolve(__dirname, '..'), maxOutputBytes: 32 * 1024 * 1024 })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || result.stdout.trim() === '' || result.stderr !== '') {
        const error = new Error('Independent v2 qualification verifier failed')
        error.code = 'INDEPENDENT_VERIFIER_FAILED'
        error.details = result
        throw error
    }
    return parseJsonStrict(result.stdout, 'independent v2 verifier output')
}

function publishOne({ storeRoot, entry, qualificationToolCommit, createdAt }) {
    return publishEvidenceBatch({
        storeRoot,
        entries: [entry],
        schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit },
        createdAt,
    }).objects[0]
}

async function main(argv = process.argv) {
    const options = parseArgs(argv)
    const identity = loadStoreIdentity(options.storeRoot)
    const qualificationToolCommit = await gitCommit(options.toolRoot)
    const subject = parseJsonStrict(fs.readFileSync(options.subjectFile), 'v2 qualification subject')
    if (subject.qualificationToolCommit !== qualificationToolCommit) {
        throw new Error('V2 qualification subject was produced by another tooling commit')
    }
    const sourceIdentity = parseJsonStrict(fs.readFileSync(options.sourceIdentityFile), 'v2 source identity')
    const provisioningReceipt = validateProvisioningReceipt(
        parseJsonStrict(fs.readFileSync(options.provisioningFile), 'v2 provisioning receipt'),
    )
    const localReceipt = validateLocalShadowReceipt(
        parseJsonStrict(fs.readFileSync(options.localReceiptFile), 'v2 local receipt'),
    )
    const globalReceipt = parseJsonStrict(fs.readFileSync(options.globalReceiptFile), 'v2 Global receipt')
    const globalEvaluation = evaluateExecutionReceipt(globalReceipt)
    if (!globalEvaluation.receiptValid || !globalEvaluation.executionAccepted) {
        throw new Error('V2 Global receipt is not independently accepted')
    }
    const qualificationRecord = buildRealGlobalQualificationRecord({
        subject, sourceIdentity, provisioningReceipt, localReceipt, globalReceipt,
    })
    const createdAt = new Date().toISOString()
    const operatingBefore = directoryIdentity(path.join(options.storeRoot, 'objects'))
    const sourcePublication = publishEvidenceBatch({
        storeRoot: options.storeRoot,
        entries: [
            {
                payloadModel: 'canonical-json', mediaType: 'application/json',
                role: 'real-global-qualification-record', referencedSchema: qualificationRecord.schema,
                value: qualificationRecord,
            },
            {
                payloadModel: 'canonical-json', mediaType: 'application/json',
                role: 'real-global-qualification-provisioning', referencedSchema: provisioningReceipt.schema,
                value: provisioningReceipt,
            },
            {
                payloadModel: 'raw-blob', mediaType: 'application/json',
                role: 'real-global-qualification-local-receipt', referencedSchema: localReceipt.schema,
                value: fs.readFileSync(options.localReceiptFile),
            },
            {
                payloadModel: 'raw-blob', mediaType: 'application/json',
                role: 'real-global-qualification-global-receipt', referencedSchema: globalReceipt.schema,
                value: fs.readFileSync(options.globalReceiptFile),
            },
        ],
        schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit },
        createdAt,
    })
    const [qualificationObject, provisioningObject, localObject, globalObject] = sourcePublication.objects
    const content = buildContentManifestV2({
        createdAt,
        subject,
        objects: {
            qualificationRecordDescriptorSha256: qualificationObject.descriptorSha256,
            provisioningReceiptDescriptorSha256: provisioningObject.descriptorSha256,
            localReceiptDescriptorSha256: localObject.descriptorSha256,
            globalReceiptDescriptorSha256: globalObject.descriptorSha256,
        },
    })
    const contentObject = publishOne({
        storeRoot: options.storeRoot, qualificationToolCommit, createdAt,
        entry: {
            payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
            role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
        },
    })
    const temporaryRoot = path.join(options.storeRoot, 'v2/tmp')
    const subjectFile = path.join(temporaryRoot, `.subject-v2.${process.pid}.${crypto.randomUUID()}.json`)
    const validationFile = path.join(temporaryRoot, `.validation-v2.${process.pid}.${crypto.randomUUID()}.json`)
    writePrivateFile(subjectFile, canonicalJsonBytes(subject))
    try {
        await runIndependentVerifier([
            '--store', options.storeRoot, '--content-manifest', contentObject.descriptorSha256,
            '--subject', subjectFile, '--validation-output', validationFile,
            '--qualification-type', REAL_GLOBAL_QUALIFICATION_TYPE,
            '--tool-root', options.toolRoot, '--subject-root', options.subjectRoot,
        ])
        const validation = validateValidationResultV2(
            parseJsonStrict(fs.readFileSync(validationFile), 'v2 independent validation result'),
        )
        const validationObject = publishOne({
            storeRoot: options.storeRoot, qualificationToolCommit, createdAt,
            entry: {
                payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
                role: 'independent-qualification-validation', referencedSchema: validation.schema, value: validation,
            },
        })
        const finalManifest = buildQualificationManifest({
            createdAt, subject, qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
            contentManifestDescriptorSha256: contentObject.descriptorSha256,
            validationResultDescriptorSha256: validationObject.descriptorSha256,
        })
        const finalObject = publishOne({
            storeRoot: options.storeRoot, qualificationToolCommit, createdAt,
            entry: {
                payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
                role: 'final-qualification-manifest', referencedSchema: finalManifest.schema, value: finalManifest,
            },
        })
        await runIndependentVerifier([
            '--store', options.storeRoot, '--qualification-manifest', finalObject.descriptorSha256,
            '--subject', subjectFile, '--qualification-type', REAL_GLOBAL_QUALIFICATION_TYPE,
            '--tool-root', options.toolRoot, '--subject-root', options.subjectRoot,
        ])
        const current = resolveVerifiedQualificationRegistryHead(options.storeRoot)
        const historicalV1Entries = current.registry.entries.filter(
            (entry) => entry.qualificationType === QUALIFICATION_TYPE,
        )
        if (historicalV1Entries.length !== 1
            || historicalV1Entries[0].action !== 'accept'
            || historicalV1Entries[0].disposition !== 'accepted-qualification') {
            throw new Error('Historical v1 accepted qualification is not uniquely preserved')
        }
        const appended = appendRegistryEntry({
            baseRegistry: current.registry,
            baseRegistryDescriptorSha256: current.registryDescriptorSha256,
            storeIdentityHash: identity.storeIdentityHash,
            action: 'accept', qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
            subject, qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
            reason: options.reason, timestamp: createdAt,
        })
        if (appended.idempotent) throw new Error('A v2 qualification was already registered unexpectedly')
        const registryObject = publishRegistrySnapshot({
            storeRoot: options.storeRoot, registry: appended.registry,
            qualificationToolCommit, createdAt,
        })
        updateCurrentRef(options.storeRoot, buildCurrentRef({
            storeIdentityHash: identity.storeIdentityHash,
            registryId: appended.registry.registryId,
            registryDescriptorSha256: registryObject.descriptorSha256,
            snapshotSequence: appended.registry.snapshotSequence,
            registryRootSha256: appended.registry.registryRootSha256,
            updatedAt: createdAt,
        }))
        const verifiedHead = resolveVerifiedQualificationRegistryHead(options.storeRoot)
        if (verifiedHead.registryDescriptorSha256 !== registryObject.descriptorSha256) {
            throw new Error('V2 registry snapshot is not the unique maximal head')
        }
        await runIndependentVerifier([
            '--store', options.storeRoot, '--registry', registryObject.descriptorSha256,
            '--subject', subjectFile, '--qualification-type', REAL_GLOBAL_QUALIFICATION_TYPE,
            '--require-current-ref', '--tool-root', options.toolRoot, '--subject-root', options.subjectRoot,
        ])
        const historicalSubjectFile = path.join(
            temporaryRoot, `.historical-subject-v1.${process.pid}.${crypto.randomUUID()}.json`,
        )
        writePrivateFile(historicalSubjectFile, canonicalJsonBytes(historicalV1Entries[0].subject))
        try {
            await runIndependentVerifier([
                '--store', options.storeRoot, '--registry', registryObject.descriptorSha256,
                '--subject', historicalSubjectFile, '--qualification-type', QUALIFICATION_TYPE,
                '--require-current-ref', '--tool-root', options.toolRoot,
                '--subject-root', options.subjectRoot,
            ])
        } finally {
            try { fs.unlinkSync(historicalSubjectFile) } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }
        }
        if (directoryIdentity(path.join(options.storeRoot, 'objects')) !== operatingBefore) {
            throw new Error('V2 qualification registration changed legacy operating evidence')
        }
        const comparison = globalReceipt.verifierResult.toolchainShadowComparison
        const report = {
            registered: true,
            qualificationType: REAL_GLOBAL_QUALIFICATION_TYPE,
            qualificationIdentity: finalObject.descriptorSha256,
            qualificationRecordDescriptorSha256: qualificationObject.descriptorSha256,
            provisioningReceiptDescriptorSha256: provisioningObject.descriptorSha256,
            localReceiptDescriptorSha256: localObject.descriptorSha256,
            globalReceiptDescriptorSha256: globalObject.descriptorSha256,
            contentManifestDescriptorSha256: contentObject.descriptorSha256,
            validationResultDescriptorSha256: validationObject.descriptorSha256,
            registryDescriptorSha256: registryObject.descriptorSha256,
            registryEntrySha256: appended.entry.entrySha256,
            registryEntryId: appended.entry.entryId,
            registryRootSha256: appended.registry.registryRootSha256,
            registryId: appended.registry.registryId,
            snapshotSequence: appended.registry.snapshotSequence,
            verifiedRegistryHead: {
                ...verifiedHead.metrics,
                uniqueMaximalHead: verifiedHead.metrics.maximalHeadCount === 1,
                currentRefMatchesMaximalHead:
                    verifiedHead.metrics.currentRefSnapshotSha256
                        === verifiedHead.metrics.verifiedMaximalHeadSha256,
                rollback: verifiedHead.metrics.rollbackDetected,
                fork: verifiedHead.metrics.forkDetected,
                invalidTrailingSnapshots: verifiedHead.metrics.invalidSnapshotCount,
            },
            historicalV1StillVerifiable: true,
            localCasesCompleted: localReceipt.coverage.processedExecutions,
            globalRunId: globalReceipt.globalRunId,
            globalMasksCompleted: globalReceipt.verifierResult.verifiedSelections,
            comparisons: comparison.coverage.processedMasks,
            matches: comparison.matches,
            mismatches: comparison.mismatches,
            operatingCounts: appended.entry.operatingCounts,
            operatingLedgerChanged: false,
        }
        process.stdout.write(`${JSON.stringify(report)}\n`)
        return report
    } finally {
        for (const file of [subjectFile, validationFile]) {
            try { fs.unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
        }
    }
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
        code: error.code ?? null, message: error.message, details: error.details ?? null,
    })}\n`)
    process.exitCode = 1
})

module.exports = { directoryIdentity, main, parseArgs, runIndependentVerifier }
