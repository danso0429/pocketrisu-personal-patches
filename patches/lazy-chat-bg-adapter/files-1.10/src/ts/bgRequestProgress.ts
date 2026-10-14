import { get } from 'svelte/store'
import { DBState } from './stores.svelte'
import { serverChatCommitReceipt } from './bgServerCommitHydration'
import { requestStatuses, startStatus, clearStatus, clearRelayedStatuses, ingestRelayedStatuses,
    type RequestStatusEntry, type RequestPhase, type RelayedStatusSnapshot } from './status/requestStatus'

export type RequestProgressPhase = 'requesting' | 'confirming-admission' | 'admitted' | 'queued'
    | 'preparing' | 'processing' | 'postprocessing' | 'saving' | 'confirming-save'
    | 'loading' | 'stopping' | 'confirming-execution' | 'blocked' | 'done' | 'cancelled' | 'failed'
export interface RequestProgressTarget { operationId: string; charId: string; chatId: string }
const captions: Record<RequestProgressPhase, string> = {
    requesting: '요청 중', 'confirming-admission': '접수 확인 중', admitted: '서버 접수됨', queued: '순서 대기 중',
    preparing: '생성 준비 중', processing: '서버 처리 중', postprocessing: '응답 정리 중',
    saving: '답변 저장 중', 'confirming-save': '저장 확인 중', loading: '답변 불러오는 중',
    stopping: '중지 확인 중', done: '완료', cancelled: '중지됨', failed: '실패',
    'confirming-execution': '처리 상태 확인 중', blocked: '입력 확인 필요',
}
// Presentation tombstones only; match the existing bounded recovery-notice history.
const closed = new Set<string>()
let presentation = 0
const valid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 255
const terminal = (phase: RequestProgressPhase) => ['done', 'cancelled', 'failed', 'blocked'].includes(phase)
function browser() {
    return typeof document !== 'undefined' && !(globalThis as { __bgOrch?: unknown }).__bgOrch
}
function current(operationId: string): RequestStatusEntry | undefined {
    return [...get(requestStatuses).values()].find(entry => entry.pipeline && entry.pipelineOwner === operationId)
}
function closeOwner(operationId: string): void {
    closed.add(operationId)
    while (closed.size > 128) closed.delete(closed.values().next().value!)
    clearRelayedStatuses(operationId)
}
function style(phase: RequestProgressPhase): RequestPhase {
    return phase === 'done' ? 'done' : phase === 'cancelled' ? 'aborted' : phase === 'failed' || phase === 'blocked' ? 'failed'
        : phase === 'confirming-save' || phase === 'confirming-execution' ? 'stalled' : 'background'
}

// All public functions are presentation-only and harmless to transport/data owners.
export function beginRequestProgress(target: RequestProgressTarget, phase: RequestProgressPhase = 'requesting', startedAt = Date.now()): void {
    try {
        if (!browser() || !valid(target.operationId) || !valid(target.charId) || !valid(target.chatId) || closed.has(target.operationId)) return
        const existing = current(target.operationId)
        if (existing && (existing.chatId !== target.chatId || existing.pipelineCharId !== target.charId)) return
        if (DBState.db.showRequestStatus === false) { if (existing) clearStatus(existing.id); return }
        if (existing) return
        startStatus('bg-request:' + target.operationId + ':' + ++presentation, {
            kind: 'main', label: '', chatId: target.chatId, phase: style(phase), phaseLabel: captions[phase],
            pipeline: true, pipelineOwner: target.operationId, pipelineCharId: target.charId,
            pipelinePhase: phase,
            now: Number.isFinite(startedAt) ? startedAt : Date.now(),
        })
    } catch { /* Display cannot reject a request or mutate its recovery state. */ }
}

export function setRequestProgress(operationId: string | null, phase: RequestProgressPhase): void {
    try {
        if (!browser() || !operationId || closed.has(operationId)) return
        const entry = current(operationId)
        if (entry && DBState.db.showRequestStatus === false) clearStatus(entry.id)
        else if (entry) requestStatuses.update(map => {
            const value = map.get(entry.id)
            if (!value || value.pipelineOwner !== operationId) return map
            if (value.progressBarrier && ['requesting', 'confirming-admission', 'admitted', 'queued', 'preparing', 'processing', 'postprocessing'].includes(phase)) return map
            if (value.progressBarrier === 'saved' && phase === 'saving') return map
            const next = new Map(map)
            next.set(entry.id, { ...value, phase: style(phase), phaseLabel: captions[phase], pipelinePhase: phase,
                progressBarrier: phase === 'loading' ? 'saved' : phase === 'saving' && value.progressBarrier !== 'saved' ? 'saving' : value.progressBarrier,
                endedAt: terminal(phase) ? Date.now() : undefined })
            return next
        })
        if (terminal(phase)) {
            closeOwner(operationId)
        }
    } catch { /* Display cannot affect generation/ACK/cancellation. */ }
}

export function retireRequestProgress(operationId: string | null): void {
    try {
        if (!browser() || !operationId) return
        const entry = current(operationId)
        if (entry) clearStatus(entry.id)
        closeOwner(operationId)
    } catch { /* A native fallback retains its original status ownership. */ }
}

export function retireUnfinishedRequestProgress(operationId: string | null): void {
    try {
        if (operationId && !closed.has(operationId)) retireRequestProgress(operationId)
    } catch { /* Observation teardown is not completion or cancellation evidence. */ }
}

export function ingestRequestProgressStatuses(snapshots: RelayedStatusSnapshot[], operationId?: string | null): void {
    try {
        if (!browser() || (operationId && closed.has(operationId))) return
        ingestRelayedStatuses(snapshots, operationId || undefined)
    } catch { /* Late snapshots must not revive a closed request's model card. */ }
}

export function completeRequestProgress(operationId: string | null, data: unknown): void {
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const failed = body.kind === 'terminal-error' || body.kind === 'terminal-partial'
        || (typeof body.error === 'string' && body.error.length > 0)
        || (typeof body.postError === 'string' && body.postError.length > 0)
    setRequestProgress(operationId, failed ? 'failed' : 'done')
}

export function requestProgressStopping(operationId: string | null): void {
    try {
        if (!browser() || !operationId || closed.has(operationId)) return
        const entry = current(operationId)
        if (!entry || entry.pipelinePhase === 'stopping') return
        requestStatuses.update(map => {
            const next = new Map(map)
            const value = next.get(entry.id)
            if (value) next.set(entry.id, { ...value, progressResume: value.pipelinePhase })
            return next
        })
        setRequestProgress(operationId, 'stopping')
    } catch { /* Cancellation owner is independent of this caption. */ }
}

export function requestProgressCancelResult(operationId: string | null, result: 'cancelled' | 'finished' | 'unconfirmed'): void {
    try {
        if (!operationId || !browser() || closed.has(operationId)) return
        const entry = current(operationId)
        if (result === 'cancelled') setRequestProgress(operationId, 'cancelled')
        else if (entry?.pipelinePhase === 'stopping') {
            const phase = result === 'finished' ? entry.progressResume === 'loading' ? 'loading' : 'confirming-save'
                : entry.progressResume && Object.hasOwn(captions, entry.progressResume) ? entry.progressResume as RequestProgressPhase : 'processing'
            setRequestProgress(operationId, phase)
        }
    } catch { /* Never reinterpret a finished reply as cancelled. */ }
}

export function requestProgressPhase(data: unknown, target: RequestProgressTarget): RequestProgressPhase | null {
    if (!data || typeof data !== 'object') return null
    const body = data as Record<string, unknown>
    if (body.operationId !== target.operationId || body.accepted === false) return null
    if (body.accepted !== true && body.found !== true
        && !(body.found === false && typeof body.operationState === 'string')) return null
    const state = typeof body.operationState === 'string' ? body.operationState : body.state
    if (state === 'cancelled' || state === 'input-cancelled') return 'cancelled'
    if (state === 'input-failed' || state === 'interrupted-before-result' || state === 'interrupted-after-main') return 'failed'
    if (state === 'delivery-failed' || state === 'result-expired' || state === 'result-evicted'
        || body.kind === 'terminal-error') return 'failed'
    if (state === 'input-transform-unknown' || state === 'input-execution-unknown') return 'confirming-execution'
    if (state === 'input-blocked_edit') return 'blocked'
    const receipt = serverChatCommitReceipt(body)
    if (receipt && receipt.operationId === target.operationId && receipt.requestedCharId === target.charId
        && receipt.requestedChatId === target.chatId) return 'confirming-save'
    if (state === 'finished' || state === 'result-ready' || body.final === true) return 'confirming-save'
    // A missing/invalid reply or an unauthenticated rejection isn't admission evidence.
    const accepted = body.accepted === true || body.found === true
        || (body.found === false && typeof state === 'string'
            && ['queued', 'running', 'running-result-consumed', 'input-queued', 'input-waiting-predecessor', 'input-attached', 'input-generating'].includes(state))
    if (!accepted) return null
    if (body.progress === 'saving') return 'saving'
    if (body.stage === 1 || body.stage === 2) return 'preparing'
    if (body.stage === 3) return 'processing'
    if (body.stage === 4) return 'postprocessing'
    if (body.kind === 'intermediate') return 'postprocessing'
    if (body.progress === 'queued' || state === 'queued' || state === 'input-queued' || state === 'input-waiting-predecessor') return 'queued'
    if (body.progress === 'preparing') return 'preparing'
    // Version skew: stage0 without the new gap marker is not proof of queueing/saving.
    return 'processing'
}

export function applyRequestProgress(target: RequestProgressTarget, data: unknown): void {
    try {
        const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
        if (body.operationId === target.operationId && body.accepted !== false
            && (body.accepted === true || body.found === false)
            && ['delivered', 'input-retried'].includes(String(body.operationState || body.state))) {
            const owned = current(target.operationId)
            if (owned && (owned.chatId !== target.chatId || owned.pipelineCharId !== target.charId)) return
            retireRequestProgress(target.operationId)
            return
        }
        const phase = requestProgressPhase(data, target)
        if (!phase) return
        beginRequestProgress(target, phase)
        const entry = current(target.operationId)
        if (!entry || entry.chatId !== target.chatId || entry.pipelineCharId !== target.charId) return
        // Stage0 is cleanup/gap metadata, not a new preparation after native work.
        // Explicit stage1/2 remains eligible during a real retry or continuation.
        if ((body.stage === 0 || body.stage === undefined) && ['preparing', 'processing'].includes(phase)
            && ['processing', 'postprocessing'].includes(entry.pipelinePhase || '')) return
        if (entry.pipelinePhase === 'loading' && phase === 'confirming-save') return
        const receipt = serverChatCommitReceipt(data)
        if (receipt && receipt.operationId === target.operationId && receipt.requestedCharId === target.charId
            && receipt.requestedChatId === target.chatId) requestStatuses.update(map => {
                const next = new Map(map)
                const value = next.get(entry.id)
                if (value) next.set(entry.id, { ...value, progressBarrier: 'saved' })
                return next
            })
        // An in-flight explicit Stop keeps its caption until cancellation is confirmed.
        if (entry.pipelinePhase === 'stopping' && !terminal(phase)) return
        setRequestProgress(target.operationId, phase)
    } catch { /* Optional progress metadata is never execution authority. */ }
}

export function requestProgressAdmission(target: RequestProgressTarget, outcome: { kind: string; state?: unknown }): void {
    try {
        if (outcome.kind === 'accepted') {
            if (typeof outcome.state === 'string') applyRequestProgress(target, { accepted: true, operationId: target.operationId, state: outcome.state })
            else if (['requesting', 'confirming-admission'].includes(current(target.operationId)?.pipelinePhase || '')) {
                setRequestProgress(target.operationId, 'admitted')
            }
        }
        else if (outcome.kind === 'unknown') setRequestProgress(target.operationId, 'confirming-admission')
        else if (outcome.kind === 'rejected' || outcome.kind === 'blocked') setRequestProgress(target.operationId, 'failed')
    } catch { /* Preserve the admission result exactly. */ }
}
