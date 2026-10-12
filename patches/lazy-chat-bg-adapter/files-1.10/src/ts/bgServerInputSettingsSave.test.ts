import { expect, it, vi } from 'vitest'
import { BG_DURABLE_SAVE_RETRY, BG_SAVE_MAX_REBASE_ATTEMPTS } from './bgDurableSaveBarrier'
import { saveServerInputSettings } from './bgServerInputSettingsSave'
const retry = () => Object.assign(new Error('persistence retry'), { code: BG_DURABLE_SAVE_RETRY })

it('keeps an already saved root to one attempt', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    await saveServerInputSettings(save, () => true)
    expect(save).toHaveBeenCalledTimes(1)
})

for (const origin of ['confirmed rebase', 'missing payload enlisted']) it(`joins ${origin} retry before admission`, async () => {
    const save = vi.fn().mockRejectedValueOnce(retry()).mockResolvedValue(undefined)
    await saveServerInputSettings(save, () => true)
    expect(save).toHaveBeenCalledTimes(2)
})

it('keeps persistence retries bounded and retains the final failure', async () => {
    const error = retry(), save = vi.fn().mockRejectedValue(error)
    await expect(saveServerInputSettings(save, () => true)).rejects.toBe(error)
    expect(save).toHaveBeenCalledTimes(BG_SAVE_MAX_REBASE_ATTEMPTS)
})

for (const reason of ['unavailable', 'noop', 'manual conflict', 'publication blocked']) it(`never retries ${reason}`, async () => {
    const error = new Error(reason), save = vi.fn().mockRejectedValue(error)
    await expect(saveServerInputSettings(save, () => true)).rejects.toBe(error)
    expect(save).toHaveBeenCalledTimes(1)
})

it('does not retry after selection changes while the previous save is observed', async () => {
    let current = true
    const save = vi.fn().mockImplementation(async () => { current = false; throw retry() })
    await expect(saveServerInputSettings(save, () => current)).rejects.toMatchObject({ code: BG_DURABLE_SAVE_RETRY })
    expect(save).toHaveBeenCalledTimes(1)
    const untouched = vi.fn()
    await expect(saveServerInputSettings(untouched, () => false)).rejects.toThrow('target changed')
    expect(untouched).not.toHaveBeenCalled()
})
