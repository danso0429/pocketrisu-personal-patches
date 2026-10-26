import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageBackend = vi.hoisted(() => ({
    setItem: vi.fn(),
}))

vi.mock('../globalApi.svelte', () => ({
    forageStorage: {
        Init: vi.fn(async () => undefined),
        getPluginStorageIndex: vi.fn(async () => ({ entries: [] })),
        getPluginStorageAll: vi.fn(async () => undefined),
        getItem: vi.fn(async () => null),
        setItem: storageBackend.setItem,
        removeItem: vi.fn(async () => undefined),
    },
}))

vi.mock('../alert', () => ({ alertError: vi.fn() }))
vi.mock('../storage/persistentKv', () => ({
    encodeStorageKeyComponent: (value: string) => encodeURIComponent(value),
}))

import * as pluginStorage from './pluginStorageStore'

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => { resolve = done })
    return { promise, resolve }
}

function pendingProbe(): () => boolean {
    const candidate = (pluginStorage as unknown as Record<string, unknown>)
        .hasPendingPluginStorageWrites
    expect(typeof candidate).toBe('function')
    return candidate as () => boolean
}

describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    beforeEach(() => {
        pluginStorage._resetForTests()
        storageBackend.setItem.mockReset()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('[new] reports a sync plugin write dirty while queued or in flight and clean after flush', async () => {
        const write = deferred()
        storageBackend.setItem.mockReturnValueOnce(write.promise)
        const probe = pendingProbe()

        pluginStorage.setItemSync('pluginA', 'val1')
        expect(probe()).toBe(true)
        write.resolve()
        await vi.waitFor(() => expect(probe()).toBe(false))
    })

    it('[new] remains dirty across rapid writes until the entire per-key queue drains', async () => {
        const first = deferred()
        const second = deferred()
        storageBackend.setItem
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
        const probe = pendingProbe()

        pluginStorage.setItemSync('pluginA', 'val1')
        pluginStorage.setItemSync('pluginA', 'val2')
        expect(probe()).toBe(true)
        first.resolve()
        await vi.waitFor(() => expect(storageBackend.setItem).toHaveBeenCalledTimes(2))
        expect(probe()).toBe(true)
        second.resolve()
        await vi.waitFor(() => expect(probe()).toBe(false))
    })

})
