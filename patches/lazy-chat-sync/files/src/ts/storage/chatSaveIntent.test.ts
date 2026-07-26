import { describe, expect, it } from 'vitest'
import { classifyChatSaveIntent } from './chatSaveIntent'

describe('chat save intent classification', () => {
    const baseline = {
        characters: [{
            chaId: 'char-1',
            chats: [
                { id: 'chat-existing', _stub: true },
                { id: 'chat-shifted', _stub: true },
            ],
        }],
    }

    it('classifies an ID absent from the last confirmed server DB as create', () => {
        expect(classifyChatSaveIntent(baseline, 'char-1', 'chat-new')).toBe('create')
    })

    it('classifies a confirmed ID as update regardless of its current index', () => {
        expect(classifyChatSaveIntent(baseline, 'char-1', 'chat-shifted')).toBe('update')
    })

    it('does not treat a different character identity as the same chat', () => {
        expect(classifyChatSaveIntent(baseline, 'char-other', 'chat-existing')).toBe('create')
    })

    it('fails closed to update when no valid confirmed baseline exists', () => {
        expect(classifyChatSaveIntent(null, 'char-1', 'chat-new')).toBe('update')
        expect(classifyChatSaveIntent({ characters: undefined }, 'char-1', 'chat-new'))
            .toBe('update')
    })
})
