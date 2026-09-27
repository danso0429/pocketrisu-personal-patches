import { describe, expect, it } from 'vitest'
import { orchestrationStartDiagnostic } from './bgOrchestrationStartDiagnostic'

describe('orchestration start diagnostics', () => {
    it('records the stale-input cause without changing start classification', () => {
        expect(orchestrationStartDiagnostic(409, 'server-chat-commit-input-stale'))
            .toBe('server-chat-commit-input-stale')
        expect(orchestrationStartDiagnostic(503, 'server-chat-commit-base-read-failed'))
            .toBe('server-chat-commit-base-read-failed')
    })
    it.each([null, undefined, {}, 'private body', 'server-chat-commit-input-stale private-id'])
        ('does not echo unrecognized response data: %j', reason => {
            expect(orchestrationStartDiagnostic(409, reason)).toBe('unknown')
        })
    it.each([401, 403])('reports authentication failure without its response body: %i', status => {
        expect(orchestrationStartDiagnostic(status, 'private body')).toBe('authorization-rejected')
    })
})
