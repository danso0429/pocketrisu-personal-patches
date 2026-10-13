<script module lang="ts">
    let processingPresentation = 0
</script>
<script lang="ts">
    import { untrack } from 'svelte'
    import { ParseMarkdown } from 'src/ts/parser/parser.svelte'
    import { cancelObservedServerOperation, isServerOrchestrationEnabled } from 'src/ts/bgOrchestrate'
    import { notifyWarning } from 'src/ts/alert'
    import { DBState } from 'src/ts/stores.svelte'
    import { requestStatuses, startStatus, clearStatus, isTerminalPhase } from 'src/ts/status/requestStatus'
    import { closePreviewThoughts, createStreamPreviewObserver, readStreamPreview,
        type StreamPreview } from 'src/ts/bgStreamPreview'

    let { charId, chatId, chat, name = '', active = false, onControl }: {
        charId: string; chatId: string;
        chat: { message?: { chatId?: string }[] } | null;
        name?: string;
        active?: boolean;
        onControl?: (available: boolean) => void;
    } = $props()
    let display = $state<{ preview: StreamPreview; html: string } | null>(null)
    let cancelling = $state<string[]>([])
    let operationId = $state<string | null>(null)
    let observedTarget = $state<{ operationId: string; charId: string; chatId: string } | null>(null)
    let settledOperationId = $state<string | null>(null)
    let confirmedCoordinates = ''
    const displayed = $derived(display && !chat?.message?.some(message => message.chatId === display?.preview.rowChatId)
        ? display : null)
    const controlledOperation = $derived(operationId && operationId !== settledOperationId
        && (!display || displayed) ? operationId : null)

    $effect(() => {
        onControl?.(!!controlledOperation && observedTarget?.charId === charId && observedTarget?.chatId === chatId)
        return () => onControl?.(false)
    })

    // Reuse the existing upper request-status surface. This placeholder is
    // memory-only and never represents a completed result or paid effect.
    $effect(() => {
        const operation = controlledOperation, selectedChat = chatId
        if (!operation || DBState.db.showRequestStatus === false) return
        let id: string | null = null
        const startedAt = Date.now()
        const unsubscribe = untrack(() => requestStatuses.subscribe(entries => {
            const native = [...entries.values()].some(entry => entry.id !== id && entry.chatId === selectedChat
                && !isTerminalPhase(entry.phase))
            if (native && id && entries.has(id)) clearStatus(id)
            else if (!native && (!id || !entries.has(id))) {
                // Sonner may retain a dismissed DOM entry briefly. Reusing its
                // id can preserve dismiss=true and hide the new presentation.
                id = 'bg-server-processing:' + operation + ':' + ++processingPresentation
                startStatus(id, { kind: 'main', label: '서버 처리 중', chatId: selectedChat,
                    phase: 'background', now: startedAt })
            }
        }))
        return () => { unsubscribe(); if (id) clearStatus(id) }
    })

    $effect(() => {
        const coordinates = JSON.stringify([charId, chatId])
        if (coordinates !== confirmedCoordinates) {
            confirmedCoordinates = coordinates
            settledOperationId = null
        }
    })

    $effect(() => {
        const character = charId, selectedChat = chatId, observing = active
        display = null
        operationId = null
        observedTarget = null
        if (!character || !selectedChat || !observing || !isServerOrchestrationEnabled()) return
        const observer = createStreamPreviewObserver({
            read: (previous, signal) => readStreamPreview(character, selectedChat, previous, signal),
            // Null character skips Lua/display triggers/plugin hooks, while the
            // native Markdown/thought/style/inlay/sanitizer pipeline is reused.
            render: preview => ParseMarkdown(closePreviewThoughts(preview.text), null, 'normal'),
            publish: value => { display = value },
            publishOperation: value => {
                if (value !== operationId) display = null
                operationId = value
                observedTarget = value ? { operationId: value, charId: character, chatId: selectedChat } : null
            },
            visible: () => document.visibilityState === 'visible',
        })
        const visibility = () => {
            if (document.visibilityState === 'visible') observer.wake()
            else observer.pause()
        }
        const wake = () => observer.wake()
        document.addEventListener('visibilitychange', visibility)
        window.addEventListener('focus', wake)
        window.addEventListener('bg-server-input-updated', wake)
        queueMicrotask(() => observer.wake())
        return () => {
            observer.dispose()
            document.removeEventListener('visibilitychange', visibility)
            window.removeEventListener('focus', wake)
            window.removeEventListener('bg-server-input-updated', wake)
        }
    })

    // The preview is not a message row and cannot invoke message/trigger controls.
    function protectDisplay(event: MouseEvent) {
        if ((event.target as Element)?.closest?.('[risu-btn], [risu-trigger], [risu-ctrl]')) {
            event.preventDefault(); event.stopImmediatePropagation()
        }
    }
    async function stopGeneration() {
        if (!controlledOperation || cancelling.includes(controlledOperation)) return
        const target = observedTarget
        if (!target || target.operationId !== controlledOperation || target.charId !== charId || target.chatId !== chatId) return
        cancelling = [...cancelling, target.operationId]
        try {
            const result = await cancelObservedServerOperation(target)
            if (charId !== target.charId || chatId !== target.chatId) return
            if (result !== 'unconfirmed') {
                settledOperationId = target.operationId
                if (operationId === target.operationId) display = null
            }
            else notifyWarning('생성 중지 요청을 확인하지 못했어요. 답변 상태를 확인한 뒤 다시 시도해 주세요.', { source: 'bg-input' })
        } finally { cancelling = cancelling.filter(id => id !== target.operationId) }
    }
    // The ordinary composer circle and streaming button share this target and
    // in-flight guard; no extra preparation/nonstream button is rendered.
    export function requestStopGeneration(): boolean {
        if (!controlledOperation || !observedTarget || observedTarget.operationId !== controlledOperation
            || observedTarget.charId !== charId || observedTarget.chatId !== chatId) return false
        void stopGeneration()
        return true
    }
</script>

{#if displayed}
    <section data-bg-stream-preview aria-label="서버 스트리밍 답변"
        class="mx-auto my-2 w-full max-w-4xl rounded-xl border border-darkborderc bg-darkbg px-4 py-3 text-textcolor">
        <div class="mb-2 flex items-center justify-between gap-2 text-xs text-textcolor2">
            <span>{name || '답변'} · 생성 중</span>
            {#if controlledOperation}
            <button type="button" class="rounded-md border border-darkborderc px-2 py-1"
                disabled={cancelling.includes(controlledOperation)} onclick={() => void stopGeneration()}>
                {cancelling.includes(controlledOperation) ? '중지 확인 중' : '생성 중지'}
            </button>
            {/if}
        </div>
        {#if displayed?.preview.oversized}
            <p class="text-sm text-textcolor2">답변이 길어 미리보기를 생략했어요. 완료 후 전체 답변을 표시해요.</p>
        {:else if displayed}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="chattext prose prose-invert max-w-none break-words" onclickcapture={protectDisplay}>
                {@html displayed.html}
            </div>
        {/if}
    </section>
{/if}
