import { serverChatCommitReceipt } from './bgServerCommitHydration'

export function anchoredCommitConflictNotice(data: unknown): string | null {
    const result = data as any
    if (!result || result.final !== true
        || !['terminal-success', 'terminal-partial'].includes(result.kind)) return null
    if (result.serverChatCommit?.status === 'failed'
        && result.serverChatCommit.reason === 'generated_identity_invalid') {
        return '메시지의 식별정보를 확인하지 못해 답변을 채팅에 넣지 못했어요. 자동 재시도는 멈췄고 서버 결과는 삭제하지 않았어요. 현재 화면에는 해당 결과를 여는 기능이 없어요.'
    }
    if (result.serverChatCommit?.status !== 'conflict') return null
    const notices: Record<string, string> = {
        input_deleted: '입력 메시지가 삭제되어 답변을 원래 채팅에 넣지 못했어요.',
        chat_deleted: '채팅이 삭제되어 답변을 저장하지 못했어요.',
        unknown_suffix: '입력 뒤에 다른 메시지가 추가되어 답변을 넣을 위치를 확정하지 못했어요.',
    }
    const reason = result.serverChatCommit.reason
    if (typeof reason !== 'string' || !Object.hasOwn(notices, reason)) return null
    return notices[reason] + ' 자동 재시도는 멈췄고 서버 결과는 삭제하지 않았어요. 현재 화면에는 해당 결과를 여는 기능이 없어요.'
}

// A server-owned operation that ended with a final error and no answer has nothing left to
// commit. Retaining it as an unconfirmed commit would warn on every launch without progress.
export function isFinishedServerFailure(data: unknown, baselineMsgs: number): boolean {
    if (!data || typeof data !== 'object') return false
    const result = data as any
    if (result.final !== true) return false
    if (result.kind !== 'terminal-error' && result.outcome !== 'error') return false
    if (serverChatCommitReceipt(result)) return false
    if (result.anchorResultVersion === 1) return result.hasGeneratedAnswer === false
    const messages = result.chat && Array.isArray(result.chat.message)
        ? result.chat.message.length : -1
    return !result.chat || messages <= baselineMsgs
}

const FAILURE_SUMMARY_MAX = 200

export function finishedServerFailureNotice(data: unknown): string {
    const result = data as any
    if (result?.kind === 'terminal-error' && result.serverChatCommit?.status === 'conflict') {
        const notices: Record<string, string> = {
            input_deleted: '입력 메시지가 삭제되어 생성을 시작하지 않았어요.',
            chat_deleted: '채팅이 삭제되어 생성을 시작하지 않았어요.',
            unknown_suffix: '입력 뒤에 다른 메시지가 추가되어 생성을 시작하지 않았어요. 대화 내용은 유지했어요.',
            latest_settings_require_client: '설정이 바뀌어 서버에서 생성을 시작할 수 없어요. 저장된 입력은 유지했어요.',
        }
        const reason = result.serverChatCommit.reason
        if (typeof reason === 'string' && Object.hasOwn(notices, reason)) {
            return notices[reason] + ' 채팅을 확인한 뒤 필요하면 새로 보내주세요.'
        }
    }
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
