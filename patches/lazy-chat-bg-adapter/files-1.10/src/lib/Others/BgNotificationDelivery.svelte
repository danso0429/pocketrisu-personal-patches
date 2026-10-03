<script lang="ts">
    import { toast } from 'svelte-sonner'
    import { v4 } from 'uuid'
    import { DBState } from 'src/ts/stores.svelte'
    import { addLog } from 'src/ts/log'
    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'
    import { createBgNotificationDelivery, notificationMessage } from 'src/ts/bgNotifications'

    let { enabled }: { enabled: boolean } = $props()
    $effect(() => {
        if (!enabled) return
        const consumerId = v4()
        const request = async (endpoint: string, body: unknown, signal: AbortSignal) => {
            const response = await clientBuildFetch('/api/bg-notifications/' + endpoint, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
            })
            if (!response.ok) throw new Error('Notification delivery unavailable')
            return response.json()
        }
        const delivery = createBgNotificationDelivery({
            claim: signal => request('claim', { consumerId }, signal),
            acknowledge: async (claims, signal) => { await request('ack', { consumerId, claims }, signal) },
            visible: () => document.visibilityState === 'visible',
            storage: {
                getItem: key => localStorage.getItem(key),
                setItem: (key, value) => localStorage.setItem(key, value),
            },
            render: notice => {
                const character = DBState.db.characters.find(row => row.chaId === notice.event.charId)
                const chat = character?.chats?.find(row => row.id === notice.event.chatId)
                const location = character ? `${character.name} / ${chat?.name || '이전 채팅'}` : '이전 채팅'
                const message = notificationMessage(notice)
                const description = location + (notice.event.effectsMayHaveOccurred
                    ? ' — 이미 실행된 모델 호출이나 외부 작업은 되돌리지 않았어요.' : '')
                // Do not clear an unrelated input/progress modal via notify* helpers.
                toast.warning(message, { id: 'bg-notification-' + notice.id, description })
                try { addLog({ level: 'warning', message, source: 'bg-notification' }) }
                catch { /* Logging failure must not turn an enqueued toast into another render. */ }
            },
        })
        let disposed = false, timer: ReturnType<typeof setTimeout> | null = null
        const refresh = async () => {
            if (timer) clearTimeout(timer)
            timer = null
            await delivery.refresh()
            if (!disposed && document.visibilityState === 'visible' && timer === null) timer = setTimeout(refresh, 5000)
        }
        const onReturn = () => { if (document.visibilityState === 'visible') void refresh() }
        void refresh()
        window.addEventListener('focus', onReturn)
        window.addEventListener('bg-server-input-updated', onReturn)
        document.addEventListener('visibilitychange', onReturn)
        return () => {
            disposed = true; delivery.stop()
            if (timer) clearTimeout(timer)
            window.removeEventListener('focus', onReturn)
            window.removeEventListener('bg-server-input-updated', onReturn)
            document.removeEventListener('visibilitychange', onReturn)
        }
    })
</script>
