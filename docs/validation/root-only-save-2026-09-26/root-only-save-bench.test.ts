import { test, vi } from 'vitest'
import { createRequire } from 'node:module'

// Real stub conversion: the client passes placeholder chats to set(), which
// converts them with chatToStub. Only modules unrelated to the measured path
// are replaced.
vi.mock('./database.svelte', async () => ({
    getDatabase: () => ({}),
    createBotPresetTemplate: () => ({}),
    isChatStub: (await import('./chatStub')).isChatStub,
}))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))

const { decodeRisuSave, RisuSavePatcher } = await import('./risuSave')
const { chatToStub, convertStubsToPlaceholders } = await import('./chatStorage')
const require = createRequire(import.meta.url)

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const time = async (fn: () => unknown) => { const start = performance.now(); await fn(); return performance.now() - start }

// database.bin above the chunk threshold is stored as a marker in kv and its
// bytes in chunks ordered by manifest_chunks.
function readValue(file: string, key: string): Buffer {
    const Database = require('better-sqlite3')
    const sqlite = new Database(file, { readonly: true, fileMustExist: true })
    try {
        const row = sqlite.prepare('select value from kv where key = ?').get(key)
        if (!row) throw new Error(`missing ${key}`)
        const marker = Buffer.from('\x00RISUCHUNKED\x00', 'binary')
        if (!Buffer.from(row.value).equals(marker)) return Buffer.from(row.value)
        const parts = sqlite.prepare(
            'select c.data from manifest_chunks m join chunks c on c.hash = m.hash where m.manifest_key = ? order by m.seq',
        ).all(key).map((part: any) => Buffer.from(part.data))
        return Buffer.concat(parts)
    } finally {
        sqlite.close()
    }
}

test('strict root-only save client cost breakdown on a real snapshot', async () => {
    const bytes = readValue(process.env.BENCH_DB!, process.env.BENCH_KEY ?? 'database/database.bin')
    const db: any = await decodeRisuSave(new Uint8Array(bytes))
    // Match the client runtime shape after boot.
    for (const character of db.characters ?? []) {
        if (Array.isArray(character?.chats)) character.chats = convertStubsToPlaceholders(character.chats)
    }
    const rootOnly = () => ({ character: [], chat: [], root: true, botPreset: false, modules: false, plugins: false, pluginCustomStorage: false })
    const patcher: any = new RisuSavePatcher()
    await patcher.init(structuredClone(db))
    const samples = {
        baselineClone: [] as number[],
        toSaveClone: [] as number[],
        characterWalk: [] as number[],
        rootKeyWalk: [] as number[],
        patcherSet: [] as number[],
    }
    let walkMatches = 0
    let rootKeyMatches = 0
    for (let i = 0; i < 7; i++) {
        db.pocketRisuPersonalSettings = { ...(db.pocketRisuPersonalSettings ?? {}), benchToggle: i }
        samples.baselineClone.push(await time(() => structuredClone(patcher.lastSyncedDb)))
        samples.toSaveClone.push(await time(() => structuredClone(rootOnly())))
        // The per-character pre-check that set() runs for every character on
        // a root-only save, replicated statement for statement.
        samples.characterWalk.push(await time(() => {
            walkMatches = 0
            for (const character of db.characters) {
                let json: string | null = null
                try {
                    json = JSON.stringify(character ? { ...character, chats: (character.chats || []).map((c: any) => chatToStub(c)) } : character)
                } catch { json = null }
                if (character?.chaId && json !== null && json === patcher.lastCharJsons.get(character.chaId)) walkMatches++
            }
        }))
        // The per-key root pre-check that set() runs on every save, replicated
        // statement for statement (characters, presets and modules excluded).
        samples.rootKeyWalk.push(await time(() => {
            rootKeyMatches = 0
            const { characters: _c, botPresets: _b, modules: _m, ...curRoot } = db
            for (const key of Object.keys(curRoot)) {
                if (key === '__proto__') continue
                const hadKey = Object.hasOwn(patcher.lastSyncedDb, key)
                let json: string | undefined
                try { json = JSON.stringify(curRoot[key]) } catch { json = undefined }
                if (json !== undefined && hadKey && json === patcher.lastRootKeyJsons.get(key)) rootKeyMatches++
            }
        }))
        samples.patcherSet.push(await time(() => patcher.set(db, rootOnly())))
    }
    // Serialized size of the largest root keys (schema field names only).
    const { characters: _c, botPresets: _b, modules: _m, ...root } = db
    const largestRootKeys = Object.keys(root)
        .map((key) => { let n = 0; try { n = JSON.stringify(root[key])?.length ?? 0 } catch {} return [key, n] as const })
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([key, n]) => ({ key, jsonChars: n }))
    const size = (value: unknown) => { try { return JSON.stringify(value)?.length ?? 0 } catch { return -1 } }
    const medianMs = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, +median(v).toFixed(1)]))
    ;(await import('node:fs')).writeFileSync(process.env.BENCH_OUT!, JSON.stringify({
        characters: db.characters.length,
        unchangedCharactersSkippedByWalk: walkMatches,
        rootKeys: Object.keys(root).length,
        unchangedRootKeysSkippedByWalk: rootKeyMatches,
        encodedBytes: bytes.byteLength,
        jsonChars: { characters: size(db.characters.map((c: any) => ({ ...c, chats: (c.chats || []).map((x: any) => chatToStub(x)) }))), root: size(root) },
        largestRootKeys,
        medianMs,
        derivedMs: { patcherSetExceptBothWalks: +(medianMs.patcherSet - medianMs.characterWalk - medianMs.rootKeyWalk).toFixed(1) },
        samplesMs: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.map(x => +x.toFixed(1))])),
    }) + '\n')
}, 600_000)
