import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SettingsRoute } from './routing'

describe('[E2-4d] Rebase personal-settings onto PocketRisu 1.16.1', () => {
    it('[unchanged] keeps the native Long Term Memory route at 24 and rendering MemorySettings', () => {
        const settings = fs.readFileSync('src/lib/Setting/Settings.svelte', 'utf8')
        expect(SettingsRoute.LongTermMemory).toBe(24)
        expect(settings).toMatch(/\$SettingsMenuIndex === 24[\s\S]{0,240}<MemorySettings\s*\/>/)
    })

    it('[new] assigns Personal route 90 and renders it independently of route 24', () => {
        expect(
            'Personal' in SettingsRoute,
            'SettingsRoute exports the rebased Personal route',
        ).toBe(true)
        const personal = (SettingsRoute as Record<string, number>).Personal
        expect(personal).toBe(90)

        const settings = fs.readFileSync('src/lib/Setting/Settings.svelte', 'utf8')
        expect(settings).toMatch(/\$SettingsMenuIndex === 90[\s\S]{0,240}<PersonalSettings\s*\/>/)
        expect(settings).toMatch(/onclick=\{\(\) => \{[\s\S]{0,120}\$SettingsMenuIndex = 90/)
    })

    it('[new] attaches stable label and description ids to native SettingRowLayout rows', () => {
        const row = fs.readFileSync('src/lib/Setting/Wrappers/SettingRowLayout.svelte', 'utf8')
        expect(row).toContain('id={`setting-${item.id}-label`}')
        expect(row).toContain('id={`setting-${item.id}-description`}')
    })
})
