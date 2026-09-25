import { test, vi } from 'vitest'
import { createRequire } from 'node:module'

vi.mock('./database.svelte', () => ({ getDatabase: () => ({}), createBotPresetTemplate: () => ({}) }))
vi.mock('./chatStorage', () => ({ chatToStub: (c: any) => c }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))

const { decodeRisuSave, RisuSaveEncoder, RisuSavePatcher } = await import('./risuSave')
const require = createRequire(import.meta.url)

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const time = async (fn: () => unknown) => { const start = performance.now(); await fn(); return performance.now() - start }

test('appearance strict save cost breakdown on a real snapshot', async () => {
    const Database = require('better-sqlite3')
    const sqlite = new Database(process.env.BENCH_DB, { readonly: true, fileMustExist: true })
    const row = sqlite.prepare(`select value from kv where key = ?`).get(process.env.BENCH_KEY)
    sqlite.close()
    const db: any = await decodeRisuSave(new Uint8Array(row.value))
    const rootOnly = () => ({ character: [], chat: [], root: true, botPreset: false, modules: false, plugins: false, pluginCustomStorage: false })
    const encoder = new RisuSaveEncoder()
    await encoder.init(db)
    const patcher = new RisuSavePatcher()
    await patcher.init(structuredClone(db))
    const samples = { encoderSet: [] as number[], encode: [] as number[], copy: [] as number[], patcherSet: [] as number[], cloneToSave: [] as number[] }
    let encoded: ArrayBuffer | null = null
    for (let i = 0; i < 7; i++) {
        db.pocketRisuPersonalSettings = { ...(db.pocketRisuPersonalSettings ?? {}), benchToggle: i }
        samples.encoderSet.push(await time(() => encoder.set(db, rootOnly())))
        samples.encode.push(await time(() => { encoded = encoder.encode() }))
        samples.copy.push(await time(() => new Uint8Array(encoded!)))
        samples.cloneToSave.push(await time(() => structuredClone(rootOnly())))
        samples.patcherSet.push(await time(() => patcher.set(db, rootOnly())))
    }
    (await import('node:fs')).writeFileSync(process.env.BENCH_OUT!, JSON.stringify({
        characters: db.characters.length,
        encodedBytes: (encoded as ArrayBuffer | null)?.byteLength,
        medianMs: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, +median(v).toFixed(1)])),
    }) + '\n')
}, 600_000)
