import {
    clearPersistentPrefix,
    listPersistentKeys,
    makeHashedStorageKey,
    readPersistentJson,
    removePersistentKey,
    writePersistentJson,
} from '../storage/persistentKv'
import {
    createTranslationCacheStore,
    type StoredTranslationCacheEntry,
    type TranslationCacheEntryIdentity,
    type TranslationCacheListOptions,
} from './translationCacheStore'

export const llmTranslateCachePrefix = 'cache/llm-translate/'

const store = createTranslationCacheStore({
    makeStorageKey: (key) => makeHashedStorageKey(llmTranslateCachePrefix, key),
    listStorageKeys: () => listPersistentKeys(llmTranslateCachePrefix),
    read: (storageKey) => readPersistentJson<StoredTranslationCacheEntry>(storageKey),
    write: (storageKey, value) => writePersistentJson(storageKey, value),
    remove: removePersistentKey,
    clear: () => clearPersistentPrefix(llmTranslateCachePrefix),
})

export type LLMCacheEntry = StoredTranslationCacheEntry
export type LLMCacheEntryIdentity = TranslationCacheEntryIdentity

export function subscribeLLMTranslationCache(
    listener: (key: string | null) => void,
): () => void {
    return store.subscribe(listener)
}

export function loadedLLMCacheEntries(): LLMCacheEntry[] {
    return store.loadedEntries()
}

export function storeGeneratedLLMCache(key: string, value: string): void {
    void store.storeGenerated(key, value).catch((error) => {
        console.error('[translation-cache] generated translation was not persisted', error)
    })
}

export async function clearLLMCache(): Promise<void> {
    await store.clear()
}

export async function getLLMCache(
    key: string,
    signal?: AbortSignal,
): Promise<string | null> {
    return store.get(key, signal)
}

export async function searchLLMCache(
    partialKey: string,
): Promise<LLMCacheEntry[]> {
    return store.search(partialKey)
}

export async function setLLMCache(
    key: string,
    value: string,
    expectedValue?: string,
): Promise<void> {
    if (expectedValue === undefined) {
        await store.set(key, value)
        return
    }
    const result = await store.replaceValue(key, expectedValue, value)
    if (result.status !== 'updated') {
        const error = new Error('Translation cache entry changed')
        error.name = 'TranslationCacheChangedError'
        throw error
    }
}

export async function deleteLLMCache(key: string): Promise<void> {
    await store.deleteKey(key)
}

export async function replaceLLMCacheEntry(
    expected: LLMCacheEntryIdentity,
    value: string,
) {
    return store.replaceEntry(expected, value)
}

export async function deleteLLMCacheEntry(
    expected: LLMCacheEntryIdentity,
) {
    return store.deleteEntry(expected)
}

export async function listLLMCacheEntries(
    options: TranslationCacheListOptions = {},
) {
    return store.list(options)
}

export async function exportLLMCacheAsJSON(): Promise<Record<string, string>> {
    return store.exportJSON()
}

export async function importLLMCacheFromJSON(
    data: Record<string, string>,
): Promise<{ count: number, failed: number }> {
    return store.importJSON(data)
}
