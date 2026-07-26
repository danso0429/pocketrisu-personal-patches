'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

const nodeUnits = [
    {
        id: 'startup-cache:node-imports',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'replace',
        anchor: 'import { normalizeChat } from "./database.svelte"\n',
        content: `import { appVer, nodeOnlyVer, normalizeChat } from "./database.svelte"
import { StartupDatabaseCache } from "./startupDatabaseCache"
`,
    },
    {
        id: 'startup-cache:node-constants',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'before',
        anchor: '// Custom error class for database conflict detection\n',
        content: `const DATABASE_KEY = 'database/database.bin'
const STARTUP_DATABASE_SCHEMA_EPOCH = 1

function responseDatabaseEtag(response: Response): string | null {
    const legacy = response.headers.get('x-db-etag')
    if (legacy) return legacy
    const standard = response.headers.get('etag')
    if (!standard) return null
    return standard.replace(/^W\\//, '').replace(/^"|"$/g, '') || null
}
`,
    },
    {
        id: 'startup-cache:node-result-interface',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'after',
        anchor: `export interface PatchItemResult {
    success: boolean
    etag?: string
    persistWarning?: PersistWarning
    /** Set when the server's chat-internal-field guard rejected the patch. */
    chatGuardRejected?: boolean
}
`,
        content: `export interface StartupDatabaseLoadResult {
    bytes: Uint8Array | null
    decoded: any | null
    etag: string | null
    fromCache: boolean
}
`,
    },
    {
        id: 'startup-cache:node-cache-field',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'after',
        anchor: '    private refreshPending: Promise<string> | null = null\n',
        content: `    private readonly startupDatabaseCache: StartupDatabaseCache

    constructor(startupDatabaseCache?: StartupDatabaseCache) {
        this.startupDatabaseCache = startupDatabaseCache ?? new StartupDatabaseCache({
            appVersion: \`\${appVer}:\${nodeOnlyVer}\`,
            schemaEpoch: STARTUP_DATABASE_SCHEMA_EPOCH,
        })
    }
`,
    },
    {
        id: 'startup-cache:node-startup-methods',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'before',
        anchor: '    async setItem(key:string, value:Uint8Array, etag?:string) {\n',
        content: `    private databaseReadHeaders(): Record<string, string> {
        return {
            'file-path': Buffer.from(DATABASE_KEY, 'utf-8').toString('hex'),
        }
    }

    private async readDatabaseUnconditionally(): Promise<StartupDatabaseLoadResult> {
        const response = await this.authFetch('/api/read', {
            method: 'GET',
            headers: this.databaseReadHeaders(),
        })
        if (response.status < 200 || response.status >= 300) {
            throw new Error(\`getItem Error (\${response.status})\`)
        }
        const etag = responseDatabaseEtag(response)
        if (etag) this._lastDbEtag = etag
        const bytes = new Uint8Array(await response.arrayBuffer())
        return {
            bytes: bytes.byteLength > 0 ? bytes : null,
            decoded: null,
            etag,
            fromCache: false,
        }
    }

    async loadDatabaseForStartup(): Promise<StartupDatabaseLoadResult> {
        const probe = await this.startupDatabaseCache.probe()
        if (!probe) return this.readDatabaseUnconditionally()

        const headers = this.databaseReadHeaders()
        headers['if-none-match'] = probe.etag
        const response = await this.authFetch('/api/read', { method: 'GET', headers })
        if (response.status === 304) {
            const hit = await this.startupDatabaseCache.resolveNotModified(probe.etag, {
                validateDecoded: (database) => !!database
                    && typeof database === 'object'
                    && !Array.isArray(database),
            })
            if (hit?.kind === 'decoded') {
                this._lastDbEtag = hit.etag
                return { bytes: null, decoded: hit.database, etag: hit.etag, fromCache: true }
            }
            if (hit?.kind === 'raw') {
                this._lastDbEtag = hit.etag
                return { bytes: hit.bytes, decoded: null, etag: hit.etag, fromCache: true }
            }
            await this.startupDatabaseCache.invalidate()
            return this.readDatabaseUnconditionally()
        }
        if (response.status < 200 || response.status >= 300) {
            throw new Error(\`getItem Error (\${response.status})\`)
        }
        const etag = responseDatabaseEtag(response)
        if (etag) this._lastDbEtag = etag
        const bytes = new Uint8Array(await response.arrayBuffer())
        return {
            bytes: bytes.byteLength > 0 ? bytes : null,
            decoded: null,
            etag,
            fromCache: false,
        }
    }

    scheduleStartupDatabaseCache(bytes: Uint8Array, decoded: any, etag = this._lastDbEtag): void {
        if (!etag || !bytes?.byteLength || !decoded) return
        const write = () => {
            void this.startupDatabaseCache.storeAuthoritative({ etag, bytes, decoded })
                .catch(() => undefined)
        }
        if (typeof requestIdleCallback === 'function') requestIdleCallback(write, { timeout: 2_000 })
        else setTimeout(write, 0)
    }

    async invalidateStartupDatabaseCache(): Promise<void> {
        await this.startupDatabaseCache.invalidate()
    }
`,
    },
    {
        id: 'startup-cache:node-full-write-invalidate',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'replace',
        anchor: `        const nextEtag = data.etag as string | undefined
        if (key === 'database/database.bin' && nextEtag) {
            this._lastDbEtag = nextEtag
        }
    }
    async getItem(key:string):Promise<Buffer> {
`,
        content: `        const nextEtag = data.etag as string | undefined
        if (key === DATABASE_KEY) {
            if (nextEtag) this._lastDbEtag = nextEtag
            void this.startupDatabaseCache.invalidate().catch(() => undefined)
        }
    }
    async getItem(key:string):Promise<Buffer> {
`,
    },
    {
        id: 'startup-cache:node-read-etag',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'replace',
        anchor: `        // Capture ETag for database.bin
        const etag = da.headers.get('x-db-etag')
`,
        content: `        // Capture ETag for database.bin
        const etag = responseDatabaseEtag(da)
`,
    },
    {
        id: 'startup-cache:node-fresh-read',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'before',
        anchor: '    async keys(prefix: string = \'\'):Promise<string[]>{\n',
        content: `    async getItemFresh(key: string): Promise<Buffer> {
        if (key === DATABASE_KEY) await this.startupDatabaseCache.invalidate()
        return this.getItem(key)
    }
`,
    },
    {
        id: 'startup-cache:node-patch-previous-etag',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'insert',
        where: 'after',
        anchor: '    async patchItem(key: string, patchData: { patch: any[], expectedHash: string }): Promise<PatchItemResult> {\n',
        content: '        const previousEtag = key === DATABASE_KEY ? this._lastDbEtag : null\n',
    },
    {
        id: 'startup-cache:node-patch-journal',
        file: 'src/ts/storage/nodeStorage.ts',
        type: 'replace',
        anchor: `        const nextEtag = data.etag as string | undefined
        if (key === 'database/database.bin' && nextEtag) {
            this._lastDbEtag = nextEtag
        }
        const persistWarning = data.persistWarning as PersistWarning | undefined
`,
        content: `        const nextEtag = data.etag as string | undefined
        if (key === DATABASE_KEY && nextEtag) {
            this._lastDbEtag = nextEtag
            if (previousEtag) {
                void this.startupDatabaseCache.recordPatch({
                    previousEtag,
                    nextEtag,
                    patch: patchData.patch,
                }).catch(() => undefined)
            }
        }
        const persistWarning = data.persistWarning as PersistWarning | undefined
`,
    },
]

for (let index = 1; index < nodeUnits.length; index += 1) {
    nodeUnits[index].after = [nodeUnits[index - 1].id]
}

const autoStorageUnit = {
    id: 'startup-cache:auto-storage-api',
    file: 'src/ts/storage/autoStorage.ts',
    type: 'insert',
    where: 'after',
    anchor: `    async getItem(key:string):Promise<Buffer> {
        return await this.realStorage.getItem(key)
    }
`,
    content: `    async getItemFresh(key:string):Promise<Buffer> {
        return await this.realStorage.getItemFresh(key)
    }
    async loadDatabaseForStartup() {
        return await this.realStorage.loadDatabaseForStartup()
    }
    scheduleStartupDatabaseCache(bytes: Uint8Array, decoded: any, etag?: string | null) {
        this.realStorage.scheduleStartupDatabaseCache(bytes, decoded, etag)
    }
    async invalidateStartupDatabaseCache() {
        await this.realStorage.invalidateStartupDatabaseCache()
    }
`,
}

const bootstrapUnit = {
    id: 'startup-cache:bootstrap',
    file: 'src/ts/bootstrap.ts',
    type: 'replace',
    anchor: `                LoadingStatusState.text = "Loading Local Save File..."
                let gotStorage: Uint8Array = await forageStorage.getItem('database/database.bin') as unknown as Uint8Array
                LoadingStatusState.text = "Decoding Local Save File..."
                if (checkNullish(gotStorage)) {
                    createdFreshDatabase = true
                    gotStorage = encodeRisuSaveLegacy({})
                    await forageStorage.setItem('database/database.bin', gotStorage)
                }
                try {
                    const decoded = await decodeRisuSave(gotStorage)
                    setPatchSyncBaseline(safeStructuredClone(decoded))
                    console.log(decoded)
                    setDatabase(decoded)
                } catch (error) {
                    console.error(error)
                    const backups = await getDbBackups()
                    let backupLoaded = false
                    for (const backup of backups) {
                        try {
                            LoadingStatusState.text = \`Reading Backup File \${backup}...\`
                            const backupData: Uint8Array = await forageStorage.getItem(\`database/dbbackup-\${backup}.bin\`) as unknown as Uint8Array
                            const backupDecoded = await decodeRisuSave(backupData)
                            setPatchSyncBaseline(safeStructuredClone(backupDecoded))
                            setDatabase(backupDecoded)
                            backupLoaded = true
                            break
                        } catch (error) { }
                    }
                    if (!backupLoaded) {
                        throw "Forage: Your save file is corrupted"
                    }
                }
`,
    content: `                LoadingStatusState.text = "Loading Local Save File..."
                const startupLoad = await forageStorage.loadDatabaseForStartup()
                let gotStorage: Uint8Array | null = startupLoad.bytes
                let decodedFromCache = startupLoad.decoded
                let databaseLoaded = false
                if (checkNullish(gotStorage) && checkNullish(decodedFromCache)) {
                    createdFreshDatabase = true
                    gotStorage = encodeRisuSaveLegacy({})
                    await forageStorage.setItem('database/database.bin', gotStorage)
                }
                try {
                    LoadingStatusState.text = decodedFromCache
                        ? "Loading Cached Save..."
                        : "Decoding Local Save File..."
                    const decoded = decodedFromCache ?? await decodeRisuSave(gotStorage!)
                    const syncBaseline = safeStructuredClone(decoded)
                    setPatchSyncBaseline(syncBaseline)
                    console.log(decoded)
                    setDatabase(decoded)
                    databaseLoaded = true
                    if (gotStorage && !createdFreshDatabase) {
                        forageStorage.scheduleStartupDatabaseCache(
                            gotStorage,
                            syncBaseline,
                            forageStorage.getDbEtag(),
                        )
                    }
                } catch (error) {
                    console.error(error)
                    if (startupLoad.fromCache) {
                        try {
                            LoadingStatusState.text = "Refreshing Local Save Cache..."
                            await forageStorage.invalidateStartupDatabaseCache()
                            gotStorage = await forageStorage.getItemFresh('database/database.bin') as unknown as Uint8Array
                            decodedFromCache = null
                            const decoded = await decodeRisuSave(gotStorage)
                            const syncBaseline = safeStructuredClone(decoded)
                            setPatchSyncBaseline(syncBaseline)
                            setDatabase(decoded)
                            databaseLoaded = true
                            forageStorage.scheduleStartupDatabaseCache(
                                gotStorage,
                                syncBaseline,
                                forageStorage.getDbEtag(),
                            )
                        } catch (refreshError) {
                            console.error(refreshError)
                        }
                    }
                    if (!databaseLoaded) {
                        const backups = await getDbBackups()
                        let backupLoaded = false
                        for (const backup of backups) {
                            try {
                                LoadingStatusState.text = \`Reading Backup File \${backup}...\`
                                const backupData: Uint8Array = await forageStorage.getItem(\`database/dbbackup-\${backup}.bin\`) as unknown as Uint8Array
                                const backupDecoded = await decodeRisuSave(backupData)
                                setPatchSyncBaseline(safeStructuredClone(backupDecoded))
                                setDatabase(backupDecoded)
                                backupLoaded = true
                                break
                            } catch (error) { }
                        }
                        if (!backupLoaded) throw "Forage: Your save file is corrupted"
                    }
                }
`,
}

const serverUnits = [
    {
        id: 'startup-cache:server-encoded-field',
        file: 'server/node/server.cjs',
        type: 'insert',
        where: 'after',
        anchor: 'let dbEtag = null;\n',
        content: `// Encoded stubs-only payload paired with its ETag.
let dbEncodedCache = null;
`,
    },
    {
        id: 'startup-cache:server-read-fast-path',
        file: 'server/node/server.cjs',
        type: 'insert',
        where: 'after',
        anchor: `        if (key === 'database/database.bin') {
            await flushPendingDb();
        }
`,
        content: `        if (key === 'database/database.bin'
            && dbEncodedCache
            && dbEncodedCache.etag === dbEtag) {
            res.setHeader('Cache-Control', 'private, no-cache');
            res.setHeader('x-db-etag', dbEtag);
            if (req.headers['if-none-match'] === dbEtag) return res.status(304).end();
            res.setHeader('Content-Type', 'application/octet-stream');
            return res.send(dbEncodedCache.value);
        }
`,
    },
    {
        id: 'startup-cache:server-cache-read',
        file: 'server/node/server.cjs',
        type: 'insert',
        where: 'after',
        anchor: '                    value = Buffer.from(encodeRisuSaveLegacy(stripped));\n',
        content: `                    dbEncodedCache = {
                        etag: computeBufferEtag(value),
                        value: Buffer.from(value),
                    };
`,
    },
    {
        id: 'startup-cache:server-cache-full-write',
        file: 'server/node/server.cjs',
        type: 'insert',
        where: 'after',
        anchor: '                dbEtag = computeBufferEtag(fileContent);\n',
        content: `                dbEncodedCache = {
                    etag: dbEtag,
                    value: Buffer.from(fileContent),
                };
`,
    },
    {
        id: 'startup-cache:server-cache-patch',
        file: 'server/node/server.cjs',
        type: 'replace',
        anchor: '                dbEtag = computeBufferEtag(Buffer.from(encodeRisuSaveLegacy(dbCache[filePath])));\n',
        content: `                const encodedForStartup = Buffer.from(encodeRisuSaveLegacy(dbCache[filePath]));
                dbEtag = computeBufferEtag(encodedForStartup);
                dbEncodedCache = { etag: dbEtag, value: encodedForStartup };
`,
    },
]

for (let index = 1; index < serverUnits.length; index += 1) {
    serverUnits[index].after = [serverUnits[index - 1].id]
}

module.exports = {
    id: 'startup-cache',
    version: '0.1.0',
    inspiration: 'PocketRisu/PocketRisu#49',
    units: [
        {
            id: 'startup-cache:module',
            file: 'src/ts/storage/startupDatabaseCache.ts',
            type: 'owned',
            content: owned('src/ts/storage/startupDatabaseCache.ts'),
        },
        {
            id: 'startup-cache:module-tests',
            file: 'src/ts/storage/startupDatabaseCache.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/startupDatabaseCache.test.ts'),
        },
        ...nodeUnits,
        autoStorageUnit,
        bootstrapUnit,
        ...serverUnits,
    ],
}
