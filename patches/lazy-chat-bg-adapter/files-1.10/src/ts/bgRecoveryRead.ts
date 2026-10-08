// BG verification budgets, not model execution deadlines. See the G1.12a
// measurement closeout. Browser timers may run late after page suspension.
export const RECOVERY_BODY_TIMEOUT_MS = 30_000
export const RECOVERY_SNAPSHOT_TIMEOUT_MS = 30_000

export function boundedRecoveryRead<T>(
    action: (signal: AbortSignal) => Promise<T>,
    timeoutMs = RECOVERY_SNAPSHOT_TIMEOUT_MS,
    parent?: AbortSignal | null,
    controller = new AbortController(),
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = (ok: boolean, value: unknown) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            parent?.removeEventListener('abort', cancelled)
            if (ok) resolve(value as T)
            else reject(value)
        }
        const abort = (reason: unknown) => {
            // Reject first: abort-aware transports can synchronously notify
            // listeners, but must not change the winning error or publish late.
            finish(false, reason)
            controller.abort(reason)
        }
        const cancelled = () => abort(parent?.reason ?? new DOMException('Recovery read cancelled', 'AbortError'))
        if (parent?.aborted) { cancelled(); return }
        if (controller.signal.aborted) { finish(false, controller.signal.reason); return }
        parent?.addEventListener('abort', cancelled, { once: true })
        timer = setTimeout(() => abort(new DOMException('Recovery read timed out', 'TimeoutError')), timeoutMs)
        try {
            // Attach both handlers even when an implementation ignores abort.
            // Only the returned winner may authorize local publication after
            // identity/epoch checks. A fetch may already have changed the server;
            // timing out observation does not prove remote non-admission.
            Promise.resolve(action(controller.signal)).then(
                value => finish(true, value), error => finish(false, error),
            )
        } catch (error) { finish(false, error) }
    })
}

const controls = new WeakMap<Response, { controller: AbortController, parent?: AbortSignal | null }>()

export async function fetchRecoveryControl(
    fetcher: (url: string, init?: RequestInit) => Promise<Response>,
    url: string,
    init: RequestInit = {},
    headersTimeoutMs = 15_000,
): Promise<Response> {
    const controller = new AbortController()
    const response = await boundedRecoveryRead(
        signal => fetcher(url, { ...init, signal }), headersTimeoutMs, init.signal, controller,
    )
    controls.set(response, { controller, parent: init.signal })
    return response
}

export async function readRecoveryJson<T = any>(response: Response, timeoutMs = RECOVERY_BODY_TIMEOUT_MS): Promise<T> {
    const control = controls.get(response)
    try {
        return await boundedRecoveryRead(
            () => response.json() as Promise<T>, timeoutMs, control?.parent, control?.controller,
        )
    } finally { controls.delete(response) }
}

// Keep original body consumption and asynchronous decoding inside one read-only
// observation. Import/decode may ignore abort; only the winning result is returned.
export async function readRecoveryBody<T>(
    response: Response,
    consume: () => Promise<T>,
    timeoutMs = RECOVERY_BODY_TIMEOUT_MS,
): Promise<T> {
    const control = controls.get(response)
    try {
        return await boundedRecoveryRead(consume, timeoutMs, control?.parent, control?.controller)
    } finally { controls.delete(response) }
}
