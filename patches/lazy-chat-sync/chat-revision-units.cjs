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
    /**
     * Whether every message of the copy carried a chatId (a non-empty string,
     * not repeated) as read, before normalization gave missing ones new ids.
     */
    messageIdsValid?: boolean
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
    /** Saved by the retry of a 422 invariant recovery that named this chat: a server without the chat gets it created, whatever the intent. */
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
    /** The chat's open-chat plugin write generation at capture (installPluginChatBase), compared like \`generation\`. */
    readonly pluginWrite: number
    /**
     * The chat's slot object the caller found in the current database at
     * capture (by chaId and chatId), with the lookup that finds the slot
     * again; null when it found none. A slot save of another object is
     * replaced from capture (chatSaveSlotReplaced). A save captured before
     * the database state was loaded gets it once loaded, before it is sent
     * (attachChatSaveSlot).
     */
    slot: { readonly chat: object, readonly locate: () => unknown, readonly replacedAtCapture: boolean } | null
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
    // Open-chat plugin writes, per chat: the generation of the latest one
    // (a save captured before it neither publishes into the chat nor moves
    // or installs its base afterwards) and, when that write carried no read
    // token, its overwrite right: the slot object it wrote and the length and
    // 64-bit hash of the encoded content (never the bytes themselves). Only a
    // save of that object with that content overwrites the server copy
    // instead of merging with it (pluginOverwriteAllowed).
    private readonly pluginWrites = new Map<string, { generation: number, right: { chat: object, length: number, hash: string } | null }>()
    private pluginWriteCount = 0
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
     * still lists (a 422 invariant recovery): its slot base is dropped. The
     * permission to create it again belongs to the recovery's retry, which
     * passes it as a save option (beginChatSave \`options.recreate\`).
     */
    forgetChatSaveBase(chaId: string, chatId: string): void {
        this.forgetChatSyncState(this.chatSyncKey(chaId, chatId))
    }

    /** Sets a chat's slot base (a decoded copy is cloned); returns the stored entry. An installed base ends the chat's plugin overwrite right. */
    private storeChatSyncState(key: string, base: ChatSaveBase): ChatSaveBase {
        this.forgetChatSyncState(key)
        this.revokePluginOverwrite(key)
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
     * \`options.recreate\` is set only by the retry of a 422 invariant recovery
     * for the chat it named (a server without the chat gets it created).
     * \`options.slot\` is the chat's slot object the caller found in the
     * current database and the lookup that finds it again (by chaId and
     * chatId, never by index); a save that is not detached and was handed
     * another object than that slot holds is replaced from capture.
     */
    beginChatSave(
        chaId: string,
        chatId: string,
        chat: any,
        options: {
            intent?: ChatSaveIntent,
            baseOf?: any,
            detached?: boolean,
            base?: ChatSaveBase | null,
            recreate?: boolean,
            slot?: { chat: object, locate: () => unknown },
        } = {},
    ): ChatSaveContext {
        const content = encodeRisuSaveLegacy(chat)
        const detached = options.detached === true
        const slot = options.slot && options.slot.chat && typeof options.slot.chat === 'object'
            ? { chat: options.slot.chat, locate: options.slot.locate, replacedAtCapture: !detached && options.slot.chat !== chat }
            : null
        const source = options.baseOf ?? chat
        const viewBase = detached || !source || typeof source !== 'object' ? undefined : this.chatViewBases.get(source)
        const entry = detached || viewBase ? undefined : this.chatSyncStates.get(this.chatSyncKey(chaId, chatId))
        const base = detached ? (options.base ?? undefined) : (viewBase ?? entry)
        const captured = base ? { ...base } : null
        return {
            recreate: options.recreate === true,
            chaId,
            chatId,
            intent: options.intent,
            content,
            base: captured,
            start: captured,
            view: viewBase ? source : null,
            entry,
            generation: this.databaseGeneration,
            pluginWrite: this.pluginWriteGeneration(this.chatSyncKey(chaId, chatId)),
            slot,
            detached,
        }
    }

    private pluginWriteGeneration(key: string): number {
        return this.pluginWrites.get(key)?.generation ?? 0
    }

    private revokePluginOverwrite(key: string): void {
        const state = this.pluginWrites.get(key)
        if (state) state.right = null
    }

    /**
     * Whether a save that started without a base overwrites the server copy
     * (the open-chat plugin write's own content, d13) instead of merging
     * with it: only while the chat's latest open-chat plugin write carried no
     * read token, this save was captured after that write, the slot still
     * holds the object the plugin wrote and this save is that object's, and
     * both the content this save sends and that object's content now have
     * the written length and hash. Called right before the save is sent; a
     * slot holding another object, or different content, ends the right.
     */
    private pluginOverwriteAllowed(context: ChatSaveContext, chat: any): boolean {
        const key = this.chatSyncKey(context.chaId, context.chatId)
        const state = this.pluginWrites.get(key)
        const right = state?.right
        if (!state || !right || !context.slot || context.detached || context.view) return false
        if (context.slot.locate() !== right.chat) {
            state.right = null
            return false
        }
        if (context.pluginWrite !== state.generation || context.slot.replacedAtCapture
            || context.slot.chat !== right.chat || chat !== right.chat) return false
        const written = (bytes: Uint8Array) => bytes.byteLength === right.length && NodeStorage.contentHash64(bytes) === right.hash
        let current: Uint8Array
        try {
            current = encodeRisuSaveLegacy(right.chat)
        } catch {
            state.right = null
            return false
        }
        if (!written(context.content) || !written(current)) {
            state.right = null
            return false
        }
        return true
    }

    /**
     * Whether the chat's slot holds another object than the one this save
     * recorded at capture: looked up again by chaId and chatId, a missing
     * chat or another object is a replacement (the native trigger write-back,
     * a plugin character or database write, the 409 database replacement,
     * a removed character). A save that recorded no slot, and a save of a
     * handed-out view, are never replaced.
     */
    chatSaveSlotReplaced(context: ChatSaveContext): boolean {
        const slot = context.slot
        if (!slot || (context.view && !context.detached)) return false
        if (slot.replacedAtCapture) return true
        return slot.locate() !== slot.chat
    }

    /**
     * A save captured its content and base at the call, before the database
     * state was loaded, so it recorded no slot. Once loaded, before the save
     * is sent: the object the chat's slot holds now (\`held\`, found by chaId
     * and chatId) with the lookup \`locate\` that finds it again. When the slot
     * holds another object than \`chat\` (the one the caller handed in), or the
     * chat is not there, the save stays replaced from capture: the slot may
     * have been replaced while the state loaded, so the save's result never
     * goes into the slot. A save that recorded a slot, and a detached one,
     * are left as they are; a save of a handed-out view is never replaced
     * (chatSaveSlotReplaced).
     */
    attachChatSaveSlot(context: ChatSaveContext, chat: object, held: unknown, locate: () => unknown): void {
        if (context.slot || context.detached) return
        context.slot = held && typeof held === 'object'
            ? { chat: held, locate, replacedAtCapture: held !== chat }
            : { chat, locate, replacedAtCapture: true }
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
     * a rebase, \`token\` advances to its result (settleChatSave). Each such
     * write starts a new plugin write generation for the chat; one without a
     * base leaves the overwrite right of pluginOverwriteAllowed, bound to
     * \`chat\` and the length and hash of its encoded content.
     */
    installPluginChatBase(chaId: string, chatId: string, base: ChatSaveBase | null, token: unknown, chat: any): void {
        const entry = this.installChatSaveBase(chaId, chatId, base)
        // A new write generation; a write without a read (no base) leaves an
        // overwrite right bound to the object and the content it wrote.
        const key = this.chatSyncKey(chaId, chatId)
        let right: { chat: object, length: number, hash: string } | null = null
        if (!entry && chat && typeof chat === 'object') {
            try {
                const written = encodeRisuSaveLegacy(chat)
                right = { chat, length: written.byteLength, hash: NodeStorage.contentHash64(written) }
            } catch {
                right = null
            }
        }
        this.pluginWrites.set(key, { generation: (this.pluginWriteCount += 1), right })
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
     * \`expected\` (nothing was installed or adopted meanwhile) and neither
     * the database was replaced nor an open-chat plugin write went into the
     * chat since capture. Returns whether it was adopted.
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
        if (context.pluginWrite !== this.pluginWriteGeneration(key)) return false
        if (this.chatSyncStates.get(key) !== expected) return false
        if (result.base?.revision) this.storeChatSyncState(key, result.base)
        else this.forgetChatSyncState(key)
        return true
    }

    /**
     * Whether a rebase may be published into the chat being saved: a view or
     * a detached copy belongs to the caller; a chat saved on its slot base
     * only while that base was not replaced since capture (the slot was not
     * reloaded with other content), neither was the database, no open-chat
     * plugin write went into the chat since capture, and the slot still
     * holds the chat object this save recorded (chatSaveSlotReplaced).
     */
    private mayPublishChatSave(context: ChatSaveContext, chat: any): boolean {
        if (!chat || typeof chat !== 'object' || chat.id !== context.chatId) return false
        if (context.view || context.detached) return true
        if (context.generation !== this.databaseGeneration) return false
        const key = this.chatSyncKey(context.chaId, context.chatId)
        if (context.pluginWrite !== this.pluginWriteGeneration(key)) return false
        if (this.chatSaveSlotReplaced(context)) return false
        return this.chatSyncStates.get(key) === context.entry
    }

    /**
     * An accepted save captured before the database was replaced, or a
     * rebase result accepted while the chat's slot holds another object
     * (\`replacedMerge\`): when the chat's slot holds no base now, the base
     * this save started from (never its result) becomes the slot base. The
     * new slot's content comes from the same starting point as what this save
     * sent, without what the rebase merged in; an older base only makes its
     * next save rebase changes made on the server in again. A slot base
     * already held stays, and none is installed over an open-chat plugin
     * write made since capture. A save of a handed-out view keeps its base
     * on the view.
     */
    private installStartAfterDatabaseReplaced(context: ChatSaveContext, replacedMerge: boolean): void {
        if (context.generation === this.databaseGeneration && !replacedMerge) return
        if (context.view && !context.detached) return
        const start = context.start
        if (!start?.revision) return
        const key = this.chatSyncKey(context.chaId, context.chatId)
        if (context.pluginWrite !== this.pluginWriteGeneration(key)) return
        if (this.chatSyncStates.has(key)) return
        this.storeChatSyncState(key, start)
    }

    /**
     * Records an accepted save; its base is adopted unless the caller does
     * that, a rebase could not be published, or the result is a rebase while
     * the chat's slot holds another object than this save recorded: that
     * object lacks what was merged, so the slot keeps its base and its next
     * save rebases the merge in. A result without a rebase is what the server
     * holds now, so it is adopted even then. An accepted save of the object
     * an open-chat plugin write without a read token wrote, captured after
     * that write, ends its overwrite right (an earlier write's save never
     * ends a later write's right).
     */
    private settleChatSave(context: ChatSaveContext, base: ChatSaveBase | null, merged: any | null, published: boolean): void {
        context.result = { base, merged }
        const replacedMerge = merged !== null && this.chatSaveSlotReplaced(context)
        this.installStartAfterDatabaseReplaced(context, replacedMerge)
        if (!context.detached && !context.view) {
            const state = this.pluginWrites.get(this.chatSyncKey(context.chaId, context.chatId))
            if (state?.right && state.generation === context.pluginWrite && context.slot?.chat === state.right.chat) state.right = null
        }
        if (!context.detached && !context.view) this.settlePluginWrittenEntry(context)
        if (context.detached || !published || replacedMerge) return
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
        // The message ids as read are checked before normalization gives
        // missing ones new ids.
        const decoded = await decodeRisuSave(bytes)
        const messageIdsValid = NodeStorage.messageIdsValid(decoded?.message)
        const chat = normalizeChat(decoded)
        return { revision: this.chatRevisionFromResponse(response), chat, encodedBytes: bytes.byteLength, bytes, messageIdsValid }
    }

    /** Whether every message carries a chatId that is a non-empty string, none repeated (an absent list has none). */
    private static messageIdsValid(messages: unknown): boolean {
        if (messages === undefined || messages === null) return true
        if (!Array.isArray(messages)) return false
        const seen = new Set<string>()
        for (const message of messages) {
            const id = message && typeof message === 'object' ? (message as any).chatId : undefined
            if (typeof id !== 'string' || !id || seen.has(id)) return false
            seen.add(id)
        }
        return true
    }

    /** Whether the messages both lists hold (by chatId) are in the same relative order in each. */
    private static sharedMessageOrderMatches(local: any[], remote: any[]): boolean {
        const localIds = new Set(local.map((message) => message.chatId))
        const remoteIds = new Set(remote.map((message) => message.chatId))
        const fromLocal = local.map((message) => message.chatId).filter((id) => remoteIds.has(id))
        const fromRemote = remote.map((message) => message.chatId).filter((id) => localIds.has(id))
        return fromLocal.length === fromRemote.length && fromLocal.every((id, index) => id === fromRemote[index])
    }

    /**
     * The server copy of a chat and its revision, without adopting it as
     * this client's base. null when the server has no body for it.
     */
    async readServerChatSnapshot(chaId: string, chatIndex: number, chatId: string): Promise<ServerChatSnapshot | null> {
        const copy = await this.readServerChatCopy(chaId, chatIndex, chatId)
        return copy ? { revision: copy.revision, chat: copy.chat, encodedBytes: copy.encodedBytes, messageIdsValid: copy.messageIdsValid } : null
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

    /** The server copy a save without a base starts from; a refused read is a ChatConflictError. */
    private async readSaveBaseline(chaId: string, chatIndex: number, chatId: string): Promise<(ServerChatSnapshot & { bytes: Uint8Array }) | null> {
        try {
            return await this.readServerChatCopy(chaId, chatIndex, chatId)
        } catch (error) {
            if (!(error instanceof ChatConflictError)) throw error
            throw new ChatConflictError(\`Could not establish a safe chat save baseline: \${error.message}\`, error.currentRevision)
        }
    }

    /**
     * One full chat POST of a save context's content under the revision
     * protocol. Names the context's base revision; without one it reads the
     * server copy and takes it as the base (a write without a read, d13), or
     * creates only when the server has none (or the caller says the chat is
     * new); an update the server has no copy of is a conflict. A refusal or a lost answer is settled by reading the server copy:
     * equal means saved, different is a ChatConflictError that carries the
     * server copy. Returns the base of the saved content (null: unknown).
     * \`serverAbsent\`: the caller just read that the server has no copy.
     */
    private async postFullChat(
        chaId: string,
        chatIndex: number,
        chatId: string,
        snapshot: any,
        encoded: Uint8Array,
        context: ChatSaveContext,
        serverAbsent = false,
    ): Promise<ChatSaveBase | null> {
        let createOnly = false
        if (!context.base?.revision) {
            if (context.intent === 'create') {
                createOnly = true
            } else {
                const server = serverAbsent ? null : await this.readSaveBaseline(chaId, chatIndex, chatId)
                if (server?.revision) {
                    context.base = this.chatSaveBase(server.revision, server.chat, null, server.encodedBytes)
                    // Started without a base: the server copy is where it starts.
                    if (!context.start?.revision) context.start = context.base
                } else if (!server) {
                    // An update of a chat the server no longer has: it was
                    // deleted elsewhere, so it is not created again (d8),
                    // unless this is the save of the chat a 422 invariant
                    // recovery named, made by that recovery's retry.
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
        // read, installed or saved since. A read never installs or changes
        // the base of the chat's slot, held or not: the slot does not hold
        // what was read, so only a path that puts its result into the slot
        // (hydration) installs a slot base. Plugin writes never take the slot
        // base: they use the base of their read token (issuePluginReadToken).
        const copy = await this.readServerChatCopy(chaId, chatIndex, chatId)
        if (!copy) return null
        if (copy.revision) {
            const base = this.chatSaveBase(copy.revision, null, copy.bytes, copy.encodedBytes)
            if (copy.chat && typeof copy.chat === 'object') this.chatViewBases.set(copy.chat, base)
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
     * Publishes \`rebased\` (this save's content \`proposed\` merged with a
     * server copy) into \`chat\` together with the edits made to it since the
     * content was captured, and returns what to send now. undefined: \`chat\`
     * may no longer show this save's content (mayPublishChatSave), nothing
     * was published. null: it cannot be published (the caller's conflict);
     * with \`checkAgainst\` (the messages of the server copy merged with),
     * also when a message of \`chat\` has no valid chatId or repeats one, as
     * read before normalization, or when the messages \`chat\` and that copy
     * both hold are in another relative order.
     */
    private publishChatRebase(save: ChatSaveContext, chat: any, proposed: any, rebased: any, checkAgainst: any[] | null): any | null | undefined {
        if (!this.mayPublishChatSave(save, chat)) return undefined
        // Keep edits made to the chat while the request ran.
        let live: any
        try {
            const raw = snapshotChatView(chat)
            if (checkAgainst) {
                if (!NodeStorage.messageIdsValid(raw?.message)) return null
                const rawMessages: any[] = Array.isArray(raw?.message) ? raw.message : []
                if (!NodeStorage.sharedMessageOrderMatches(rawMessages, checkAgainst)) return null
            }
            live = normalizeChat(raw)
        } catch {
            return null
        }
        const publication = rebaseChatSave(proposed, live, rebased)
        if (!publication.ok) return null
        // A stored streaming flag describes an earlier run; never let
        // a merged server copy start a spinner here.
        for (const field of ['isStreaming', 'activeStreamingDisplayOptimizationMode']) {
            if (Object.hasOwn(live, field)) publication.chat[field] = live[field]
            else delete publication.chat[field]
        }
        try {
            publishChatView(chat, publication.chat)
        } catch {
            return null
        }
        return publication.chat
    }

    /**
     * Saves a whole chat under the revision protocol, as the save context
     * \`context\` (captured now when none is given) holds it: its content on
     * its base. When the chat changed on the server since that base, the
     * content is rebased on the server copy (chatSaveRebase.ts), published
     * into \`chat\` when that may still show it, and saved again, so a reply
     * another device saved is kept. A conflict that cannot be merged throws
     * ChatConflictError and leaves \`chat\` as it is.
     *
     * A save that starts without a base (not a create, not detached, not a
     * view) reads the server copy first. When there is none, the save goes
     * on as before (create, or the d8 conflict). Otherwise it overwrites that
     * copy only with the content of an open-chat plugin write without a read
     * token (pluginOverwriteAllowed); any other such save merges with it
     * once, without deleting: the messages of both are kept (a server message
     * the content lacks counts as added there, never as deleted here), the
     * fields outside the message list take the content's values, and an
     * edited shared message takes the content's version. The merge is a
     * visible conflict (ChatConflictError, nothing sent) when a message of
     * the content or of the server copy has no valid chatId (a non-empty
     * string) or repeats one, as read before normalization, when the
     * messages both hold are in another relative order (also between \`chat\`
     * as published into and the server copy), while \`chat\` is streaming, or
     * when it cannot be merged. The merge is published like a
     * rebase and sent on the copy's revision, while the base the save started
     * from stays empty; a later 409 rebases as usual, checking the message
     * ids of every new server copy and of the chat it publishes into the
     * same way.
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
        const decoded = await decodeRisuSave(proposedBytes)
        const contentIdsValid = NodeStorage.messageIdsValid(decoded?.message)
        let proposed = normalizeChat(decoded)
        let merged: any | null = null
        let published = true
        let baseless = false
        let serverAbsent = false
        if (!save.base?.revision && save.intent !== 'create' && !save.detached && !save.view) {
            const server = await this.readSaveBaseline(chaId, chatIndex, chatId)
            if (!server) {
                serverAbsent = true
            } else if (server.revision && this.pluginOverwriteAllowed(save, chat)) {
                // The plugin's content overwrites the server copy (d13).
                save.base = this.chatSaveBase(server.revision, server.chat, null, server.encodedBytes)
                if (!save.start?.revision) save.start = save.base
            } else if (server.revision) {
                baseless = true
                const refuse = (reason: string) => new ChatConflictError(\`Chat changed on the server and could not be merged without a base: \${reason}\`, server.revision)
                const serverMessages: any[] = Array.isArray(server.chat?.message) ? server.chat.message : []
                const localMessages: any[] = Array.isArray(proposed?.message) ? proposed.message : []
                if (!contentIdsValid || server.messageIdsValid === false) throw refuse('a message has no valid chat id')
                if (!NodeStorage.sharedMessageOrderMatches(localMessages, serverMessages)) throw refuse('shared messages are in another order')
                if (chat?.isStreaming) throw refuse('the chat is streaming')
                // The comparison base: the server copy holding only the
                // messages the content holds too, so nothing reads as deleted.
                const held = new Set(localMessages.map((message) => message.chatId))
                const comparison = { ...server.chat, message: serverMessages.filter((message) => held.has(message.chatId)) }
                const rebased = rebaseChatSave(comparison, proposed, server.chat)
                if (!rebased.ok) throw refuse('the edits overlap')
                let next = this.publishChatRebase(save, chat, proposed, rebased.chat, serverMessages)
                if (next === null) throw refuse('the chat cannot show the merge')
                if (next === undefined) {
                    published = false
                    next = rebased.chat
                }
                if (jsonValuesEqual(next, proposed)) published = true
                else merged = next
                // Sent on the server copy's revision; the start stays empty.
                save.base = this.chatSaveBase(server.revision, server.chat, null, server.encodedBytes)
                proposed = next
                proposedBytes = encodeRisuSaveLegacy(proposed)
            }
        }
        for (let attempt = 0; ; attempt++) {
            try {
                const saved = await this.postFullChat(chaId, chatIndex, chatId, proposed, proposedBytes, save, serverAbsent)
                this.settleChatSave(save, saved, merged, published)
                return
            } catch (error) {
                const fresh = error instanceof ChatConflictError ? error.serverSnapshot : undefined
                if (error instanceof ChatConflictError) delete error.serverSnapshot
                // The save's own base, never a newer one found by chat.
                const base = save.base
                if (!fresh || !base || attempt >= 2 || fresh.revision === base.revision || chat?.isStreaming) throw error
                if (baseless && fresh.messageIdsValid === false) throw error
                const baseCopy = await this.chatSaveBaseCopy(base)
                if (!baseCopy) throw error
                const rebased = rebaseChatSave(baseCopy, proposed, fresh.chat)
                if (!rebased.ok) throw error
                const freshMessages: any[] = Array.isArray(fresh.chat?.message) ? fresh.chat.message : []
                let next = this.publishChatRebase(save, chat, proposed, rebased.chat, baseless ? freshMessages : null)
                if (next === null) throw error
                if (next === undefined) {
                    // The chat no longer shows this save's content: it keeps
                    // its own base, and the merge is saved without it.
                    published = false
                    next = rebased.chat
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
    // \`options.recreate\`: the retry of a 422 invariant recovery saves the
    // chat it named.
    beginChatSave?(chaId: string, chatId: string, chat: Chat, options: { intent?: ChatSaveIntent, recreate?: boolean }): ChatSaveContext | undefined
    // Run in a save's turn before anything else, for a save that did not get
    // its context from the caller: waits until the save can be captured or
    // sent (null when nothing has to be waited for) and completes a context
    // captured at the call meanwhile. A rejection fails this save only.
    prepareChatSave?(context: ChatSaveContext | undefined): Promise<void> | null
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
    // \`options.recreate\` (the retry of a 422 invariant recovery saving the
    // chat it named) goes into the context captured for this save.
    // Every save takes its place in the queue at the call; a save that did
    // not get its context from the caller first waits in that place for what
    // its capture or sending needs (transport.prepareChatSave), so a save
    // called later never goes first, and a failure there fails that save
    // alone.
    function saveChat(
        chaId: string,
        chatIndex: number,
        chatId: string,
        chat: Chat,
        intent?: ChatSaveIntent,
        options: { live?: boolean, context?: ChatSaveContext, recreate?: boolean } = {},
    ): Promise<void | 'skipped'> {
        const key = chatCopyKey(chaId, chatId)
        const previous = saveQueues.get(key)
        const live = !options.context && options.live === true && typeof transport.locateLiveChat === 'function'
        const recreate = options.recreate === true
        const context = options.context ?? (live ? undefined : transport.beginChatSave?.(chaId, chatId, chat, { intent, recreate }))
        const queued = live ? null : chat
        const prepare = !options.context
        const run = previous
            ? previous.then(() => saveChatNow(chaId, chatIndex, chatId, queued, intent, context, recreate, prepare))
            : saveChatNow(chaId, chatIndex, chatId, queued, intent, context, recreate, prepare)
`,
    },
    {
        name: 'save-now-intent',
        type: 'replace',
        anchor: `    async function saveChatNow(chaId: string, chatIndex: number, chatId: string, chat: Chat): Promise<void> {
`,
        content: `    async function saveChatNow(chaId: string, chatIndex: number, chatId: string, queued: Chat | null, intent?: ChatSaveIntent, context?: ChatSaveContext, recreate = false, prepare = false): Promise<void | 'skipped'> {
        // In this save's turn: wait for what its capture or sending needs
        // (nothing to wait for keeps the turn synchronous).
        if (prepare) {
            const preparing = transport.prepareChatSave?.(context)
            if (preparing) await preparing
        }
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
        const save = context ?? transport.beginChatSave?.(chaId, chatId, chat, { intent, recreate })
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
    // A slot save records the chat's slot object it finds in the current
    // database now, and how to find the slot again by chaId and chatId: its
    // result is neither published nor, after a rebase, adopted as the slot's
    // base once the slot holds another object (NodeStorage.chatSaveSlotReplaced).
    // Not found (the database has no such character or chat): nothing is
    // recorded. Captured before the database state is loaded: the slot is
    // recorded once loaded, in the save's turn (prepareChatSave).
    beginChatSave: (chaId, chatId, chat, options) => {
        const held = findChatSlot(chaId, chatId)?.chat
        const slot = held && typeof held === 'object'
            ? { chat: held, locate: () => findChatSlot(chaId, chatId)?.chat }
            : undefined
        const loaded = liveDatabaseState !== null
        const context = forageStorage.realStorage?.beginChatSave?.(chaId, chatId, chat, { ...options, slot })
        if (context && !loaded && chat && typeof chat === 'object') capturedBeforeLoad.set(context, chat)
        return context
    },
    // A save's turn: the database state is loaded first (a live autosave
    // looks its chat up in it, a captured save records its slot from it).
    prepareChatSave: (context) => {
        if (liveDatabaseState) {
            attachSlotAfterLoad(context)
            return null
        }
        return loadLiveDatabaseState().then(() => attachSlotAfterLoad(context))
    },
    registerFetchedChat: (chaId, chatId, revision, chat) => forageStorage.realStorage?.registerFetchedChat?.(chaId, chatId, revision, chat),
    locateLiveChat: (chaId, chatId) => locateLiveChat(chaId, chatId),
}, indexedDbChatCopies)

// The current database state (DBState), loaded in the turn of the first chat
// save that captures its own context rather than with this module, so
// loading chatStorage still starts no reactive store effects.
let liveDatabaseState: typeof import("../stores.svelte").DBState | null = null
async function loadLiveDatabaseState(): Promise<void> {
    liveDatabaseState ??= (await import("../stores.svelte")).DBState
}

// Save contexts captured at the call before the database state was loaded,
// with the chat object the caller handed in: they record no slot until their
// turn (NodeStorage.attachChatSaveSlot).
const capturedBeforeLoad = new WeakMap<ChatSaveContext, object>()

function attachSlotAfterLoad(context: ChatSaveContext | undefined): void {
    if (!context) return
    const chat = capturedBeforeLoad.get(context)
    if (chat === undefined) return
    capturedBeforeLoad.delete(context)
    const { chaId, chatId } = context
    forageStorage.realStorage?.attachChatSaveSlot?.(
        context,
        chat,
        findChatSlot(chaId, chatId)?.chat,
        () => findChatSlot(chaId, chatId)?.chat,
    )
}

// The chat's slot in the current database, found by chaId and chatId (never
// by index), and its index; null when the character or the chat is not
// there. A placeholder slot is returned as it is.
function findChatSlot(chaId: string, chatId: string): { chatIndex: number, chat: Chat } | null {
    const characters = liveDatabaseState?.db?.characters
    const character = characters ? Object.values(characters).find(entry => entry?.chaId === chaId) : undefined
    const chats = character?.chats
    if (!Array.isArray(chats)) return null
    const chatIndex = chats.findIndex(entry => entry?.id === chatId)
    return chatIndex === -1 ? null : { chatIndex, chat: chats[chatIndex] }
}

// The chat in its slot in the current database and its index, for an open
// chat's autosave when its turn in the save queue comes; null when the
// character or the chat is gone or the slot holds a placeholder.
function locateLiveChat(chaId: string, chatId: string): { chatIndex: number, chat: Chat } | null {
    const found = findChatSlot(chaId, chatId)
    if (!found?.chat || found.chat._placeholder) return null
    return found
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
// reads its result afterwards. \`options.recreate\` is passed only by the
// retry of a 422 invariant recovery for the chat it named. Every save takes
// its place in the chat's save queue at the call. A save that captures its
// own context records the chat's slot object; when the database state is not
// loaded yet, it is loaded in the save's turn and the slot recorded then
// (a slot holding another object than \`chat\` by then keeps the save's result
// out of it).
export async function saveChatToServer(
    chaId: string,
    chatIndex: number,
    chatId: string,
    chat: Chat,
    intent?: ChatSaveIntent,
    options?: { live?: boolean, context?: ChatSaveContext, recreate?: boolean },
): Promise<void | 'skipped'> {
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
    // The chat a 422 invariant recovery named, waiting for that recovery's
    // retry: the next persistTrackedChanges takes it when it starts and may
    // create that chat on the server; it ends with that attempt, saved,
    // skipped or failed. Separate from the recovery slot above, which only a
    // successful save clears.
    let recreateOnRetryKey: string | null = null
`,
    },
    {
        name: 'persist-recreate-permission',
        type: 'insert',
        where: 'after',
        anchor: `    ): Promise<'saved' | 'retry' | 'noop'> {
`,
        content: `        // This attempt alone may create the chat a 422 invariant recovery
        // named (the recovery's retry); later attempts may not.
        const recreateKey = recreateOnRetryKey
        recreateOnRetryKey = null
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
        // this client holds: its slot base is dropped, and the retry this
        // returns saves it with permission to create it when the server has
        // none, even when classified as an update. Any other save of a chat
        // missing on the server that is classified as an update conflicts.
        forageStorage.realStorage?.forgetChatSaveBase?.(recoverable.chaId, recoverable.chatId)
        recreateOnRetryKey = key
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
                // then is skipped and not counted as posted. The chat a 422
                // invariant recovery named is saved with permission to create
                // it when this attempt is that recovery's retry.
                const recreate = recreateKey === \`\${chaId}|\${chatId}\`
                const outcome = await saveChatToServer(chaId, chatIndex, chatId, chat, classifyChatSaveIntent(confirmedBaseline, chaId, chatId), { live: true, recreate })
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
                    // rebased there, so it must be the slot's own base. With
                    // no slot base held there is nothing to compare: the
                    // token's base is installed as it is (a save on a
                    // revision the server has passed then conflicts).
                    const opening = Number(charId) === get(selectedCharID) && owner.chatPage === chatIndex
                    const slotRevision = opening ? storage.chatSlotBaseRevision(owner.chaId, writtenId) : null
                    if(opening && tokenBase && tokenBase.snapshot === null && tokenBase.bytes === null
                        && slotRevision !== null && tokenBase.revision !== slotRevision){
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
                        // plugin's content and its token's base, and the slot
                        // object holding that content now, found again by
                        // chaId and chatId when the save is settled.
                        const slotChaId = char.chaId
                        const slotChatId = saved.id
                        const context = storage.beginChatSave(char.chaId, saved.id, sent, {
                            detached: true,
                            base: tokenBase,
                            slot: {
                                chat: saved,
                                locate: () => {
                                    const characters = DBState.db?.characters
                                    const chats = characters ? Object.values(characters).find((entry) => entry?.chaId === slotChaId)?.chats : undefined
                                    return Array.isArray(chats) ? chats.find((entry) => entry?.id === slotChatId) : undefined
                                },
                            },
                        })
                        // The slot holds that content now, so its base is the
                        // context's base.
                        const installed = storage.installChatSaveBase(char.chaId, saved.id, context.base)
                        // A chat the rebase cannot represent is never merged on
                        // a conflict (the save throws), so it needs no copy.
                        let sentView: any = null
                        try { sentView = snapshotChatView(sent) } catch { sentView = null }
                        await saveChatToServer(char.chaId, chatIndex, saved.id, sent, undefined, { context })
                        storage.settlePluginReadToken(readToken, context)
                        // The chat's slot, found again in the current database,
                        // may hold another object than the one put there above
                        // (a character or database write replaced it, or the
                        // character is gone). A result without a rebase is what
                        // the server holds, so the slot takes its base either
                        // way. A merge with another device's change is published
                        // with the edits made to the slot meanwhile, only while
                        // the slot still holds that object; otherwise, or when
                        // publishing is not possible, the slot keeps the base of
                        // its content (or gets this save's starting base when it
                        // holds none) and its next save rebases.
                        if(context.result){
                            const replaced = storage.chatSaveSlotReplaced(context)
                            let published = true
                            if(context.result.merged){
                                published = false
                                if(!replaced){
                                    try {
                                        const merged = sentView ? rebaseChatSave(sentView, snapshotChatView(saved), context.result.merged) : { ok: false as const }
                                        if(merged.ok){
                                            publishChatView(saved, merged.chat)
                                            published = true
                                        }
                                    } catch {
                                        published = false
                                    }
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
