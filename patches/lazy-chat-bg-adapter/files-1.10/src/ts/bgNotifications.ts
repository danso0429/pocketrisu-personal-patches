export type NotificationCode = 'input_host_unsupported' | 'plugin_permission_missing'
    | 'plugin_api_unsupported' | 'plugin_hook_failed' | 'plugin_provider_failed' | 'plugin_message'
    | 'plugin_host_limit' | 'plugin_late_call'
export interface BgNotification {
    id: string
    token: string
    leaseMs: number
    event: {
        code: NotificationCode
        operationId: string
        eventKey: string
        charId: string
        chatId: string
        createdAt: number
        effectsMayHaveOccurred: boolean
        api?: string
        pluginName?: string
        pluginVersion?: string
        phase?: string
        message?: string
        level?: 'info' | 'warning' | 'error'
        reason?: 'notification_capacity' | 'operation_budget'
    }
}
const CODES = new Set<NotificationCode>(['input_host_unsupported', 'plugin_permission_missing',
    'plugin_api_unsupported', 'plugin_hook_failed', 'plugin_provider_failed', 'plugin_message', 'plugin_host_limit', 'plugin_late_call'])
const SEEN_KEY = 'bg-notification-seen-v1'
const RETAIN_MS = 48 * 60 * 60 * 1000
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string'
    && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)

export function parseBgNotifications(value: unknown): BgNotification[] {
    if (!value || typeof value !== 'object' || !Array.isArray((value as any).notifications)
        || (value as any).notifications.length > 8) throw new Error('Invalid notification response')
    const rows = (value as { notifications: BgNotification[] }).notifications
    const ids = new Set<string>()
    for (const row of rows) {
        const event = row?.event
        if (!row || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id) || ids.has(row.id)
            || !identifier(row.token) || !Number.isSafeInteger(row.leaseMs) || row.leaseMs <= 0 || row.leaseMs > 30_000
            || !event || !CODES.has(event.code) || !identifier(event.operationId)
            || !text(event.eventKey, 160) || !text(event.charId, 255) || !text(event.chatId, 255)
            || !Number.isSafeInteger(event.createdAt) || event.createdAt <= 0
            || typeof event.effectsMayHaveOccurred !== 'boolean'
            || ((event.code === 'input_host_unsupported' || event.code === 'plugin_api_unsupported')
                && (typeof event.api !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(event.api)))
            || (event.code.startsWith('plugin_') && (!text(event.pluginName, 120) || !text(event.pluginVersion, 80)
                || !['load', 'input', 'before_request', 'after_request', 'provider'].includes(event.phase || '')))
            || (event.code === 'plugin_permission_missing' && event.effectsMayHaveOccurred)
            || (event.code === 'plugin_host_limit' && !['notification_capacity', 'operation_budget'].includes(event.reason ?? ''))
            || (event.code === 'plugin_message' && (typeof event.message !== 'string' || event.message.length < 1
                || event.message.length > 4096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(event.message)
                || !['info', 'warning', 'error'].includes(event.level ?? '')))) {
            throw new Error('Invalid notification record')
        }
        ids.add(row.id)
    }
    return rows
}

export function notificationMessage(notification: BgNotification): string {
    const event = notification.event
    const plugin = `${event.pluginName} (${event.pluginVersion})`
    switch (event.code) {
        case 'input_host_unsupported': return '서버에서 처리할 수 없는 입력 동작으로 멈췄어요. 원문은 해당 채팅에 보존했어요.'
        case 'plugin_permission_missing': return `${plugin}: 저장된 권한이 없거나 재확인이 필요해 플러그인을 적용하지 않았어요. 앱에서 권한을 확인해 주세요.`
        case 'plugin_api_unsupported': {
            const reasons: Record<string, string> = { server_plugin_host_disabled: '호스트가 꺼져 있어', server_plugin_host_bindings: '필수 서버 API가 없어',
                server_plugin_host_ownership: '작업 소유권을 지원하지 않아' }
            const unavailable = reasons[event.api as string]
            return unavailable ? `${plugin}: ${unavailable} 서버 플러그인 실행을 생략했어요.`
                : `${plugin}: 서버에서 지원하지 않는 API를 요청했어요 (${event.api}).`
        }
        case 'plugin_hook_failed': return `${plugin}: 요청 처리 중 플러그인 오류가 발생했어요.`
        case 'plugin_provider_failed': return `${plugin}: 모델 공급자 실행이 실패했어요.`
        case 'plugin_message': return `${plugin}: ${event.message}`
        case 'plugin_host_limit': return event.reason === 'notification_capacity'
            ? '서버 알림 보관 한도로 일부 플러그인 알림을 생략했어요. 생성 작업은 계속 진행해요.'
            : event.eventKey.endsWith(':settlement-budget')
                ? `${plugin}: 플러그인의 추가 처리 대기 한도에 도달했어요. 일부 처리가 끝나지 않았을 수 있으니 응답과 저장 상태를 확인해 주세요.`
            : event.eventKey.endsWith(':limit')
                ? `${plugin}: 플러그인 API 호출이 실행 한도를 초과해 거부되었어요.`
                : `${plugin}: 서버 플러그인 실행 한도에 도달해 이 플러그인의 요청을 중단했어요.`
        case 'plugin_late_call': return `${plugin}: 완료된 콜백에서 뒤늦게 도착한 API 요청을 거부했어요. 다른 콜백은 유지해요.`
    }
}

export function createBgNotificationDelivery(deps: {
    claim: (signal: AbortSignal) => Promise<unknown>
    acknowledge: (claims: Array<{ id: string, token: string }>, signal: AbortSignal) => Promise<void>
    render: (notice: BgNotification) => void
    visible: () => boolean
    storage: Pick<Storage, 'getItem' | 'setItem'>
    monotonicNow?: () => number
    now?: () => number
}) {
    const now = deps.now || Date.now
    const monotonicNow = deps.monotonicNow || (() => performance.now())
    const seen = new Map<string, number>()
    let disposed = false, inFlight = false, controller: AbortController | null = null
    const prune = () => {
        for (const [id, at] of seen) if (at + RETAIN_MS <= now()) seen.delete(id)
        while (seen.size > 1024) seen.delete(seen.keys().next().value!)
    }
    const readSeen = () => {
        try {
            const rows = JSON.parse(deps.storage.getItem(SEEN_KEY) || '[]')
            if (Array.isArray(rows) && rows.length <= 1024) {
                for (const row of rows) if (Array.isArray(row) && /^[a-f0-9]{64}$/.test(row[0])
                    && Number.isSafeInteger(row[1]) && row[1] > 0 && row[1] <= now()) seen.set(row[0], row[1])
            }
        } catch { /* Page-local receipts still suppress ordinary ACK retries. */ }
        prune()
    }
    async function refresh(): Promise<void> {
        if (disposed || inFlight || !deps.visible()) return
        inFlight = true
        controller = new AbortController()
        const signal = controller.signal
        const deadlineStart = monotonicNow()
        const timeout = setTimeout(() => controller?.abort(), 10_000)
        try {
            const notices = parseBgNotifications(await deps.claim(signal))
            const acknowledgements: Array<{ id: string, token: string }> = []
            readSeen()
            for (const notice of notices) {
                if (disposed || signal.aborted || !deps.visible()
                    || monotonicNow() >= deadlineStart + notice.leaseMs) break
                if (!seen.has(notice.id)) {
                    deps.render(notice)
                    seen.set(notice.id, now())
                    prune()
                    try { deps.storage.setItem(SEEN_KEY, JSON.stringify([...seen])) }
                    catch { /* Server ACK remains durable; enqueue/crash is not exactly-once observation. */ }
                }
                acknowledgements.push({ id: notice.id, token: notice.token })
            }
            if (!disposed && !signal.aborted && acknowledgements.length) {
                await deps.acknowledge(acknowledgements, signal)
            }
        } catch { /* Preserve unacknowledged events; a later visible refresh retries. */ }
        finally { clearTimeout(timeout); controller = null; inFlight = false }
    }
    return { refresh, stop: () => { disposed = true; controller?.abort() } }
}
