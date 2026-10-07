import { describe, expect, it } from 'vitest'
import {
    COMMITTED_RESULT_KEPT_NOTICE,
    PERMANENT_ADOPTION_ATTEMPT_LIMIT,
    finishedServerFailureNotice,
    isFinishedServerFailure,
    recordCommittedAdoptionAttempt,
} from './bgFinishedOperation'

function receipt() {
    return {
        contractVersion: 'bg_server_chat_commit.v1',
        commitReceiptId: 'commit-receipt-1',
        operationId: 'operation-finished-1',
        resultId: 'result-finished-1',
        publishSeq: 2,
        requestedCharId: 'char-1',
        requestedChatId: 'chat-1',
        storedChatId: 'chat-1',
        baseChatRevision: 'base-revision',
        storedRevision: 'stored-revision',
        storageDisposition: 'original',
        chatCommitted: true,
        finalContentHash: 'stored-revision',
        effects: { chat: { status: 'committed' }, metadata: { status: 'committed' } },
    }
}

function terminalError(overrides: Record<string, unknown> = {}) {
    return {
        found: true,
        operationId: 'operation-finished-1',
        resultId: 'result-finished-1',
        kind: 'terminal-error',
        outcome: 'error',
        final: true,
        chat: null,
        error: 'The operation was aborted due to timeout',
        serverChatCommitVersion: 1,
        serverChatCommit: null,
        ...overrides,
    }
}

const messages = (count: number) => ({ message: Array.from({ length: count }, (_, i) => ({ chatId: `m${i}` })) })

describe('finished server failure classification', () => {
    it('uses the versioned server answer identity result instead of total message count', () => {
        expect(isFinishedServerFailure(terminalError({
            anchorResultVersion: 1, hasGeneratedAnswer: false, chat: messages(9),
        }), 4)).toBe(true)
        expect(isFinishedServerFailure(terminalError({
            anchorResultVersion: 1, hasGeneratedAnswer: true, chat: messages(2),
        }), 4)).toBe(false)
        expect(isFinishedServerFailure(terminalError({
            anchorResultVersion: 1, chat: null,
        }), 4)).toBe(false)
    })

    it('closes a final error without a chat payload', () => {
        expect(isFinishedServerFailure(terminalError(), 4)).toBe(true)
        expect(isFinishedServerFailure(terminalError({ chat: undefined }), 4)).toBe(true)
    })

    it('accepts the outcome field when the kind is absent', () => {
        expect(isFinishedServerFailure(terminalError({ kind: undefined }), 4)).toBe(true)
    })

    it('closes a final error whose chat has no message beyond the delegation baseline', () => {
        expect(isFinishedServerFailure(terminalError({ chat: messages(4) }), 4)).toBe(true)
        expect(isFinishedServerFailure(terminalError({ chat: messages(3) }), 4)).toBe(true)
        expect(isFinishedServerFailure(terminalError({ chat: {} }), 4)).toBe(true)
    })

    it('retains an error that carries an answer', () => {
        expect(isFinishedServerFailure(terminalError({ chat: messages(5) }), 4)).toBe(false)
    })

    it('retains a result with a valid commit receipt', () => {
        expect(isFinishedServerFailure(terminalError({
            serverChatCommit: { status: 'committed', receipt: receipt() },
        }), 4)).toBe(false)
    })

    it('retains a non-final or non-error result', () => {
        expect(isFinishedServerFailure(terminalError({ final: false }), 4)).toBe(false)
        expect(isFinishedServerFailure(terminalError({ final: undefined }), 4)).toBe(false)
        expect(isFinishedServerFailure(terminalError({ kind: 'intermediate', outcome: undefined, final: false }), 4)).toBe(false)
        expect(isFinishedServerFailure(terminalError({ kind: 'terminal-success', outcome: 'success' }), 4)).toBe(false)
        expect(isFinishedServerFailure(terminalError({ kind: 'terminal-partial', outcome: 'partial' }), 4)).toBe(false)
    })

    it('rejects missing data', () => {
        expect(isFinishedServerFailure(null, 0)).toBe(false)
        expect(isFinishedServerFailure(undefined, 0)).toBe(false)
        expect(isFinishedServerFailure('terminal-error', 0)).toBe(false)
    })
})

describe('finished server failure notice', () => {
    it('explains a lost plugin execution context without inviting duplicate submission', () => {
        const result = terminalError({ serverChatCommit: {
            status: 'conflict', reason: 'plugin_execution_context_unavailable',
        } })
        expect(isFinishedServerFailure(result, 4)).toBe(true)
        const notice = finishedServerFailureNotice(result)
        expect(notice).toContain('입력은 서버에 보존')
        expect(notice).toContain('채팅 반영은 복구 대기 중일 수')
        expect(notice).toContain('플러그인 실행을 중복하지 않도록 자동 재시도를 멈췄')
        expect(notice).toContain('이미 실행된 외부 작업은 되돌리지 않았')
        expect(notice).not.toContain('다시 보내')
        expect(notice).not.toContain('새로 보내')
    })

    it.each([
        ['chat_deleted', '채팅이 삭제되어 생성을 시작하지 않았어요.'],
        ['unknown_suffix', '입력 뒤에 다른 메시지가 추가되어 생성을 시작하지 않았어요.'],
        ['latest_settings_require_client', '설정이 바뀌어 서버에서 생성을 시작할 수 없어요. 저장된 입력은 유지했어요.'],
    ])('explains the pre-provider conflict %s', (reason, text) => {
        const notice = finishedServerFailureNotice(terminalError({ serverChatCommit: { status: 'conflict', reason } }))
        expect(notice).toContain(text)
        expect(notice).not.toContain('서버 결과는 삭제하지 않았')
    })

    it.each(['base_revision_changed', '__proto__', 1, null])('keeps the bounded fallback for an unmapped reason %s', reason => {
        expect(finishedServerFailureNotice(terminalError({ serverChatCommit: { status: 'conflict', reason } })))
            .toBe(finishedServerFailureNotice(terminalError()))
    })

    it('includes a bounded server error summary', () => {
        expect(finishedServerFailureNotice(terminalError())).toContain('The operation was aborted due to timeout')
        const long = finishedServerFailureNotice(terminalError({ error: 'x'.repeat(500) }))
        expect(long).toContain('x'.repeat(200))
        expect(long).not.toContain('x'.repeat(201))
    })

    it('does not split a surrogate pair at the summary boundary', () => {
        const notice = finishedServerFailureNotice(terminalError({ error: 'x'.repeat(199) + '😀' + 'y' }))
        expect(notice).toContain('x'.repeat(199) + '😀)')
        expect(notice).not.toContain('y')
        expect(notice).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
        const astral = finishedServerFailureNotice(terminalError({ error: '😀'.repeat(300) }))
        expect(astral).toContain('(' + '😀'.repeat(200) + ')')
        expect(astral).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    })

    it('omits an absent summary', () => {
        expect(finishedServerFailureNotice(terminalError({ error: undefined })))
            .toBe('백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.')
        expect(finishedServerFailureNotice(terminalError({ error: '   ' })))
            .toBe('백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.')
    })

    it('keeps the committed-result notice text', () => {
        expect(COMMITTED_RESULT_KEPT_NOTICE).toBe('답변은 서버 채팅에 저장돼 있어요. 채팅을 다시 열면 보여요.')
    })
})

describe('committed adoption attempts', () => {
    it.each(['local-revision-conflict', 'projection-invalid', 'commit-receipt-invalid'])(
        'stops on the third consecutive permanent reason: %s',
        reason => {
            const attempts = new Map<string, number>()
            expect(PERMANENT_ADOPTION_ATTEMPT_LIMIT).toBe(3)
            expect(recordCommittedAdoptionAttempt(attempts, 'op-1', reason)).toBe('retry')
            expect(recordCommittedAdoptionAttempt(attempts, 'op-1', reason)).toBe('retry')
            expect(recordCommittedAdoptionAttempt(attempts, 'op-1', reason)).toBe('stop')
            expect(attempts.has('op-1')).toBe(false)
        },
    )

    it.each(['projection-unavailable', 'chat-readback-failed', 'server-revision-mismatch', undefined])(
        'keeps retrying a non-permanent reason: %s',
        reason => {
            const attempts = new Map<string, number>()
            for (let i = 0; i < 10; i += 1) {
                expect(recordCommittedAdoptionAttempt(attempts, 'op-1', reason)).toBe('retry')
            }
            expect(attempts.size).toBe(0)
        },
    )

    it('restarts the count after a non-permanent reason', () => {
        const attempts = new Map<string, number>()
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'projection-unavailable')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('stop')
    })

    it('counts each operation separately', () => {
        const attempts = new Map<string, number>()
        recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')
        recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-2', 'local-revision-conflict')).toBe('retry')
        expect(recordCommittedAdoptionAttempt(attempts, 'op-1', 'local-revision-conflict')).toBe('stop')
    })
})
