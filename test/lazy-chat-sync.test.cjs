'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const repositoryRoot = path.resolve(__dirname, '..')
const lazyManifest = require('../patches/lazy-chat-sync/manifest.cjs')
const bgAdapter = require('../patches/lazy-chat-bg-adapter/manifest.cjs')

function payload(relative) {
    return fs.readFileSync(
        path.join(repositoryRoot, 'patches/lazy-chat-sync/files', relative),
        'utf8',
    )
}

function payload190(relative) {
    return fs.readFileSync(
        path.join(repositoryRoot, 'patches/lazy-chat-sync/files-1.9', relative),
        'utf8',
    )
}

test('lazy chat pack includes CAS, WAL, reconciliation, and safe hydration boundaries', () => {
    assert.equal(lazyManifest.id, 'lazy-chat-sync')
    assert.equal(lazyManifest.version, '0.2.0')
    assert.deepEqual(lazyManifest.targets, {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: [],
        },
    })
    assert.match(payload('server/node/server.cjs'), /chatWriteJournal/)
    assert.match(payload('server/node/server.cjs'), /\/api\/chat-content\/:chaId\/:chatIndex\/patch/)
    assert.match(payload('server/node/server.cjs'), /validateStrippedDatabaseTransition/)
    assert.match(payload('server/node/server.cjs'), /CHAT_PAYLOAD_MISSING/)
    assert.match(payload('server/node/chatWriteJournal.cjs'), /CHAT_JOURNAL_CAPACITY/)
    assert.match(payload('server/node/chatWriteJournal.cjs'), /DEFAULT_MAX_AWAITING_RECORDS = 128/)
    assert.match(payload('src/ts/storage/nodeStorage.ts'), /x-chat-base-revision/)
    assert.match(payload('src/ts/storage/nodeStorage.ts'), /ChatSaveIntent/)
    assert.match(
        payload('src/ts/storage/chatStorage.ts'),
        /intent: ChatSaveIntent = 'update'/,
    )
    assert.match(payload('src/ts/globalApi.svelte.ts'), /classifyChatSaveIntent/)
    assert.match(payload('src/ts/globalApi.svelte.ts'), /assignMissingChatIdsToNewCharacters/)
    const importedCharacterSave = payload('src/ts/globalApi.svelte.ts').slice(
        payload('src/ts/globalApi.svelte.ts').indexOf('requestImportedCharacterSaveImpl = async'),
        payload('src/ts/globalApi.svelte.ts').indexOf('requestChatSaveImpl = async'),
    )
    assert.match(importedCharacterSave, /queueTrackedCharacter\(chaId\)/)
    assert.match(importedCharacterSave, /queueTrackedChat\(chaId, chat\.id\)/)
    assert.match(importedCharacterSave, /lastConfirmedServerDb/)
    assert.match(importedCharacterSave, /forageStorage\.flushDatabase\(\)/)
    assert.match(payload('src/ts/storage/conflictRebase.ts'), /mergeThreeWayValue/)
    assert.match(payload('src/ts/plugins/apiV3/pluginChatAccess.ts'), /hydrateChat/)
    assert.match(payload('src/ts/plugins/apiV3/pluginChatAccess.ts'), /getDatabaseWithChatMetadata/)
    assert.match(payload('src/ts/plugins/apiV3/v3.svelte.ts'), /getDatabaseMetadata/)
    assert.match(payload('src/ts/plugins/apiV3/v3.svelte.ts'), /assignMissingChatIdsToNewCharacters/)
    assert.match(payload('src/ts/storage/chatIdentityRepair.ts'), /Refusing to replace the missing ID of existing character/)
    const serverSource = payload('server/node/server.cjs')
    const failedColdStoragePromotion = serverSource.slice(
        serverSource.indexOf('function promoteFailedColdStorageStub'),
        serverSource.indexOf('function restoreColdStorageCharactersInDb'),
    )
    assert.match(failedColdStoragePromotion, /id: nodeCrypto\.randomUUID\(\),[\s\S]*name: 'Chat 1'/)
    const metadataTypes = lazyManifest.units.find((unit) =>
        unit.id === 'lazy-chat-sync:plugin-api-chat-metadata-types'
    )
    assert.ok(metadataTypes)
    assert.match(metadataTypes.content, /getDatabaseMetadata/)
    const missingPayloadNotice = lazyManifest.units.find((unit) =>
        unit.id === 'lazy-chat-sync:chat-missing-payload-notice'
    )
    assert.ok(missingPayloadNotice)
    assert.match(missingPayloadNotice.content, /Your draft was kept/)
})

test('PocketRisu 1.9 replacements retain native runtime owners and lazy-chat contracts', () => {
    const server = payload190('server/node/server.cjs')
    const bootstrap = payload190('src/ts/bootstrap.ts')
    const globalApi = payload190('src/ts/globalApi.svelte.ts')
    const pluginApi = payload190('src/ts/plugins/apiV3/v3.svelte.ts')
    const autoStorage = payload190('src/ts/storage/autoStorage.ts')
    const chatStorage = payload190('src/ts/storage/chatStorage.ts')
    const nodeStorage = payload190('src/ts/storage/nodeStorage.ts')

    assert.match(server, /normalizeForwardHeaders/)
    assert.match(server, /chatWriteJournal/)
    assert.match(server, /buildSettingsOnlyPlan/)
    assert.match(server, /kvDelPrefix\('coldstorage\/'\)/)
    assert.match(server, /kvDelPrefix\(CHAT_WRITE_JOURNAL_PREFIX\)/)
    assert.match(bootstrap, /initModelJobRecovery\(\)/)
    assert.match(bootstrap, /loadDatabaseForStartup\(\)/)
    assert.match(globalApi, /createRequestLogScope/)
    assert.match(globalApi, /mergeThreeWayValue/)
    assert.match(pluginApi, /endAllGenerations\(\)/)
    assert.match(pluginApi, /getCurrentCharacterForPlugin/)
    assert.match(pluginApi, /content: string \| ReadableStream<string>/)
    assert.match(autoStorage, /settingsBackupEstimate/)
    assert.match(autoStorage, /getWriterLockState/)
    assert.match(chatStorage, /full\.isStreaming = false/)
    assert.match(chatStorage, /intent: ChatSaveIntent = 'update'/)
    assert.match(nodeStorage, /x-user-active/)
    assert.match(nodeStorage, /settingsBackupEstimate/)
    assert.match(nodeStorage, /x-chat-base-revision/)

    const versioned = lazyManifest.units.filter((unit) =>
        unit.targetVersions && [
            'server/node/server.cjs',
            'src/ts/bootstrap.ts',
            'src/ts/globalApi.svelte.ts',
            'src/ts/plugins/apiV3/v3.svelte.ts',
            'src/ts/storage/autoStorage.ts',
            'src/ts/storage/chatStorage.ts',
            'src/ts/storage/nodeStorage.ts',
        ].includes(unit.file)
    )
    assert.equal(versioned.length, 14)
    for (const file of new Set(versioned.map((unit) => unit.file))) {
        const variants = versioned.filter((unit) => unit.file === file)
        assert.deepEqual(
            variants.map((unit) => unit.targetVersions),
            [
                { pocketrisu: ['1.8.1'] },
                { pocketrisu: ['1.9.0'] },
            ],
        )
    }
})

test('startup probe accepts either valid browser cache without joining stalled backends', () => {
    const source = payload('src/ts/storage/startupDatabaseCache.ts')
    const probe = source.slice(
        source.indexOf('private async probeWithoutTimeout'),
        source.indexOf('async resolveNotModified'),
    )
    assert.match(probe, /Promise\.race\(pending\.values\(\)\)/)
    assert.doesNotMatch(probe, /Promise\.all/)
})

test('BG adapter preserves semantic revisions and adds only the durable flush barrier', () => {
    assert.deepEqual(bgAdapter.requires, ['bg-preserve', 'lazy-chat-sync'])
    const flush = bgAdapter.units.find((unit) =>
        unit.id === 'lazy-chat-bg-adapter:durable-flush'
    )
    assert.ok(flush)
    assert.match(flush.content, /forageStorage\.flushDatabase\(\)/)
    assert.doesNotMatch(flush.content, /baseChatRevision|x-chat-base-revision/)
})
