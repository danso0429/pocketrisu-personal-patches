export type OrchestrationRetentionTerminalState = 'result-expired' | 'result-evicted'

// A durable server tombstone is authoritative: the paid result existed, but
// its bounded retention window or storage budget ended before exact client ACK.
// Returning a message from one pure boundary keeps live polling and cold-boot
// recovery on the same terminal policy without creating another lifecycle.
export function orchestrationRetentionFailureMessage(state: unknown): string | null {
    if (state === 'result-expired') {
        return '완료된 백그라운드 결과가 48시간 보존 기간을 지나 정리됐어요. 다시 보내면 새 비용이 들 수 있어요.'
    }
    if (state === 'result-evicted') {
        return '완료된 백그라운드 결과가 서버 보관 한도 때문에 정리됐어요. 다시 보내면 새 비용이 들 수 있어요.'
    }
    return null
}
