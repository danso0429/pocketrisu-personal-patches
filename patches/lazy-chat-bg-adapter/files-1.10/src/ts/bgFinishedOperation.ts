import { serverChatCommitReceipt } from './bgServerCommitHydration'

// A server-owned operation that ended with a final error and no answer has nothing left to
// commit. Retaining it as an unconfirmed commit would warn on every launch without progress.
export function isFinishedServerFailure(data: unknown, baselineMsgs: number): boolean {
    if (!data || typeof data !== 'object') return false
    const result = data as any
    if (result.final !== true) return false
    if (result.kind !== 'terminal-error' && result.outcome !== 'error') return false
    if (serverChatCommitReceipt(result)) return false
    const messages = result.chat && Array.isArray(result.chat.message)
        ? result.chat.message.length : -1
    return !result.chat || messages <= baselineMsgs
}

const FAILURE_SUMMARY_MAX = 200

export function finishedServerFailureNotice(data: unknown): string {
    const error = data && typeof data === 'object' ? (data as any).error : undefined
    // Slice by code point so a surrogate pair at the boundary is not split into a broken glyph.
    // Twice the limit in UTF-16 units always contains the first FAILURE_SUMMARY_MAX code points,
    // so an unbounded server error string is never expanded in full.
    const summary = typeof error === 'string'
        ? Array.from(error.trim().slice(0, FAILURE_SUMMARY_MAX * 2))
            .slice(0, FAILURE_SUMMARY_MAX).join('')
        : ''
    return summary
        ? `백그라운드 생성이 답변 없이 끝났어요 (${summary}). 해당 채팅에서 다시 보내주세요.`
        : '백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.'
}

export const COMMITTED_RESULT_KEPT_NOTICE = '답변은 서버 채팅에 저장돼 있어요. 채팅을 다시 열면 보여요.'

// These reasons cannot change while the current adoption rule and receipt stay the same.
const PERMANENT_ADOPTION_REASONS = new Set([
    'local-revision-conflict',
    'projection-invalid',
    'commit-receipt-invalid',
])
export const PERMANENT_ADOPTION_ATTEMPT_LIMIT = 3

// Records one non-hydrated attempt for an operation and decides whether to keep retrying.
// Only consecutive permanent reasons count; any other reason keeps the existing retry and
// deadline behavior and restarts the count.
export function recordCommittedAdoptionAttempt(
    attempts: Map<string, number>,
    operationId: string,
    reason: unknown,
): 'retry' | 'stop' {
    if (typeof reason !== 'string' || !PERMANENT_ADOPTION_REASONS.has(reason)) {
        attempts.delete(operationId)
        return 'retry'
    }
    const count = (attempts.get(operationId) || 0) + 1
    if (count >= PERMANENT_ADOPTION_ATTEMPT_LIMIT) {
        attempts.delete(operationId)
        return 'stop'
    }
    attempts.set(operationId, count)
    return 'retry'
}
