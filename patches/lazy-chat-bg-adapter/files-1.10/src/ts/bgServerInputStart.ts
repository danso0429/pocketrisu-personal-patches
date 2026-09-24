import {
    classifyOrchestrationStatusResponse,
    reconcileOrchestrationStart,
} from './bgOrchestrationStart'

interface HttpOutcome {
    status: number
    body: unknown
}

export interface ServerInputStartOutcome {
    resolution: 'accepted' | 'rejected' | 'unknown'
    state: string | null
}

const preAdmissionReasons = new Set([
    'server-input-command-mode-unsupported',
    'server-input-command-unavailable',
    'server-chat-commit-unavailable',
])

export async function reconcileServerInputStart(options: {
    operationId: string
    start: (signal: AbortSignal) => Promise<HttpOutcome>
    status: (signal: AbortSignal) => Promise<HttpOutcome>
    isCurrent: () => boolean
    deadlineAt: number
    now?: () => number
    wait?: (ms: number) => Promise<void>
}): Promise<ServerInputStartOutcome> {
    let state: string | null = null
    const resolution = await reconcileOrchestrationStart({
        start: async signal => {
            const response = await options.start(signal)
            const body = response.body as Record<string, unknown> | null
            if (response.status >= 200 && response.status < 300
                && body?.operationId === options.operationId
                && (body.started === true || body.accepted === true)) {
                state = typeof body.state === 'string' ? body.state : null
                return 'accepted'
            }
            if ((response.status === 401 || response.status === 403)
                || (response.status === 409 && body?.operationId === options.operationId
                    && preAdmissionReasons.has(String(body.reason)))) {
                return 'rejected'
            }
            throw new Error('server input start outcome is ambiguous')
        },
        status: async signal => {
            const response = await options.status(signal)
            const status = classifyOrchestrationStatusResponse(
                response.status, response.body, options.operationId,
            )
            if (status === 'accepted') {
                const body = response.body as Record<string, unknown>
                state = typeof body.state === 'string' ? body.state : null
                return 'accepted'
            }
            if (status === 'missing') return 'missing'
            throw new Error('server input status is ambiguous')
        },
        isCurrent: options.isCurrent,
        deadlineAt: options.deadlineAt,
        now: options.now,
        wait: options.wait,
    })
    return {
        resolution: resolution === 'abandoned' ? 'unknown' : resolution,
        state,
    }
}
