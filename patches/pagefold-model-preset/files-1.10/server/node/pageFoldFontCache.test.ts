import { afterEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const {
    PageFoldFontCacheError,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')

const tempDirectories: string[] = []
afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, {
        recursive: true,
        force: true,
    })))
})

async function tempDirectory() {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pagefold-font-cache-test-'))
    tempDirectories.push(directory)
    return directory
}

function digest(bytes: Buffer) {
    return crypto.createHash('sha256').update(bytes).digest('hex')
}

function spec(id: string, fileName: string, bytes: Buffer, magic?: number[]) {
    return {
        id,
        fileName,
        url: `https://fonts.example.invalid/${fileName}`,
        byteLength: bytes.byteLength,
        sha256: digest(bytes),
        magic,
    }
}

function response(bytes: Buffer) {
    return new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.byteLength) },
    })
}

describe('PageFold immutable font cache', () => {
    it('singleflights downloads, verifies every byte, and reuses disk cache', async () => {
        const root = await tempDirectory()
        const text = Buffer.from([0, 1, 0, 0, 10, 11, 12])
        const emoji = Buffer.from([0, 1, 0, 0, 20, 21])
        const license = Buffer.from('OFL fixture')
        const specs = [
            spec('textFont', 'text.ttf', text, [0, 1, 0, 0]),
            spec('emojiFont', 'emoji.ttf', emoji, [0, 1, 0, 0]),
            spec('textLicense', 'text-OFL.txt', license),
        ]
        const sources = new Map(specs.map((item, index) => [item.url, [text, emoji, license][index]]))
        const fetchImpl = vi.fn(async (url: string) => response(sources.get(url)!))
        const cache = createPageFoldFontCache({ cacheRoot: root, specs, fetchImpl })

        const [first, second] = await Promise.all([cache.load(), cache.load()])
        expect(first).toBe(second)
        expect(fetchImpl).toHaveBeenCalledTimes(3)
        expect(await readFile(first.assets.textFont.path)).toEqual(text)
        expect((await stat(first.assets.textFont.path)).mode & 0o777).toBe(0o600)

        const diskOnlyFetch = vi.fn(async () => { throw new Error('must not fetch') })
        const reloaded = await createPageFoldFontCache({
            cacheRoot: root,
            specs,
            fetchImpl: diskOnlyFetch,
        }).load()
        expect(reloaded.assets.emojiFont.sha256).toBe(digest(emoji))
        expect(diskOnlyFetch).not.toHaveBeenCalled()
    })

    it('atomically replaces a corrupt cached asset only after a valid refetch', async () => {
        const root = await tempDirectory()
        const bytes = Buffer.from([0, 1, 0, 0, 30, 31, 32])
        const item = spec('textFont', 'text.ttf', bytes, [0, 1, 0, 0])
        const fetchImpl = vi.fn(async () => response(bytes))
        await createPageFoldFontCache({ cacheRoot: root, specs: [item], fetchImpl }).load()
        await writeFile(path.join(root, item.fileName), Buffer.from('corrupt'))

        await createPageFoldFontCache({ cacheRoot: root, specs: [item], fetchImpl }).load()
        expect(fetchImpl).toHaveBeenCalledTimes(2)
        expect(await readFile(path.join(root, item.fileName))).toEqual(bytes)
        expect((await readdir(root)).every((name) => !name.endsWith('.tmp'))).toBe(true)
    })

    it('rejects same-length hash substitution without publishing it', async () => {
        const root = await tempDirectory()
        const expected = Buffer.from([0, 1, 0, 0, 40, 41])
        const substituted = Buffer.from([0, 1, 0, 0, 40, 99])
        const item = spec('textFont', 'text.ttf', expected, [0, 1, 0, 0])
        const cache = createPageFoldFontCache({
            cacheRoot: root,
            specs: [item],
            fetchImpl: async () => response(substituted),
        })
        await expect(cache.load()).rejects.toMatchObject({
            name: 'PageFoldFontCacheError',
            code: 'FONT_HASH_MISMATCH',
        })
        expect(await readdir(root)).toEqual([])
    })

    it('rejects declared-length mismatch before reading a response body', async () => {
        const root = await tempDirectory()
        const expected = Buffer.from([0, 1, 0, 0, 50, 51])
        const item = spec('textFont', 'text.ttf', expected, [0, 1, 0, 0])
        const read = vi.fn()
        const cache = createPageFoldFontCache({
            cacheRoot: root,
            specs: [item],
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                headers: { get: (name: string) => name === 'content-length' ? String(expected.byteLength + 1) : null },
                body: { getReader: () => ({ read }) },
            }),
        })
        await expect(cache.load()).rejects.toMatchObject({ code: 'FONT_LENGTH_MISMATCH' })
        expect(read).not.toHaveBeenCalled()
    })

    it('validates decoded bytes instead of comparing a compressed wire length', async () => {
        const root = await tempDirectory()
        const expected = Buffer.from([0, 1, 0, 0, 55, 56])
        const item = spec('textFont', 'text.ttf', expected, [0, 1, 0, 0])
        const cache = createPageFoldFontCache({
            cacheRoot: root,
            specs: [item],
            fetchImpl: async () => new Response(expected, {
                status: 200,
                headers: {
                    'content-length': '3',
                    'content-encoding': 'gzip',
                },
            }),
        })
        await expect(cache.load()).resolves.toMatchObject({
            assets: { textFont: { byteLength: expected.byteLength } },
        })
    })

    it('cleans temporary bytes after a streaming interruption', async () => {
        const root = await tempDirectory()
        const expected = Buffer.from([0, 1, 0, 0, 60, 61, 62, 63])
        const item = spec('textFont', 'text.ttf', expected, [0, 1, 0, 0])
        let reads = 0
        const cache = createPageFoldFontCache({
            cacheRoot: root,
            specs: [item],
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                headers: { get: () => null },
                body: { getReader: () => ({
                    read: async () => {
                        reads++
                        if (reads === 1) return { value: expected.subarray(0, 4), done: false }
                        throw new Error('connection reset')
                    },
                    cancel: async () => {},
                }) },
            }),
        })
        await expect(cache.load()).rejects.toMatchObject({ code: 'FONT_DOWNLOAD_INTERRUPTED' })
        expect(await readdir(root)).toEqual([])
    })

    it('keeps shared work alive for a remaining subscriber and aborts the lone subscriber', async () => {
        const root = await tempDirectory()
        const bytes = Buffer.from([0, 1, 0, 0, 70, 71])
        const item = spec('textFont', 'text.ttf', bytes, [0, 1, 0, 0])
        let releaseFetch!: () => void
        const fetchGate = new Promise<void>((resolve) => { releaseFetch = resolve })
        const fetchImpl = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
            await Promise.race([
                fetchGate,
                new Promise((_, reject) => init.signal.addEventListener('abort', () => {
                    const error = new Error('aborted')
                    error.name = 'AbortError'
                    reject(error)
                }, { once: true })),
            ])
            return response(bytes)
        })
        const cache = createPageFoldFontCache({ cacheRoot: root, specs: [item], fetchImpl })
        const firstController = new AbortController()
        const secondController = new AbortController()
        const first = cache.load(firstController.signal)
        const second = cache.load(secondController.signal)
        firstController.abort()
        releaseFetch()
        await expect(first).rejects.toMatchObject({ name: 'AbortError' })
        await expect(second).resolves.toMatchObject({ assets: { textFont: { byteLength: bytes.length } } })
        expect(fetchImpl).toHaveBeenCalledTimes(1)

        const loneRoot = await tempDirectory()
        let markLoneStarted!: () => void
        const loneStarted = new Promise<void>((resolve) => { markLoneStarted = resolve })
        const loneFetch = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
            markLoneStarted()
            await new Promise((_, reject) => init.signal.addEventListener('abort', () => {
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
            }, { once: true }))
            return response(bytes)
        })
        const loneController = new AbortController()
        const lone = createPageFoldFontCache({ cacheRoot: loneRoot, specs: [item], fetchImpl: loneFetch }).load(loneController.signal)
        await loneStarted
        loneController.abort()
        await expect(lone).rejects.toMatchObject({ name: 'AbortError' })
        expect(loneFetch).toHaveBeenCalledTimes(1)
    })

    it('fails closed on malformed immutable specs', async () => {
        expect(() => createPageFoldFontCache({
            specs: [{ id: 'x', fileName: '../escape.ttf', url: 'http://mutable', byteLength: 1, sha256: 'x' }],
            fetchImpl: vi.fn(),
        })).toThrow(PageFoldFontCacheError)
    })
})
