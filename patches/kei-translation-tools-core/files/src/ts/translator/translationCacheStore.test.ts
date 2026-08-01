import { describe, expect, it, vi } from 'vitest'
import {
    createTranslationCacheStore,
    findUnusedTranslationCacheEntries,
    sameTranslationCacheEntry,
    type StoredTranslationCacheEntry,
    type TranslationCacheEntryIdentity,
} from './translationCacheStore'

function makeStore() {
    const persistent = new Map<string, StoredTranslationCacheEntry>()
    const dependencies = {
        makeStorageKey: vi.fn(async (key: string) => `cache/${key}`),
        listStorageKeys: vi.fn(async () => Array.from(persistent.keys())),
        read: vi.fn(async (storageKey: string) => persistent.get(storageKey) ?? null),
        write: vi.fn(async (storageKey: string, value: StoredTranslationCacheEntry) => {
            persistent.set(storageKey, { ...value })
        }),
        remove: vi.fn(async (storageKey: string) => {
            persistent.delete(storageKey)
        }),
        clear: vi.fn(async () => {
            persistent.clear()
        }),
        yieldToEventLoop: vi.fn(async () => {}),
    }
    return {
        persistent,
        dependencies,
        store: createTranslationCacheStore(dependencies),
    }
}

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

describe('translation cache store', () => {
    it('writes persistent state before exposing an explicit edit', async () => {
        const { dependencies, store } = makeStore()
        dependencies.write.mockRejectedValueOnce(new Error('storage unavailable'))

        await expect(store.set('source', 'translation')).rejects.toThrow('storage unavailable')
        await expect(store.get('source')).resolves.toBeNull()
    })

    it('serializes generated persistence and later explicit edits', async () => {
        const { persistent, store } = makeStore()

        const generatedWrite = store.storeGenerated('source', 'generated')
        const explicitWrite = store.set('source', 'edited')
        await Promise.all([generatedWrite, explicitWrite])

        expect(persistent.get('cache/source')).toEqual({
            key: 'source',
            value: 'edited',
        })
        await expect(store.get('source')).resolves.toBe('edited')
    })

    it('does not let a generated value bypass an exact stale-entry check', async () => {
        const { persistent, dependencies, store } = makeStore()
        persistent.set('cache/source', { key: 'source', value: 'first' })
        const writeStarted = deferred()
        const releaseWrite = deferred()
        dependencies.write.mockImplementationOnce(async (storageKey, value) => {
            writeStarted.resolve()
            await releaseWrite.promise
            persistent.set(storageKey, { ...value })
        })

        const generatedWrite = store.storeGenerated('source', 'generated')
        await writeStarted.promise
        const staleEdit = store.replaceEntry({
            storageKey: 'cache/source',
            key: 'source',
            value: 'first',
        }, 'stale edit')
        releaseWrite.resolve()

        await expect(generatedWrite).resolves.toBeUndefined()
        await expect(staleEdit).resolves.toMatchObject({
            status: 'changed',
            current: { value: 'generated' },
        })
        expect(persistent.get('cache/source')?.value).toBe('generated')
    })

    it('does not resurrect a generated value after a later exact delete', async () => {
        const { persistent, dependencies, store } = makeStore()
        const writeStarted = deferred()
        const releaseWrite = deferred()
        dependencies.write.mockImplementationOnce(async (storageKey, value) => {
            writeStarted.resolve()
            await releaseWrite.promise
            persistent.set(storageKey, { ...value })
        })

        const generatedWrite = store.storeGenerated('source', 'generated')
        await writeStarted.promise
        const deletion = store.deleteEntry({
            storageKey: 'cache/source',
            key: 'source',
            value: 'generated',
        })
        releaseWrite.resolve()

        await expect(generatedWrite).resolves.toBeUndefined()
        await expect(deletion).resolves.toEqual({ status: 'deleted' })
        expect(persistent.has('cache/source')).toBe(false)
        await expect(store.get('source')).resolves.toBeNull()
    })

    it('uses the expected value for a raw-key compare-and-set', async () => {
        const { persistent, store } = makeStore()
        await store.set('source', 'first')

        await expect(store.replaceValue(
            'source',
            'stale',
            'edited',
        )).resolves.toMatchObject({
            status: 'changed',
            current: { value: 'first' },
        })
        await expect(store.replaceValue(
            'source',
            'first',
            'edited',
        )).resolves.toEqual({ status: 'updated' })
        expect(persistent.get('cache/source')?.value).toBe('edited')
    })

    it('keeps a generated value in memory when only persistence fails', async () => {
        const { dependencies, store } = makeStore()
        dependencies.write.mockRejectedValueOnce(new Error('storage unavailable'))

        await expect(store.storeGenerated('source', 'generated')).rejects.toThrow(
            'storage unavailable',
        )
        await expect(store.get('source')).resolves.toBe('generated')
    })

    it('updates and deletes only the complete issued entry identity', async () => {
        const { persistent, store } = makeStore()
        await store.set('source', 'first')
        const issued: TranslationCacheEntryIdentity = {
            storageKey: 'cache/source',
            key: 'source',
            value: 'first',
        }

        await store.set('source', 'changed elsewhere')

        await expect(store.replaceEntry(issued, 'stale edit')).resolves.toMatchObject({
            status: 'changed',
            current: { value: 'changed elsewhere' },
        })
        await expect(store.deleteEntry(issued)).resolves.toMatchObject({
            status: 'changed',
            current: { value: 'changed elsewhere' },
        })
        expect(persistent.get('cache/source')?.value).toBe('changed elsewhere')

        const current = { ...issued, value: 'changed elsewhere' }
        await expect(store.replaceEntry(current, 'accepted edit')).resolves.toEqual({
            status: 'updated',
        })
        await expect(store.deleteEntry({
            ...current,
            value: 'accepted edit',
        })).resolves.toEqual({ status: 'deleted' })
        expect(persistent.has('cache/source')).toBe(false)
    })

    it('rejects a storage-key mismatch even when key and value match', async () => {
        const { store } = makeStore()
        await store.set('source', 'translation')

        await expect(store.deleteEntry({
            storageKey: 'cache/another',
            key: 'source',
            value: 'translation',
        })).resolves.toEqual({ status: 'missing' })
        await expect(store.get('source')).resolves.toBe('translation')
    })

    it('does not report an externally removed persisted entry as deleted', async () => {
        const { persistent, store } = makeStore()
        await store.set('source', 'translation')
        persistent.delete('cache/source')

        await expect(store.deleteEntry({
            storageKey: 'cache/source',
            key: 'source',
            value: 'translation',
        })).resolves.toEqual({ status: 'missing' })
    })

    it('drops stale memory even when clear partially fails', async () => {
        const { persistent, dependencies, store } = makeStore()
        await store.set('source', 'translation')
        dependencies.clear.mockImplementationOnce(async () => {
            persistent.delete('cache/source')
            throw new Error('partial clear')
        })

        await expect(store.clear()).rejects.toThrow('partial clear')
        await expect(store.get('source')).resolves.toBeNull()
    })

    it('loads persistent entries in batches and reports final exact totals', async () => {
        const { persistent, store } = makeStore()
        persistent.set('cache/a', { key: 'a', value: 'A' })
        persistent.set('cache/b', { key: 'b', value: 'B' })
        persistent.set('cache/c', { key: 'c', value: 'C' })
        const progress: number[] = []

        const result = await store.list({
            batchSize: 1,
            onProgress: (state) => progress.push(state.entries.length),
        })

        expect(result).toEqual({
            entries: [
                { storageKey: 'cache/a', key: 'a', value: 'A' },
                { storageKey: 'cache/b', key: 'b', value: 'B' },
                { storageKey: 'cache/c', key: 'c', value: 'C' },
            ],
            total: 3,
            done: true,
        })
        expect(progress.at(-1)).toBe(3)
    })

    it('exports arbitrary source text without losing prototype-like keys', async () => {
        const { store } = makeStore()
        await store.set('__proto__', 'prototype translation')
        await store.set('constructor', 'constructor translation')

        const exported = await store.exportJSON()

        expect(Object.getPrototypeOf(exported)).toBeNull()
        expect(Object.keys(exported).sort()).toEqual(['__proto__', 'constructor'])
        expect(exported.__proto__).toBe('prototype translation')
        expect(exported.constructor).toBe('constructor translation')
    })

    it('throws AbortError instead of returning a partial successful load', async () => {
        const { persistent, dependencies, store } = makeStore()
        persistent.set('cache/a', { key: 'a', value: 'A' })
        persistent.set('cache/b', { key: 'b', value: 'B' })
        const controller = new AbortController()
        dependencies.read.mockImplementation(async (storageKey: string) => {
            controller.abort()
            return persistent.get(storageKey) ?? null
        })

        await expect(store.list({
            signal: controller.signal,
        })).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('cancels promptly while a prior cache mutation is still pending', async () => {
        const { dependencies, store } = makeStore()
        dependencies.write.mockImplementationOnce(async () => {
            await new Promise<void>(() => {})
        })
        void store.storeGenerated('source', 'generated').catch(() => undefined)
        await Promise.resolve()
        const controller = new AbortController()
        const listing = store.list({ signal: controller.signal })

        controller.abort()

        await expect(listing).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('cancels a cache lookup while a prior mutation is still pending', async () => {
        const { dependencies, store } = makeStore()
        dependencies.write.mockImplementationOnce(async () => {
            await new Promise<void>(() => {})
        })
        void store.storeGenerated('source', 'generated').catch(() => undefined)
        await Promise.resolve()
        const controller = new AbortController()
        const lookup = store.get('source', controller.signal)

        controller.abort()

        await expect(lookup).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('cancels promptly while one persistent entry read is pending', async () => {
        const { persistent, dependencies, store } = makeStore()
        persistent.set('cache/source', { key: 'source', value: 'translation' })
        const readStarted = deferred()
        dependencies.read.mockImplementationOnce(async () => {
            readStarted.resolve()
            return await new Promise<never>(() => {})
        })
        const controller = new AbortController()
        const listing = store.list({ signal: controller.signal })
        await readStarted.promise

        controller.abort()

        await expect(listing).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('keeps identity comparison and unused planning pure', () => {
        const a = { storageKey: 'cache/a', key: 'a', value: 'A' }
        const b = { storageKey: 'cache/b', key: 'b', value: 'B' }

        expect(sameTranslationCacheEntry({ ...a }, a)).toBe(true)
        expect(sameTranslationCacheEntry({ ...a, value: 'changed' }, a)).toBe(false)
        expect(findUnusedTranslationCacheEntries([a, b], new Set(['a']))).toEqual([b])
    })
})
