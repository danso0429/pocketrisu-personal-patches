import { addLog } from './log'

// Temporary G1.12a measurement only. No timeout, retry or recovery authority.
type Context = 'boot' | 'watch'
type Kind = 'result-get' | 'projection' | 'ack' | 'status' | 'snapshot'
type Checkpoint = 'hidden' | 'resumed' | 'finished'
type RequestRow = {
    kind: Kind, phase: 'fetch' | 'headers' | 'body' | 'complete' | 'error'
    startMs: number, status?: number, headersMs?: number, bodyMs?: number
    totalMs?: number, wallMs?: number, bytes?: number, sizeBasis?: 'snapshot' | 'resource'
    networkHeadersMs?: number, networkBodyMs?: number, error?: string
    hiddenDuring: boolean, controlTimerFired: boolean, resourceMatch?: 'none' | 'multiple' | 'unique'
}
type Trace = {
    ordinal: number, context: Context, operation: string, char: string, chat: string
    start: number, wall: number, closed: boolean, requests: RequestRow[], dropped: number
    checkpoints: Set<Checkpoint>, milestones: Record<string, number>, entries: RequestEntry[]
}
type RequestEntry = { trace: Trace, row: RequestRow, url: string, started: number, wall: number, ended?: number }
type Resource = { name: string, startTime: number, responseStart: number, responseEnd: number, decodedBodySize: number }
type Dependencies = {
    now: () => number, wall: () => number, hidden: () => boolean
    resources: (url: string) => Resource[], absolute: (url: string) => string
    subscribe: (listener: () => void) => () => void
    emit: (message: string, description: string) => void
}
const noop = () => {}
const fixedError = (error: unknown) => {
    const name = (error as { name?: unknown })?.name
    return ['AbortError', 'TimeoutError', 'TypeError', 'SyntaxError', 'RangeError'].includes(name as string)
        ? String(name) : 'OtherError'
}

export function createRecoveryTiming(deps: Dependencies) {
    const traces = new Map<string, Trace>()
    const bodies = new WeakMap<Response, RequestEntry>()
    let ordinal = 0, unsubscribe: (() => void) | null = null
    const safe = (action: () => void) => { try { action() } catch { /* Measurement cannot change recovery. */ } }
    const elapsed = (start: number) => Math.max(0, Math.round(deps.now() - start))
    const emit = (trace: Trace, checkpoint: Checkpoint, outcome?: string) => safe(() => {
        if (trace.checkpoints.has(checkpoint)) return
        trace.checkpoints.add(checkpoint)
        for (const entry of trace.entries) if (entry.ended !== undefined) resource(entry)
        const record = { version: 1, trace: trace.ordinal, context: trace.context,
            checkpoint, outcome, elapsedMs: elapsed(trace.start), wallMs: Math.max(0, deps.wall() - trace.wall),
            milestones: trace.milestones, requests: [...trace.requests], dropped: trace.dropped,
            omittedForSize: 0, sampling: 'first8-last40' }
        let description = JSON.stringify(record)
        while (new TextEncoder().encode(description).byteLength > 9_500 && record.requests.length) {
            record.requests.splice(record.requests.length > 8 ? 8 : 0, 1)
            record.omittedForSize++
            description = JSON.stringify(record)
        }
        // Unique message: the native logger dedupes message/source/level and drops
        // later descriptions within one second. Never put coordinates in it.
        deps.emit(`BG recovery timing ${trace.ordinal} ${checkpoint}`, description)
    })
    const finish = (operation: string | null, outcome: string) => safe(() => {
        if (!operation) return
        const trace = traces.get(operation)
        if (!trace) return
        trace.closed = true
        emit(trace, 'finished', outcome)
        traces.delete(operation)
        if (!traces.size && unsubscribe) { unsubscribe(); unsubscribe = null }
    })
    const finishContext = (context: Context, operation: string | null, outcome: string) => safe(() => {
        for (const trace of [...traces.values()]) {
            if (trace.context === context && (operation === null || trace.operation === operation)) finish(trace.operation, outcome)
        }
    })
    const visibility = () => safe(() => {
        const hidden = deps.hidden()
        for (const trace of traces.values()) {
            if (hidden) for (const row of trace.requests) {
                if (!['complete', 'error'].includes(row.phase)) row.hiddenDuring = true
            }
            emit(trace, hidden ? 'hidden' : 'resumed')
        }
    })
    const start = (context: Context, operation: string | null, char: string, chat: string) => safe(() => {
        if (!operation || traces.has(operation) || ordinal >= 64 || traces.size >= 16) return
        if (![operation, char, chat].every(value => typeof value === 'string' && value.length <= 255)) return
        traces.set(operation, { ordinal: ++ordinal, context, operation, char, chat,
            start: deps.now(), wall: deps.wall(), closed: false, requests: [], dropped: 0,
            checkpoints: new Set(), milestones: {}, entries: [] })
        if (!unsubscribe) unsubscribe = deps.subscribe(visibility)
    })
    const milestone = (operation: string | null, name: 'character-ready' | 'chat-hydrated' | 'adoption') => safe(() => {
        const trace = operation ? traces.get(operation) : null
        if (trace && trace.milestones[name] === undefined) trace.milestones[name] = elapsed(trace.start)
    })
    const matching = (operation?: string | null, char?: string | null, chat?: string | null) => {
        if (operation) return traces.get(operation)
        const matches = [...traces.values()].filter(trace => trace.char === char && trace.chat === chat)
        return matches.length === 1 ? matches[0] : undefined
    }
    const begin = (trace: Trace | undefined, kind: Kind, url: string) => {
        if (!trace || trace.closed) return null
        const absolute = deps.absolute(url)
        if (trace.requests.length >= 48) {
            trace.requests.splice(8, 1); trace.entries.splice(8, 1); trace.dropped++
        }
        const started = deps.now(), wall = deps.wall()
        const row: RequestRow = { kind, phase: 'fetch', startMs: elapsed(trace.start),
            hiddenDuring: deps.hidden(), controlTimerFired: false }
        trace.requests.push(row)
        const entry: RequestEntry = { trace, row, url: absolute, started, wall }
        trace.entries.push(entry)
        return entry
    }
    const resource = (entry: NonNullable<ReturnType<typeof begin>>) => safe(() => {
        delete entry.row.networkHeadersMs; delete entry.row.networkBodyMs
        if (entry.row.sizeBasis === 'resource') { delete entry.row.bytes; delete entry.row.sizeBasis }
        const matches = deps.resources(entry.url).filter(row => row.startTime >= entry.started - 1
            && row.startTime <= (entry.ended ?? deps.now()) && row.responseEnd >= entry.started
            && row.responseEnd <= (entry.ended ?? deps.now()) + 1)
        if (matches.length !== 1) { entry.row.resourceMatch = matches.length ? 'multiple' : 'none'; return }
        entry.row.resourceMatch = 'unique'
        const value = matches[0]
        if (value.responseStart > 0 && value.responseEnd >= value.responseStart) {
            entry.row.networkHeadersMs = Math.round(value.responseStart - value.startTime)
            entry.row.networkBodyMs = Math.round(value.responseEnd - value.responseStart)
        }
        if (entry.row.bytes === undefined && Number.isFinite(value.decodedBodySize) && value.decodedBodySize > 0) {
            entry.row.bytes = value.decodedBodySize; entry.row.sizeBasis = 'resource'
        }
    })
    const endRequest = (entry: NonNullable<ReturnType<typeof begin>>, error?: unknown) => safe(() => {
        if (entry.trace.closed) return
        entry.row.totalMs = elapsed(entry.started)
        entry.ended = deps.now()
        entry.row.wallMs = Math.max(0, deps.wall() - entry.wall)
        entry.row.hiddenDuring ||= deps.hidden()
        entry.row.phase = error === undefined ? 'complete' : 'error'
        if (error !== undefined) entry.row.error = fixedError(error)
        resource(entry)
    })
    const control = (url: string, method = 'GET') => {
        let entry: ReturnType<typeof begin> = null
        safe(() => {
            const parsed = new URL(deps.absolute(url))
            if (parsed.searchParams.has('heartbeat')) return
            const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
            if (segments[0] !== 'api') return
            const route = segments[1]
            let kind: Kind, trace: Trace | undefined
            if (route === 'bg-orchestrate-result') {
                kind = method === 'DELETE' ? 'ack' : 'result-get'
                trace = (method === 'DELETE' ? segments.length === 4 : parsed.searchParams.has('charId')) ? matching(segments[2])
                    : matching(null, segments[2], segments[3])
            } else if (route === 'bg-orchestrate-chat-state') {
                kind = 'projection'; trace = matching(null, segments[2], segments[3])
            } else if (route === 'bg-orchestrate-status') {
                kind = 'status'; trace = matching(segments[2])
            } else return
            entry = begin(trace, kind, url)
        })
        return {
            timerFired: () => safe(() => { if (entry) entry.row.controlTimerFired = true }),
            headers: (response: Response) => safe(() => {
                if (!entry || entry.trace.closed) return
                entry.row.phase = 'headers'; entry.row.status = response.status
                entry.row.headersMs = elapsed(entry.started)
                bodies.set(response, entry)
            }),
            error: (error: unknown) => { if (entry) endRequest(entry, error) },
        }
    }
    function json<T = any>(response: Response): Promise<T> {
        const entry = bodies.get(response)
        if (!entry || entry.trace.closed) return response.json()
        let bodyStart = entry.started
        safe(() => { bodyStart = deps.now(); entry.row.phase = 'body' })
        return response.json().then(value => {
            safe(() => { entry.row.bodyMs = elapsed(bodyStart) }); endRequest(entry); return value
        }, error => {
            safe(() => { entry.row.bodyMs = elapsed(bodyStart) }); endRequest(entry, error); throw error
        })
    }
    function snapshot<T extends { encodedBytes?: number } | null>(char: string, chat: string, index: number, action: () => Promise<T>): Promise<T> {
        let entry: ReturnType<typeof begin> = null
        safe(() => { entry = begin(matching(null, char, chat), 'snapshot', `/api/chat-content/${encodeURIComponent(char)}/${index}`) })
        const measured = entry as RequestEntry | null
        if (!measured) return action()
        return action().then(value => {
            safe(() => {
                if (value && typeof value.encodedBytes === 'number' && Number.isFinite(value.encodedBytes)) {
                    measured.row.bytes = value.encodedBytes; measured.row.sizeBasis = 'snapshot'
                }
            })
            endRequest(measured); return value
        }, error => { endRequest(measured, error); throw error })
    }
    return { start, finish, finishContext, milestone, control, json, snapshot,
        dispose: () => { traces.clear(); unsubscribe?.(); unsubscribe = null },
        active: () => traces.size }
}

const observedResources: Resource[] = []
export const bgRecoveryTiming = createRecoveryTiming({
    now: () => performance.now(), wall: Date.now,
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    absolute: url => new URL(url, typeof location === 'undefined' ? 'http://localhost' : location.origin).href,
    resources: url => observedResources.filter(entry => entry.name === url),
    subscribe: listener => {
        if (typeof document === 'undefined') return noop
        let observer: PerformanceObserver | undefined
        try {
            observer = new PerformanceObserver(list => {
                try { for (const raw of list.getEntries()) {
                    const entry = raw as PerformanceResourceTiming
                    const url = new URL(entry.name)
                    if (url.origin !== location.origin || entry.name.length > 2048
                        || !/^\/api\/(chat-content\/|bg-orchestrate-)/.test(url.pathname)) continue
                    observedResources.push({ name: entry.name, startTime: entry.startTime,
                        responseStart: entry.responseStart, responseEnd: entry.responseEnd, decodedBodySize: entry.decodedBodySize })
                    if (observedResources.length > 256) observedResources.shift()
                } } catch { /* Unavailable observation is not a recovery error. */ }
            })
            observer.observe({ type: 'resource', buffered: true })
        } catch { observer?.disconnect() }
        document.addEventListener('visibilitychange', listener)
        return () => {
            document.removeEventListener('visibilitychange', listener)
            observer?.disconnect(); observedResources.length = 0
        }
    },
    emit: (message, description) => addLog({ level: 'info', source: 'bg-recovery-timing', message, description }),
})
