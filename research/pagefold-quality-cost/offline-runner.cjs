#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildActivationDraft, QualityCostProtocolError } = require('./protocol-v1.cjs')
const {
    assertOutsideRepository,
    assertPrivateFile,
    readPrivateJson,
    writeJsonExclusive,
} = require('./artifact-store.cjs')
const { createDossierTemplate, closeDossierForActivation } = require('./dossier.cjs')
const { verifySyntheticManifest } = require('./fixtures-v1.cjs')
const { inspectReadOnlyQuiescence } = require('./quiescence.cjs')
const { executeSourceCapture } = require('./source-capture.cjs')
const { initializePrivateEvaluation } = require('./case-selection.cjs')

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function parseArgs(argv) {
    const [command, ...rest] = argv
    if (!command) fail('OFFLINE_COMMAND_REQUIRED')
    const args = { command }
    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index]
        const value = rest[index + 1]
        if (!key?.startsWith('--') || value === undefined) fail('OFFLINE_ARGUMENT_INVALID')
        args[key.slice(2)] = value
    }
    return args
}

function loadPrivateConfig(configPath) {
    if (typeof configPath !== 'string' || !path.isAbsolute(configPath)) fail('OFFLINE_CONFIG_PATH_INVALID')
    assertPrivateFile(configPath)
    const configDirectory = path.dirname(configPath)
    const directoryStat = fs.lstatSync(configDirectory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
        || (directoryStat.mode & 0o777) !== 0o700) fail('OFFLINE_CONFIG_DIRECTORY_MODE_INVALID')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail('OFFLINE_CONFIG_INVALID')
    if (config.providerCallsAuthorized !== undefined && config.providerCallsAuthorized !== false) {
        fail('OFFLINE_PROVIDER_CALL_AUTHORITY_INVALID')
    }
    if (typeof config.repositoryRoot !== 'string' || !path.isAbsolute(config.repositoryRoot)) {
        fail('OFFLINE_REPOSITORY_ROOT_INVALID')
    }
    assertOutsideRepository(configDirectory, config.repositoryRoot)
    return config
}

function publicQuiescence(proof) {
    return {
        observedAt: proof.observedAt,
        nativeActive: proof.nativeActive,
        backgroundActive: proof.backgroundActive,
        selectedNativeActive: proof.selectedNativeActive,
        selectedBackgroundActive: proof.selectedBackgroundActive,
        pendingPayloads: proof.pendingPayloads,
        quiescent: proof.quiescent,
    }
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv)
    switch (args.command) {
        case 'initialize-evaluation': {
            const summary = await initializePrivateEvaluation({
                repositoryRoot: args['repository-root'],
                targetRoot: args['target-root'],
                databasePath: args['database-path'],
                modelJobsPath: args['model-jobs-path'],
                privateRoot: args['private-root'],
                calibrationCharacter: args['calibration-character'],
                calibrationChat: args['calibration-chat'],
                lockedCharacter: args['locked-character'],
                lockedChat: args['locked-chat'],
            })
            process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
            return
        }
        case 'activation-draft':
            process.stdout.write(JSON.stringify(buildActivationDraft(), null, 2) + '\n')
            return
        case 'verify-synthetic':
            process.stdout.write(JSON.stringify(verifySyntheticManifest(), null, 2) + '\n')
            return
        case 'inspect-quiescence': {
            const config = loadPrivateConfig(args.config)
            const proof = await inspectReadOnlyQuiescence(config)
            process.stdout.write(JSON.stringify(publicQuiescence(proof), null, 2) + '\n')
            if (!proof.quiescent) process.exitCode = 2
            return
        }
        case 'capture-source': {
            const config = loadPrivateConfig(args.config)
            const receipt = await executeSourceCapture(config)
            process.stdout.write(JSON.stringify(receipt, null, 2) + '\n')
            return
        }
        case 'create-dossier-template': {
            const config = loadPrivateConfig(args.config)
            assertOutsideRepository(config.runRoot, config.repositoryRoot)
            const snapshot = readPrivateJson(config.runRoot, 'source-snapshot.json')
            const template = createDossierTemplate(snapshot)
            writeJsonExclusive(config.runRoot, 'obligation-dossier.json', template)
            process.stdout.write(JSON.stringify({
                status: template.status,
                sourceSnapshotSha256: template.sourceSnapshotSha256,
                sourceCount: template.sourceInventory.sources.length,
                effectiveMessageCount: template.sourceInventory.effectiveMessages.length,
                obligationCount: 0,
            }, null, 2) + '\n')
            return
        }
        case 'verify-dossier': {
            const config = loadPrivateConfig(args.config)
            assertOutsideRepository(config.runRoot, config.repositoryRoot)
            const snapshot = readPrivateJson(config.runRoot, 'source-snapshot.json')
            const dossier = readPrivateJson(config.runRoot, 'obligation-dossier.json')
            const summary = closeDossierForActivation(snapshot, dossier)
            process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
            return
        }
        default:
            fail('OFFLINE_COMMAND_INVALID')
    }
}

if (require.main === module) {
    main().catch((error) => {
        const code = error instanceof QualityCostProtocolError && error.code
            ? error.code
            : 'PAGEFOLD_QUALITY_OFFLINE_UNEXPECTED'
        process.stderr.write(`[pagefold-quality-offline] failed code=${code}\n`)
        process.exitCode = 1
    })
}

module.exports = {
    loadPrivateConfig,
    main,
    parseArgs,
    publicQuiescence,
}
