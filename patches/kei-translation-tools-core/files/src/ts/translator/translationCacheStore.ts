import {
    raceTranslationAbort,
    throwIfTranslationAborted,
} from './translationTask'

export interface StoredTranslationCacheEntry {
    key: string
    value: string
}

export interface TranslationCacheEntryIdentity extends StoredTranslationCacheEntry {
    storageKey: string
}

export interface TranslationCacheListState {
    entries: TranslationCacheEntryIdentity[]
    total: number
    done: boolean
}

export interface TranslationCacheMutationResult {
    status: 'updated' | 'deleted' | 'missing' | 'changed'
    current?: TranslationCacheEntryIdentity
}

export interface TranslationCacheStoreDependencies {
    makeStorageKey: (key: string) => Promise<string>
    listStorageKeys: () => Promise<string[]>
    read: (storageKey: string) => Promise<unknown>
    write: (storageKey: string, value: StoredTranslationCacheEntry) => Promise<void>
    remove: (storageKey: string) => Promise<void>
    clear: () => Promise<void>
    yieldToEventLoop?: () => Promise<void>
}

export interface TranslationCacheListOptions {
    limit?: number
    batchSize?: number
    signal?: AbortSignal
    onProgress?: (state: TranslationCacheListState) => void
}

function isStoredEntry(value: unknown): value is StoredTranslationCacheEntry {
    return typeof value === 'object'
        && value !== null
        && typeof (value as StoredTranslationCacheEntry).key === 'string'
        && typeof (value as StoredTranslationCacheEntry).value === 'string'
}

export function sameTranslationCacheEntry(
    current: TranslationCacheEntryIdentity | null | undefined,
    expected: TranslationCacheEntryIdentity,
): boolean {
    return !!current
        && current.storageKey === expected.storageKey
        && current.key === expected.key
        && current.value === expected.value
}

export function findUnusedTranslationCacheEntries(
    entries: TranslationCacheEntryIdentity[],
    usedKeys: ReadonlySet<string>,
): TranslationCacheEntryIdentity[] {
    return entries.filter((entry) => !usedKeys.has(entry.key))
}

export function createTranslationCacheStore(
    dependencies: TranslationCacheStoreDependencies,
) {
    const memory = new Map<string, string>()
    const volatile = new Set<string>()
    const listeners = new Set<(key: string | null) => void>()
    let mutationTail: Promise<void> = Promise.resolve()

    const notify = (key: string | null) => {
        for (const listener of listeners) {
            try {
                listener(key)
            }
            catch (error) {
                console.error('[translation-cache] listener failed', error)
            }
        }
    }

    const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
        const result = mutationTail.then(operation, operation)
        mutationTail = result.then(
            () => undefined,
            () => undefined,
        )
        return result
    }

    const waitForMutations = async () => {
        await mutationTail
    }

    const currentEntry = async (
        expected: TranslationCacheEntryIdentity,
    ): Promise<TranslationCacheEntryIdentity | null> => {
        const storageKey = await dependencies.makeStorageKey(expected.key)
        if (storageKey !== expected.storageKey) {
            return null
        }
        if (volatile.has(expected.key) && memory.has(expected.key)) {
            return {
                storageKey,
                key: expected.key,
                value: memory.get(expected.key)!,
            }
        }
        const persisted = await dependencies.read(storageKey)
        if (isStoredEntry(persisted)) {
            return {
                storageKey,
                key: persisted.key,
                value: persisted.value,
            }
        }
        return null
    }

    const snapshot = (
        entries: Map<string, TranslationCacheEntryIdentity>,
        total: number,
        done: boolean,
        limit?: number,
    ): TranslationCacheListState => {
        const values = Array.from(entries.values())
        return {
            entries: limit === undefined ? values : values.slice(0, limit),
            total,
            done,
        }
    }

    const list = async (
        options: TranslationCacheListOptions = {},
    ): Promise<TranslationCacheListState> => {
        const limit = options.limit === undefined
            ? undefined
            : Math.max(1, Math.floor(options.limit))
        const batchSize = Math.max(1, Math.floor(options.batchSize ?? 200))
        const signal = options.signal
        throwIfTranslationAborted(signal)
        await raceTranslationAbort(waitForMutations(), signal)
        throwIfTranslationAborted(signal)

        const entries = new Map<string, TranslationCacheEntryIdentity>()
        for (const key of volatile) {
            throwIfTranslationAborted(signal)
            const value = memory.get(key)
            if (value === undefined) {
                continue
            }
            const storageKey = await raceTranslationAbort(
                dependencies.makeStorageKey(key),
                signal,
            )
            throwIfTranslationAborted(signal)
            entries.set(storageKey, { storageKey, key, value })
        }

        const storageKeys = await raceTranslationAbort(
            dependencies.listStorageKeys(),
            signal,
        )
        throwIfTranslationAborted(signal)
        const potentialKeys = new Set([...storageKeys, ...entries.keys()])
        let total = potentialKeys.size
        options.onProgress?.(snapshot(entries, total, false, limit))

        if (limit !== undefined && entries.size >= limit) {
            return snapshot(entries, total, false, limit)
        }

        let loadedSinceYield = 0
        for (const storageKey of storageKeys) {
            throwIfTranslationAborted(signal)
            const persisted = await raceTranslationAbort(
                dependencies.read(storageKey),
                signal,
            )
            throwIfTranslationAborted(signal)
            if (isStoredEntry(persisted)) {
                const local = entries.get(storageKey)
                if (!local || !volatile.has(local.key)) {
                    entries.set(storageKey, {
                        storageKey,
                        key: persisted.key,
                        value: persisted.value,
                    })
                    memory.set(persisted.key, persisted.value)
                    volatile.delete(persisted.key)
                }
            }

            if (limit !== undefined && entries.size >= limit) {
                return snapshot(entries, total, false, limit)
            }

            loadedSinceYield++
            if (loadedSinceYield >= batchSize) {
                loadedSinceYield = 0
                options.onProgress?.(snapshot(entries, total, false, limit))
                await (dependencies.yieldToEventLoop?.()
                    ?? new Promise<void>((resolve) => setTimeout(resolve, 0)))
                throwIfTranslationAborted(signal)
            }
        }

        total = entries.size
        const result = snapshot(entries, total, true, limit)
        options.onProgress?.(result)
        return result
    }

    const replaceCurrentEntry = async (
        expected: TranslationCacheEntryIdentity,
        value: string,
    ): Promise<TranslationCacheMutationResult> => {
        const current = await currentEntry(expected)
        if (!current) {
            return { status: 'missing' }
        }
        if (!sameTranslationCacheEntry(current, expected)) {
            return { status: 'changed', current }
        }
        await dependencies.write(expected.storageKey, {
            key: expected.key,
            value,
        })
        memory.set(expected.key, value)
        volatile.delete(expected.key)
        notify(expected.key)
        return { status: 'updated' }
    }

    return {
        subscribe(listener: (key: string | null) => void) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },

        loadedEntries(): StoredTranslationCacheEntry[] {
            return Array.from(memory, ([key, value]) => ({ key, value }))
        },

        async storeGenerated(key: string, value: string): Promise<void> {
            await mutate(async () => {
                const storageKey = await dependencies.makeStorageKey(key)
                memory.set(key, value)
                volatile.add(key)
                notify(key)
                await dependencies.write(storageKey, { key, value })
                volatile.delete(key)
            })
        },

        async get(
            key: string,
            signal?: AbortSignal,
        ): Promise<string | null> {
            throwIfTranslationAborted(signal)
            await raceTranslationAbort(waitForMutations(), signal)
            throwIfTranslationAborted(signal)
            if (memory.has(key)) {
                return memory.get(key)!
            }
            const storageKey = await raceTranslationAbort(
                dependencies.makeStorageKey(key),
                signal,
            )
            const persisted = await raceTranslationAbort(
                dependencies.read(storageKey),
                signal,
            )
            throwIfTranslationAborted(signal)
            if (!isStoredEntry(persisted) || persisted.key !== key) {
                return null
            }
            memory.set(key, persisted.value)
            volatile.delete(key)
            return persisted.value
        },

        async set(key: string, value: string): Promise<void> {
            await mutate(async () => {
                const storageKey = await dependencies.makeStorageKey(key)
                await dependencies.write(storageKey, { key, value })
                memory.set(key, value)
                volatile.delete(key)
                notify(key)
            })
        },

        async deleteKey(key: string): Promise<void> {
            await mutate(async () => {
                const storageKey = await dependencies.makeStorageKey(key)
                await dependencies.remove(storageKey)
                memory.delete(key)
                volatile.delete(key)
                notify(key)
            })
        },

        async replaceEntry(
            expected: TranslationCacheEntryIdentity,
            value: string,
        ): Promise<TranslationCacheMutationResult> {
            return mutate(() => replaceCurrentEntry(expected, value))
        },

        async replaceValue(
            key: string,
            expectedValue: string,
            value: string,
        ): Promise<TranslationCacheMutationResult> {
            return mutate(async () => {
                const storageKey = await dependencies.makeStorageKey(key)
                return replaceCurrentEntry({
                    storageKey,
                    key,
                    value: expectedValue,
                }, value)
            })
        },

        async deleteEntry(
            expected: TranslationCacheEntryIdentity,
        ): Promise<TranslationCacheMutationResult> {
            return mutate(async () => {
                const current = await currentEntry(expected)
                if (!current) {
                    return { status: 'missing' }
                }
                if (!sameTranslationCacheEntry(current, expected)) {
                    return { status: 'changed', current }
                }
                await dependencies.remove(expected.storageKey)
                memory.delete(expected.key)
                volatile.delete(expected.key)
                notify(expected.key)
                return { status: 'deleted' }
            })
        },

        async clear(): Promise<void> {
            await mutate(async () => {
                try {
                    await dependencies.clear()
                }
                finally {
                    memory.clear()
                    volatile.clear()
                    notify(null)
                }
            })
        },

        list,

        async search(partialKey: string): Promise<StoredTranslationCacheEntry[]> {
            const state = await list()
            return state.entries
                .filter((entry) => entry.key.includes(partialKey))
                .map(({ key, value }) => ({ key, value }))
        },

        async exportJSON(): Promise<Record<string, string>> {
            const state = await list()
            const result = Object.create(null) as Record<string, string>
            for (const entry of state.entries) {
                result[entry.key] = entry.value
            }
            return result
        },

        async importJSON(
            data: Record<string, string>,
        ): Promise<{ count: number, failed: number }> {
            return mutate(async () => {
                let count = 0
                let failed = 0
                for (const [key, value] of Object.entries(data)) {
                    try {
                        const storageKey = await dependencies.makeStorageKey(key)
                        await dependencies.write(storageKey, { key, value })
                        memory.set(key, value)
                        volatile.delete(key)
                        count++
                    }
                    catch {
                        failed++
                    }
                }
                if (count > 0) {
                    notify(null)
                }
                return { count, failed }
            })
        },
    }
}
