'use strict'

// E2-3d: the chat revision protocol over the native PocketRisu 1.16.1 chat
// transports. The server gives every chat a revision (sha256 of its legacy
// encoding, chatDelta.cjs); a write that replaces an existing chat must name
// the revision it was based on, and a create may ask to create only. The
// native prefix-fingerprint delta stays and also carries the base revision.
// Every client chat save carries a save context: the content it sends and the
// base revision (and server copy) that content was derived from, captured
// together and kept through the native save queue, the delta-to-full fallback
// and retries. On a conflict the edit is rebased on the server copy
// (chatSaveRebase.ts) so a reply saved by another device is kept. The stripped
// database written through /api/write
// and /api/patch must not list a new chat without a body, nor an empty or
// repeated id (pack 0.5.19 invariant).

const serverFile = 'server/node/server.cjs'
const nodeStorageFile = 'src/ts/storage/nodeStorage.ts'
const chatDeltaSyncFile = 'src/ts/storage/chatDeltaSync.ts'
const chatStorageFile = 'src/ts/storage/chatStorage.ts'
const globalApiFile = 'src/ts/globalApi.svelte.ts'
const pluginApiFile = 'src/ts/plugins/apiV3/v3.svelte.ts'

const serverUnits = [
    {
        name: 'revision-helpers',
        type: 'insert',
        where: 'before',
        anchor: `function sendChatContent(req, res, chat) {
`,
        content: `// Chat revision protocol (chatDelta.cjs). A revision is the sha256 of the
// chat's legacy encoding. A GET returns it as x-chat-revision and answers 304
// to a matching If-None-Match. A full POST that replaces an existing chat
// names the revision it was based on (x-chat-base-revision): 428 without it,
// 409 with currentRevision when the chat moved on. If-None-Match: * creates
// only (412 when the chat exists, before any other check). A delta POST that
// carries a base revision is checked the same way before its native prefix
// check; one without keeps the native prefix check alone.
const {
    chatRevision,
    evaluateFullChatWritePrecondition,
    canonicalizeStrippedDatabase,
    validateStrippedDatabaseTransition,
} = require('./chatDelta.cjs');

function chatRevisionMatches(header, revision) {
    if (typeof header !== 'string' || !header || !revision) return false;
    return header.split(',').some((candidate) => {
        const value = candidate.trim().replace(/^W\\//, '').replace(/^"|"$/g, '');
        return value === '*' || value === revision;
    });
}

// null when the chat POST may proceed, otherwise the refusal to send.
function checkChatWritePrecondition(req, storedChat) {
    const baseRevision = typeof req.headers['x-chat-base-revision'] === 'string'
        ? req.headers['x-chat-base-revision']
        : '';
    const createOnly = String(req.headers['if-none-match'] || '')
        .split(',')
        .some((candidate) => candidate.trim() === '*');
    if (readChatDeltaBase(req) && !baseRevision && !createOnly) return null;
    if (storedChat && !restoreColdStorageChat(storedChat)) {
        return { status: 500, body: { error: 'Cold storage restore failed' } };
    }
    const precondition = evaluateFullChatWritePrecondition(storedChat, { baseRevision, createOnly });
    if (precondition.matches) return null;
    const code = precondition.status === 412
        ? 'CHAT_ALREADY_EXISTS'
        : precondition.status === 428 ? 'CHAT_BASE_REVISION_REQUIRED' : 'CHAT_REVISION_MISMATCH';
    return {
        status: precondition.status,
        revision: precondition.currentRevision,
        body: { error: precondition.error, code, currentRevision: precondition.currentRevision },
    };
}

// The database a stripped write replaces: the cached client view, or the
// one on disk stubbed the same way (no cache side effects).
async function acceptedStrippedDatabase() {
    if (dbCache[DB_HEX_KEY]) return dbCache[DB_HEX_KEY];
    const raw = kvGet('database/database.bin');
    return raw ? stripChatsFromDb(await decodeRisuSave(raw)) : {};
}

// Stripped database invariants (pack 0.5.19): every character has a chaId
// and a chats array, ids are not empty or repeated, every chat is a stub,
// and a stub without a body may stay only if the previous database already
// listed it without one. A body counts when the chat store holds it, when
// the write carries it inline, or when the character has archive rows (the
// native write restores those bodies itself). Returns null or the 422 body.
function strippedDatabaseInvariantFailure(previousDb, nextDb, inlineBodies) {
    const archived = new Map();
    const hasBody = (chaId, chatId) => {
        if (Array.isArray(fullChatStore?.get(chaId)?.get(chatId)?.message)) return true;
        if (inlineBodies?.has(\`\${chaId}\\0\${chatId}\`)) return true;
        if (!archived.has(chaId)) archived.set(chaId, hasAnyArchivePayload(chaId));
        return archived.get(chaId);
    };
    try {
        validateStrippedDatabaseTransition(
            canonicalizeStrippedDatabase(previousDb ?? {}),
            canonicalizeStrippedDatabase(nextDb),
            hasBody,
        );
        return null;
    } catch (error) {
        return {
            error: 'Write rejected: stripped database invariant failed',
            code: 'DB_INVARIANT_REJECTED',
            detail: String(error?.message || error),
            missingFullChat: error?.code === 'MISSING_FULL_CHAT_PAYLOAD'
                ? { chaId: error.chaId, chatId: error.chatId }
                : undefined,
        };
    }
}

// Chats a full database write carries with their bodies. A message array
// counts also on a chat marked _stub (the native hybrid, which chatToStub and
// initChatStore treat as a chat with a body); a stub without one does not.
function inlineChatBodies(db) {
    const bodies = new Set();
    for (const char of Array.isArray(db?.characters) ? db.characters : []) {
        if (!char?.chaId || !Array.isArray(char.chats)) continue;
        for (const chat of char.chats) {
            if (chat?.id && Array.isArray(chat.message)) {
                bodies.add(\`\${char.chaId}\\0\${chat.id}\`);
            }
        }
    }
    return bodies;
}

`,
    },
    {
        name: 'chat-get-revision',
        type: 'insert',
        where: 'after',
        anchor: `    res.setHeader('Vary', 'x-chat-base-count, x-chat-base-fp');
    res.setHeader('Content-Type', 'application/octet-stream');
`,
        content: `    // Revision of the whole chat, also when only a delta is sent.
    const revision = chatRevision(chat);
    res.setHeader('x-chat-revision', revision);
    if (chatRevisionMatches(req.headers['if-none-match'], revision)) {
        return res.status(304).end();
    }
`,
    },
    {
        name: 'chat-get-payload-missing',
        type: 'insert',
        where: 'after',
        anchor: `            return res.status(409).json({ error: 'Chat ID mismatch — index may have shifted' });
        }
`,
        content: `        // Metadata without a body: an explicit missing payload, so the client
        // keeps the chat as a placeholder instead of loading it empty.
        if (chat?._stub === true && !Array.isArray(chat.message)) {
            return res.status(404).json({
                error: 'Chat metadata exists but its full payload is unavailable',
                code: 'CHAT_PAYLOAD_MISSING',
            });
        }
`,
    },
    {
        name: 'chat-post-precondition',
        type: 'insert',
        where: 'before',
        anchor: `            // Delta save: the body holds only the messages after a prefix the
`,
        content: `            // Revision precondition, before the delta splice and the journal.
            const refusal = checkChatWritePrecondition(req, fullChatStore.get(chaId)?.get(expectedChatId) || null);
            if (refusal) {
                if (refusal.revision) res.setHeader('x-chat-revision', refusal.revision);
                return res.status(refusal.status).json(refusal.body);
            }

`,
    },
    {
        name: 'chat-post-revision',
        type: 'insert',
        where: 'after',
        anchor: `            fullChatStore.get(chaId).set(expectedChatId, chatData);
            recordChatPost(chaId, expectedChatId);
`,
        content: `            res.setHeader('x-chat-revision', chatRevision(chatData));
            res.setHeader('x-chat-save-mode', deltaBase ? 'delta' : 'full');
`,
    },
    {
        name: 'write-invariant',
        type: 'insert',
        where: 'before',
        anchor: `                    await ensureChatStore();
                    let fullDb = hydrateDatabaseForDisk(incomingDb);
`,
        content: `                    // The written database, stubbed as the server stores it, must
                    // keep the stripped database invariants.
                    await ensureChatStore();
                    const invariantFailure = strippedDatabaseInvariantFailure(
                        await acceptedStrippedDatabase(),
                        stripChatsFromDb(incomingDb),
                        inlineChatBodies(incomingDb),
                    );
                    if (invariantFailure) {
                        logger.warn(\`[Write] Rejected: \${invariantFailure.detail}\`);
                        res.status(422).json({ ...invariantFailure, currentEtag: dbEtag ?? undefined });
                        return;
                    }
`,
    },
    {
        name: 'patch-invariant',
        type: 'insert',
        where: 'before',
        anchor: `            if (decodedKey === 'database/database.bin') {
                databasePatchHashCache.update(dbCache[filePath], next, patch);
            }
`,
        content: `            // The patched database must keep the stripped database invariants;
            // a refusal leaves the cache, the hash baseline and the etag as they were.
            if (decodedKey === 'database/database.bin') {
                await ensureChatStore();
                const invariantFailure = strippedDatabaseInvariantFailure(dbCache[filePath], next, null);
                if (invariantFailure) {
                    logger.warn(\`[Patch] Rejected: \${invariantFailure.detail}\`);
                    res.status(422).send({ ...invariantFailure, currentEtag: dbEtag ?? undefined });
                    return;
                }
            }
`,
    },
]

const nodeStorageUnits = [
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `import { normalizeChat } from "./database.svelte"
`,
        content: `import { isChatMergeValue, publishChatView, rebaseChatSave, snapshotChatView } from "./chatSaveRebase"
import { jsonValuesEqual } from "./conflictRebase"
import type { ChatSaveIntent } from "./chatSaveIntent"
`,
    },
    {
        name: 'errors',
        type: 'insert',
        where: 'before',
        anchor: `export class StorageRequestError extends Error {
`,
        content: `/** A chat as the server holds it, with its revision. */
export interface ServerChatSnapshot {
    revision: string
    chat: any
    encodedBytes: number
}

/**
 * The server copy a chat save is based on: its revision and, when kept, the
 * copy itself (decoded, or still encoded) as the base of a rebase.
 */
export interface ChatSaveBase {
    revision: string
    snapshot: any | null
    bytes: Uint8Array | null
    encodedBytes: number
}

/**
 * One chat save (NodeStorage.beginChatSave): the content it sends and the base
 * that content was derived from, captured together. Both stay as captured
 * through the native save queue, the delta-to-full fallback and retries; the
 * base moves only to the server copy a rebase of this content was verified
 * against, or to the server copy adopted when no base was known.
 */
export interface ChatSaveContext {
    readonly chaId: string
    readonly chatId: string
    readonly intent?: ChatSaveIntent
    /** A 422 invariant recovery: a server without the chat gets it created, whatever the intent. */
    readonly recreate?: boolean
    /** The encoded content this save sends. */
    readonly content: Uint8Array
    /** Its base; null when unknown (the server copy is read first). */
    base: ChatSaveBase | null
    /** The base this save started from: \`base\` at capture, or the server copy read first when it had none; never a rebase or its result. */
    start: ChatSaveBase | null
    /** The handed-out view the base belongs to, when it came from one. */
    readonly view: object | null
    /** The chat's slot base at capture, compared before publishing into the chat or adopting the result. */
    readonly entry: ChatSaveBase | undefined
    /** The database replacement generation at capture (NodeStorage.noteDatabaseReplaced), compared like \`entry\`. */
    readonly generation: number
    /** The caller publishes the result into the chat's slot and adopts its base itself. */
    readonly detached: boolean
    /** Set once the server accepted the content: its new base, and the content as rebased when a rebase happened. */
    result?: { base: ChatSaveBase | null, merged: any | null }
}

/**
 * A chat save the server refused because the chat changed there and the
 * change could not be merged (or confirmed). The local chat stays as it is.
 */
export class ChatConflictError extends Error {
    currentRevision: string | null
    serverSnapshot?: ServerChatSnapshot

    constructor(message: string, currentRevision: string | null = null, serverSnapshot?: ServerChatSnapshot) {
        super(message)
        this.name = 'ChatConflictError'
        this.currentRevision = currentRevision
        Object.defineProperty(this, 'serverSnapshot', {
            value: serverSnapshot, enumerable: false, configurable: true, writable: true,
        })
    }
}

/** A database write the server refused for its stripped database invariants (422). */
export class DatabaseInvariantError extends Error {
    missingFullChat?: { chaId: string, chatId: string }

    constructor(message: string, missingFullChat?: { chaId: string, chatId: string }) {
        super(message)
        this.name = 'DatabaseInvariantError'
        this.missingFullChat = missingFullChat
    }
}

function readMissingFullChat(body: any): { chaId: string, chatId: string } | undefined {
    const missing = body?.missingFullChat
    return typeof missing?.chaId === 'string' && typeof missing?.chatId === 'string'
        ? { chaId: missing.chaId, chatId: missing.chatId }
        : undefined
}

`,
    },
    {
        name: 'patch-result-fields',
        type: 'insert',
        where: 'before',
        anchor: `    /** Server stage timings on success (older servers omit them). */
`,
        content: `    /** The patched database broke the stripped database invariants (422); not retried as a full write. */
    validationRejected?: boolean
    /** The chat the rejected database listed without a body, when the server names one. */
    missingFullChat?: { chaId: string, chatId: string }
`,
    },
    {
        name: 'chat-sync-state',
        type: 'insert',
        where: 'after',
        anchor: `        private readonly retryOptions: Partial<AuthFetchRetryOptions> = {}
    ) {}
`,
        content: `
    // ── Chat revisions ──────────────────────────────────────────────────────
    // A chat save sends a save context (ChatSaveContext): its content and the
    // base that content came from, captured together (beginChatSave). After
    // capture the base is never looked up again by chat. A base comes from:
    // - a handed-out view (a full read, a delta load not installed yet): the
    //   view object's own base (chatViewBases);
    // - the chat's slot base, keyed \`chaId|chatId\` (chatSyncStates): set when
    //   fetched content is installed into the chat's slot or a plugin write
    //   puts content there, and moved by a save of that content only while
    //   nothing replaced it meanwhile. A full read sets it only when none is
    //   held, so a copy of the view it handed out has the read as its base;
    //   it never replaces a held one.
    // - a plugin write (detached): the base of the single read its read token
    //   names (pluginReadTokens). The chat crosses to the plugin as a
    //   structured clone that carries no view base, so each chat handed to a
    //   plugin carries an opaque token field that comes back with the clone.
    //   A detached save never takes the slot base; without a token (or with
    //   one for another chat) it reads the server copy first, and a token the
    //   host no longer knows refuses the write.
    // Kept server copies of slot bases are bounded (count and bytes); an
    // evicted one keeps its revision, so a save still names its base and
    // conflicts instead of rebasing. Read tokens are bounded the same way,
    // plus a count bound past which the oldest token is forgotten.
    private static readonly MAX_CHAT_SYNC_STATES = 4
    private static readonly MAX_CHAT_SYNC_STATE_BYTES = 16 * 1024 * 1024
    private static readonly MAX_SINGLE_CHAT_SYNC_BYTES = 8 * 1024 * 1024
    private static readonly MAX_PLUGIN_READ_TOKENS = 256
    private readonly chatSyncStates = new Map<string, ChatSaveBase>()
    private readonly chatViewBases = new WeakMap<object, ChatSaveBase>()
    private readonly pluginReadTokens = new Map<string, { chaId: string, chatId: string, base: ChatSaveBase }>()
    // A slot base an open-chat plugin write installed: the token of that
    // write and the length and 64-bit hash of the encoded content it put into
    // the slot (never the bytes themselves).
    private readonly pluginWrittenEntries = new WeakMap<ChatSaveBase, { token: string, length: number, hash: string }>()
    // Chats whose next save recreates a missing body (recreateChatOnNextSave).
    private readonly chatsToRecreate = new Set<string>()
    // Counts replacements of the whole database (the native 409 rebase's
    // setDatabase): a save captured before one never publishes into the
    // chat or moves the slot base afterwards.
    private databaseGeneration = 0
    private pluginReadTokenSeq = 0
    private chatSyncStateBytes = 0
    private chatSyncSnapshotCount = 0

    private chatSyncKey(chaId: string, chatId: string): string {
        return \`\${chaId}|\${chatId}\`
    }

    private static keepsServerCopy(state: ChatSaveBase): boolean {
        return state.snapshot !== null || state.bytes !== null
    }

    /** A base that keeps its server copy only within the single-chat bound. */
    private chatSaveBase(revision: string, snapshot: any | null, bytes: Uint8Array | null, encodedBytes: number): ChatSaveBase {
        if ((snapshot === null && bytes === null) || !(encodedBytes > 0) || encodedBytes > NodeStorage.MAX_SINGLE_CHAT_SYNC_BYTES) {
            return { revision, snapshot: null, bytes: null, encodedBytes: 0 }
        }
        return { revision, snapshot, bytes, encodedBytes }
    }

    /** The server copy a base keeps, decoded; null when it keeps none. */
    private async chatSaveBaseCopy(base: ChatSaveBase): Promise<any | null> {
        if (base.snapshot !== null) return base.snapshot
        if (base.bytes === null) return null
        try {
            return normalizeChat(await decodeRisuSave(base.bytes))
        } catch {
            return null
        }
    }

    private forgetChatSyncState(key: string): void {
        const previous = this.chatSyncStates.get(key)
        if (previous && NodeStorage.keepsServerCopy(previous)) {
            this.chatSyncStateBytes -= previous.encodedBytes
            this.chatSyncSnapshotCount -= 1
        }
        this.chatSyncStates.delete(key)
    }

    /**
     * The server holds no body for a chat this client holds and the database
     * still lists (a 422 invariant recovery): its base is dropped, and the
     * next save of that chat creates it when the server has none, even when
     * classified as an update. One save consumes this.
     */
    recreateChatOnNextSave(chaId: string, chatId: string): void {
        const key = this.chatSyncKey(chaId, chatId)
        this.forgetChatSyncState(key)
        this.chatsToRecreate.add(key)
    }

    /** Sets a chat's slot base (a decoded copy is cloned); returns the stored entry. */
    private storeChatSyncState(key: string, base: ChatSaveBase): ChatSaveBase {
        this.forgetChatSyncState(key)
        let snapshot: any | null = null
        if (base.snapshot !== null && isChatMergeValue(base.snapshot)) {
            try {
                snapshot = structuredClone(base.snapshot)
            } catch {
                snapshot = null
            }
        }
        const entry = this.chatSaveBase(base.revision, snapshot, snapshot === null ? base.bytes : null, base.encodedBytes)
        this.chatSyncStates.set(key, entry)
        if (NodeStorage.keepsServerCopy(entry)) {
            this.chatSyncStateBytes += entry.encodedBytes
            this.chatSyncSnapshotCount += 1
        }
        // Drop the oldest server copies first; their revisions stay. In
        // place, so a save that captured an entry still recognizes it.
        while (
            this.chatSyncSnapshotCount > NodeStorage.MAX_CHAT_SYNC_STATES
            || this.chatSyncStateBytes > NodeStorage.MAX_CHAT_SYNC_STATE_BYTES
        ) {
            const oldest = [...this.chatSyncStates.values()].find(NodeStorage.keepsServerCopy)
            if (!oldest) break
            this.chatSyncStateBytes -= oldest.encodedBytes
            this.chatSyncSnapshotCount -= 1
            oldest.snapshot = null
            oldest.bytes = null
            oldest.encodedBytes = 0
        }
        return entry
    }

    private rememberChatSyncState(key: string, revision: string, chat: any, encodedBytes: number): ChatSaveBase {
        return this.storeChatSyncState(key, this.chatSaveBase(revision, chat ?? null, null, encodedBytes))
    }

    /**
     * Captures a chat save: the content to send (encoded now) and its base.
     * A detached save (a plugin write) takes \`options.base\` (its plugin read
     * record) or none. Any other save takes the own base of \`options.baseOf\`
     * (default \`chat\`) when that is a handed-out view, else the chat's slot
     * base, else none. A save without a base reads the server copy first.
     */
    beginChatSave(
        chaId: string,
        chatId: string,
        chat: any,
        options: { intent?: ChatSaveIntent, baseOf?: any, detached?: boolean, base?: ChatSaveBase | null } = {},
    ): ChatSaveContext {
        const content = encodeRisuSaveLegacy(chat)
        const detached = options.detached === true
        const source = options.baseOf ?? chat
        const viewBase = detached || !source || typeof source !== 'object' ? undefined : this.chatViewBases.get(source)
        const entry = detached || viewBase ? undefined : this.chatSyncStates.get(this.chatSyncKey(chaId, chatId))
        const base = detached ? (options.base ?? undefined) : (viewBase ?? entry)
        const recreate = this.chatsToRecreate.delete(this.chatSyncKey(chaId, chatId))
        const captured = base ? { ...base } : null
        return {
            recreate,
            chaId,
            chatId,
            intent: options.intent,
            content,
            base: captured,
            start: captured,
            view: viewBase ? source : null,
            entry,
            generation: this.databaseGeneration,
            detached,
        }
    }

    /**
     * The whole database was replaced (the native 409 rebase put a merged
     * copy in place): every chat slot now holds another object. A save
     * captured before this never publishes its rebase into a chat or moves
     * the chat's slot base afterwards (mayPublishChatSave,
     * adoptChatSaveResult), so the next save of the new slot keeps its own
     * base and rebases on the server copy. Slot bases themselves stay; a
     * chat without one gets the starting base of such a save once it is
     * accepted (installStartAfterDatabaseReplaced).
     */
    noteDatabaseReplaced(): void {
        this.databaseGeneration += 1
    }

    /**
     * The host hands a chat to a plugin: issues a read token for this single
     * read and keeps, per token, the chat and the base of what was handed
     * out (\`view\`'s own base for a full read, else the chat's slot base).
     * null when no base is known (a write then reads the server copy first).
     * Tokens are bounded: past the server copy bound a token keeps only its
     * revision (a save then conflicts instead of rebasing); past the count
     * bound the oldest token is forgotten (a write with it is refused).
     */
    issuePluginReadToken(chaId: string, chatId: string, view: any): string | null {
        const base = (view && typeof view === 'object' ? this.chatViewBases.get(view) : undefined)
            ?? this.chatSyncStates.get(this.chatSyncKey(chaId, chatId))
        if (!base?.revision) return null
        const random = new Uint32Array(2)
        try {
            globalThis.crypto.getRandomValues(random)
        } catch {
            random[0] = Math.floor(Math.random() * 0xffffffff)
            random[1] = Math.floor(Math.random() * 0xffffffff)
        }
        const token = \`\${(this.pluginReadTokenSeq += 1).toString(36)}.\${random[0].toString(36)}\${random[1].toString(36)}\`
        this.storePluginReadToken(token, { chaId, chatId, base })
        return token
    }

    /**
     * The base of a plugin write that carried \`token\`: null when there is no
     * token or it names another chat (a write without a read, d13). Throws
     * when the host no longer knows the token, so a stale view is never saved
     * as a write without a read.
     */
    pluginReadTokenBase(token: unknown, chaId: string, chatId: string): ChatSaveBase | null {
        if (typeof token !== 'string' || !token) return null
        const entry = this.pluginReadTokens.get(token)
        if (!entry) throw new Error('setChatToIndex: this chat view is no longer known; read it again with getChatFromIndex')
        if (entry.chaId !== chaId || entry.chatId !== chatId) return null
        return { ...entry.base }
    }

    /** The revision of the chat's slot base, or null when none is held. */
    chatSlotBaseRevision(chaId: string, chatId: string): string | null {
        return this.chatSyncStates.get(this.chatSyncKey(chaId, chatId))?.revision || null
    }

    /**
     * A plugin write with \`token\` was accepted. Saved as sent (no rebase), its
     * result is what the plugin holds, so the token's base advances to it;
     * after a rebase the plugin's view still lacks what was merged in, so the
     * token keeps its base, as it does when the saved revision is unknown.
     */
    settlePluginReadToken(token: unknown, context: ChatSaveContext): void {
        if (typeof token !== 'string') return
        const entry = this.pluginReadTokens.get(token)
        const result = context.result
        if (!entry || !result || result.merged || !result.base?.revision) return
        if (entry.chaId !== context.chaId || entry.chatId !== context.chatId) return
        this.storePluginReadToken(token, { ...entry, base: result.base })
    }

    private storePluginReadToken(token: string, entry: { chaId: string, chatId: string, base: ChatSaveBase }): void {
        this.pluginReadTokens.delete(token)
        this.pluginReadTokens.set(token, { ...entry, base: { ...entry.base } })
        while (this.pluginReadTokens.size > NodeStorage.MAX_PLUGIN_READ_TOKENS) {
            const oldest = this.pluginReadTokens.keys().next().value
            if (oldest === undefined) break
            this.pluginReadTokens.delete(oldest)
        }
        // Server copies: the newest tokens keep theirs within the slot base
        // bounds; older ones keep only their revision.
        let copies = 0
        let bytes = 0
        for (const { base } of [...this.pluginReadTokens.values()].reverse()) {
            if (!NodeStorage.keepsServerCopy(base)) continue
            if (copies < NodeStorage.MAX_CHAT_SYNC_STATES && bytes + base.encodedBytes <= NodeStorage.MAX_CHAT_SYNC_STATE_BYTES) {
                copies += 1
                bytes += base.encodedBytes
                continue
            }
            base.snapshot = null
            base.bytes = null
            base.encodedBytes = 0
        }
    }

    /** Records the revision of a chat a delta load assembled: that object's own base until it is installed. */
    registerFetchedChat(chaId: string, chatId: string, revision: string, chat: any): void {
        if (!revision || !chat || typeof chat !== 'object') return
        let bytes: Uint8Array | null = null
        try {
            bytes = encodeRisuSaveLegacy(chat)
        } catch {
            bytes = null
        }
        this.chatViewBases.set(chat, this.chatSaveBase(revision, null, bytes, bytes?.byteLength ?? 0))
    }

    /**
     * Fetched content was installed into the chat's slot: its base becomes
     * the slot base (none when it had none). A fetch that was not installed
     * changes nothing.
     */
    adoptInstalledChat(chaId: string, chatId: string, chat: any): void {
        const key = this.chatSyncKey(chaId, chatId)
        const base = chat && typeof chat === 'object' ? this.chatViewBases.get(chat) : undefined
        if (chat && typeof chat === 'object') this.chatViewBases.delete(chat)
        if (base) this.storeChatSyncState(key, base)
        else this.forgetChatSyncState(key)
    }

    /**
     * Content derived from \`base\` was put into the chat's slot (a plugin
     * write): it becomes the slot base. Returns the entry to hand to
     * adoptChatSaveResult.
     */
    installChatSaveBase(chaId: string, chatId: string, base: ChatSaveBase | null): ChatSaveBase | undefined {
        const key = this.chatSyncKey(chaId, chatId)
        if (!base) {
            this.forgetChatSyncState(key)
            return undefined
        }
        return this.storeChatSyncState(key, base)
    }

    /**
     * An open-chat plugin write put \`chat\` into the chat's slot: \`base\` (its
     * read token's base, null for a write without a read) becomes the slot
     * base as a new entry, even at the same revision, so a save that captured
     * the earlier entry never moves the base of the plugin's content. When
     * the slot's next save sends exactly this content and is accepted without
     * a rebase, \`token\` advances to its result (settleChatSave).
     */
    installPluginChatBase(chaId: string, chatId: string, base: ChatSaveBase | null, token: unknown, chat: any): void {
        const entry = this.installChatSaveBase(chaId, chatId, base)
        if (!entry || typeof token !== 'string' || !token) return
        const content = encodeRisuSaveLegacy(chat)
        this.pluginWrittenEntries.set(entry, { token, length: content.byteLength, hash: NodeStorage.contentHash64(content) })
    }

    /**
     * A synchronous 64-bit hash of encoded chat content: the mixing of the
     * native hash64 (chatFingerprint.ts) over the bytes, all 64 bits kept as
     * 16 hex digits.
     */
    private static contentHash64(bytes: Uint8Array): string {
        let h1 = 0xdeadbeef ^ bytes.length
        let h2 = 0x41c6ce57 ^ bytes.length
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i]
            h1 = Math.imul(h1 ^ b, 2654435761)
            h2 = Math.imul(h2 ^ b, 1597334677)
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
        return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
    }

    /**
     * A save of a slot base an open-chat plugin write installed was accepted:
     * the write's token advances when the save sent the plugin's content as
     * it was written, that is content of the same length and 64-bit hash
     * (settlePluginReadToken decides on rebases).
     */
    private settlePluginWrittenEntry(context: ChatSaveContext): void {
        const written = context.entry ? this.pluginWrittenEntries.get(context.entry) : undefined
        if (!written || !context.entry) return
        this.pluginWrittenEntries.delete(context.entry)
        const sent = context.content
        if (sent.byteLength !== written.length) return
        if (NodeStorage.contentHash64(sent) !== written.hash) return
        this.settlePluginReadToken(written.token, context)
    }

    /**
     * Makes the base of an accepted save the base of what it saved: the view
     * it came from, or the chat's slot when the slot base is still
     * \`expected\` (nothing was installed or adopted meanwhile) and the
     * database was not replaced since capture. Returns whether it was
     * adopted.
     */
    adoptChatSaveResult(context: ChatSaveContext, expected: ChatSaveBase | undefined = context.entry): boolean {
        const result = context.result
        if (!result) return false
        if (context.view && !context.detached) {
            if (result.base?.revision) this.chatViewBases.set(context.view, result.base)
            else this.chatViewBases.delete(context.view)
            return true
        }
        const key = this.chatSyncKey(context.chaId, context.chatId)
        if (context.generation !== this.databaseGeneration) return false
        if (this.chatSyncStates.get(key) !== expected) return false
        if (result.base?.revision) this.storeChatSyncState(key, result.base)
        else this.forgetChatSyncState(key)
        return true
    }

    /**
     * Whether a rebase may be published into the chat being saved: a view or
     * a detached copy belongs to the caller; a chat saved on its slot base
     * only while that base was not replaced since capture (the slot was not
     * reloaded with other content) and neither was the database.
     */
    private mayPublishChatSave(context: ChatSaveContext, chat: any): boolean {
        if (!chat || typeof chat !== 'object' || chat.id !== context.chatId) return false
        if (context.view || context.detached) return true
        if (context.generation !== this.databaseGeneration) return false
        return this.chatSyncStates.get(this.chatSyncKey(context.chaId, context.chatId)) === context.entry
    }

    /**
     * An accepted save captured before the database was replaced: when the
     * chat's slot holds no base now, the base this save started from (never
     * its result) becomes the slot base. The replaced slot's content is the
     * local copy taken at the replacement, from the same starting point as
     * what this save sent; an older base only makes its next save rebase
     * changes made on the server in again. A slot base already held stays.
     * A save of a handed-out view keeps its base on the view.
     */
    private installStartAfterDatabaseReplaced(context: ChatSaveContext): void {
        if (context.generation === this.databaseGeneration) return
        if (context.view && !context.detached) return
        const start = context.start
        if (!start?.revision) return
        const key = this.chatSyncKey(context.chaId, context.chatId)
        if (this.chatSyncStates.has(key)) return
        this.storeChatSyncState(key, start)
    }

    /** Records an accepted save; its base is adopted unless the caller does that or a rebase could not be published. */
    private settleChatSave(context: ChatSaveContext, base: ChatSaveBase | null, merged: any | null, published: boolean): void {
        context.result = { base, merged }
        this.installStartAfterDatabaseReplaced(context)
        if (!context.detached && !context.view) this.settlePluginWrittenEntry(context)
        if (context.detached || !published) return
        this.adoptChatSaveResult(context)
    }

    private chatRevisionFromResponse(response: Response, body?: any): string | null {
        return response.headers.get('x-chat-revision')
            ?? (typeof body?.revision === 'string' ? body.revision : null)
            ?? (typeof body?.currentRevision === 'string' ? body.currentRevision : null)
    }

    /** The server copy of a chat with its revision and encoded bytes; null when the server has no body for it. */
    private async readServerChatCopy(chaId: string, chatIndex: number, chatId: string): Promise<(ServerChatSnapshot & { bytes: Uint8Array }) | null> {
        const response = await this.authFetchGetWithFirstByteTimeout(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
            cache: 'no-store',
            headers: { 'x-chat-id': chatId },
        })
        if (response.status === 404) return null
        if (response.status === 409 || response.status === 412) {
            const body = await response.clone().json().catch(() => ({}))
            throw new ChatConflictError(body?.error || 'Chat changed on the server', this.chatRevisionFromResponse(response, body))
        }
        if (response.status < 200 || response.status >= 300) throw new Error(\`fetchChatContent error: \${response.status}\`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const chat = normalizeChat(await decodeRisuSave(bytes))
        return { revision: this.chatRevisionFromResponse(response), chat, encodedBytes: bytes.byteLength, bytes }
    }

    /**
     * The server copy of a chat and its revision, without adopting it as
     * this client's base. null when the server has no body for it.
     */
    async readServerChatSnapshot(chaId: string, chatIndex: number, chatId: string): Promise<ServerChatSnapshot | null> {
        const copy = await this.readServerChatCopy(chaId, chatIndex, chatId)
        return copy ? { revision: copy.revision, chat: copy.chat, encodedBytes: copy.encodedBytes } : null
    }

    /**
     * Whether the server holds exactly \`currentSnapshot\`: its base when it
     * does, otherwise the server copy for a rebase. Adopts nothing.
     */
    private async confirmChatOnServer(
        chaId: string,
        chatIndex: number,
        chatId: string,
        currentSnapshot: any,
        encodedBytes: number,
    ): Promise<{ base: ChatSaveBase | null, currentRevision: string | null, serverSnapshot?: ServerChatSnapshot }> {
        try {
            const serverSnapshot = await this.readServerChatSnapshot(chaId, chatIndex, chatId)
            if (!serverSnapshot || !serverSnapshot.revision || !isChatMergeValue(serverSnapshot.chat)) {
                return { base: null, currentRevision: serverSnapshot?.revision ?? null }
            }
            if (!jsonValuesEqual(serverSnapshot.chat, currentSnapshot)) {
                return { base: null, currentRevision: serverSnapshot.revision, serverSnapshot }
            }
            return {
                base: this.chatSaveBase(serverSnapshot.revision, currentSnapshot, null, encodedBytes),
                currentRevision: serverSnapshot.revision,
            }
        } catch (error) {
            return { base: null, currentRevision: error instanceof ChatConflictError ? error.currentRevision : null }
        }
    }

    /**
     * Whether the server holds exactly \`currentSnapshot\` (a save whose answer
     * was lost, or a conflict that is already resolved). Adopts it as the
     * chat's slot base when it does; otherwise returns the server copy for a
     * rebase.
     */
    async confirmCurrentSnapshotOnServer(
        chaId: string,
        chatIndex: number,
        chatId: string,
        currentSnapshot: any,
        encodedBytes: number,
    ): Promise<{ confirmed: boolean, currentRevision: string | null, serverSnapshot?: ServerChatSnapshot }> {
        const confirmation = await this.confirmChatOnServer(chaId, chatIndex, chatId, currentSnapshot, encodedBytes)
        if (!confirmation.base) {
            return { confirmed: false, currentRevision: confirmation.currentRevision, serverSnapshot: confirmation.serverSnapshot }
        }
        this.rememberChatSyncState(this.chatSyncKey(chaId, chatId), confirmation.base.revision, currentSnapshot, encodedBytes)
        return { confirmed: true, currentRevision: confirmation.currentRevision }
    }

    /**
     * One full chat POST of a save context's content under the revision
     * protocol. Names the context's base revision; without one it reads the
     * server copy and takes it as the base (a write without a read, d13), or
     * creates only when the server has none (or the caller says the chat is
     * new); an update the server has no copy of is a conflict. A refusal or a lost answer is settled by reading the server copy:
     * equal means saved, different is a ChatConflictError that carries the
     * server copy. Returns the base of the saved content (null: unknown).
     */
    private async postFullChat(
        chaId: string,
        chatIndex: number,
        chatId: string,
        snapshot: any,
        encoded: Uint8Array,
        context: ChatSaveContext,
    ): Promise<ChatSaveBase | null> {
        let createOnly = false
        if (!context.base?.revision) {
            if (context.intent === 'create') {
                createOnly = true
            } else {
                let server: ServerChatSnapshot | null
                try {
                    server = await this.readServerChatSnapshot(chaId, chatIndex, chatId)
                } catch (error) {
                    if (!(error instanceof ChatConflictError)) throw error
                    throw new ChatConflictError(\`Could not establish a safe chat save baseline: \${error.message}\`, error.currentRevision)
                }
                if (server?.revision) {
                    context.base = this.chatSaveBase(server.revision, server.chat, null, server.encodedBytes)
                    // Started without a base: the server copy is where it starts.
                    if (!context.start?.revision) context.start = context.base
                } else if (!server) {
                    // An update of a chat the server no longer has: it was
                    // deleted elsewhere, so it is not created again (d8),
                    // unless a 422 invariant recovery asked to store its
                    // body again.
                    if (context.intent === 'update' && !context.recreate) throw new ChatConflictError('Chat no longer exists on the server', null)
                    createOnly = true
                }
            }
        }
        const headers: Record<string, string> = {
            'content-type': 'application/octet-stream',
            'x-chat-id': chatId,
        }
        if (context.base?.revision) headers['x-chat-base-revision'] = context.base.revision
        else if (createOnly) headers['if-none-match'] = '*'
        let response: Response
        try {
            response = await this.authFetch(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
                method: 'POST',
                headers,
                body: encoded as BodyInit,
            })
        } catch (error) {
            // The server may have stored it before the connection dropped.
            const confirmation = await this.confirmChatOnServer(chaId, chatIndex, chatId, snapshot, encoded.byteLength)
            if (confirmation.base) return confirmation.base
            if (confirmation.serverSnapshot) {
                throw new ChatConflictError(\`Chat save could not be confirmed: \${String(error)}\`, confirmation.currentRevision, confirmation.serverSnapshot)
            }
            throw error
        }
        const body = await response.clone().json().catch(() => ({}))
        if (response.status === 409 || response.status === 412 || response.status === 428) {
            const confirmation = await this.confirmChatOnServer(chaId, chatIndex, chatId, snapshot, encoded.byteLength)
            if (confirmation.base) return confirmation.base
            throw new ChatConflictError(
                body?.error || 'Chat changed on the server',
                confirmation.currentRevision ?? this.chatRevisionFromResponse(response, body),
                confirmation.serverSnapshot,
            )
        }
        if (response.status < 200 || response.status >= 300) throw new Error(\`saveChatContent error: \${response.status}\`)
        const revision = this.chatRevisionFromResponse(response, body)
        if (revision) return this.chatSaveBase(revision, snapshot, null, encoded.byteLength)
        // Saved without a revision in the answer: take it from the server.
        // If the server copy already differs, what was just sent is the base
        // of the rebase that follows.
        const confirmation = await this.confirmChatOnServer(chaId, chatIndex, chatId, snapshot, encoded.byteLength)
        if (confirmation.base) return confirmation.base
        if (confirmation.serverSnapshot) {
            context.base = this.chatSaveBase('', snapshot, null, encoded.byteLength)
            throw new ChatConflictError('Chat advanced after an unversioned save', confirmation.currentRevision, confirmation.serverSnapshot)
        }
        return null
    }
`,
    },
    {
        name: 'fetch-chat-content',
        type: 'replace',
        anchor: `    async fetchChatContent(chaId: string, chatIndex: number, chatId: string): Promise<any | null> {
        const da = await this.authFetchGetWithFirstByteTimeout(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
            headers: { 'x-chat-id': chatId },
        })
        if (da.status === 404) return null
        if (da.status < 200 || da.status >= 300) throw new Error(\`fetchChatContent error: \${da.status}\`)
        const buffer = new Uint8Array(await da.arrayBuffer())
        return normalizeChat(await decodeRisuSave(buffer))
    }
`,
        content: `    async fetchChatContent(chaId: string, chatIndex: number, chatId: string): Promise<any | null> {
        // The view is handed out detached (exports, plugins) with its own
        // base: saving it names the revision it was read at, whatever was
        // read, installed or saved since. A read changes no base held for the
        // chat's slot; only when none is held does it become one, so a copy
        // of this view saved as the chat's slot content is saved on this
        // read's base. Plugin writes never take the slot base: they use the
        // base of their read token (issuePluginReadToken).
        const copy = await this.readServerChatCopy(chaId, chatIndex, chatId)
        if (!copy) return null
        if (copy.revision) {
            const base = this.chatSaveBase(copy.revision, null, copy.bytes, copy.encodedBytes)
            if (copy.chat && typeof copy.chat === 'object') this.chatViewBases.set(copy.chat, base)
            const key = this.chatSyncKey(chaId, chatId)
            if (!this.chatSyncStates.has(key)) this.storeChatSyncState(key, base)
        }
        return copy.chat
    }
`,
    },
    {
        name: 'fetch-chat-delta-revision',
        type: 'replace',
        anchor: `    async fetchChatContentDelta(chaId: string, chatIndex: number, chatId: string, base: { count: number, fp: string } | null): Promise<{ chat: any, deltaBase: number | null } | null> {
`,
        content: `    async fetchChatContentDelta(chaId: string, chatIndex: number, chatId: string, base: { count: number, fp: string } | null): Promise<{ chat: any, deltaBase: number | null, revision?: string | null } | null> {
`,
    },
    {
        name: 'fetch-chat-delta-revision-return',
        type: 'replace',
        anchor: `        const buffer = new Uint8Array(await da.arrayBuffer())
        return { chat: normalizeChat(await decodeRisuSave(buffer)), deltaBase }
`,
        content: `        const buffer = new Uint8Array(await da.arrayBuffer())
        return { chat: normalizeChat(await decodeRisuSave(buffer)), deltaBase, revision: da.headers.get('x-chat-revision') }
`,
    },
    {
        name: 'save-chat-content',
        type: 'replace',
        anchor: `    async saveChatContentDelta(chaId: string, chatIndex: number, chatId: string, chat: any, base: { count: number, fp: string } | null): Promise<'ok' | 'base-mismatch'> {
        const encoded = encodeRisuSaveLegacy(chat)
        const headers: Record<string, string> = {
            'content-type': 'application/octet-stream',
            'x-chat-id': chatId,
        }
        if (base) {
            headers['x-chat-base-count'] = String(base.count)
            headers['x-chat-base-fp'] = base.fp
        }
        const gzipped = await gzipForUpload(encoded)
        if (gzipped) headers['content-encoding'] = 'gzip'
        const da = await this.authFetch(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
            method: 'POST',
            headers,
            body: (gzipped ?? encoded) as BodyInit,
        })
        if (base && da.status === 409) {
            const body = await da.json().catch(() => ({})) as { code?: string }
            if (body?.code === 'CHAT_DELTA_BASE_MISMATCH') return 'base-mismatch'
        }
        if (da.status < 200 || da.status >= 300) throw new Error(\`saveChatContent error: \${da.status}\`)
        return 'ok'
    }

    async saveChatContent(chaId: string, chatIndex: number, chatId: string, chat: any): Promise<void> {
        const encoded = encodeRisuSaveLegacy(chat)
        const da = await this.authFetch(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
            method: 'POST',
            headers: {
                'content-type': 'application/octet-stream',
                'x-chat-id': chatId,
            },
            body: encoded,
        })
        if (da.status < 200 || da.status >= 300) throw new Error(\`saveChatContent error: \${da.status}\`)
    }
`,
        content: `    async saveChatContentDelta(
        chaId: string,
        chatIndex: number,
        chatId: string,
        chat: any,
        base: { count: number, fp: string } | null,
        options: { fullChat?: any, intent?: ChatSaveIntent, context?: ChatSaveContext } = {},
    ): Promise<'ok' | 'base-mismatch'> {
        // A full save goes through the revision protocol with its rebase.
        if (!base) {
            await this.saveChatContent(chaId, chatIndex, chatId, options.fullChat ?? chat, options.intent, options.context)
            return 'ok'
        }
        // The delta names the base revision of its save context. Without a
        // known one nothing is sent: the full save reads the server copy first.
        if (!options.fullChat) return 'base-mismatch'
        const context = options.context ?? this.beginChatSave(chaId, chatId, options.fullChat, { intent: options.intent })
        const baseRevision = context.base?.revision
        if (!baseRevision) return 'base-mismatch'
        // Both encodings are taken before any await: they describe the chat
        // the delta was cut from, even while it keeps changing (streaming).
        const fullEncoded = encodeRisuSaveLegacy(options.fullChat)
        const encoded = encodeRisuSaveLegacy(chat)
        const headers: Record<string, string> = {
            'content-type': 'application/octet-stream',
            'x-chat-id': chatId,
            'x-chat-base-count': String(base.count),
            'x-chat-base-fp': base.fp,
            'x-chat-base-revision': baseRevision,
        }
        const gzipped = await gzipForUpload(encoded)
        if (gzipped) headers['content-encoding'] = 'gzip'
        const da = await this.authFetch(\`/api/chat-content/\${encodeURIComponent(chaId)}/\${chatIndex}\`, {
            method: 'POST',
            headers,
            body: (gzipped ?? encoded) as BodyInit,
        })
        // A prefix or revision mismatch: the caller saves in full with the
        // same context, which settles a revision conflict by a rebase.
        if (da.status === 409) return 'base-mismatch'
        if (da.status < 200 || da.status >= 300) throw new Error(\`saveChatContent error: \${da.status}\`)
        // The server now holds the chat the delta was cut from.
        const revision = da.headers.get('x-chat-revision')
        this.settleChatSave(context, revision ? this.chatSaveBase(revision, null, fullEncoded, fullEncoded.byteLength) : null, null, true)
        return 'ok'
    }

    /**
     * Saves a whole chat under the revision protocol, as the save context
     * \`context\` (captured now when none is given) holds it: its content on
     * its base. When the chat changed on the server since that base, the
     * content is rebased on the server copy (chatSaveRebase.ts), published
     * into \`chat\` when that may still show it, and saved again, so a reply
     * another device saved is kept. A conflict that cannot be merged throws
     * ChatConflictError and leaves \`chat\` as it is.
     */
    async saveChatContent(
        chaId: string,
        chatIndex: number,
        chatId: string,
        chat: any,
        intent?: ChatSaveIntent,
        context?: ChatSaveContext,
    ): Promise<void> {
        const save = context ?? this.beginChatSave(chaId, chatId, chat, { intent })
        let proposedBytes: Uint8Array = save.content
        let proposed = normalizeChat(await decodeRisuSave(proposedBytes))
        let merged: any | null = null
        let published = true
        for (let attempt = 0; ; attempt++) {
            try {
                const saved = await this.postFullChat(chaId, chatIndex, chatId, proposed, proposedBytes, save)
                this.settleChatSave(save, saved, merged, published)
                return
            } catch (error) {
                const fresh = error instanceof ChatConflictError ? error.serverSnapshot : undefined
                if (error instanceof ChatConflictError) delete error.serverSnapshot
                // The save's own base, never a newer one found by chat.
                const base = save.base
                if (!fresh || !base || attempt >= 2 || fresh.revision === base.revision || chat?.isStreaming) throw error
                const baseCopy = await this.chatSaveBaseCopy(base)
                if (!baseCopy) throw error
                const rebased = rebaseChatSave(baseCopy, proposed, fresh.chat)
                if (!rebased.ok) throw error
                let next = rebased.chat
                if (this.mayPublishChatSave(save, chat)) {
                    // Keep edits made to the chat while the request ran.
                    let live: any
                    try {
                        live = normalizeChat(snapshotChatView(chat))
                    } catch {
                        throw error
                    }
                    const publication = rebaseChatSave(proposed, live, rebased.chat)
                    if (!publication.ok) throw error
                    // A stored streaming flag describes an earlier run; never let
                    // a merged server copy start a spinner here.
                    for (const field of ['isStreaming', 'activeStreamingDisplayOptimizationMode']) {
                        if (Object.hasOwn(live, field)) publication.chat[field] = live[field]
                        else delete publication.chat[field]
                    }
                    try {
                        publishChatView(chat, publication.chat)
                    } catch {
                        throw error
                    }
                    next = publication.chat
                } else {
                    // The chat no longer shows this save's content: it keeps
                    // its own base, and the merge is saved without it.
                    published = false
                }
                // Verified rebase: the content moves onto the server copy.
                save.base = this.chatSaveBase(fresh.revision, fresh.chat, null, fresh.encodedBytes)
                proposed = next
                proposedBytes = encodeRisuSaveLegacy(proposed)
                merged = proposed
            }
        }
    }
`,
    },
    {
        name: 'patch-item-invariant',
        type: 'insert',
        where: 'before',
        anchor: `        if (da.status < 200 || da.status >= 300) {
            // Surface the server's error detail — without this the browser
            // console shows nothing while every save silently falls back to
            // a full write.
`,
        content: `        if (da.status === 422) {
            const data = await da.json().catch(() => ({}))
            return {
                success: false,
                validationRejected: true,
                missingFullChat: readMissingFullChat(data),
                conflictCode: typeof data?.code === 'string' ? data.code : undefined,
                conflictError: typeof data?.detail === 'string' ? data.detail : data?.error,
            }
        }
`,
    },
    {
        name: 'set-item-invariant',
        type: 'insert',
        where: 'before',
        anchor: `        if(da.status < 200 || da.status >= 300){
            throw await this.storageRequestError('setItem', da)
        }
`,
        content: `        if (da.status === 422) {
            const data = await da.json().catch(() => ({}))
            throw new DatabaseInvariantError(data?.detail || data?.error || 'Database write rejected', readMissingFullChat(data))
        }
`,
    },
]

const chatDeltaSyncUnits = [
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `import { messageFingerprints, prefixFingerprint } from './chatFingerprint'
`,
        content: `import type { ChatSaveIntent } from './chatSaveIntent'
import type { ChatSaveContext } from './nodeStorage'
`,
    },
    {
        name: 'transport',
        type: 'replace',
        anchor: `export interface ChatDeltaTransport {
    fetchChatContentDelta(chaId: string, chatIndex: number, chatId: string, base: { count: number, fp: string } | null): Promise<{ chat: any, deltaBase: number | null } | null>
    saveChatContentDelta(chaId: string, chatIndex: number, chatId: string, chat: any, base: { count: number, fp: string } | null): Promise<'ok' | 'base-mismatch'>
}
`,
        content: `export interface ChatDeltaTransport {
    fetchChatContentDelta(chaId: string, chatIndex: number, chatId: string, base: { count: number, fp: string } | null): Promise<{ chat: any, deltaBase: number | null, revision?: string | null } | null>
    // \`options.fullChat\` is the whole chat a delta was cut from; \`options.intent\`
    // says whether a full save creates the chat or updates it; \`options.context\`
    // is the save context (content and base) of this save.
    saveChatContentDelta(chaId: string, chatIndex: number, chatId: string, chat: any, base: { count: number, fp: string } | null, options?: { fullChat?: Chat, intent?: ChatSaveIntent, context?: ChatSaveContext }): Promise<'ok' | 'base-mismatch'>
    // Captures a save context: the content to send and its base, together.
    beginChatSave?(chaId: string, chatId: string, chat: Chat, options: { intent?: ChatSaveIntent }): ChatSaveContext | undefined
    // Records the revision of a chat a load assembled, as that object's own
    // base until it is installed.
    registerFetchedChat?(chaId: string, chatId: string, revision: string, chat: Chat): void
    // The chat now in its slot and its index; null when the character or the
    // chat is gone or the slot holds a placeholder.
    locateLiveChat?(chaId: string, chatId: string): { chatIndex: number, chat: Chat } | null
}
`,
    },
    {
        name: 'fetch-adopt',
        type: 'insert',
        where: 'before',
        anchor: `        if ((full.message?.length ?? 0) >= CACHE_MIN_MESSAGES) {
`,
        content: `        // The revision belongs to the whole chat; record it while \`full\` is
        // still a plain object. It becomes the chat's base only if the caller
        // installs \`full\` (chatStorage.ensureChatHydrated).
        if (result.revision) transport.registerFetchedChat?.(chaId, chatId, result.revision, full)
`,
    },
    {
        name: 'save-intent',
        type: 'replace',
        anchor: `    function saveChat(chaId: string, chatIndex: number, chatId: string, chat: Chat): Promise<void> {
        const key = chatCopyKey(chaId, chatId)
        const previous = saveQueues.get(key)
        const run = previous
            ? previous.then(() => saveChatNow(chaId, chatIndex, chatId, chat))
            : saveChatNow(chaId, chatIndex, chatId, chat)
`,
        content: `    // A save's context (its content and the base of that content) is
    // captured at the call and kept while the save waits its turn, so a base
    // an earlier save moves on never goes to content that lacks that save's
    // result. The open chat's autosave (\`options.live\`) holds no chat while it
    // waits: when its turn comes it looks the chat up in its slot again
    // (transport.locateLiveChat) and captures the content and its base from
    // that object, at that index. When the chat is gone or its slot holds a
    // placeholder by then, nothing is sent and the save resolves 'skipped'.
    // A caller may hand in a context it captured itself (\`options.context\`).
    function saveChat(
        chaId: string,
        chatIndex: number,
        chatId: string,
        chat: Chat,
        intent?: ChatSaveIntent,
        options: { live?: boolean, context?: ChatSaveContext } = {},
    ): Promise<void | 'skipped'> {
        const key = chatCopyKey(chaId, chatId)
        const previous = saveQueues.get(key)
        const live = !options.context && options.live === true && typeof transport.locateLiveChat === 'function'
        const context = options.context ?? (live ? undefined : transport.beginChatSave?.(chaId, chatId, chat, { intent }))
        const queued = live ? null : chat
        const run = previous
            ? previous.then(() => saveChatNow(chaId, chatIndex, chatId, queued, intent, context))
            : saveChatNow(chaId, chatIndex, chatId, queued, intent, context)
`,
    },
    {
        name: 'save-now-intent',
        type: 'replace',
        anchor: `    async function saveChatNow(chaId: string, chatIndex: number, chatId: string, chat: Chat): Promise<void> {
`,
        content: `    async function saveChatNow(chaId: string, chatIndex: number, chatId: string, queued: Chat | null, intent?: ChatSaveIntent, context?: ChatSaveContext): Promise<void | 'skipped'> {
        // An open chat's autosave (no queued chat) saves the chat in its slot
        // now, at its index now; nothing when it is gone or a placeholder.
        let chat: Chat
        if (queued) {
            chat = queued
        } else {
            const located = transport.locateLiveChat?.(chaId, chatId)
            if (!located) return 'skipped'
            chat = located.chat
            chatIndex = located.chatIndex
        }
        // This run's save context: captured at the call, or now, together
        // with the fingerprints and the delta below from the same object.
        const save = context ?? transport.beginChatSave?.(chaId, chatId, chat, { intent })
`,
    },
    {
        name: 'save-delta-full-chat',
        type: 'replace',
        anchor: `            const outcome = await transport.saveChatContentDelta(chaId, chatIndex, chatId, delta, {
                count: shared,
                fp: prefixFingerprint(fingerprints, shared),
            })
`,
        content: `            const outcome = await transport.saveChatContentDelta(chaId, chatIndex, chatId, delta, {
                count: shared,
                fp: prefixFingerprint(fingerprints, shared),
            }, { fullChat: chat, intent, context: save })
`,
    },
    {
        name: 'save-full-intent',
        type: 'replace',
        anchor: `        await transport.saveChatContentDelta(chaId, chatIndex, chatId, chat, null)
`,
        content: `        await transport.saveChatContentDelta(chaId, chatIndex, chatId, chat, null, { fullChat: chat, intent, context: save })
`,
    },
]

const chatStorageUnits = [
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `import { createChatDeltaSync, indexedDbChatCopies } from "./chatDeltaSync"
`,
        content: `import type { ChatSaveIntent } from "./chatSaveIntent"
import type { ChatSaveContext } from "./nodeStorage"
`,
    },
    {
        name: 'transport',
        type: 'replace',
        anchor: `    saveChatContentDelta: (chaId, chatIndex, chatId, chat, base) => forageStorage.realStorage.saveChatContentDelta(chaId, chatIndex, chatId, chat, base),
}, indexedDbChatCopies)
`,
        content: `    saveChatContentDelta: (chaId, chatIndex, chatId, chat, base, options) => forageStorage.realStorage.saveChatContentDelta(chaId, chatIndex, chatId, chat, base, options),
    beginChatSave: (chaId, chatId, chat, options) => forageStorage.realStorage?.beginChatSave?.(chaId, chatId, chat, options),
    registerFetchedChat: (chaId, chatId, revision, chat) => forageStorage.realStorage?.registerFetchedChat?.(chaId, chatId, revision, chat),
    locateLiveChat: (chaId, chatId) => locateLiveChat(chaId, chatId),
}, indexedDbChatCopies)

// The current database state (DBState), loaded when the first open-chat
// autosave is queued rather than with this module, so loading chatStorage
// still starts no reactive store effects.
let liveDatabaseState: typeof import("../stores.svelte").DBState | null = null
async function loadLiveDatabaseState(): Promise<void> {
    liveDatabaseState ??= (await import("../stores.svelte")).DBState
}

// The chat in its slot in the current database and its index, for an open
// chat's autosave when its turn in the save queue comes; null when the
// character or the chat is gone or the slot holds a placeholder.
function locateLiveChat(chaId: string, chatId: string): { chatIndex: number, chat: Chat } | null {
    const characters = liveDatabaseState?.db?.characters
    const character = characters ? Object.values(characters).find(entry => entry?.chaId === chaId) : undefined
    const chats = character?.chats
    if (!Array.isArray(chats)) return null
    const chatIndex = chats.findIndex(entry => entry?.id === chatId)
    const chat = chatIndex === -1 ? undefined : chats[chatIndex]
    if (!chat || chat._placeholder) return null
    return { chatIndex, chat }
}
`,
    },
    {
        name: 'save-intent',
        type: 'replace',
        anchor: `export async function saveChatToServer(chaId: string, chatIndex: number, chatId: string, chat: Chat): Promise<void> {
    await chatDeltaSync.saveChat(chaId, chatIndex, chatId, chat)
}
`,
        content: `// \`intent\` (chatSaveIntent.ts) says whether the server should already have
// the chat; a new one is created only if absent. Without it the server copy
// decides. The save's content and its base are taken at the call, except for
// the open chat's autosave (\`options.live\`): it takes the chat in its slot
// (found again by chaId and chatId, at its index then) with its base when its
// turn in the save queue comes, and resolves 'skipped' without sending when
// the chat is gone or its slot holds a placeholder by then. \`options.context\`
// hands in a context the caller captured (NodeStorage.beginChatSave) and
// reads its result afterwards.
export async function saveChatToServer(
    chaId: string,
    chatIndex: number,
    chatId: string,
    chat: Chat,
    intent?: ChatSaveIntent,
    options?: { live?: boolean, context?: ChatSaveContext },
): Promise<void | 'skipped'> {
    if (options?.live && !options.context && !liveDatabaseState) await loadLiveDatabaseState()
    return await chatDeltaSync.saveChat(chaId, chatIndex, chatId, chat, intent, options)
}
`,
    },
    {
        name: 'install-base',
        type: 'insert',
        where: 'after',
        anchor: `            hydrationJustApplied.add(key)
            chats[currentIndex] = full
`,
        content: `            // The slot holds the fetched chat now: its revision becomes the
            // base of the slot's saves. A fetch that is not installed here
            // changes no base.
            forageStorage.realStorage?.adoptInstalledChat?.(chaId, chatId, full)
`,
    },
]

const globalApiUnits = [
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `import { addLog } from './log'
`,
        content: `import { ChatConflictError, DatabaseInvariantError, type ServerChatSnapshot } from "./storage/nodeStorage";
import { classifyChatSaveIntent, collectUnconfirmedChatPayloads, findRecoverableChatPayload } from "./storage/chatSaveIntent";
import { assignMissingChatIdsToNewCharacters } from "./storage/chatIdentityRepair";
`,
    },
    {
        name: 'save-contract-state',
        type: 'insert',
        where: 'after',
        anchor: `let trackChatForSaveImpl: (chaId: string, chatId: string) => void = () => {}
`,
        content: `let requestImportedCharacterSaveImpl: (chaId: string) => Promise<void> = async () => {
    throw new Error('character import save is not initialized')
}
let requestImportedModuleSaveImpl: (moduleId: string) => Promise<void> = async () => {
    throw new Error('module import save is not initialized')
}
// trackChatForSave goes through this hook; dependent packs may wrap it.
let markChatDirtyImpl = (chaId: string, chatId: string) => trackChatForSaveImpl(chaId, chatId)

/**
 * A save attempt stopped because the server refused a chat as changed there
 * (ChatConflictError) and the change could not be rebased. The chats and the
 * database metadata stay queued.
 */
export class ManualSaveConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ManualSaveConflictError'
    }
}
`,
    },
    {
        name: 'save-contract-exports',
        type: 'replace',
        anchor: `export function trackChatForSave(chaId: string, chatId: string) {
    trackChatForSaveImpl(chaId, chatId)
}
`,
        content: `export function trackChatForSave(chaId: string, chatId: string) {
    markChatDirtyImpl(chaId, chatId)
}

/** Saves an imported character with all its chat bodies; rejects unless the server confirmed them. */
export function requestImportedCharacterSave(chaId: string): Promise<void> {
    return requestImportedCharacterSaveImpl(chaId)
}

/** Saves an imported module; rejects unless the server confirmed it. */
export function requestImportedModuleSave(moduleId: string): Promise<void> {
    return requestImportedModuleSaveImpl(moduleId)
}

/** The server copy of a chat and its revision, not adopted as this client's base. */
export function readServerChatSnapshot(chaId: string, chatIndex: number, chatId: string): Promise<ServerChatSnapshot | null> {
    return forageStorage.realStorage.readServerChatSnapshot(chaId, chatIndex, chatId)
}

/** Whether the server holds exactly this chat; adopts its revision when it does. */
export function confirmCurrentSnapshotOnServer(chaId: string, chatIndex: number, chatId: string, chat: any, encodedBytes: number) {
    return forageStorage.realStorage.confirmCurrentSnapshotOnServer(chaId, chatIndex, chatId, chat, encodedBytes)
}
`,
    },
    {
        name: 'confirmed-chat-baseline',
        type: 'insert',
        where: 'after',
        anchor: `    const knownChatIdsByCharacter = new Map<string, Set<string>>(
        (getDatabase()?.characters ?? [])
            .filter(character => character?.chaId)
            .map(character => [
                character.chaId,
                new Set((character.chats ?? []).map(chat => chat?.id).filter(Boolean)),
            ])
    )
`,
        content: `    // The chats the server confirmed, as a database shape: the baseline of the
    // save intent and of the chat id repair. A fresh install starts from {}
    // and gets an empty character list here.
    const confirmedChatBaseline = () => ({
        characters: [...knownChatIdsByCharacter].map(([chaId, ids]) => ({
            chaId,
            chats: [...ids].map((id) => ({ id })),
        })),
    })
    // Recovery slot: the one chat a database refusal for a missing body may
    // enlist again before the refusal is shown.
    let missingPayloadRecoveryKey: string | null = null
`,
    },
    {
        name: 'collect-unconfirmed',
        type: 'insert',
        where: 'before',
        anchor: `        return chatsToPersist
`,
        content: `        // Chat bodies the server has not confirmed, even when no tracker named
        // their character: the database must not list a chat whose body never
        // reached the server.
        for (const { chaId, chatId } of collectUnconfirmedChatPayloads(confirmedChatBaseline(), db)) {
            pushChat(chaId, chatId)
        }

`,
    },
    {
        name: 'invariant-retry',
        type: 'insert',
        where: 'before',
        anchor: `    async function persistTrackedChanges(
`,
        content: `    // The server refused a database save for its stripped database invariants
    // (422). When it names a chat body this client holds, enlist that chat
    // once and retry, body first; otherwise, or when the same chat comes back,
    // stop with a visible error and keep the edits queued. Never retried as a
    // full write.
    async function retryAfterInvariantRejection(
        db: Database,
        toSave: toSaveType,
        syncedBaselineDb: Database | null,
        missing: { chaId: string, chatId: string } | undefined,
        detail: string | undefined,
    ): Promise<'retry'> {
        // set() advanced the patcher to this attempt; diff the retry from the
        // last accepted baseline instead.
        if (supportsPatchSync && syncedBaselineDb) {
            patcher = new RisuSavePatcher()
            await patcher.init(syncedBaselineDb)
            activeSavePatcher = patcher
        }
        const recoverable = findRecoverableChatPayload(db, missing)
        const key = recoverable ? \`\${recoverable.chaId}|\${recoverable.chatId}\` : null
        if (!recoverable || missingPayloadRecoveryKey === key) {
            throw new SaveRejectedError(\`Server rejected an invalid database update: \${detail ?? 'stripped database invariant failed'}\`)
        }
        missingPayloadRecoveryKey = key
        // The server holds no body for a chat the database still lists and
        // this client holds: the next save of that chat stores its body again
        // (created when the server has none, even when classified as an
        // update; any other update of a chat missing on the server conflicts).
        forageStorage.realStorage?.recreateChatOnNextSave?.(recoverable.chaId, recoverable.chatId)
        requeueTrackedChanges(toSave)
        if (!changeTracker.chat.some(([c, id]) => c === recoverable.chaId && id === recoverable.chatId)) {
            changeTracker.chat.unshift([recoverable.chaId, recoverable.chatId])
        }
        changed = true
        return 'retry'
    }

`,
    },
    {
        name: 'chat-save-loop',
        type: 'replace',
        anchor: `        const failedChats: { chaId: string, chatId: string, message: string }[] = []
        for (const [chaId, chatId] of collectChatsToPersist(db, toSave)) {
            const char = db.characters.find(c => c.chaId === chaId)
            if (!char) continue
            const chatIndex = char.chats.findIndex(c => c.id === chatId)
            if (chatIndex === -1) continue
            const chat = char.chats[chatIndex]
            // Skip placeholders — they have no real data to save
            if (!chat || chat._placeholder) continue
            try {
                await saveChatToServer(chaId, chatIndex, chatId, chat)
            } catch (e) {
                console.error(\`[Save] Failed to save chat \${chaId}/\${chatId}:\`, e)
                failedChats.push({ chaId, chatId, message: errorMessage(e) })
            }
        }
        if (failedChats.length > 0) {
            throw new Error(
                \`Failed to save \${failedChats.length} chat\${failedChats.length === 1 ? '' : 's'}: \${failedChats[0].message}\`
            )
        }
`,
        content: `        // Chats of a character the server does not know yet may lack an id or
        // repeat one: give them unique ids before anything is saved.
        for (const { chaId, chatId } of assignMissingChatIdsToNewCharacters(db, confirmedChatBaseline(), v4)) {
            if (!toSave.character.includes(chaId)) toSave.character.unshift(chaId)
            if (!toSave.chat.some(([c, id]) => c === chaId && id === chatId)) toSave.chat.unshift([chaId, chatId])
        }
        const confirmedBaseline = confirmedChatBaseline()
        const failedChats: { chaId: string, chatId: string, message: string }[] = []
        const postedChats: [string, string][] = []
        let chatConflict = false
        for (const [chaId, chatId] of collectChatsToPersist(db, toSave)) {
            const char = db.characters.find(c => c.chaId === chaId)
            if (!char) continue
            const chatIndex = char.chats.findIndex(c => c.id === chatId)
            if (chatIndex === -1) continue
            const chat = char.chats[chatIndex]
            // Skip placeholders — they have no real data to save
            if (!chat || chat._placeholder) continue
            try {
                // A chat the server never confirmed is created only if absent.
                // The live save holds no chat while it waits: when its turn in
                // the save queue comes it saves the chat then in its slot, on
                // the slot's base. A chat gone or turned into a placeholder by
                // then is skipped and not counted as posted.
                const outcome = await saveChatToServer(chaId, chatIndex, chatId, chat, classifyChatSaveIntent(confirmedBaseline, chaId, chatId), { live: true })
                if (outcome !== 'skipped') postedChats.push([chaId, chatId])
            } catch (e) {
                console.error(\`[Save] Failed to save chat \${chaId}/\${chatId}:\`, e)
                if (e instanceof ChatConflictError) chatConflict = true
                failedChats.push({ chaId, chatId, message: errorMessage(e) })
            }
        }
        // Bodies first: no database metadata is saved after a failed body.
        if (failedChats.length > 0) {
            const message = \`Failed to save \${failedChats.length} chat\${failedChats.length === 1 ? '' : 's'}: \${failedChats[0].message}\`
            throw chatConflict ? new ManualSaveConflictError(message) : new Error(message)
        }
`,
    },
    {
        name: 'patch-invariant',
        type: 'insert',
        where: 'after',
        anchor: `                timing.server = patchResult.serverTimings
`,
        content: `                if (patchResult.validationRejected) {
                    return await retryAfterInvariantRejection(db, toSave, syncedBaselineDb, patchResult.missingFullChat, patchResult.conflictError)
                }
`,
    },
    {
        name: 'full-write-invariant',
        type: 'insert',
        where: 'before',
        anchor: `                throw conflictErr
`,
        content: `                if (conflictErr instanceof DatabaseInvariantError) {
                    return await retryAfterInvariantRejection(db, toSave, syncedBaselineDb, conflictErr.missingFullChat, conflictErr.message)
                }
`,
    },
    {
        name: 'database-replaced-generation',
        type: 'insert',
        where: 'after',
        anchor: `            const selectedChaId = getCurrentCharacter()?.chaId
            setDatabase(mergedDb)
`,
        content: `            // Every chat slot holds another object now: a chat save captured
            // before this never publishes into a chat or moves a slot base
            // afterwards. Nothing awaits between the swap and this.
            forageStorage.realStorage?.noteDatabaseReplaced?.()
`,
    },
    {
        name: 'confirmed-after-save',
        type: 'insert',
        where: 'after',
        anchor: `        updateKnownChatsAfterSuccessfulSave(db, toSave)
`,
        content: `        // The chat bodies this save posted are confirmed with its metadata.
        for (const [chaId, chatId] of postedChats) {
            const known = knownChatIdsByCharacter.get(chaId) ?? new Set<string>()
            known.add(chatId)
            knownChatIdsByCharacter.set(chaId, known)
            if (missingPayloadRecoveryKey === \`\${chaId}|\${chatId}\`) missingPayloadRecoveryKey = null
        }
`,
    },
    {
        name: 'imported-save',
        type: 'insert',
        where: 'before',
        anchor: `    trackCharacterForSaveImpl = (chaId) => {
`,
        content: `    // Imported data reaches the server before the import reports success:
    // the character with every chat body, or the module.
    requestImportedCharacterSaveImpl = async (chaId) => {
        const character = getDatabase().characters?.find((item) => item?.chaId === chaId)
        if (!character) throw new Error('Imported character is no longer present')
        trackCharacterForSaveImpl(chaId)
        for (const chat of character.chats ?? []) {
            if (chat?.id && !chat._placeholder) trackChatForSaveImpl(chaId, chat.id)
        }
        if (!await flushSavesImpl()) throw new Error('Server has not confirmed the imported character yet')
    }
    requestImportedModuleSaveImpl = async (moduleId) => {
        if (!getDatabase().modules?.some((module) => module?.id === moduleId)) {
            throw new Error('Imported module is no longer present')
        }
        changeTracker.modules = true
        if (!await flushSavesImpl()) throw new Error('Server has not confirmed the imported module yet')
    }

`,
    },
]

const pluginApiUnits = [
    {
        name: 'import',
        type: 'insert',
        where: 'after',
        anchor: `import { checkCharOrder, forageStorage, getFetchLogs } from "src/ts/globalApi.svelte";
`,
        content: `import { trackCharacterForSave } from "src/ts/globalApi.svelte";
import { publishChatView, rebaseChatSave, snapshotChatView } from "src/ts/storage/chatSaveRebase";

// A chat handed to a plugin carries the token of that read in this field; it
// comes back with the plugin's clone and names the base of its write.
const PLUGIN_READ_TOKEN_FIELD = '__pluginReadToken';
`,
    },
    {
        name: 'chat-read-token',
        type: 'replace',
        anchor: `                    if(slot._placeholder){
                        if(!slot.id) return null;
                        return await fetchChatFromServer(db.characters[charId].chaId, chatIndex, slot.id);
                    }
                    return $state.snapshot(slot);
`,
        content: `                    // The chat reaches the plugin as a clone that carries no
                    // base: each read hands it out with a read token naming
                    // the base of what is handed out here, so the plugin's
                    // setChatToIndex saves on it.
                    const chaId = db.characters[charId].chaId;
                    if(slot._placeholder){
                        if(!slot.id) return null;
                        const fetched = await fetchChatFromServer(chaId, chatIndex, slot.id);
                        const token = fetched ? forageStorage.realStorage?.issuePluginReadToken?.(chaId, slot.id, fetched) : null;
                        if(fetched && token) (fetched as any)[PLUGIN_READ_TOKEN_FIELD] = token;
                        return fetched;
                    }
                    const handed = $state.snapshot(slot) as any;
                    const token = slot.id ? forageStorage.realStorage?.issuePluginReadToken?.(chaId, slot.id, null) : null;
                    if(token) handed[PLUGIN_READ_TOKEN_FIELD] = token;
                    return handed;
`,
    },
    {
        name: 'set-chat-take-token',
        type: 'insert',
        where: 'after',
        anchor: `        setChatToIndex: async (characterIndex:number, chatIndex:number, chat:any) => {
`,
        content: `            // The read token leaves the chat before anything else, so it is
            // never normalized, put into the slot or saved.
            let readToken: unknown = undefined;
            if(chat && typeof chat === 'object' && Object.hasOwn(chat, PLUGIN_READ_TOKEN_FIELD)){
                readToken = chat[PLUGIN_READ_TOKEN_FIELD];
                delete chat[PLUGIN_READ_TOKEN_FIELD];
            }
`,
    },
    {
        name: 'unopened-chat-character',
        type: 'replace',
        anchor: `                    DBState.db.characters[charId].chats[chatIndex] = normalizeChat(chat)
                    // Only the open chat is saved by change tracking; save any
                    // other chat directly or the write is lost on reload.
                    const char = DBState.db.characters[charId]
                    const isOpen = Number(charId) === get(selectedCharID) && char.chatPage === chatIndex
                    if(!isOpen){
                        const saved = char.chats[chatIndex]
                        await saveChatToServer(char.chaId, chatIndex, saved.id, $state.snapshot(saved) as any)
                    }
`,
        content: `                    // The base of this write is the base of the read its
                    // token names, never the slot's base; no token, or one for
                    // another chat, is a write without a read (the server copy
                    // is read first). Resolved before the slot changes: a
                    // token the host no longer knows refuses the write.
                    const storage = forageStorage.realStorage
                    const owner = DBState.db.characters[charId]
                    const writtenId = chat?.id ?? chats[chatIndex].id
                    const tokenBase = storage.pluginReadTokenBase(readToken, owner.chaId, writtenId)
                    // The open chat is saved by its autosave on the slot's
                    // base. A token base without its server copy cannot be
                    // rebased there, so it must be the slot's own base.
                    const opening = Number(charId) === get(selectedCharID) && owner.chatPage === chatIndex
                    if(opening && tokenBase && tokenBase.snapshot === null && tokenBase.bytes === null
                        && tokenBase.revision !== storage.chatSlotBaseRevision(owner.chaId, writtenId)){
                        throw new Error('setChatToIndex: this chat changed since it was read; read it again with getChatFromIndex');
                    }
                    DBState.db.characters[charId].chats[chatIndex] = normalizeChat(chat)
                    // Only the open chat is saved by change tracking; save any
                    // other chat directly or the write is lost on reload.
                    const char = DBState.db.characters[charId]
                    const isOpen = Number(charId) === get(selectedCharID) && char.chatPage === chatIndex
                    if(isOpen){
                        // The slot holds the plugin's content now: its autosave
                        // saves it on the token's base, installed as a new slot
                        // base even at the same revision (an autosave already
                        // running never moves it), or reads the server copy
                        // first without a token. Saved as written, the token
                        // advances to the result.
                        const saved = char.chats[chatIndex]
                        storage.installPluginChatBase(char.chaId, saved.id, tokenBase, tokenBase ? readToken : null, saved)
                    }
                    if(!isOpen){
                        const saved = char.chats[chatIndex]
                        // The chat's name, folder and modules live in the
                        // character's database entry: save it too, or the next
                        // database save restores the old values.
                        trackCharacterForSave(char.chaId)
                        const sent = $state.snapshot(saved) as any
                        // Save context, taken before the save is queued: the
                        // plugin's content and its token's base.
                        const context = storage.beginChatSave(char.chaId, saved.id, sent, { detached: true, base: tokenBase })
                        // The slot holds that content now, so its base is the
                        // context's base.
                        const installed = storage.installChatSaveBase(char.chaId, saved.id, context.base)
                        // A chat the rebase cannot represent is never merged on
                        // a conflict (the save throws), so it needs no copy.
                        let sentView: any = null
                        try { sentView = snapshotChatView(sent) } catch { sentView = null }
                        await saveChatToServer(char.chaId, chatIndex, saved.id, sent, undefined, { context })
                        storage.settlePluginReadToken(readToken, context)
                        // The slot takes the saved result, and its base, only
                        // while it still holds the chat put there above. A merge
                        // with another device's change is published with the
                        // edits made to the slot meanwhile; when that is not
                        // possible the slot keeps the base of its content and
                        // its next save rebases.
                        const live = char.chats[chatIndex]
                        if(context.result && live === saved && live.id === saved.id){
                            let published = true
                            if(context.result.merged){
                                published = false
                                try {
                                    const merged = sentView ? rebaseChatSave(sentView, snapshotChatView(live), context.result.merged) : { ok: false as const }
                                    if(merged.ok){
                                        publishChatView(live, merged.chat)
                                        published = true
                                    }
                                } catch {
                                    published = false
                                }
                            }
                            if(published) storage.adoptChatSaveResult(context, installed)
                        }
                    }
`,
    },
]

const scoped = (file, prefix, units) => units.map(({ name, ...unit }) => ({
    id: `lazy-chat-sync:${prefix}-${name}:1.16`,
    file,
    ...unit,
}))

module.exports = [
    ...scoped(serverFile, 'server', serverUnits),
    ...scoped(nodeStorageFile, 'node-storage', nodeStorageUnits),
    ...scoped(chatDeltaSyncFile, 'chat-delta-sync', chatDeltaSyncUnits),
    ...scoped(chatStorageFile, 'chat-storage', chatStorageUnits),
    ...scoped(globalApiFile, 'global-api', globalApiUnits),
    ...scoped(pluginApiFile, 'plugin-api', pluginApiUnits),
    // The native chat screen keeps a chat without a body as a placeholder;
    // sending into it explains why nothing happened. Same unit as on 1.10.0.
    {
        id: 'lazy-chat-sync:chat-missing-payload-notice',
        file: 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        type: 'replace',
        anchor: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) return
`,
        content: `        const activeChat = await ensureActiveChatReady(selectedChar)
        if(!activeChat) {
            notifyError('Chat data unavailable', {
                description: 'The server has metadata for this chat but no message payload. Your draft was kept.',
                source: 'chat-hydration',
            })
            return
        }
`,
    },
]
