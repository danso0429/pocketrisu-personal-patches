// The Node transformer supplies an async-local scope, including delayed
// descendants. Browser calls and prepared/main execution have no input scope.
type InputExecution = { signal?: AbortSignal; failure: Error | null; reject(api: string): never }

function scope(): InputExecution | undefined {
    return (globalThis as typeof globalThis & { __bgGetServerInputExecution?: () => InputExecution | undefined })
        .__bgGetServerInputExecution?.()
}

export function assertServerInputCanContinue(): void {
    const current = scope()
    if (current?.signal?.aborted) throw Object.assign(new Error('server input aborted'), { code: 'BG_INPUT_ABORTED' })
    if (current?.failure) throw current.failure
}

export function rejectUnsupportedServerInput(api: string): void {
    scope()?.reject(api)
}
