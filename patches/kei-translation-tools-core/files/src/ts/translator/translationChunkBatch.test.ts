import { describe, expect, it, vi } from 'vitest'
import { createTranslationChunkBatch } from './translationChunkBatch'

describe('translation chunk batch', () => {
    it('resolves a combined translation back to each queued node', async () => {
        const translate = vi.fn(async () => '하나■둘')
        const batch = createTranslationChunkBatch({
            translate,
            maxCombinedLength: 100,
        })
        const first = batch.enqueue('one')
        const second = batch.enqueue('two')

        await batch.flush()

        await expect(first).resolves.toBe('하나')
        await expect(second).resolves.toBe('둘')
        expect(translate).toHaveBeenCalledOnce()
    })

    it('falls back per item and does not index past resolvers on split mismatch', async () => {
        const translate = vi.fn(async (text: string) => {
            if (text.includes('■')) {
                return 'delimiter■inside■translation'
            }
            return `translated:${text}`
        })
        const batch = createTranslationChunkBatch({ translate })
        const first = batch.enqueue('one')
        const second = batch.enqueue('two')

        await batch.flush()

        await expect(first).resolves.toBe('translated:one')
        await expect(second).resolves.toBe('translated:two')
        expect(translate).toHaveBeenCalledTimes(3)
    })

    it('rejects every queued node and flush when translation is cancelled', async () => {
        const abort = new Error('cancelled')
        abort.name = 'AbortError'
        const batch = createTranslationChunkBatch({
            translate: vi.fn(async () => {
                throw abort
            }),
        })
        const first = batch.enqueue('one')
        const second = batch.enqueue('two')
        void first.catch(() => undefined)
        void second.catch(() => undefined)

        await expect(batch.flush()).rejects.toBe(abort)
        await expect(first).rejects.toBe(abort)
        await expect(second).rejects.toBe(abort)
    })

    it('starts a full batch before assigning the threshold-crossing item', async () => {
        const calls: string[] = []
        const batch = createTranslationChunkBatch({
            maxCombinedLength: 5,
            translate: vi.fn(async (text: string) => {
                calls.push(text)
                return `translated:${text}`
            }),
        })
        const first = batch.enqueue('1234')
        const second = batch.enqueue('56')

        await batch.flush()

        await expect(first).resolves.toBe('translated:1234')
        await expect(second).resolves.toBe('translated:56')
        expect(calls).toEqual(['1234', '56'])
    })

    it('includes the joiner when enforcing the combined-length boundary', async () => {
        const calls: string[] = []
        const batch = createTranslationChunkBatch({
            maxCombinedLength: 8,
            joiner: '---',
            splitMarker: '---',
            translate: vi.fn(async (text: string) => {
                calls.push(text)
                return `translated:${text}`
            }),
        })
        const first = batch.enqueue('1234')
        const second = batch.enqueue('5')

        await batch.flush()

        await expect(first).resolves.toBe('translated:1234')
        await expect(second).resolves.toBe('translated:5')
        expect(calls).toEqual(['1234', '5'])
    })
})
