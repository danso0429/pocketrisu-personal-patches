import { writable } from 'svelte/store'
import { readPendingMarkers, ORCHESTRATION_PENDING_MAX_AGE_MS } from './bgOrchestrationPending'
import { readServerInputMarkers } from './bgServerInputLedger'

export const RECONCILIATION_PENDING = '저장된 대화를 확인한 뒤 답변 추천을 준비해요. 다른 채팅으로 이동할 수 있어요.'
export const RECONCILIATION_MAX_OPERATIONS = 512
type Marker = { charId: string, chatId: string, operationId: string | null, ts: number }
type Target = { charId: string, chatId: string, epoch: number, operations: Map<string, { ts: number, terminal: boolean }> }

// Page-local context readiness, never a server execution/admission authority.
export function createReconciliationReadiness() {
    const targets = new Map<string, Target>()
    const seen = new Map<string, number>()
    const changes = writable(0)
    let epoch = 0
    let overflow = false
    let operationCount = 0
    const key = (charId: string, chatId: string) => JSON.stringify([charId, chatId])
    const publish = () => changes.set(++epoch)
    function register(marker: Marker, now = Date.now()) {
        if (marker.ts > 0 && now - marker.ts > ORCHESTRATION_PENDING_MAX_AGE_MS) return
        const id = marker.operationId || key(marker.charId, marker.chatId)
        if (seen.has(id)) return
        if (operationCount >= RECONCILIATION_MAX_OPERATIONS) {
            if (!overflow) { overflow = true; publish() }
            return
        }
        seen.set(id, marker.ts)
        const k = key(marker.charId, marker.chatId)
        const target = targets.get(k) || { charId: marker.charId, chatId: marker.chatId, epoch: 0, operations: new Map() }
        target.operations.set(id, { ts: marker.ts, terminal: false })
        operationCount++
        target.epoch = ++epoch
        targets.set(k, target)
        for (const previous of seen.keys()) {
            if (seen.size <= RECONCILIATION_MAX_OPERATIONS + 256) break
            if (![...targets.values()].some(value => value.operations.has(previous))) seen.delete(previous)
        }
        publish()
    }
    function seed(markers: Marker[], now = Date.now()) {
        let changed = false
        for (const [id, ts] of seen) if (ts > 0 && now - ts > ORCHESTRATION_PENDING_MAX_AGE_MS) seen.delete(id)
        for (const [k, target] of targets) {
            for (const [id, { ts }] of target.operations) {
                if (ts > 0 && now - ts > ORCHESTRATION_PENDING_MAX_AGE_MS) { target.operations.delete(id); operationCount--; changed = true }
            }
            if (!target.operations.size) targets.delete(k)
        }
        if (changed) publish()
        for (const marker of markers) register(marker, now)
        // Evict only resolved identities: forgetting one may conservatively
        // require another proof, never silently release an unresolved target.
        for (const id of seen.keys()) {
            if (seen.size <= 256) break
            if (![...targets.values()].some(target => target.operations.has(id))) seen.delete(id)
        }
    }
    return {
        subscribe: changes.subscribe,
        seed,
        register,
        // A pathological session exceeding the durable ledgers' combined bound
        // must not forget unresolved work and silently authorize paid suggestions.
        pending: (charId: string, chatId: string) => overflow || targets.has(key(charId, chatId)),
        capture: (charId: string, chatId: string) => targets.get(key(charId, chatId))?.epoch,
        terminal: (charId: string, chatId: string) => {
            const target = targets.get(key(charId, chatId))
            return !overflow && !!target && [...target.operations.values()].every(operation => operation.terminal)
        },
        classifyTerminal(charId: string, chatId: string, operationId: string | null) {
            const target = targets.get(key(charId, chatId))
            const operation = target?.operations.get(operationId || key(charId, chatId))
            if (!target || !operation || operation.terminal) return
            operation.terminal = true
            target.epoch = ++epoch
            publish()
        },
        targets: () => [...targets.values()].map(({ charId, chatId, epoch }) => ({ charId, chatId, epoch })),
        operations: (charId: string, chatId: string) => [...(targets.get(key(charId, chatId))?.operations ?? [])]
            .map(([operationId, value]) => ({ operationId, terminal: value.terminal })),
        resolveOperation(charId: string, chatId: string, operationId: string) {
            const k = key(charId, chatId), target = targets.get(k)
            if (!target?.operations.delete(operationId)) return
            operationCount--
            target.epoch = ++epoch
            if (!target.operations.size) targets.delete(k)
            publish()
        },
        verifyTarget(charId: string, chatId: string, captured: number | undefined) {
            const k = key(charId, chatId), target = targets.get(k)
            if (overflow || !target || target.epoch !== captured
                || ![...target.operations.values()].every(operation => operation.terminal)) return false
            targets.delete(k)
            operationCount -= target.operations.size
            publish()
            return true
        },
    }
}

export const reconciliationReadiness = createReconciliationReadiness()
export function seedReconciliationReadiness(): void {
    if (typeof localStorage === 'undefined') return
    try { reconciliationReadiness.seed([...readPendingMarkers(localStorage),
        ...readServerInputMarkers(localStorage).map(marker => ({ ...marker, ts: marker.createdAt }))]) }
    catch { /* Existing in-memory evidence must survive storage unavailability. */ }
}
// Imports finish before Suggestion's synchronous store subscription.
seedReconciliationReadiness()
