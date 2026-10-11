'use strict';
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const add = (name, file, anchor, content) => units.push({
        id: `lazy-chat-bg-adapter:publication-write:${name}:1.10`, file,
        type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    const server = 'server/node/server.cjs';
    const refuse = `if (!publication.allowed) {
                res.setHeader('x-bg-save-blocked', publication.code);
                return res.status(503).json({ code: publication.code,
                    error: publication.code === 'BG_PUBLICATION_SAVE_BLOCKED'
                        ? 'Committed answer recovery blocks this save. Local edits have not been saved.'
                        : 'Server saving is unavailable because the current database could not be checked. Local edits have not been saved.' });
            }`;
    add('delta', server,
        '            const chat = fullChatStore.get(chaId)?.get(expectedChatId);',
        `            const publication = await serverChatCommitOwner.recoverBeforeWrite({ charId: chaId, chatId: expectedChatId });
            ${refuse}
            const chat = fullChatStore.get(chaId)?.get(expectedChatId);`);
    add('full', server,
        '            const currentChat = fullChatStore.get(chaId)?.get(expectedChatId) || null;',
        `            const publication = await serverChatCommitOwner.recoverBeforeWrite({ charId: chaId, chatId: expectedChatId });
            ${refuse}
            const currentChat = fullChatStore.get(chaId)?.get(expectedChatId) || null;`);
    add('root-full', server,
        '                    let acceptedStrippedDb = dbCache[DB_HEX_KEY];',
        `                    const publication = await serverChatCommitOwner.recoverBeforeWrite({ incomingDatabase: canonicalizeStrippedDatabase(normalizeJSON(stripChatsFromDb(incomingDb))) });
                    ${refuse}
                    if (publication.recovered) {
                        const standard = req.headers['if-match'], legacy = req.headers['x-if-match'];
                        if (!(standard ? requestEtagMatches(standard, dbEtag, { allowWeak: false }) : requestEtagMatches(legacy, dbEtag))) {
                            return res.status(409).json({ error: 'Database advanced during answer recovery', currentEtag: dbEtag });
                        }
                    }
                    let acceptedStrippedDb = dbCache[DB_HEX_KEY];`);
    add('root-patch', server,
        `                    nextDocument = serverChatCommitOwner.preserveDatabaseState(
                        dbCache[cacheKey],
                        nextDocument,
                    );`,
        `                    const publication = await serverChatCommitOwner.recoverBeforeWrite({ incomingDatabase: nextDocument });
                    ${refuse}
                    if (publication.recovered) {
                        return res.status(409).json({ error: 'Database advanced during answer recovery', currentEtag: dbEtag });
                    }
                    nextDocument = serverChatCommitOwner.preserveDatabaseState(
                        dbCache[cacheKey],
                        nextDocument,
                    );`);
    const node = 'src/ts/storage/nodeStorage.ts';
    add('error', node, 'export class ChatConflictError extends Error {',
        `export class PublicationSaveBlockedError extends Error {
    blockedChats: [string, string][] = []
    acceptedRoot = false
    constructor() {
        super('서버에 저장된 답변을 복구하지 못해 저장이 막혔어요. 현재 화면의 수정은 유지했지만 서버에는 저장되지 않았어요. 앱을 닫기 전에 수정 내용을 따로 보관해 주세요.')
        this.name = 'PublicationSaveBlockedError'
    }
}

export class ChatConflictError extends Error {`);
    add('response', node, '        return response\n    }\n\n    private databaseReadHeaders()',
        `        if (response.status === 503 && response.headers.get('x-bg-save-blocked') === 'BG_PUBLICATION_SAVE_BLOCKED') {
            throw new PublicationSaveBlockedError()
        }
        return response
    }

    private databaseReadHeaders()`);
    add('full-refusal', node,
        '        catch (error) {\n            const confirmation = await this.confirmCurrentSnapshotOnServer(',
        '        catch (error) {\n            if (error instanceof PublicationSaveBlockedError) throw error\n            const confirmation = await this.confirmCurrentSnapshotOnServer(');
    add('delta-refusal', node,
        '                catch (error) {\n                    // The server may have committed before the connection was',
        '                catch (error) {\n                    if (error instanceof PublicationSaveBlockedError) throw error\n                    // The server may have committed before the connection was');
    const global = 'src/ts/globalApi.svelte.ts';
    add('import', global, 'import { ConflictError, type PatchItemResult, type PersistWarning } from "./storage/nodeStorage";',
        'import { ConflictError, PublicationSaveBlockedError, type PatchItemResult, type PersistWarning } from "./storage/nodeStorage";\nimport { notifyPublicationSaveBlocked, clearPublicationSaveBlockedNotice } from "./storage/publicationSaveNotice";');
    add('batch-error', global, '        const failedChats: [string, string][] = []',
        '        let publicationBlockedError: PublicationSaveBlockedError | null = null\n        const publicationBlockedChats: [string, string][] = []\n        const failedChats: [string, string][] = []');
    add('batch-retain', global, '                failedChats.push([chaId, chatId])',
        `                if (e instanceof PublicationSaveBlockedError) {
                    publicationBlockedError = e
                    publicationBlockedChats.push([chaId, chatId])
                }
                else failedChats.push([chaId, chatId])`);
    add('batch-partial-save', global, "        return 'saved'\n    }\n\n    async function triggerSave",
        `        // Unaffected chats and root settings were accepted above. Keep
        // the blocked chat dirty and propagate its exact non-conflict reason.
        if (publicationBlockedError) {
            publicationBlockedError.blockedChats = publicationBlockedChats
            publicationBlockedError.acceptedRoot = true
            throw publicationBlockedError
        }
        return 'saved'
    }

    async function triggerSave`);
    add('notice-clear', global, "                if (result === 'saved') {",
        "                if (result === 'saved') {\n                    clearPublicationSaveBlockedNotice()");
    add('retain-draft', global,
        '                if (error instanceof ManualSaveConflictError) {',
        `                if (error instanceof PublicationSaveBlockedError) {
                    changed = false
                    savetrys = 0
                    notifyPublicationSaveBlocked(error.message)
                    scheduleDeferredRecovery(5 * 60_000)
                    const scope = (options as any)?.durableScope
                    const scopedChat = Array.isArray(scope?.chat) && scope.chat.length === 2 && scope.chat.every((id: unknown) => typeof id === 'string' && id.length > 0)
                    const namedScope = scopedChat || scope?.root === true || scope?.plugins === true
                    const scopeBlocked = scope?.chat && (!scopedChat || error.blockedChats.some(([chaId, chatId]) => chaId === scope.chat[0] && chatId === scope.chat[1]))
                    if ((options as any)?.rejectOnError) {
                        if (!error.acceptedRoot || !namedScope || scopeBlocked) throw error
                        // This strict caller's chat/root were saved; an
                        // unrelated retained draft must not withhold its ACK.
                        ;(options as any)?.onResult?.('saved')
                    }
                    return
                }
                if (error instanceof ManualSaveConflictError) {
`);
    add('durable-scope', global,
        '            rejectOnError: true,\n            onResult: (result: string) => { committed = result === \'saved\' },',
        '            rejectOnError: true,\n            durableScope: scope,\n            onResult: (result: string) => { committed = result === \'saved\' },');
    const job = 'src/ts/process/request/jobRecovery.ts';
    add('job-import', job, "import { notifyError, notifyInfo } from 'src/ts/alert'",
        "import { notifyError, notifyInfo } from 'src/ts/alert'\nimport { PublicationSaveBlockedError } from 'src/ts/storage/nodeStorage'\nimport { notifyPublicationSaveBlocked, clearPublicationSaveBlockedNotice, retainPublicationJobNotices } from 'src/ts/storage/publicationSaveNotice'");
    add('job-refusal', job,
        "        console.warn('[ModelJobRecovery] chat save after slot-in failed', job.id, err)",
        "        if (err instanceof PublicationSaveBlockedError) notifyPublicationSaveBlocked(err.message, job.id)\n        console.warn('[ModelJobRecovery] chat save after slot-in failed', job.id, err)");
    add('job-saved', job, '        await saveChatToServer(chaId, index, job.chatId, chat)',
        '        await saveChatToServer(chaId, index, job.chatId, chat)\n        clearPublicationSaveBlockedNotice(job.id)');
    add('job-discovery', job,
        "        const [unclaimedJobs, activeJobs] = await Promise.all([listJobs('unclaimed'), listJobs('active')])",
        "        const [unclaimedJobs, activeJobs] = await Promise.all([listJobs('unclaimed'), listJobs('active')])\n        if ((unclaimedJobs as any).publicationDiscoveryComplete === true && (activeJobs as any).publicationDiscoveryComplete === true) {\n            retainPublicationJobNotices([...unclaimedJobs, ...activeJobs].map(job => job.id))\n        }");
    add('job-list-proof', job, '    return Array.isArray(parsed?.jobs) ? parsed.jobs : []',
        `    if (!Array.isArray(parsed?.jobs)) return []
    Object.defineProperty(parsed.jobs, 'publicationDiscoveryComplete', { value: true })
    return parsed.jobs`);
    add('hydration-dirty-import', global,
        'import { isHydrating, saveChatToServer, ensureChatHydrated, chatToStub, classifyChat, convertStubsToPlaceholders } from "./storage/chatStorage";',
        'import { isHydrating, setHydrationDirtyCallback, saveChatToServer, ensureChatHydrated, chatToStub, classifyChat, convertStubsToPlaceholders } from "./storage/chatStorage";');
    add('hydration-dirty-registration', global,
        `    markChatDirtyImpl = (chaId, chatId) => {
        queueTrackedChat(chaId, chatId)
        changed = true
    }`,
        `    markChatDirtyImpl = (chaId, chatId) => {
        queueTrackedChat(chaId, chatId)
        changed = true
    }
    setHydrationDirtyCallback((chaId, chatId, observed) => {
        const current = getDatabase()?.characters?.find(character => character?.chaId === chaId)
            ?.chats?.find(chat => chat?.id === chatId)
        if (current !== observed) return
        queueTrackedChat(chaId, chatId)
        // Keep the existing token checkpoint cadence. A non-streaming user
        // edit gets the ordinary autosave policy, not a strict flush.
        if (current.isStreaming !== true) changed = true
    }, chaId => getDatabase()?.characters?.find(character => character?.chaId === chaId)?.chats ?? null)`);
    const chatStorage = 'src/ts/storage/chatStorage.ts';
    add('hydration-publication-import', chatStorage, 'import { forageStorage } from "../globalApi.svelte"',
        'import { forageStorage } from "../globalApi.svelte"\nimport { orchestrationChatRevision } from "../bgOrchestrationMerge"');
    add('hydration-publication-record', chatStorage, '                chats[applyIndex] = full',
        `                chats[applyIndex] = full
                // Only an overlapping reader needs a publication basis.
                // Ordinary opens do not add another full-history fingerprint.
                if ((hydrationInFlightCounts.get(key) ?? 0) > 1) {
                    try { recordHydrationPublication(chats[applyIndex]) }
                    catch { /* a diagnostic basis must not fail an already applied hydration */ }
                }`);
    return units;
};
