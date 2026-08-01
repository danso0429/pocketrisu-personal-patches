import { describe, expect, test } from 'vitest'
import { orchestrationRetentionFailureMessage } from './bgOrchestrationRetentionState'

describe('orchestration retention terminal state', () => {
    test('maps expiration and capacity eviction to explicit paid-result messages', () => {
        expect(orchestrationRetentionFailureMessage('result-expired')).toContain('48시간')
        expect(orchestrationRetentionFailureMessage('result-evicted')).toContain('보관 한도')
    })

    test('does not claim ownership of existing lifecycle states', () => {
        for (const state of [
            'queued', 'running', 'delivery-failed', 'delivered', 'cancelled', null, undefined,
        ]) {
            expect(orchestrationRetentionFailureMessage(state)).toBeNull()
        }
    })
})
