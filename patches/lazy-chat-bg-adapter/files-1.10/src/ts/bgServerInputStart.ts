import {
    classifyOrchestrationStatusResponse,
    reconcileOrchestrationStart,
} from './bgOrchestrationStart'

export const SERVER_INPUT_START_WINDOW_MS = 60_000
export const SERVER_INPUT_START_ATTEMPT_TIMEOUT_MS = 10_000

interface HttpOutcome {
    status: number
    body: unknown
}

export interface ServerInputStartOutcome {
    resolution: 'accepted' | 'rejected' | 'unknown'
    state: string | null
    rejectedReason: string | null
    // Server storage epoch from the response that established acceptance;
    // absent when that response carried none.
    storageEpoch?: number
}

// A non-negative safe integer epoch from a server body, else null.
export function responseStorageEpoch(body: unknown): number | null {
    const value = (body as { storageEpoch?: unknown } | null)?.storageEpoch
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

const preAdmissionReasons = new Set([
    'server-input-command-mode-unsupported',
    'server-input-command-unavailable',
    'server-chat-commit-unavailable',
    'input_command_identity_conflict',
    'blocked_input_retry_unavailable',
    'submitted_base_changed',
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
    let rejectedReason: string | null = null
    let storageEpoch: number | null = null
    const resolution = await reconcileOrchestrationStart({
        start: async signal => {
            const response = await options.start(signal)
            const body = response.body as Record<string, unknown> | null
            if (response.status >= 200 && response.status < 300
                && body?.operationId === options.operationId
                && (body.started === true || body.accepted === true)) {
                state = typeof body.state === 'string' ? body.state : null
                storageEpoch = responseStorageEpoch(body)
                return 'accepted'
            }
            // The start request itself was refused by the session lock before any
            // admission: final for this attempt, no status reconciliation.
            if (response.status === 423) {
                rejectedReason = 'session-deactivated'
                return 'rejected'
            }
            // Refused by the client build fence before admission (the build
            // handshake reloads or freezes the tab): final after this attempt.
            // A 426 without this code stays ambiguous.
            if (response.status === 426 && body?.code === 'CLIENT_UPGRADE_REQUIRED') {
                rejectedReason = 'client-upgrade-required'
                return 'rejected'
            }
            if ((response.status === 401 || response.status === 403)
                || (response.status === 409 && body?.operationId === options.operationId
                    && preAdmissionReasons.has(String(body.reason)))) {
                rejectedReason = typeof body?.reason === 'string' ? body.reason : null
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
                storageEpoch = responseStorageEpoch(body)
                return 'accepted'
            }
            if (status === 'missing') return 'missing'
            throw new Error('server input status is ambiguous')
        },
        isCurrent: options.isCurrent,
        deadlineAt: options.deadlineAt,
        attemptTimeoutMs: SERVER_INPUT_START_ATTEMPT_TIMEOUT_MS,
        now: options.now,
        wait: options.wait,
    })
    return {
        resolution: resolution === 'abandoned' ? 'unknown' : resolution,
        state,
        rejectedReason,
        ...(resolution === 'accepted' && storageEpoch !== null ? { storageEpoch } : {}),
    }
}
