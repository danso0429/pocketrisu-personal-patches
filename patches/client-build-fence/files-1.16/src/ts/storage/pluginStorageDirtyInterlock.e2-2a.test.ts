import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    handleClientUpgradeRequired,
    hasUnsafeClientBuildState,
    resetClientBuildHandshakeForTests,
    setClientBuildDirtyStateProbe,
} from './clientBuildHandshake'

describe('[E2-2a] Rebase the client build fence onto PocketRisu 1.16.1', () => {
    const reload = vi.fn()

    beforeEach(() => {
        resetClientBuildHandshakeForTests()
        reload.mockReset()
        vi.stubGlobal('location', { reload })
        document.body.innerHTML = '<div id="app"><textarea>draft</textarea></div>'
    })

    afterEach(() => {
        resetClientBuildHandshakeForTests()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    it('[new] plugin persistence dirty state blocks 426 reload until the queue is clean', () => {
        const source = readFileSync(path.join(process.cwd(), 'src/ts/globalApi.svelte.ts'), 'utf8')
        expect(source).toMatch(/setClientBuildDirtyStateProbe\([\s\S]*pluginStorage/i)

        let pluginWritePending = true
        setClientBuildDirtyStateProbe(() => pluginWritePending)

        expect(hasUnsafeClientBuildState()).toBe(true)
        expect(handleClientUpgradeRequired({ version: '1.16.1', stamp: 'build-1162' })).toBe('recovery')
        expect(reload).not.toHaveBeenCalled()

        pluginWritePending = false
        expect(hasUnsafeClientBuildState()).toBe(false)
        expect(handleClientUpgradeRequired({ version: '1.16.1', stamp: 'build-1162' })).toBe('reload')
        expect(reload).toHaveBeenCalledOnce()
    })
})
import { readFileSync } from 'node:fs'
import path from 'node:path'
