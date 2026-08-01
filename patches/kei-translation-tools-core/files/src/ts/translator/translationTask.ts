export interface TranslationTask {
    signal: AbortSignal
    isCurrent: () => boolean
    isLatest: () => boolean
    finish: () => void
}

export interface TranslationTaskController {
    begin: () => TranslationTask
    cancel: () => void
    hasCurrent: () => boolean
    dispose: () => void
}

function abortError(reason?: unknown): Error {
    if (reason instanceof Error && reason.name === 'AbortError') {
        return reason
    }
    const error = new Error(
        reason instanceof Error ? reason.message : 'Translation aborted',
    ) as Error & { cause?: unknown }
    error.name = 'AbortError'
    if (reason !== undefined) {
        error.cause = reason
    }
    return error
}

export function throwIfTranslationAborted(signal?: AbortSignal | null): void {
    if (!signal?.aborted) {
        return
    }
    throw abortError(signal.reason)
}

export function isTranslationAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
}

export function raceTranslationAbort<T>(
    promise: Promise<T>,
    signal?: AbortSignal | null,
): Promise<T> {
    throwIfTranslationAborted(signal)
    if (!signal) {
        return promise
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            cleanup()
            reject(abortError(signal.reason))
        }
        const cleanup = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
        promise.then(
            (value) => {
                cleanup()
                resolve(value)
            },
            (error) => {
                cleanup()
                reject(error)
            },
        )
    })
}

export function waitForTranslationDelay(
    milliseconds: number,
    signal?: AbortSignal | null,
): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const delay = new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, Math.max(0, milliseconds))
    })
    return raceTranslationAbort(delay, signal).finally(() => {
        if (timeout) {
            clearTimeout(timeout)
        }
    })
}

export function createTranslationTaskController(): TranslationTaskController {
    let current: {
        token: object
        controller: AbortController
    } | null = null
    let latestToken: object | null = null
    let disposed = false

    const cancel = () => {
        const task = current
        current = null
        latestToken = null
        task?.controller.abort()
    }

    return {
        begin() {
            if (disposed) {
                throw new Error('Translation task controller is disposed')
            }
            cancel()
            const token = {}
            const controller = new AbortController()
            current = { token, controller }
            latestToken = token

            return {
                signal: controller.signal,
                isCurrent: () => current?.token === token,
                isLatest: () => latestToken === token,
                finish: () => {
                    if (current?.token === token) {
                        current = null
                    }
                },
            }
        },
        cancel,
        hasCurrent() {
            return current !== null
        },
        dispose() {
            disposed = true
            cancel()
        },
    }
}
