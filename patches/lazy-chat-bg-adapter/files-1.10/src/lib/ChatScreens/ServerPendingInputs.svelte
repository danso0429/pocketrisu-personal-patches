<script lang="ts">
    import { hasServerOwnedInputMarker, reconcileServerPendingInputCommands } from 'src/ts/bgOrchestrate'
    import type { ServerPendingInput } from 'src/ts/bgServerPendingProjection'

    let { charId, chatId, chat, onRetryBlocked }: {
        charId: string
        chatId: string
        chat: unknown
        onRetryBlocked?: (input: ServerPendingInput) => Promise<void>
    } = $props()

    let pending = $state<ServerPendingInput[]>([])
    let unavailable = $state(false)
    let retryingId = $state('')

    async function retry(input: ServerPendingInput) {
        if (!onRetryBlocked || retryingId || input.retryAllowed !== true
            || !input.rawText || !input.inputCommandId) return
        retryingId = input.operationId
        try { await onRetryBlocked(input) }
        finally { retryingId = '' }
    }

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
                const result = await reconcileServerPendingInputCommands(
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
                const activePending = pending.some(input => (
                    input.state !== 'blocked_edit' && input.state !== 'execution_unknown'
                ))
                if (!disposed && (activePending || (pending.length === 0
                    && hasServerOwnedInputMarker(currentCharId, currentChatId)))) {
                    timer = setTimeout(refresh, 2000)
                }
            }
        }
        const onReturn = () => {
            if (document.visibilityState === 'visible') void refresh()
        }
        const onInputUpdate = () => { void refresh() }
        void refresh()
        window.addEventListener('focus', onReturn)
        window.addEventListener('storage', onReturn)
        window.addEventListener('bg-server-input-updated', onInputUpdate)
        document.addEventListener('visibilitychange', onReturn)
        return () => {
            disposed = true
            if (timer) clearTimeout(timer)
            window.removeEventListener('focus', onReturn)
            window.removeEventListener('storage', onReturn)
            window.removeEventListener('bg-server-input-updated', onInputUpdate)
            document.removeEventListener('visibilitychange', onReturn)
        }
    })
</script>

{#if pending.length > 0 || unavailable}
    <div class="mb-1 rounded-xl border border-darkborderc px-3 py-2 text-xs text-textcolor2" aria-live="polite">
        {#each pending as input (input.operationId)}
            <div>
                <div>{label(input.state)}</div>
                {#if input.state === 'blocked_edit' && input.rawText && input.inputCommandId}
                    <div class="line-clamp-2 break-all">{input.rawText}</div>
                    {#if input.retryAllowed}
                        <button type="button" class="underline" disabled={!!retryingId || !onRetryBlocked}
                            onclick={() => void retry(input)}>
                            이 입력을 새로 생성하기 (모델 호출 가능)
                        </button>
                    {/if}
                {/if}
            </div>
        {/each}
        {#if unavailable}
            <div>서버 입력 상태를 확인할 수 없음</div>
        {/if}
    </div>
{/if}
