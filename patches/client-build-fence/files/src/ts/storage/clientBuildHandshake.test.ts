import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    clientBuildStamp,
    handleAdvertisedClientBuild,
    handleClientBuildResponse,
    handleClientUpgradeRequired,
    hasUnsafeClientBuildState,
    resetClientBuildHandshakeForTests,
    setClientBuildComposerDirty,
    setClientBuildDirtyStateProbe,
    setClientBuildDraftUnsafe,
    setClientBuildGenerationActive,
} from './clientBuildHandshake'

describe('client build fence recovery', () => {
    const reload = vi.fn()
    const expectedBuild = { version: '1.9.0', stamp: '1.9.0-new-build' }

    beforeEach(() => {
        resetClientBuildHandshakeForTests()
        reload.mockReset()
        vi.stubGlobal('location', { reload })
        document.body.innerHTML = '<div id="app"><textarea>unsaved</textarea><button>mutate</button></div>'
    })

    afterEach(() => {
        resetClientBuildHandshakeForTests()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    it('reloads once when every dirty source is clean', async () => {
        const response = new Response(JSON.stringify({
            code: 'CLIENT_UPGRADE_REQUIRED',
            expectedBuild,
        }), {
            status: 426,
            headers: { 'content-type': 'application/json' },
        })

        await handleClientBuildResponse(response)

        expect(reload).toHaveBeenCalledOnce()
        expect(document.getElementById('risu-client-build-banner')).toBeNull()
    })

    it('reconciles the server-advertised build during session bootstrap', () => {
        expect(handleAdvertisedClientBuild({
            version: '1.9.0',
            stamp: clientBuildStamp,
        })).toBe('match')
        expect(reload).not.toHaveBeenCalled()

        expect(handleAdvertisedClientBuild(expectedBuild)).toBe('reload')
        expect(reload).toHaveBeenCalledOnce()
        expect(handleAdvertisedClientBuild(null)).toBe('ignored')
    })

    it.each([
        ['database', () => setClientBuildDirtyStateProbe(() => true)],
        ['composer', () => setClientBuildComposerDirty(true)],
        ['draft queue', () => setClientBuildDraftUnsafe(true)],
        ['generation', () => setClientBuildGenerationActive(true)],
    ])('freezes instead of reloading for dirty %s state', (_label, dirty) => {
        dirty()
        expect(hasUnsafeClientBuildState()).toBe(true)
        expect(handleClientUpgradeRequired(expectedBuild)).toBe('recovery')

        expect(reload).not.toHaveBeenCalled()
        expect((document.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBe(true)
        expect(document.getElementById('risu-client-build-banner')?.textContent)
            .toContain('Server updated')
    })

    it('blocks a reload loop when an old cached bundle survives one reload', () => {
        expect(handleClientUpgradeRequired(expectedBuild)).toBe('reload')
        resetClientBuildHandshakeForTests({ preserveReloadGuard: true })
        expect(handleClientUpgradeRequired(expectedBuild)).toBe('blocked')

        expect(reload).toHaveBeenCalledOnce()
        expect(document.getElementById('risu-client-build-banner')).not.toBeNull()
        expect(clientBuildStamp).toBeTruthy()
    })

    it('freezes body portals without looping and exposes only the composer recovery text', async () => {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="portal">
                <div id="editor" contenteditable="true">stored profile text</div>
                <button id="portal-action">mutate</button>
            </div>
        `)
        const action = vi.fn()
        document.getElementById('portal-action')?.addEventListener('pointerdown', action)
        setClientBuildComposerDirty(true, 'unsent composer only')

        expect(handleClientUpgradeRequired(expectedBuild)).toBe('recovery')
        await vi.waitFor(() => {
            expect(document.getElementById('editor')?.getAttribute('contenteditable')).toBe('false')
        })
        await Promise.resolve()
        await Promise.resolve()

        document.getElementById('portal-action')?.dispatchEvent(new Event('pointerdown', {
            bubbles: true,
            cancelable: true,
        }))
        expect(action).not.toHaveBeenCalled()
        const recovery = document.querySelector<HTMLTextAreaElement>(
            '#risu-client-build-banner textarea[aria-label="Unsaved text recovery"]',
        )
        expect(recovery?.value).toBe('unsent composer only')
        expect(recovery?.value).not.toContain('stored profile text')
    })

    it('fails closed when the upgrade payload is malformed', () => {
        expect(handleClientUpgradeRequired({ version: '1.9.0' })).toBe('blocked')
        expect(reload).not.toHaveBeenCalled()
        expect(document.getElementById('risu-client-build-banner')).not.toBeNull()
    })
})
