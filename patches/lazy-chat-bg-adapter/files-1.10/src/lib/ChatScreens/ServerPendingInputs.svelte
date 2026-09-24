<script lang="ts">
    import { readServerPendingInputCommands } from 'src/ts/bgOrchestrate'
    import type { ServerPendingInput } from 'src/ts/bgServerPendingProjection'

    let { charId, chatId, chat }: {
        charId: string
        chatId: string
        chat: unknown
    } = $props()

    let pending = $state<ServerPendingInput[]>([])
    let unavailable = $state(false)

    function label(state: ServerPendingInput['state']): string {
        switch (state) {
            case 'waiting_predecessor': return '앞선 답변을 기다리는 입력'
            case 'queued': return '서버에 접수된 입력'
            case 'attached': return '서버에 저장된 입력'
            case 'generating': return '서버에서 답변 생성 중'
            case 'blocked_edit': return '입력 충돌: 채팅을 확인한 뒤 다시 보내야 함'
            case 'execution_unknown': return '생성 상태 미확인: 재전송 전 채팅을 확인해야 함'
        }
    }

    $effect(() => {
        const currentCharId = charId
        const currentChatId = chatId
        const currentChat = chat
        if (!currentCharId || !currentChatId || !currentChat) {
            pending = []
            unavailable = false
            return
        }
        let disposed = false
        let inFlight = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const refresh = async () => {
            if (disposed || inFlight) return
            inFlight = true
            if (timer) { clearTimeout(timer); timer = null }
            try {
                const result = await readServerPendingInputCommands(
                    currentCharId, currentChatId, currentChat,
                )
                if (!disposed) {
                    pending = result
                    unavailable = false
                }
            } catch {
                if (!disposed) unavailable = true
            } finally {
                inFlight = false
                if (!disposed && pending.length > 0) {
                    timer = setTimeout(refresh, 2000)
                }
            }
        }
        const onReturn = () => {
            if (document.visibilityState === 'visible') void refresh()
        }
        void refresh()
        window.addEventListener('focus', onReturn)
        document.addEventListener('visibilitychange', onReturn)
        return () => {
            disposed = true
            if (timer) clearTimeout(timer)
            window.removeEventListener('focus', onReturn)
            document.removeEventListener('visibilitychange', onReturn)
        }
    })
</script>

{#if pending.length > 0 || unavailable}
    <div class="mb-1 rounded-xl border border-darkborderc px-3 py-2 text-xs text-textcolor2" aria-live="polite">
        {#each pending as input (input.operationId)}
            <div>{label(input.state)}</div>
        {/each}
        {#if unavailable}
            <div>서버 입력 상태를 확인할 수 없음</div>
        {/if}
    </div>
{/if}
