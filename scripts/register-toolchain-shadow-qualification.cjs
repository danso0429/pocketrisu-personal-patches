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
    appendRegistryEntry,
    buildContentManifest,
    buildCurrentRef,
    buildQualificationManifest,
    publishRegistrySnapshot,
    readCurrentRegistry,
    registrySchemaRegistry,
    updateCurrentRef,
    validateValidationResult,
} = require('../src/qualification-registry.cjs')
const {
    assertQuarantineIsNotAcceptedStore,
    fullSchemaRegistry,
} = require('../src/qualification-verifier.cjs')
const {
    validateMachineClosureReceipt,
    validateSupportRecord,
} = require('../src/toolchain-shadow-qualification.cjs')
const { validateLocalShadowReceipt } = require('../src/toolchain-shadow-local.cjs')
const { validateGlobalProjectionReceipt } = require('../src/toolchain-shadow-global.cjs')
const { runChild } = require('../src/verification-evidence.cjs')

function parseArgs(argv) {
    const options = { toolRoot: path.resolve(__dirname, '..') }
    const values = argv.slice(2)
    const optionKeys = {
        '--store': 'storeRoot',
        '--support': 'supportFile',
        '--closure': 'closureFile',
        '--local-receipt': 'localReceiptFile',
        '--global-synthetic-receipt': 'globalReceiptFile',
        '--closure-narrative': 'narrativeFile',
        '--source-event': 'sourceEventFile',
        '--environment-narrative': 'environmentNarrativeFile',
        '--reason': 'reason',
        '--tool-root': 'toolRoot',
        '--subject-root': 'subjectRoot',
    }
    const seen = new Set()
    let index = 0
    while (index < values.length) {
        const flag = values[index]
        const key = optionKeys[flag]
        if (!key) throw new Error(`Unknown option: ${flag}`)
        if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`)
        if (index + 1 >= values.length || values[index + 1] === '' || values[index + 1].startsWith('--')) {
            throw new Error(`Missing value for ${flag}`)
        }
        options[key] = values[index + 1]
        seen.add(flag)
        index += 2
    }
    for (const key of ['storeRoot', 'supportFile', 'closureFile', 'localReceiptFile', 'globalReceiptFile', 'reason', 'subjectRoot']) {
        if (!options[key]) throw new Error(`Missing required option: ${key}`)
    }
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
        || result.signal !== null || !/^[0-9a-f]{40}\n?$/.test(result.stdout)) throw new Error('Cannot resolve qualification tool commit')
    return result.stdout.trim()
}

function directoryIdentity(root) {
    if (!fs.existsSync(root)) return sha256(canonicalJsonBytes({ exists: false, entries: [] }))
    const entries = []
    function walk(current, relative) {
        for (const name of fs.readdirSync(current).sort()) {
            const absolute = path.join(current, name)
            const child = relative === '' ? name : `${relative}/${name}`
            const stat = fs.lstatSync(absolute)
            if (stat.isDirectory()) {
                entries.push({ path: child, type: 'directory', mode: stat.mode & 0o7777 })
                walk(absolute, child)
            } else if (stat.isFile()) {
                entries.push({ path: child, type: 'file', mode: stat.mode & 0o7777, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) })
            } else if (stat.isSymbolicLink()) {
                entries.push({ path: child, type: 'symlink', target: fs.readlinkSync(absolute) })
            } else throw new Error(`Unsupported operating-ledger entry: ${absolute}`)
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
    const result = await runChild(process.execPath, [path.join(__dirname, 'verify-qualification-evidence.cjs'), ...args], {
        cwd: path.resolve(__dirname, '..'),
        maxOutputBytes: 32 * 1024 * 1024,
    })
    if (result.spawnError !== null || result.outputError !== null || result.exitCode !== 0
        || result.signal !== null || result.stdout.trim() === '' || result.stderr !== '') {
        const error = new Error('Independent qualification verifier failed')
        error.code = 'INDEPENDENT_VERIFIER_FAILED'
        error.details = result
        throw error
    }
    return parseJsonStrict(result.stdout, 'independent verifier output')
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
    assertQuarantineIsNotAcceptedStore(options.storeRoot)
    const identity = loadStoreIdentity(options.storeRoot)
    const qualificationToolCommit = await gitCommit(options.toolRoot)
    const createdAt = new Date().toISOString()
    const supportBytes = fs.readFileSync(options.supportFile)
    const closureBytes = fs.readFileSync(options.closureFile)
    const localBytes = fs.readFileSync(options.localReceiptFile)
    const globalBytes = fs.readFileSync(options.globalReceiptFile)
    const support = validateSupportRecord(parseJsonStrict(supportBytes, 'machine support'))
    const closure = parseJsonStrict(closureBytes, 'machine closure')
    const localReceipt = validateLocalShadowReceipt(parseJsonStrict(localBytes, 'local exact receipt'))
    const globalReceipt = validateGlobalProjectionReceipt(parseJsonStrict(globalBytes, 'Global synthetic exact receipt'))
    validateMachineClosureReceipt(closure, { supportRecord: support, localReceipt, globalReceipt })
    if (support.authority.qualificationToolCommit !== qualificationToolCommit
        || closure.subject.qualificationToolCommit !== qualificationToolCommit) {
        throw new Error('Machine closure was built by another qualification tool commit')
    }
    const subject = {
        implementationCommit: closure.subject.implementationCommit,
        qualificationToolCommit,
        policySha256: closure.subject.policySha256,
        contractSha256: closure.candidate.contractSha256,
        compiledDeclarationSha256: closure.candidate.compiledDeclarationSha256,
        targetCommit: closure.subject.targetCommit,
        targetApplicationTreeSha256: closure.subject.targetApplicationTreeSha256,
    }
    const operatingLedgerBefore = directoryIdentity(path.join(options.storeRoot, 'objects'))
    const entries = [
        {
            payloadModel: 'canonical-json', mediaType: 'application/json',
            role: 'machine-support-authority-environment', referencedSchema: support.schema, value: supportBytes,
        },
        {
            payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.toolchain-shadow-pilot-closure+json',
            role: 'machine-closure-receipt', referencedSchema: closure.schema, value: closureBytes,
        },
        {
            payloadModel: 'raw-blob', mediaType: 'application/json',
            role: 'local-synthetic-exact-receipt', referencedSchema: localReceipt.schema, value: localBytes,
        },
        {
            payloadModel: 'raw-blob', mediaType: 'application/json',
            role: 'global-synthetic-exact-receipt', referencedSchema: globalReceipt.schema, value: globalBytes,
        },
    ]
    const optionalIndexes = {}
    for (const [optionKey, role, mediaType] of [
        ['narrativeFile', 'closure-narrative', 'text/markdown; charset=utf-8'],
        ['sourceEventFile', 'closure-source-event', 'application/x-ndjson'],
        ['environmentNarrativeFile', 'environment-setup-narrative', 'text/markdown; charset=utf-8'],
    ]) {
        if (!options[optionKey]) continue
        optionalIndexes[optionKey] = entries.length
        entries.push({ payloadModel: 'raw-blob', mediaType, role, referencedSchema: null, value: fs.readFileSync(options[optionKey]) })
    }
    const sourcePublication = publishEvidenceBatch({
        storeRoot: options.storeRoot,
        entries,
        schemaRegistry: fullSchemaRegistry(),
        publisherToolIdentity: { qualificationToolCommit },
        createdAt,
    })
    const [supportObject, closureObject, localObject, globalObject] = sourcePublication.objects
    const content = buildContentManifest({
        createdAt,
        subject,
        objects: {
            machineClosureDescriptorSha256: closureObject.descriptorSha256,
            machineSupportDescriptorSha256: supportObject.descriptorSha256,
            authorityEnvironmentDescriptorSha256: supportObject.descriptorSha256,
            localReceiptDescriptorSha256: localObject.descriptorSha256,
            globalSyntheticReceiptDescriptorSha256: globalObject.descriptorSha256,
            closureNarrativeDescriptorSha256: optionalIndexes.narrativeFile === undefined
                ? null : sourcePublication.objects[optionalIndexes.narrativeFile].descriptorSha256,
            sourceEventDescriptorSha256: optionalIndexes.sourceEventFile === undefined
                ? null : sourcePublication.objects[optionalIndexes.sourceEventFile].descriptorSha256,
            environmentNarrativeDescriptorSha256: optionalIndexes.environmentNarrativeFile === undefined
                ? null : sourcePublication.objects[optionalIndexes.environmentNarrativeFile].descriptorSha256,
        },
    })
    const contentObject = publishOne({
        storeRoot: options.storeRoot,
        qualificationToolCommit,
        createdAt,
        entry: {
            payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
            role: 'qualification-content-manifest', referencedSchema: content.schema, value: content,
        },
    })
    const temporaryRoot = path.join(options.storeRoot, 'v2/tmp')
    const subjectFile = path.join(temporaryRoot, `.subject.${process.pid}.${crypto.randomUUID()}.json`)
    const validationFile = path.join(temporaryRoot, `.validation.${process.pid}.${crypto.randomUUID()}.json`)
    writePrivateFile(subjectFile, canonicalJsonBytes(subject))
    try {
        await runIndependentVerifier([
            '--store', options.storeRoot,
            '--content-manifest', contentObject.descriptorSha256,
            '--subject', subjectFile,
            '--validation-output', validationFile,
            '--tool-root', options.toolRoot,
            '--subject-root', options.subjectRoot,
        ])
        const validation = validateValidationResult(parseJsonStrict(fs.readFileSync(validationFile), 'independent validation result'))
        const validationObject = publishOne({
            storeRoot: options.storeRoot,
            qualificationToolCommit,
            createdAt,
            entry: {
                payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-validation+json',
                role: 'independent-qualification-validation', referencedSchema: validation.schema, value: validation,
            },
        })
        const finalManifest = buildQualificationManifest({
            createdAt,
            subject,
            contentManifestDescriptorSha256: contentObject.descriptorSha256,
            validationResultDescriptorSha256: validationObject.descriptorSha256,
        })
        const finalObject = publishOne({
            storeRoot: options.storeRoot,
            qualificationToolCommit,
            createdAt,
            entry: {
                payloadModel: 'canonical-json', mediaType: 'application/vnd.pocketrisu.qualification-manifest+json',
                role: 'final-qualification-manifest', referencedSchema: finalManifest.schema, value: finalManifest,
            },
        })
        await runIndependentVerifier([
            '--store', options.storeRoot,
            '--qualification-manifest', finalObject.descriptorSha256,
            '--subject', subjectFile,
            '--tool-root', options.toolRoot,
            '--subject-root', options.subjectRoot,
        ])
        const current = readCurrentRegistry(options.storeRoot)
        const appended = appendRegistryEntry({
            baseRegistry: current.registry,
            baseRegistryDescriptorSha256: current.registryDescriptorSha256,
            storeIdentityHash: identity.storeIdentityHash,
            action: 'accept',
            subject,
            qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
            reason: options.reason,
            timestamp: createdAt,
        })
        let registryObject
        if (appended.idempotent) {
            registryObject = { descriptorSha256: current.registryDescriptorSha256 }
        } else {
            registryObject = publishRegistrySnapshot({
                storeRoot: options.storeRoot,
                registry: appended.registry,
                qualificationToolCommit,
                createdAt,
            })
        }
        await runIndependentVerifier([
            '--store', options.storeRoot,
            '--registry', registryObject.descriptorSha256,
            '--subject', subjectFile,
            '--tool-root', options.toolRoot,
            '--subject-root', options.subjectRoot,
        ])
        const registry = appended.registry
        if (!appended.idempotent) {
            updateCurrentRef(options.storeRoot, buildCurrentRef({
                storeIdentityHash: identity.storeIdentityHash,
                registryDescriptorSha256: registryObject.descriptorSha256,
                registryRootSha256: registry.registryRootSha256,
                updatedAt: createdAt,
            }))
        }
        await runIndependentVerifier([
            '--store', options.storeRoot,
            '--registry', registryObject.descriptorSha256,
            '--subject', subjectFile,
            '--require-current-ref',
            '--tool-root', options.toolRoot,
            '--subject-root', options.subjectRoot,
        ])
        const operatingLedgerAfter = directoryIdentity(path.join(options.storeRoot, 'objects'))
        if (operatingLedgerAfter !== operatingLedgerBefore) throw new Error('Qualification registration changed legacy operating evidence')
        const report = {
            registered: true,
            idempotent: appended.idempotent,
            subjectImplementationCommit: subject.implementationCommit,
            qualificationToolCommit,
            qualificationManifestDescriptorSha256: finalObject.descriptorSha256,
            registryDescriptorSha256: registryObject.descriptorSha256,
            registryRootSha256: registry.registryRootSha256,
            entryId: appended.entry.entryId,
            operatingLedgerChanged: false,
            operatingCounts: appended.entry.operatingCounts,
        }
        process.stdout.write(`${JSON.stringify(report)}\n`)
        return report
    } finally {
        for (const file of [subjectFile, validationFile]) {
            try { fs.unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
        }
    }
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${JSON.stringify({ code: error.code ?? null, message: error.message, details: error.details ?? null })}\n`)
        process.exitCode = 1
    })
}

module.exports = { directoryIdentity, main, parseArgs, runIndependentVerifier }
