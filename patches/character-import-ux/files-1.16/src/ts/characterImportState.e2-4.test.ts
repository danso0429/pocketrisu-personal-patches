import { describe, expect, test, vi } from 'vitest'
import { importOptional } from './characterImport.e2-4.helpers'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const statePath = './characterImportState'

describe('[E2-4e] Rebase character-import-ux onto PocketRisu 1.16.1', () => {
    test('[new] state API exposes the nine specified public functions with deterministic formatters', async () => {
        const state = await importOptional(statePath)
        expect(state, 'characterImportState.ts exists').toBeDefined()
        if (!state) return

        const names = [
            'beginCharacterImport',
            'beginModuleImport',
            'isImportActive',
            'isCharacterImportActive',
            'allowDuringImport',
            'allowDuringCharacterImport',
            'formatImportProgress',
            'formatCharacterImportProgress',
            'reserveImport',
        ]
        for (const name of names) expect(state[name], `${name} is exported`).toEqual(expect.any(Function))

        expect(state.isImportActive()).toBe(false)
        expect(state.isCharacterImportActive()).toBe(false)
        const generalA = state.formatImportProgress(2, 4)
        const generalB = state.formatImportProgress(2, 4)
        const characterA = state.formatCharacterImportProgress(2, 4)
        const characterB = state.formatCharacterImportProgress(2, 4)
        expect(generalA).toBe(generalB)
        expect(characterA).toBe(characterB)
    })

    test('[new] e1e blocks all six guarded operation classes while an import is reserved', async () => {
        const state = await importOptional(statePath)
        expect(state, 'characterImportState.ts exists').toBeDefined()
        if (!state) return

        const reservation = state.reserveImport()
        expect(reservation, 'the first import reserves the shared lock').toBeTruthy()
        expect(state.isImportActive()).toBe(true)

        const effects = [
            vi.fn(), // local backup restore
            vi.fn(), // save-folder import
            vi.fn(), // old-file cleanup
            vi.fn(), // snapshot restore
            vi.fn(), // server backup restore
            vi.fn(), // self update
        ]
        for (const effect of effects) {
            if (state.allowDuringImport()) effect()
        }
        expect(effects.every((effect) => effect.mock.calls.length === 0)).toBe(true)

        reservation.cancel()

        expect(state.isImportActive()).toBe(false)
        for (const effect of effects) {
            if (state.allowDuringImport()) effect()
        }
        expect(effects.every((effect) => effect.mock.calls.length === 1)).toBe(true)
    })

    test('[new] e1f refuses a second reservation without replacing the first lock', async () => {
        const state = await importOptional(statePath)
        expect(state, 'characterImportState.ts exists').toBeDefined()
        if (!state) return

        const first = state.reserveImport()
        expect(first).toBeTruthy()
        const second = state.reserveImport()
        expect(second).toBeFalsy()
        expect(state.isImportActive()).toBe(true)

        first.cancel()
    })
})
