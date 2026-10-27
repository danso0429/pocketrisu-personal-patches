'use strict'

// E2-3e: client startup safety over the native PocketRisu 1.16.1 start.
// - Startup database copy (startupDatabaseCache.ts): the start reads the
//   database with the copy's ETag as validator. A 304 starts from the decoded
//   baseline with its patch journal replayed (only when the journal ends at
//   that ETag) or from the raw bytes stored under that ETag; anything else
//   clears the copy and reads again without a validator. A 200 starts from the
//   new bytes. The copy is stored at idle from the received bytes decoded
//   again, with the ETag of the response that delivered them, and that
//   reservation is cancelled by any database write or invalidation before it
//   runs. A database patch is appended to the journal only when the journal
//   ends at its previous ETag and the server returned the next one; every
//   other database write drops the copy. Whole-database replacements and the
//   snapshot restore drop it before they return.
// - Plugins load after chat stubs became placeholders, so a plugin running at
//   start sees the protected placeholder of the native plugin API.
// - Writer session: the session id and the user-gesture check come from
//   writerSession.ts, so every write path of the tab sends one id, and a 423
//   sends the native risu-session-deactivated event through it.

const DB_KEY = `'database/database.bin'`

const nodeStorageUnits = [
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `import type { PatchServerTimings } from "./saveMetrics"
`,
        content: `import { StartupDatabaseCache } from "./startupDatabaseCache"
import { isUserActive, notifySessionDeactivated, writerSessionId } from "./writerSession"

// Bump this when decoding the same bytes can produce a different runtime shape.
const STARTUP_DATABASE_SCHEMA_EPOCH = 1
// The build version (vite define), as database.svelte nodeOnlyVer reads it.
const STARTUP_DATABASE_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

/** The database a start begins from: server bytes, or the stored copy confirmed by a 304. */
export interface StartupDatabaseLoadResult {
    /** Bytes to decode (the server body, or the stored raw copy); null with a decoded copy or an empty database. */
    bytes: Uint8Array | null
    /** The stored decoded copy with its journal replayed; null otherwise. */
    decoded: any | null
    /** The ETag of the database these come from. */
    etag: string | null
    /** True when the start comes from the stored copy. */
    fromCache: boolean
}
`,
    },
    {
        // The gesture window and its listeners move to writerSession.ts.
        name: 'user-gesture',
        type: 'replace',
        anchor: `const USER_GESTURE_WINDOW_MS = 15_000
let lastUserGestureAt = 0
if (typeof window !== 'undefined') {
    const markGesture = () => { lastUserGestureAt = Date.now() }
    window.addEventListener('pointerdown', markGesture, { capture: true, passive: true })
    window.addEventListener('keydown', markGesture, { capture: true, passive: true })
}
function isUserActive(): boolean {
    return Date.now() - lastUserGestureAt < USER_GESTURE_WINDOW_MS
}
`,
        content: `// isUserActive and its gesture listeners live in writerSession.ts (imported
// above), shared with the requests that do not go through NodeStorage.
`,
    },
    {
        name: 'writer-session-id',
        type: 'replace',
        anchor: `    private static sessionId: string = (() => {
        const KEY = 'risu-writer-session-id'
        const minted = crypto?.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2))
        try {
            const stored = sessionStorage.getItem(KEY)
            if (stored) return stored
            sessionStorage.setItem(KEY, minted)
        } catch { /* storage unavailable (rare privacy modes) — per-load id */ }
        return minted
    })()
`,
        content: `    // The id is minted once in writerSession.ts (same sessionStorage key), so
    // NodeStorage and the helper never send two ids.
    private static sessionId: string = writerSessionId
`,
    },
    {
        // A third constructor argument injects the startup copy (tests); the
        // app uses the browser stores.
        name: 'constructor',
        type: 'replace',
        after: ['lazy-chat-sync:node-storage-chat-sync-state:1.16'],
        anchor: `        private readonly retryOptions: Partial<AuthFetchRetryOptions> = {}
    ) {}
`,
        content: `        private readonly retryOptions: Partial<AuthFetchRetryOptions> = {},
        startupDatabaseCache?: StartupDatabaseCache,
    ) {
        this.startupDatabaseCache = startupDatabaseCache ?? new StartupDatabaseCache({
            appVersion: STARTUP_DATABASE_APP_VERSION,
            schemaEpoch: STARTUP_DATABASE_SCHEMA_EPOCH,
        })
    }
`,
    },
    {
        name: 'session-deactivated',
        type: 'replace',
        anchor: `        if (response.status === 423) {
            // ACCOUNT_IMPORT_ACTIVE: a RisuAI account import blocks every write.
            let code: string | null = null
            try {
                code = (await response.clone().json())?.code ?? null
            } catch { /* no JSON body */ }
            window.dispatchEvent(new CustomEvent('risu-session-deactivated', { detail: { code } }))
        }
`,
        content: `        // 423 (writer lock, or ACCOUNT_IMPORT_ACTIVE while a RisuAI account
        // import blocks every write): the native event with detail { code }.
        await notifySessionDeactivated(response)
`,
    },
    {
        name: 'startup-load',
        type: 'insert',
        where: 'before',
        anchor: `    async setItem(key:string, value:Uint8Array, etag?:string) {
`,
        content: `    // ── Startup database copy ───────────────────────────────────────────────
    startupDatabaseCache: StartupDatabaseCache
    /** The pending idle store of the start copy; cleared by a database write or an invalidation. */
    private startupCacheStoreToken: object | null = null

    /**
     * Reads the database for the start. With a stored copy its ETag is sent
     * as validator; a 304 resolves the copy (decoded baseline with its journal
     * when the journal ends at that ETag, else raw bytes stored under it). A
     * copy that cannot be resolved is cleared and the database is read again
     * without a validator. \`fresh\` clears the copy and reads without one.
     */
    async loadDatabaseForStartup(options: { fresh?: boolean } = {}): Promise<StartupDatabaseLoadResult> {
        if (options.fresh) await this.invalidateStartupDatabaseCache()
        const probe = options.fresh ? null : await this.startupDatabaseCache.probe()
        const headers: Record<string, string> = {
            'file-path': Buffer.from(${DB_KEY}, 'utf-8').toString('hex'),
        }
        if (probe) headers['if-none-match'] = probe.etag
        const response = await this.authFetch('/api/read', { method: 'GET', headers })

        if (probe && response.status === 304) {
            const hit = await this.startupDatabaseCache.resolveNotModified(probe.etag, {
                validateDecoded: (database) => !!database
                    && typeof database === 'object'
                    && !Array.isArray(database),
            })
            if (hit) {
                this._lastDbEtag = hit.etag
                return hit.kind === 'decoded'
                    ? { bytes: null, decoded: hit.database, etag: hit.etag, fromCache: true }
                    : { bytes: hit.bytes, decoded: null, etag: hit.etag, fromCache: true }
            }
            // The server confirmed the ETag but the copy has nothing usable
            // for it (journal ends elsewhere, replay failed, bytes gone).
            return this.loadDatabaseForStartup({ fresh: true })
        }

        if (response.status < 200 || response.status >= 300) {
            throw await this.storageRequestError('getItem', response)
        }
        const etag = response.headers.get('x-db-etag')
        if (etag) this._lastDbEtag = etag
        const bytes = new Uint8Array(await response.arrayBuffer())
        return {
            bytes: bytes.byteLength > 0 ? bytes : null,
            decoded: null,
            etag: etag || null,
            fromCache: false,
        }
    }

    /**
     * Stores the start copy at idle: the bytes the start received, decoded
     * again (the live database is changed in place after the start), with the
     * ETag of the response that delivered them. A database write or an
     * invalidation before it runs cancels it.
     */
    scheduleStartupDatabaseCache(bytes: Uint8Array, etag: string | null): void {
        if (!etag || !bytes?.byteLength) return
        const token = {}
        this.startupCacheStoreToken = token
        const store = async () => {
            if (this.startupCacheStoreToken !== token) return
            const decoded = await decodeRisuSave(bytes)
            if (this.startupCacheStoreToken !== token) return
            this.startupCacheStoreToken = null
            await this.startupDatabaseCache.storeAuthoritative({ etag, bytes, decoded })
        }
        const run = () => { void store().catch(() => undefined) }
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 2_000 })
        }
        else {
            // No idle callback (Safari): keep the second decode off the first
            // seconds after the start, like the idle timeout above.
            setTimeout(run, 2_000)
        }
    }

    /** Drops the stored start copy; a failure is swallowed (the next start then gets a 200). */
    async invalidateStartupDatabaseCache(): Promise<void> {
        this.startupCacheStoreToken = null
        await this.startupDatabaseCache.invalidate().catch(() => undefined)
    }

    /**
     * After a successful database patch: appended to the journal when the
     * journal ends at the previous ETag and the server returned the next one
     * (the cache checks the chain); a patch without both ETags drops the copy.
     */
    private recordStartupDatabasePatch(previousEtag: string | null, nextEtag: string | undefined, patch: any[]): void {
        this.startupCacheStoreToken = null
        if (previousEtag && nextEtag) {
            void this.startupDatabaseCache.recordPatch({ previousEtag, nextEtag, patch }).catch(() => undefined)
        }
        else {
            void this.invalidateStartupDatabaseCache()
        }
    }

`,
    },
    {
        // A full database write: the server may canonicalize the bytes, and
        // the journal cannot describe it, so the copy is dropped.
        name: 'set-item-invalidate',
        type: 'insert',
        where: 'after',
        anchor: `        if (key === 'database/database.bin') {
            this._lastDbWriteDiagnostics = parseHashDiagnostics(data)
        }
`,
        content: `        if (key === ${DB_KEY}) void this.invalidateStartupDatabaseCache()
`,
    },
    {
        name: 'remove-item-invalidate',
        type: 'insert',
        where: 'after',
        anchor: `            throw await this.storageRequestError('removeItem', da)
        }
        const data = await da.json()
        if(data.error){
            throw data.error
        }
`,
        content: `        if (key === ${DB_KEY}) void this.invalidateStartupDatabaseCache()
`,
    },
    {
        name: 'patch-item-previous-etag',
        type: 'insert',
        where: 'after',
        anchor: `    async patchItem(key: string, patchData: { patch: any[], expectedHash: string }): Promise<PatchItemResult> {
`,
        content: `        // The ETag this client last saw for the database: the journal entry's previous ETag.
        const previousDbEtag = this._lastDbEtag
`,
    },
    {
        name: 'patch-item-journal',
        type: 'insert',
        where: 'before',
        anchor: `        const persistWarning = data.persistWarning as PersistWarning | undefined
`,
        content: `        if (key === ${DB_KEY}) this.recordStartupDatabasePatch(previousDbEtag, nextEtag, patchData.patch)
`,
    },
    {
        // The manifest edit changes the server database and its ETag without
        // moving _lastDbEtag, so a later patch would chain onto the wrong ETag.
        name: 'asset-manifest-invalidate',
        type: 'insert',
        where: 'after',
        anchor: `        if (!da.ok) throw new Error(\`asset manifest edit error: \${da.status}\`)
`,
        content: `        void this.invalidateStartupDatabaseCache()
`,
    },
    ...[
        ['importBackup', `    async importBackup(
        file: Blob,
        onProgress?: (loaded: number, total: number) => void
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number, pluginStorageColdFailed?: number}> {
`, 'file: Blob, onProgress?: (loaded: number, total: number) => void', 'file, onProgress', 'Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number, pluginStorageColdFailed?: number}>'],
        ['restoreServerBackup', `    async restoreServerBackup(
        filename: string,
        onProgress?: (bytes: number, totalBytes: number) => void
    ): Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number, pluginStorageColdFailed?: number}> {
`, 'filename: string, onProgress?: (bytes: number, totalBytes: number) => void', 'filename, onProgress', 'Promise<{ok: boolean, assetsRestored: number, coldStorageFailed?: number, pluginStorageColdFailed?: number}>'],
        ['executeSaveFolderImport', `    async executeSaveFolderImport(folderPath?: string): Promise<{ok: boolean, imported: number}> {
`, 'folderPath?: string', 'folderPath', 'Promise<{ok: boolean, imported: number}>'],
        ['uploadSaveFolderZip', `    async uploadSaveFolderZip(
        file: Blob,
        onProgress?: (loaded: number, total: number) => void
    ): Promise<{ok: boolean, imported: number}> {
`, 'file: Blob, onProgress?: (loaded: number, total: number) => void', 'file, onProgress', 'Promise<{ok: boolean, imported: number}>'],
        ['applyRisuAccountImport', `    async applyRisuAccountImport(): Promise<void> {
`, '', '', 'Promise<void>'],
    ].map(([method, anchor, parameters, args, returnType]) => ({
        // Whole-database replacement: the stored start copy is dropped before
        // the call returns (the UI reloads right after), whatever the outcome.
        name: `replacement-${method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        type: 'replace',
        anchor,
        content: `    async ${method}(${parameters}): ${returnType} {
        try {
            return await this.${method}ReplacingDatabase(${args})
        } finally {
            await this.invalidateStartupDatabaseCache()
        }
    }

${anchor.replace(`    async ${method}(`, `    private async ${method}ReplacingDatabase(`)}`,
    })),
]

const autoStorageUnits = [
    {
        name: 'startup',
        type: 'insert',
        where: 'after',
        anchor: `    async getItem(key:string):Promise<Buffer> {
        return await this.realStorage.getItem(key)
    }
`,
        content: `    async loadDatabaseForStartup(options?: { fresh?: boolean }): Promise<StartupDatabaseLoadResult> {
        return await this.realStorage.loadDatabaseForStartup(options)
    }
    scheduleStartupDatabaseCache(bytes: Uint8Array, etag: string | null) {
        this.realStorage.scheduleStartupDatabaseCache(bytes, etag)
    }
    async invalidateStartupDatabaseCache() {
        await this.Init()
        await this.realStorage.invalidateStartupDatabaseCache()
    }
`,
    },
    {
        name: 'imports',
        type: 'insert',
        where: 'after',
        anchor: `    type AssetManifestOperation,
} from "./nodeStorage"
`,
        content: `import type { StartupDatabaseLoadResult } from "./nodeStorage"
`,
    },
]

const bootstrapUnits = [
    {
        name: 'startup-read',
        type: 'replace',
        anchor: `                let gotStorage: Uint8Array = await forageStorage.getItem('database/database.bin') as unknown as Uint8Array
                LoadingStatusState.text = "Decoding Local Save File..."
                if (checkNullish(gotStorage)) {
`,
        content: `                // The stored start copy is used only after the server confirmed
                // its ETag (304); a decoded copy comes without bytes.
                const startupLoad = await forageStorage.loadDatabaseForStartup()
                let gotStorage: Uint8Array = startupLoad.bytes
                const decodedFromCache = startupLoad.decoded
                LoadingStatusState.text = "Decoding Local Save File..."
                if (checkNullish(gotStorage) && checkNullish(decodedFromCache)) {
`,
    },
    {
        name: 'startup-decode',
        type: 'replace',
        anchor: `                    const decoded = await decodeRisuSave(gotStorage)
`,
        content: `                    const decoded = decodedFromCache ?? await decodeRisuSave(gotStorage)
`,
    },
    {
        name: 'startup-store',
        type: 'replace',
        anchor: `                    if (!createdFreshDatabase) recordDbTransferSize(gotStorage.byteLength, 'boot')
`,
        content: `                    if (!createdFreshDatabase && gotStorage) {
                        recordDbTransferSize(gotStorage.byteLength, 'boot')
                        // Stored at idle from these bytes with the ETag they came with.
                        forageStorage.scheduleStartupDatabaseCache(gotStorage, startupLoad.etag)
                    }
`,
    },
    {
        name: 'startup-retry',
        type: 'replace',
        anchor: `                    console.error(error)
                    const backups = await getDbBackups()
                    let backupLoaded = false
`,
        content: `                    console.error(error)
                    // A stored copy that cannot be decoded or applied is dropped and
                    // the server body is read once more without a validator before
                    // the backup order. A start that ends on a backup drops the copy
                    // and stores none.
                    let recovered = false
                    if (startupLoad.fromCache) {
                        try {
                            const freshLoad = await forageStorage.loadDatabaseForStartup({ fresh: true })
                            const freshDecoded = await decodeRisuSave(freshLoad.bytes)
                            setPatchSyncBaseline(freshDecoded)
                            setDatabase(freshDecoded)
                            recordDbTransferSize(freshLoad.bytes.byteLength, 'boot')
                            forageStorage.scheduleStartupDatabaseCache(freshLoad.bytes, freshLoad.etag)
                            recovered = true
                        } catch (refreshError) {
                            console.error(refreshError)
                        }
                    }
                    if (!recovered) await forageStorage.invalidateStartupDatabaseCache()
                    const backups = recovered ? [] : await getDbBackups()
                    let backupLoaded = recovered
`,
    },
    {
        // Moved below the stub conversion (startup-plugins).
        name: 'plugins-early',
        type: 'replace',
        anchor: `            LoadingStatusState.text = "Loading Plugins..."
            try {
                await loadPlugins()
            } catch (error) { }
`,
        content: `            // Plugins load after chat stubs became placeholders (below).
`,
    },
    {
        // Plugins must never observe the server-only raw stub shape: a
        // placeholder gets the native plugin API protection (server copy on
        // read, refused write-back), a raw stub would read as an empty chat.
        name: 'plugins-after-placeholders',
        type: 'insert',
        where: 'after',
        after: ['lazy-chat-sync:bootstrap-plugins-early:1.16'],
        anchor: `                    char.chats = convertStubsToPlaceholders(char.chats)
                }
            }
`,
        content: `            LoadingStatusState.text = "Loading Plugins..."
            try {
                await loadPlugins()
            } catch (error) { }
`,
    },
]

const systemBackupUnits = [
    {
        // The server restores the snapshot without NodeStorage; the stored
        // start copy is dropped before the page reloads.
        name: 'snapshot-restore-invalidate',
        type: 'insert',
        where: 'after',
        anchor: `                body: JSON.stringify({ key: snap.key }),
            })
            const json = await res.json().catch(() => ({}))
`,
        content: `            await forageStorage.invalidateStartupDatabaseCache().catch(() => undefined)
`,
    },
]

const scoped = (file, prefix, units) => units.map(({ name, ...unit }) => ({
    id: `lazy-chat-sync:${prefix}-${name}:1.16`,
    file,
    ...unit,
}))

module.exports = [
    ...scoped('src/ts/storage/nodeStorage.ts', 'node-storage-startup', nodeStorageUnits),
    ...scoped('src/ts/storage/autoStorage.ts', 'auto-storage-startup', autoStorageUnits),
    ...scoped('src/ts/bootstrap.ts', 'bootstrap', bootstrapUnits),
    ...scoped('src/lib/Setting/Pages/SystemBackup.svelte', 'system-backup', systemBackupUnits),
]
