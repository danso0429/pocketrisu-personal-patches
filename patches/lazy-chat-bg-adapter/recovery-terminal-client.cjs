'use strict';

module.exports = `
const parkedRecoveries = new Set<string>()
const recoveryNotices = new Map<string, string>()
const RECOVERY_UNVERIFIED_NOTICE = '이 기기에서 서버 결과를 확인하지 못했어요. 작업 기록을 보존했으며 연결이나 채팅 상태가 바뀌면 다시 확인해요. 재전송하지 말고 채팅을 확인해 주세요.'
const RECOVERY_CONFLICT_NOTICE = '서버에 저장된 답변과 현재 편집 내용을 함께 확인해야 해요. 현재 내용과 서버 결과를 보존하고 복구를 보류했어요.'
const RECOVERY_SUPERSEDED_NOTICE = '답변 저장 이후 대화가 변경됐어요. 현재 대화를 유지하고 이전 답변을 다시 덮어쓰지 않았어요.'

function trackParkedRecovery(operationId: string): void {
    parkedRecoveries.add(operationId)
    while (parkedRecoveries.size > 128) parkedRecoveries.delete(parkedRecoveries.values().next().value!)
}

function rememberRecoveryOutcome(operationId: string, data: any, outcome: string, notice?: string, asError = false): void {
    if (outcome !== 'superseded-current' && outcome !== 'target-deleted') trackParkedRecovery(operationId)
    // The marker already identifies the operation. Do not alternate notices
    // when the same result changes between conflict and unavailable evidence.
    const noticeKey = outcome === 'superseded-current' ? 'superseded'
        : outcome === 'terminal-error' ? 'terminal-error' : 'verification'
    let alreadyNotified = recoveryNotices.get(operationId) === noticeKey
    try {
        const marker = readPendingMarkers(localStorage).find(m => m.operationId === operationId)
        const input = readServerInputMarkers(localStorage).find(m => m.operationId === operationId)
        alreadyNotified ||= marker?.recoveryNoticeKey === noticeKey || input?.recoveryNoticeKey === noticeKey
        if (marker) updatePendingMarker(localStorage, operationId, value => ({
            ...value, recoveryOutcome: outcome, recoveryNoticeKey: notice ? noticeKey : value.recoveryNoticeKey,
        }))
        if (input) writeServerInputMarker(localStorage, { ...input,
            recoveryOutcome: outcome, recoveryNoticeKey: notice ? noticeKey : input.recoveryNoticeKey,
        })
    } catch { /* Page-local deduplication remains available if storage fails. */ }
    if (!notice || alreadyNotified) return
    recoveryNotices.set(operationId, noticeKey)
    while (recoveryNotices.size > 128) recoveryNotices.delete(recoveryNotices.keys().next().value!)
    try {
        if (asError) alertError(notice)
        else notifyInfo(notice, { source: 'bg-recovery' })
    } catch { /* best-effort notice */ }
}

function parkUnverifiedRecovery(operationId: string | null, mode: 'watch' | 'boot'): void {
    if (operationId) {
        trackParkedRecovery(operationId)
        rememberRecoveryOutcome(operationId, null, 'unverified-parked', RECOVERY_UNVERIFIED_NOTICE)
    }
    if (mode === 'watch') stopWatch({ preservePendingMarker: true })
    else deferBootRecovery(operationId)
}

function settleCommittedRecovery(
    operationId: string, data: any, reason: string,
    mode: 'watch' | 'boot' | 'input', deadline: number,
): boolean {
    const decision = classifyCommittedRecoveryReason(reason)
    if (decision === 'stale') return false
    if (!isTerminalCommittedEvidence(data)) return false
    const retire = decision === 'retire'
    const transient = decision === 'retry'
    if (!retire && transient && Date.now() <= deadline) return false
    if (retire) {
        if (reason === 'superseded-current') rememberRecoveryOutcome(operationId, data, reason, RECOVERY_SUPERSEDED_NOTICE)
        // These are local retirements, never delivery ACKs. The server retains
        // the possibly-last answer under its existing retention authority.
        clearServerInputMarker(localStorage, operationId)
        parkedRecoveries.delete(operationId)
        if (mode === 'watch') stopWatch()
        else if (mode === 'boot') finishBootRecovery(operationId)
        else clearPendingMarker(operationId)
        return true
    }
    trackParkedRecovery(operationId)
    const conflict = reason === 'local-revision-conflict'
    rememberRecoveryOutcome(operationId, data, conflict ? 'conflict-parked' : 'unverified-parked',
        conflict ? RECOVERY_CONFLICT_NOTICE : RECOVERY_UNVERIFIED_NOTICE)
    if (mode === 'watch') stopWatch({ preservePendingMarker: true })
    else if (mode === 'boot') deferBootRecovery(operationId)
    return true
}

let recoveryWakeQueued = false
let recoveryWakePending = false
const legacyRecoverySaves = new Map<string, number>()
const recoveryWakeExclusions = new Set<string>()
function beginLegacyRecoverySave(operationId: string | null): () => void {
    const key = operationId || ''
    legacyRecoverySaves.set(key, (legacyRecoverySaves.get(key) || 0) + 1)
    return () => {
        const remaining = (legacyRecoverySaves.get(key) || 1) - 1
        if (remaining > 0) legacyRecoverySaves.set(key, remaining)
        else legacyRecoverySaves.delete(key)
    }
}

function wakeParkedRecoveries(): void {
    if (recoveryWakeQueued || !isServerOrchestrationEnabled()) return
    recoveryWakeQueued = true
    setTimeout(() => {
        recoveryWakeQueued = false
        if (watchKey || bootRecoveryActive || get(doingChat)) { recoveryWakePending = true; return }
        recoveryWakePending = false
        const characters = (DBState as any)?.db?.characters
        const loadedCharacter = (charId: string) => Array.isArray(characters)
            && characters.some((character: any) => character?.chaId === charId)
        let candidates: OrchestrationPendingMarker[] = []
        try { candidates = readPendingMarkers(localStorage).filter(marker => !recoveryWakeExclusions.has(marker.operationId || '')
            && (marker.recoveryOutcome
            || (marker.operationId && parkedRecoveries.has(marker.operationId)))
            && loadedCharacter(marker.charId)) }
        catch { /* No evidence can be read; keep current local state. */ }
        for (const candidate of candidates) {
            if (!bootRecoveryQueue.some(queued => candidate.operationId
                ? queued.operationId === candidate.operationId
                : queued.operationId === null && queued.charId === candidate.charId && queued.chatId === candidate.chatId)) {
                // In-memory root/chat receipts can precede a failed legacy
                // durable save. Only cold reload may treat them as disk proof.
                bootRecoveryQueue.push({ ...candidate, verifyLegacySave: true })
            }
            if (candidate.operationId) parkedRecoveries.delete(candidate.operationId)
        }
        // Raw-input markers use their existing UI reconciler, not the classic
        // boot queue. Release its page-local park on the same external event.
        try {
            for (const marker of readServerInputMarkers(localStorage)) {
                if (loadedCharacter(marker.charId) && !recoveryWakeExclusions.has(marker.operationId)) {
                    parkedRecoveries.delete(marker.operationId)
                }
            }
        } catch { /* Retain memory-only parks when storage cannot be read. */ }
        recoveryWakeExclusions.clear()
        scheduleNextBootRecovery()
        try { window.dispatchEvent(new Event('bg-server-input-updated')) } catch { /* server environment */ }
    }, 0)
}

try {
    doingChat.subscribe(busy => { if (!busy && recoveryWakePending) wakeParkedRecoveries() })
    if (typeof window !== 'undefined') {
        const externalWake = () => { recoveryWakeExclusions.clear(); wakeParkedRecoveries() }
        window.addEventListener('online', externalWake)
        window.addEventListener('bg-recovery-evidence', () => {
            for (const operationId of legacyRecoverySaves.keys()) recoveryWakeExclusions.add(operationId)
            wakeParkedRecoveries()
        })
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') externalWake()
        })
    }
} catch { /* Server bundle has no browser lifecycle. */ }
`;
