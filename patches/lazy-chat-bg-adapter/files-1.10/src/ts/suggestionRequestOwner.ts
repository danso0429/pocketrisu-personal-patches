// Request lifetime shared by busy/readiness/target eligibility signals.
// The caller owns context proof; navigation availability alone is not proof.
export function createSuggestionRequestOwner<C, R>(options: {
    capture: () => C | null
    current: (context: C) => boolean
    request: (context: C, signal: AbortSignal) => Promise<R>
    publish: (context: C, result: R) => void
    progress: (value: boolean) => void
}) {
    let epoch = 0, queued = false, destroyed = false
    let flight: { context: C, controller: AbortController, epoch: number } | null = null
    function cancel() {
        ++epoch
        const old = flight
        flight = null
        old?.controller.abort()
        options.progress(false)
    }
    function schedule() {
        if (destroyed) return
        if (flight && !options.current(flight.context)) cancel()
        if (queued) return
        queued = true
        queueMicrotask(() => {
            queued = false
            if (destroyed || flight) return
            const context = options.capture()
            if (!context || !options.current(context)) return
            const request = { context, controller: new AbortController(), epoch: ++epoch }
            flight = request
            options.progress(true)
            void Promise.resolve().then(() => {
                if (destroyed || flight !== request || request.controller.signal.aborted
                    || !options.current(context)) return undefined
                return options.request(context, request.controller.signal)
            }).then(result => {
                if (result !== undefined && !destroyed && flight === request && request.epoch === epoch
                    && !request.controller.signal.aborted && options.current(context)) options.publish(context, result)
            }).catch(() => { /* Existing request UI owns provider errors; no unhandled rejection. */ })
                .finally(() => {
                    if (flight !== request) return
                    flight = null
                    options.progress(false)
                })
        })
    }
    return { schedule, cancel, destroy() { destroyed = true; cancel() } }
}
