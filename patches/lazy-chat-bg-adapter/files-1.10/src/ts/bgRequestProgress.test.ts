// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { DBState } from './stores.svelte'
import { requestStatuses, startStatus, ingestRelayedStatuses, clearRelayedStatuses } from './status/requestStatus'
import { beginRequestProgress, setRequestProgress, applyRequestProgress, completeRequestProgress,
    requestProgressAdmission, requestProgressPhase, requestProgressStopping, requestProgressCancelResult,
    retireRequestProgress, ingestRequestProgressStatuses, retireUnfinishedRequestProgress } from './bgRequestProgress'

vi.mock('./stores.svelte', () => ({ DBState: { db: { showRequestStatus: true } } }))
const target = (operationId: string) => ({ operationId, charId: 'char', chatId: 'chat' })
const entry = (operationId: string) => [...get(requestStatuses).values()].find(value => value.pipelineOwner === operationId && value.pipeline)
afterEach(() => { requestStatuses.set(new Map()); DBState.db.showRequestStatus = true; delete (globalThis as any).__bgOrch })

describe('whole-request presentation', () => {
    it('keeps one card and its clock across real queue/stage/save transitions without timer-based completion', () => {
        const scope = target('sequence')
        beginRequestProgress(scope, 'requesting', 100)
        const id = entry(scope.operationId)!.id
        expect(entry(scope.operationId)?.phaseLabel).toBe('요청 중')
        for (const [packet, caption] of [
            [{ progress: 'queued', stage: 0 }, '순서 대기 중'],
            [{ progress: 'preparing', stage: 1 }, '생성 준비 중'],
            [{ stage: 3 }, '서버 처리 중'], [{ stage: 4 }, '응답 정리 중'],
            [{ progress: 'saving', stage: 0 }, '답변 저장 중'],
        ] as const) {
            applyRequestProgress(scope, { found: false, operationId: scope.operationId, operationState: 'running', ...packet })
            expect(entry(scope.operationId)?.phaseLabel).toBe(caption)
            expect(entry(scope.operationId)?.startedAt).toBe(100)
            expect(entry(scope.operationId)?.id).toBe(id)
        }
        expect(entry(scope.operationId)?.endedAt).toBeUndefined()
        setRequestProgress(scope.operationId, 'loading')
        completeRequestProgress(scope.operationId, { kind: 'terminal-success' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('완료')
        expect(entry(scope.operationId)?.phase).toBe('done')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 3 })
        expect(entry(scope.operationId)?.phaseLabel).toBe('완료')
    })
    it('permits retry/continue revisits before saving but ignores late earlier phases after saving', () => {
        const scope = target('revisit')
        beginRequestProgress(scope)
        for (const stage of [1, 2, 1, 3, 4, 3, 4]) applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage })
        expect(entry(scope.operationId)?.phaseLabel).toBe('응답 정리 중')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 0 })
        expect(entry(scope.operationId)?.phaseLabel).toBe('응답 정리 중')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', progress: 'saving' })
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 3 })
        expect(entry(scope.operationId)?.phaseLabel).toBe('답변 저장 중')
        setRequestProgress(scope.operationId, 'loading')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', progress: 'saving' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('답변 불러오는 중')
    })
    it('does not accept wrong identity, coordinates or rejection as progress evidence', () => {
        const scope = target('identity')
        beginRequestProgress(scope)
        applyRequestProgress(scope, { accepted: true, operationId: 'other', state: 'running', progress: 'saving' })
        applyRequestProgress({ ...scope, chatId: 'other-chat' }, { accepted: true, operationId: scope.operationId, state: 'running', stage: 3 })
        applyRequestProgress(scope, { accepted: false, operationId: scope.operationId, state: 'cancelled' })
        applyRequestProgress({ ...scope, chatId: 'other-chat' }, { accepted: true, operationId: scope.operationId, state: 'delivered' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('요청 중')
    })
    it('uses neutral old-server fallback and explicit admission/verification outcomes', () => {
        const scope = target('fallback')
        beginRequestProgress(scope)
        requestProgressAdmission(scope, { kind: 'unknown' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('접수 확인 중')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 0 })
        expect(entry(scope.operationId)?.phaseLabel).toBe('서버 처리 중')
        expect(requestProgressPhase({ accepted: true, operationId: scope.operationId, state: 'input-waiting-predecessor' }, scope)).toBe('queued')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'finished' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('저장 확인 중')
        expect(entry(scope.operationId)?.phase).toBe('stalled')
    })
    it('isolates a cancelled predecessor from the queued successor and restores an unconfirmed Stop', () => {
        beginRequestProgress(target('cancel-A'), 'processing')
        beginRequestProgress(target('cancel-B'), 'queued')
        requestProgressStopping('cancel-A')
        expect(entry('cancel-A')?.phaseLabel).toBe('중지 확인 중')
        requestProgressCancelResult('cancel-A', 'unconfirmed')
        expect(entry('cancel-A')?.phaseLabel).toBe('서버 처리 중')
        requestProgressStopping('cancel-A')
        requestProgressCancelResult('cancel-A', 'cancelled')
        expect(entry('cancel-A')?.phaseLabel).toBe('중지됨')
        expect(entry('cancel-B')?.phaseLabel).toBe('순서 대기 중')
        requestProgressCancelResult('cancel-A', 'finished')
        expect(entry('cancel-A')?.phaseLabel).toBe('중지됨')
    })
    it('never turns a late finished Stop or a saved partial error into successful completion', () => {
        beginRequestProgress(target('late-finished'), 'processing')
        requestProgressStopping('late-finished')
        requestProgressCancelResult('late-finished', 'finished')
        expect(entry('late-finished')?.phaseLabel).toBe('저장 확인 중')
        completeRequestProgress('late-finished', { kind: 'terminal-partial', error: 'controlled failure' })
        expect(entry('late-finished')?.phaseLabel).toBe('실패')
    })
    it('scopes relay pruning and clearing to the operation while preserving local requests', () => {
        beginRequestProgress(target('scope-A'))
        beginRequestProgress({ ...target('scope-B'), chatId: 'chat-B' })
        const snapshot = (id: string) => ({ id, kind: 'main' as const, label: id, phase: 'connecting' as const, startedAt: 10 })
        ingestRelayedStatuses([snapshot('model-A')], 'scope-A')
        ingestRelayedStatuses([snapshot('model-B')], 'scope-B')
        startStatus('local', { kind: 'main', label: 'local', now: 10 })
        ingestRelayedStatuses([], 'scope-A')
        expect(get(requestStatuses).has('model-A')).toBe(false)
        expect(get(requestStatuses).has('model-B')).toBe(true)
        clearRelayedStatuses()
        expect(get(requestStatuses).has('model-B')).toBe(true)
        completeRequestProgress('scope-A', { kind: 'terminal-success' })
        expect(get(requestStatuses).has('model-B')).toBe(true)
        expect(get(requestStatuses).has('local')).toBe(true)
    })
    it('is inert in the server bundle and honors disabled presentation without changing admission', () => {
        ;(globalThis as any).__bgOrch = {}
        beginRequestProgress(target('server-runtime'))
        expect(entry('server-runtime')).toBeUndefined()
        delete (globalThis as any).__bgOrch
        DBState.db.showRequestStatus = false
        beginRequestProgress(target('display-off'))
        expect(entry('display-off')).toBeUndefined()
        expect(requestProgressPhase({ accepted: true, operationId: 'display-off', state: 'input-queued' }, target('display-off'))).toBe('queued')
    })
    it('retires a rejected delegation for native fallback without fabricating completion', () => {
        beginRequestProgress(target('retire'))
        retireRequestProgress('retire')
        expect(entry('retire')).toBeUndefined()
    })
    it('closes raw terminal errors and known storage/retention failures without reviving late model snapshots', () => {
        const scope = target('raw-error')
        beginRequestProgress(scope, 'processing')
        applyRequestProgress(scope, { found: true, operationId: scope.operationId, final: true, kind: 'terminal-error', error: 'model refused' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('실패')
        ingestRequestProgressStatuses([{ id: 'late-model', kind: 'main', label: 'Late', phase: 'connecting', startedAt: 10 }], scope.operationId)
        expect(get(requestStatuses).has('late-model')).toBe(false)
        for (const state of ['delivery-failed', 'result-expired', 'result-evicted']) {
            expect(requestProgressPhase({ found: false, operationId: scope.operationId, operationState: state }, scope)).toBe('failed')
        }
    })
    it('does not invent model work at admission or restart preparation during stage0 cleanup', () => {
        const scope = target('gap-order')
        beginRequestProgress(scope)
        requestProgressAdmission(scope, { kind: 'accepted', state: null })
        expect(entry(scope.operationId)?.phaseLabel).toBe('서버 접수됨')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 4 })
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 0, progress: 'preparing' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('응답 정리 중')
        // A real retry stage remains authoritative, rather than ranking all phases monotonically.
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 1 })
        expect(entry(scope.operationId)?.phaseLabel).toBe('생성 준비 중')
        setRequestProgress(scope.operationId, 'loading')
        applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'finished' })
        expect(entry(scope.operationId)?.phaseLabel).toBe('답변 불러오는 중')
    })
    it('retires results consumed elsewhere and replaced input without claiming local completion', () => {
        for (const state of ['delivered', 'input-retried']) {
            const scope = target('retired-' + state)
            beginRequestProgress(scope, 'processing')
            applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state })
            expect(entry(scope.operationId)).toBeUndefined()
            applyRequestProgress(scope, { accepted: true, operationId: scope.operationId, state: 'running', stage: 3 })
            expect(entry(scope.operationId)).toBeUndefined()
        }
    })
    it('removes unfinished observation cards on teardown while retaining proven terminal captions', () => {
        beginRequestProgress(target('teardown-active'), 'loading')
        retireUnfinishedRequestProgress('teardown-active')
        expect(entry('teardown-active')).toBeUndefined()
        beginRequestProgress(target('teardown-completed'), 'loading')
        completeRequestProgress('teardown-completed', { kind: 'terminal-success' })
        retireUnfinishedRequestProgress('teardown-completed')
        expect(entry('teardown-completed')?.phaseLabel).toBe('완료')
    })
    it('uses actual stages on intermediate results and preserves legacy main-to-post evidence when stages are absent', () => {
        const scope = target('intermediate')
        expect(requestProgressPhase({ found: true, operationId: scope.operationId, kind: 'intermediate', stage: 4 }, scope)).toBe('postprocessing')
        expect(requestProgressPhase({ found: true, operationId: scope.operationId, kind: 'intermediate', stage: 3 }, scope)).toBe('processing')
        expect(requestProgressPhase({ found: true, operationId: scope.operationId, kind: 'intermediate' }, scope)).toBe('postprocessing')
    })
})
