<script lang="ts">
    import { ParseMarkdown } from 'src/ts/parser/parser.svelte'
    import { cancelObservedServerOperation, isServerOrchestrationEnabled } from 'src/ts/bgOrchestrate'
    import { notifyWarning } from 'src/ts/alert'
    import { closePreviewThoughts, createStreamPreviewObserver, readStreamPreview,
        type StreamPreview } from 'src/ts/bgStreamPreview'

    let { charId, chatId, chat, name = '', active = false }: {
        charId: string; chatId: string;
        chat: { message?: { chatId?: string }[] } | null;
        name?: string;
        active?: boolean;
    } = $props()
    let display = $state<{ preview: StreamPreview; html: string } | null>(null)
    let cancelling = $state<string | null>(null)
    let operationId = $state<string | null>(null)
    let settledOperationId = $state<string | null>(null)
    let confirmedCoordinates = ''
    const displayed = $derived(display && !chat?.message?.some(message => message.chatId === display?.preview.rowChatId)
        ? display : null)
    const controlledOperation = $derived(operationId && operationId !== settledOperationId
        && (!display || displayed) ? operationId : null)

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
        if (!controlledOperation || cancelling) return
        const target = { operationId: controlledOperation, charId, chatId }
        cancelling = target.operationId
        try {
            const result = await cancelObservedServerOperation(target)
            if (charId !== target.charId || chatId !== target.chatId) return
            if (result !== 'unconfirmed') {
                settledOperationId = target.operationId
                if (operationId === target.operationId) display = null
            }
            else notifyWarning('생성 중지 요청을 확인하지 못했어요. 답변 상태를 확인한 뒤 다시 시도해 주세요.', { source: 'bg-input' })
        } finally { if (cancelling === target.operationId) cancelling = null }
    }
</script>

{#if displayed || controlledOperation}
    <section data-bg-stream-preview aria-label="서버 스트리밍 답변"
        class="mx-auto my-2 w-full max-w-4xl rounded-xl border border-darkborderc bg-darkbg px-4 py-3 text-textcolor">
        <div class="mb-2 flex items-center justify-between gap-2 text-xs text-textcolor2">
            <span>{name || '답변'} · {displayed ? '생성 중' : '서버 처리 중'}</span>
            {#if controlledOperation}
            <button type="button" class="rounded-md border border-darkborderc px-2 py-1"
                disabled={!!cancelling} onclick={() => void stopGeneration()}>
                {cancelling ? '중지 확인 중' : '생성 중지'}
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
