import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const { completeOpenCodeSessionHeaders: complete } = createRequire(import.meta.url)('./bgOpenCodeHeaders.cjs')
const endpoint = 'https://opencode.ai/zen/go/v1/chat/completions'
const context = { charId: 'character-one', chatId: 'chat-one', operationId: 'operation-one' }

describe('BG OpenCode conversation headers', () => {
    it('uses one opaque session for a conversation across operations and routes', () => {
        const first = complete(endpoint, {}, context)
        const next = complete('https://opencode.ai/inference/go/v1/chat/completions', {}, { ...context, operationId: 'operation-two' })
        expect(first.headers['x-opencode-session']).toMatch(/^[a-f0-9]{64}$/)
        expect(next.headers['x-opencode-session']).toBe(first.headers['x-opencode-session'])
        expect(first.headers['User-Agent']).toBe('PocketRisu-BGPluginHost/1')
        for (const ids of [{ ...context, chatId: 'chat-two' }, { ...context, charId: 'character-two' }]) {
            expect(complete(endpoint, {}, ids).headers['x-opencode-session']).not.toBe(first.headers['x-opencode-session'])
        }
        expect(first.headers['x-opencode-session']).not.toContain(context.chatId)
    })
    it('does not modify caller options, signal, body, credentials or secret references', () => {
        const reference = { secretHeader: 'Authorization' }
        const signal = new AbortController().signal
        const headers = Object.freeze({ Authorization: reference, 'Content-Type': 'application/json' })
        const options = Object.freeze({ method: 'post', headers, body: 'original body', signal, requestTimeoutMs: 5000 })
        const result = complete(endpoint, options, context)
        expect(result).not.toBe(options)
        expect(result.headers).not.toBe(headers)
        expect(result.headers.Authorization).toBe(reference)
        expect(result.signal).toBe(signal)
        expect(result.body).toBe(options.body)
        expect(result.requestTimeoutMs).toBe(5000)
        expect(result.method).toBe('post')
        expect(Object.keys(headers)).toEqual(['Authorization', 'Content-Type'])
    })
    it.each(['', undefined, 'explicit-session'])('preserves explicit mixed-case session overrides: %s', value => {
        const options = { headers: { 'X-OpenCode-Session': value, 'USER-AGENT': 'My-Client/1' } }
        expect(complete(endpoint, options, context)).toBe(options)
        expect(options.headers['X-OpenCode-Session']).toBe(value)
    })
    it('fills only the absent field', () => {
        const options = { headers: { 'X-OpenCode-Session': 'kept-session' } }
        const result = complete(endpoint, options, context)
        expect(result.headers['X-OpenCode-Session']).toBe('kept-session')
        expect(result.headers).not.toHaveProperty('x-opencode-session')
        expect(result.headers['User-Agent']).toBe('PocketRisu-BGPluginHost/1')
    })
    it.each([null, undefined, '', 1, 'x'.repeat(256)])('does not manufacture sessions for invalid coordinates: %s', id => {
        const options = { headers: {} }
        expect(complete(endpoint, options, { ...context, chatId: id })).toBe(options)
        expect(complete(endpoint, options, { ...context, charId: id })).toBe(options)
    })
    it.each([
        'https://opencode.ai/zen/v1/chat/completions',
        'https://opencode.ai.example/zen/go/v1/chat/completions',
        'https://sub.opencode.ai/zen/go/v1/chat/completions',
        'https://opencode.ai./zen/go/v1/chat/completions',
        'http://opencode.ai/zen/go/v1/chat/completions',
        'https://opencode.ai:8443/zen/go/v1/chat/completions',
        'https://user@opencode.ai/zen/go/v1/chat/completions',
        'https://opencode.ai/zen/go/../../other',
        'http://localhost:1234/v1/chat/completions',
        'not-a-url',
    ])('leaves other endpoints unchanged: %s', url => {
        const options = { headers: { Authorization: 'kept' } }
        expect(complete(url, options, context)).toBe(options)
    })
    it.each(['GET', 'DELETE', 'PUT'])('leaves non-model request methods unchanged: %s', method => {
        const options = { method, headers: {} }
        expect(complete(endpoint, options, context)).toBe(options)
    })
    it('keeps non-record formats unchanged rather than coercing proxy inputs', () => {
        for (const headers of [new Headers({ Authorization: 'kept' }), [['Authorization', 'kept']], 'invalid', Object.create({ inherited: 'kept' })]) {
            const options = { headers }
            expect(complete(endpoint, options, context)).toBe(options)
        }
        const headers = Object.assign(Object.create(null), { Authorization: 'kept' })
        expect(complete(endpoint, { headers }, context).headers.Authorization).toBe('kept')
    })
    it('separates coordinate tuples without delimiter collisions', () => {
        expect(complete(endpoint, {}, { charId: 'ab', chatId: 'c' }).headers['x-opencode-session'])
            .not.toBe(complete(endpoint, {}, { charId: 'a', chatId: 'bc' }).headers['x-opencode-session'])
    })
})
