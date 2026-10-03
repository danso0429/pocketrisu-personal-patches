// Never copy an arbitrary response body into persisted client logs.
const knownStartReasons = new Set([
    'chat-generation-active',
    'server-chat-commit-unavailable',
    'server-chat-commit-base-read-failed',
    'server-chat-commit-base-unavailable',
    'server-chat-commit-input-stale',
    'server-chat-commit-already-completed',
    'server-chat-commit-identity-unavailable',
    'server-input-command-unavailable',
    'server-input-command-mode-unsupported',
    'server-input-command-blocked',
    'server-input-admission-failed',
    'start-reconciliation-required',
    'operation-coordinate-conflict',
    'operation-protocol-conflict',
    'operation-state-store-unavailable',
    'orchestration-capacity',
])

export function orchestrationStartDiagnostic(status: number, reason: unknown): string {
    if (status === 401 || status === 403) return 'authorization-rejected'
    return typeof reason === 'string' && knownStartReasons.has(reason) ? reason : 'unknown'
}
