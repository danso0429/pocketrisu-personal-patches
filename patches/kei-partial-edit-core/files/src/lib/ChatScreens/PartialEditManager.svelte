<script lang="ts">
    import { SaveIcon, Trash2Icon } from '@lucide/svelte';
    import { onDestroy, untrack } from 'svelte';
    import { language } from 'src/lang';
    import ShButton from 'src/lib/UI/GUI/ShButton.svelte';
    import ShDialog from 'src/lib/UI/GUI/ShDialog.svelte';
    import TextAreaInput from 'src/lib/UI/GUI/TextAreaInput.svelte';
    import {
        EDITABLE_BLOCK_SELECTORS,
        findAllOriginalRangesFromHtml,
        findAllOriginalRangesFromText,
        replaceRange,
        type RangeResult,
        type RangeResultWithContext,
    } from 'src/ts/parser/partialEdit';
    import {
        samePartialEditMessageIdentity,
        type PartialEditMessageIdentity,
    } from './keiPartialEditIdentity';
    import { DBState, ReloadChatPointer } from 'src/ts/stores.svelte';
    import type { Message } from 'src/ts/storage/database.svelte';

    interface Props {
        screenRoot: HTMLElement | null;
        messages: Message[];
        characterIndex: number;
        chatPage: number;
        chatId?: string | null;
        blockEditEnabled?: boolean;
        dragEditEnabled?: boolean;
    }

    interface TranslationEditContext {
        token: object;
        key: string;
        data: string;
    }

    interface TranslationSaveDetail extends TranslationEditContext {
        expectedData: string;
        respond: (result: Promise<boolean>) => void;
    }

    interface PartialEditTarget extends PartialEditMessageIdentity {
        characterIndex: number;
        chatPage: number;
        chatId: string | null;
        messageRef: Message;
        translatedView: boolean;
        chatRoot: HTMLElement;
        bodyRoot: HTMLElement;
    }

    type MatchingMode = 'edit' | 'delete' | null;
    type EditSource = 'original' | 'translation';

    let {
        screenRoot,
        messages,
        characterIndex,
        chatPage,
        chatId = null,
        blockEditEnabled = false,
        dragEditEnabled = false,
    }: Props = $props();

    const MIN_DRAG_SELECTION_LENGTH = 5;
    const PARTIAL_EDIT_BUTTON_CELL_SIZE = 32;
    const PARTIAL_EDIT_ICON_SIZE = 16;
    const SELECTOR = EDITABLE_BLOCK_SELECTORS.join(', ');

    let isEditing = $state(false);
    let isSaving = $state(false);
    let saveFailed = $state(false);
    let editText = $state('');
    let textareaWrapperRef: HTMLDivElement | null = $state(null);
    let isConfirmingDelete = $state(false);
    let showMatchFailedModal = $state(false);
    let messageData = $state('');

    let matchingState = $state<{
        mode: MatchingMode;
        targetElement: HTMLElement | null;
        originalHTML: string;
        foundMatches: RangeResultWithContext[];
        selectedRange: RangeResult | null;
        sourceType: EditSource;
        sourceData: string;
    }>({
        mode: null,
        targetElement: null,
        originalHTML: '',
        foundMatches: [],
        selectedRange: null,
        sourceType: 'original',
        sourceData: '',
    });

    let activeTarget: PartialEditTarget | null = null;
    let activeTranslationContext: TranslationEditContext | null = null;
    let blockButtonWrapper: HTMLDivElement | null = null;
    let currentHoveredBlock: HTMLElement | null = null;
    let dragButtonWrapper: HTMLDivElement | null = null;
    let currentDragSelectedText = '';
    let rafId: number | null = null;
    let selectionTimer: ReturnType<typeof setTimeout> | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    function emptyMatchingState() {
        return {
            mode: null as MatchingMode,
            targetElement: null as HTMLElement | null,
            originalHTML: '',
            foundMatches: [] as RangeResultWithContext[],
            selectedRange: null as RangeResult | null,
            sourceType: 'original' as EditSource,
            sourceData: '',
        };
    }

    function hasOpenInteraction() {
        return isEditing
            || isSaving
            || isConfirmingDelete
            || matchingState.mode !== null
            || showMatchFailedModal;
    }

    function hasTextContent(element: HTMLElement) {
        const clone = element.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('button').forEach((button) => button.remove());
        return !!clone.textContent?.trim();
    }

    function createButton(
        className: string,
        onEdit: () => void,
        onDelete: () => void,
        onMouseLeave?: (event: MouseEvent) => void,
    ) {
        const wrapper = document.createElement('div');
        wrapper.className = className;
        wrapper.style.setProperty('--partial-edit-icon-size', `${PARTIAL_EDIT_ICON_SIZE}px`);
        wrapper.style.setProperty('--partial-edit-cell-size', `${PARTIAL_EDIT_BUTTON_CELL_SIZE}px`);
        wrapper.innerHTML = `
            <button type="button" class="partial-edit-btn partial-edit-btn-edit">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                </svg>
            </button>
            <button type="button" class="partial-edit-btn partial-edit-btn-delete">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        `;

        const editButton = wrapper.querySelector<HTMLButtonElement>('.partial-edit-btn-edit')!;
        editButton.title = language.partialEdit.editButtonTooltip;
        editButton.setAttribute('aria-label', language.partialEdit.editButtonTooltip);
        editButton.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            onEdit();
        });

        const deleteButton = wrapper.querySelector<HTMLButtonElement>('.partial-edit-btn-delete')!;
        deleteButton.title = language.partialEdit.deleteButtonTooltip;
        deleteButton.setAttribute('aria-label', language.partialEdit.deleteButtonTooltip);
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            onDelete();
        });

        if (onMouseLeave) wrapper.addEventListener('mouseleave', onMouseLeave);
        return wrapper;
    }

    function resolveTarget(element: Element | null): PartialEditTarget | null {
        if (!element || !screenRoot) return null;
        const bodyRoot = element.closest('.chattext') as HTMLElement | null;
        const chatRoot = element.closest('.risu-chat[data-chat-index]') as HTMLElement | null;
        if (
            !bodyRoot
            || !chatRoot
            || !screenRoot.contains(chatRoot)
            || !chatRoot.contains(bodyRoot)
        ) {
            return null;
        }
        if (chatRoot.dataset.partialEditDisabled === 'true') return null;

        const messageIndex = Number.parseInt(chatRoot.dataset.chatIndex ?? '', 10);
        if (!Number.isInteger(messageIndex) || messageIndex < 0) return null;
        const messageRef = messages[messageIndex];
        if (!messageRef) return null;

        const character = DBState.db.characters[characterIndex];
        const chat = character?.chats?.[chatPage];
        if (!character || !chat || (chat.id ?? null) !== (chatId ?? null)) return null;
        if (chat.message?.[messageIndex] !== messageRef) return null;

        const messageId = messageRef.chatId ?? null;
        if ((chatRoot.dataset.chatId || null) !== messageId) return null;

        return {
            characterIndex,
            chatPage,
            chatId: chatId ?? null,
            chatRef: chat,
            messageIndex,
            messageId,
            messageRef,
            messageData: messageRef.data,
            translatedView: chatRoot.dataset.partialEditTranslated === 'true',
            chatRoot,
            bodyRoot,
        };
    }

    function getCurrentMessage(target: PartialEditTarget): Message | null {
        const character = DBState.db.characters[target.characterIndex];
        const chat = character?.chats?.[target.chatPage];
        if (!character || !chat) return null;
        if ((chat.id ?? null) !== target.chatId) return null;
        const message = chat.message?.[target.messageIndex];
        if (
            !message
            || !samePartialEditMessageIdentity({
                chatRef: chat,
                messageRef: message,
                messageIndex: target.messageIndex,
                messageId: message.chatId ?? null,
                messageData: message.data,
            }, target)
        ) {
            return null;
        }
        return message;
    }

    function validateTarget(
        target = activeTarget,
        requireDom = true,
    ): target is PartialEditTarget {
        if (
            !target
            || target.characterIndex !== characterIndex
            || target.chatPage !== chatPage
            || target.chatId !== (chatId ?? null)
            || messages[target.messageIndex] !== target.messageRef
        ) {
            return false;
        }
        const currentMessage = getCurrentMessage(target);
        if (!currentMessage || currentMessage.data !== target.messageData) return false;
        if (!requireDom) return true;
        if (
            !screenRoot
            || target.chatRoot.dataset.chatIndex !== String(target.messageIndex)
            || (target.chatRoot.dataset.chatId || null) !== target.messageId
            || target.chatRoot.dataset.partialEditDisabled === 'true'
            || (target.chatRoot.dataset.partialEditTranslated === 'true') !== target.translatedView
            || !target.chatRoot.isConnected
            || !target.bodyRoot.isConnected
            || !screenRoot.contains(target.chatRoot)
            || !target.chatRoot.contains(target.bodyRoot)
        ) {
            return false;
        }
        return true;
    }

    function setActiveTarget(target: PartialEditTarget) {
        activeTarget = target;
        messageData = target.messageData;
    }

    function showBlockButton(block: HTMLElement, target: PartialEditTarget) {
        if (currentHoveredBlock === block && blockButtonWrapper?.style.display === 'flex') return;
        setActiveTarget(target);
        currentHoveredBlock = block;

        if (!blockButtonWrapper) {
            blockButtonWrapper = createButton(
                'partial-edit-btn-wrapper',
                startBlockEdit,
                startBlockDelete,
                (event) => {
                    const relatedTarget = event.relatedTarget as HTMLElement | null;
                    if (!relatedTarget || !currentHoveredBlock?.contains(relatedTarget)) {
                        hideBlockButton();
                    }
                },
            );
            document.body.appendChild(blockButtonWrapper);
        }

        const rect = block.getBoundingClientRect();
        blockButtonWrapper.style.position = 'fixed';
        blockButtonWrapper.style.top = `${rect.top - PARTIAL_EDIT_BUTTON_CELL_SIZE - 4}px`;
        blockButtonWrapper.style.left = `${rect.left}px`;
        blockButtonWrapper.style.display = 'flex';
        blockButtonWrapper.style.gap = '4px';
        blockButtonWrapper.style.zIndex = '1000';
    }

    function hideBlockButton() {
        if (blockButtonWrapper) blockButtonWrapper.style.display = 'none';
        currentHoveredBlock = null;
        if (!hasOpenInteraction() && !currentDragSelectedText) activeTarget = null;
    }

    function showDragButton(rect: DOMRect, target: PartialEditTarget) {
        setActiveTarget(target);
        if (!dragButtonWrapper) {
            dragButtonWrapper = createButton(
                'partial-edit-btn-wrapper partial-edit-drag-btn-wrapper',
                startDragEdit,
                startDragDelete,
            );
            document.body.appendChild(dragButtonWrapper);
        }

        const width = PARTIAL_EDIT_BUTTON_CELL_SIZE * 2 + 4;
        const centerX = (rect.left + rect.right) / 2;
        dragButtonWrapper.style.position = 'fixed';
        dragButtonWrapper.style.top = `${rect.bottom + 4}px`;
        dragButtonWrapper.style.left = `${centerX - width / 2}px`;
        dragButtonWrapper.style.display = 'flex';
        dragButtonWrapper.style.gap = '4px';
        dragButtonWrapper.style.zIndex = '1000';
    }

    function hideDragButton() {
        if (dragButtonWrapper) dragButtonWrapper.style.display = 'none';
        currentDragSelectedText = '';
        if (!hasOpenInteraction() && !currentHoveredBlock) activeTarget = null;
    }

    function clearTimers() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (selectionTimer) clearTimeout(selectionTimer);
        if (focusTimer) clearTimeout(focusTimer);
        rafId = null;
        selectionTimer = null;
        focusTimer = null;
    }

    function resetInteraction(removeButtons = false) {
        clearTimers();
        hideBlockButton();
        hideDragButton();
        isEditing = false;
        isSaving = false;
        saveFailed = false;
        isConfirmingDelete = false;
        showMatchFailedModal = false;
        editText = '';
        matchingState = emptyMatchingState();
        activeTarget = null;
        activeTranslationContext = null;
        messageData = '';
        if (removeButtons) {
            blockButtonWrapper?.remove();
            dragButtonWrapper?.remove();
            blockButtonWrapper = null;
            dragButtonWrapper = null;
        }
    }

    function ensureValidTarget() {
        if (validateTarget()) return true;
        resetInteraction();
        return false;
    }

    async function getTranslationContext(target: PartialEditTarget) {
        let response: Promise<TranslationEditContext | null> | null = null;
        target.chatRoot.dispatchEvent(new CustomEvent('risu-partial-edit-translation-context', {
            detail: {
                respond(context: Promise<TranslationEditContext | null>) {
                    if (response === null) response = context;
                },
            },
        }));
        try {
            return response ? await response : null;
        }
        catch {
            return null;
        }
    }

    async function findAndProcessMatches(
        mode: Exclude<MatchingMode, null>,
        elementOrText: HTMLElement | string,
        proceed: (match: RangeResultWithContext) => void,
    ) {
        if (!elementOrText || !ensureValidTarget()) return;
        matchingState.mode = mode;
        const options = mode === 'edit'
            ? { extendToEOL: false, snapStartToPrevEOL: false }
            : { extendToEOL: true, snapStartToPrevEOL: true };

        const target = activeTarget;
        if (!target) return;
        const isTextSelection = typeof elementOrText === 'string';
        const translationContext = target.translatedView
            ? await getTranslationContext(target)
            : null;
        if (!validateTarget(target)) {
            resetInteraction();
            return;
        }
        if (target.translatedView && !translationContext) {
            resetInteraction();
            return;
        }

        const sourceType: EditSource = translationContext ? 'translation' : 'original';
        const sourceData = translationContext?.data ?? messageData;
        const foundMatches = isTextSelection
            ? findAllOriginalRangesFromText(sourceData, elementOrText as string, options)
            : findAllOriginalRangesFromHtml(sourceData, elementOrText as HTMLElement, options);

        matchingState.targetElement = isTextSelection ? null : elementOrText as HTMLElement;
        matchingState.originalHTML = isTextSelection
            ? ''
            : (elementOrText as HTMLElement).innerHTML;
        matchingState.sourceType = sourceType;
        matchingState.sourceData = sourceData;
        activeTranslationContext = sourceType === 'translation'
            ? translationContext
            : null;
        matchingState.foundMatches = foundMatches;

        if (foundMatches.length === 0) {
            matchingState.mode = null;
            showMatchFailedModal = true;
        }
        else {
            const highConfidence = foundMatches.filter((match) => match.confidence >= 0.95);
            if (highConfidence.length === 1) proceed(highConfidence[0]);
            else if (foundMatches.length === 1) proceed(foundMatches[0]);
        }
        hideBlockButton();
        hideDragButton();
    }

    function startBlockEdit() {
        if (!currentHoveredBlock || !ensureValidTarget()) return;
        void findAndProcessMatches('edit', currentHoveredBlock, proceedWithEdit);
    }

    function startBlockDelete() {
        if (!currentHoveredBlock || !ensureValidTarget()) return;
        void findAndProcessMatches('delete', currentHoveredBlock, proceedWithDelete);
    }

    function startDragEdit() {
        if (!currentDragSelectedText || !ensureValidTarget()) return;
        void findAndProcessMatches('edit', currentDragSelectedText, proceedWithEdit);
    }

    function startDragDelete() {
        if (!currentDragSelectedText || !ensureValidTarget()) return;
        void findAndProcessMatches('delete', currentDragSelectedText, proceedWithDelete);
    }

    function proceedWithEdit(match: RangeResultWithContext) {
        if (!ensureValidTarget()) return;
        matchingState.selectedRange = match;
        matchingState.mode = null;
        editText = matchingState.sourceData.slice(match.start, match.end);
        isEditing = true;
        focusTimer = setTimeout(() => {
            textareaWrapperRef?.querySelector('textarea')?.focus();
        }, 10);
    }

    function proceedWithDelete(match: RangeResultWithContext) {
        if (!ensureValidTarget()) return;
        matchingState.selectedRange = match;
        matchingState.mode = null;
        isConfirmingDelete = true;
    }

    function selectMatchAtIndex(index: number) {
        if (!ensureValidTarget()) return;
        const match = matchingState.foundMatches[index];
        if (!match) return;
        if (matchingState.mode === 'edit') proceedWithEdit(match);
        else if (matchingState.mode === 'delete') proceedWithDelete(match);
    }

    async function saveNewData(newData: string) {
        if (!ensureValidTarget() || !activeTarget) return;
        const target = activeTarget;
        const message = getCurrentMessage(target);
        if (!message) {
            resetInteraction();
            return;
        }

        if (matchingState.sourceType === 'translation') {
            const context = activeTranslationContext;
            if (!context) {
                resetInteraction();
                return;
            }
            let response: Promise<boolean> | null = null;
            isSaving = true;
            saveFailed = false;
            target.chatRoot.dispatchEvent(new CustomEvent<TranslationSaveDetail>(
                'risu-partial-edit-translation-save',
                {
                    detail: {
                        ...context,
                        expectedData: matchingState.sourceData,
                        data: newData,
                        respond(result) {
                            if (response === null) response = result;
                        },
                    },
                },
            ));
            let saved = false;
            try {
                saved = response ? await response : false;
            }
            catch {
                saved = false;
            }
            if (!saved) {
                isSaving = false;
                saveFailed = true;
                return;
            }
            resetInteraction();
            return;
        }

        message.data = newData;
        if (message.swipes && message.swipeId !== undefined) {
            message.swipes[message.swipeId] = newData;
        }
        ReloadChatPointer.update((value) => ({
            ...value,
            [target.messageIndex]: (value[target.messageIndex] ?? 0) + 1,
        }));
        resetInteraction();
    }

    async function handleSave() {
        if (!matchingState.selectedRange || !ensureValidTarget() || isSaving) return;
        await saveNewData(replaceRange(
            matchingState.sourceData,
            matchingState.selectedRange,
            editText,
        ));
    }

    async function handleConfirmDelete() {
        if (!matchingState.selectedRange || !ensureValidTarget() || isSaving) return;
        let newData = replaceRange(
            matchingState.sourceData,
            matchingState.selectedRange,
            '',
        );
        newData = newData.replace(/\n{3,}/g, '\n\n').trim();
        await saveNewData(newData);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            resetInteraction();
        }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.stopPropagation();
            void handleSave();
        }
    }

    function attachPartialEditTextarea(node: HTMLDivElement) {
        textareaWrapperRef = node;
        node.addEventListener('keydown', handleKeydown);
        return {
            destroy() {
                node.removeEventListener('keydown', handleKeydown);
                if (textareaWrapperRef === node) textareaWrapperRef = null;
            },
        };
    }

    function isMouseOnBlockButton(mouseX: number, mouseY: number) {
        if (!blockButtonWrapper || blockButtonWrapper.style.display === 'none') return false;
        const rect = blockButtonWrapper.getBoundingClientRect();
        return mouseX >= rect.left
            && mouseX <= rect.right
            && mouseY >= rect.top
            && mouseY <= rect.bottom;
    }

    function isMouseInButtonZone(mouseX: number, mouseY: number, block: HTMLElement) {
        const rect = block.getBoundingClientRect();
        return mouseX >= rect.left
            && mouseX <= rect.right
            && mouseY >= rect.top - PARTIAL_EDIT_BUTTON_CELL_SIZE - 12
            && mouseY < rect.top;
    }

    function handleMove(event: MouseEvent) {
        if (!blockEditEnabled || hasOpenInteraction()) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            hideBlockButton();
            return;
        }
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (hasOpenInteraction()) return;
            if (isMouseOnBlockButton(mouseX, mouseY)) return;
            if (
                currentHoveredBlock
                && isMouseInButtonZone(mouseX, mouseY, currentHoveredBlock)
            ) {
                return;
            }

            const elementAtPoint = document.elementFromPoint(mouseX, mouseY);
            const block = elementAtPoint?.closest(SELECTOR) as HTMLElement | null;
            const target = resolveTarget(block);
            if (block && target && target.bodyRoot.contains(block) && hasTextContent(block)) {
                showBlockButton(block, target);
                return;
            }
            hideBlockButton();
        });
    }

    function handleSelectionChange() {
        if (!dragEditEnabled || hasOpenInteraction()) return;
        if (selectionTimer) clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            selectionTimer = null;
            if (hasOpenInteraction()) return;
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                hideDragButton();
                return;
            }
            const selectedText = selection.toString();
            if (selectedText.trim().length < MIN_DRAG_SELECTION_LENGTH) {
                hideDragButton();
                return;
            }

            const range = selection.getRangeAt(0);
            const ancestor = range.commonAncestorContainer;
            const ancestorElement = ancestor.nodeType === Node.ELEMENT_NODE
                ? ancestor as HTMLElement
                : ancestor.parentElement;
            const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
                ? range.startContainer as HTMLElement
                : range.startContainer.parentElement;
            const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
                ? range.endContainer as HTMLElement
                : range.endContainer.parentElement;
            const target = resolveTarget(ancestorElement);
            if (
                !target
                || !startElement
                || !endElement
                || !target.bodyRoot.contains(startElement)
                || !target.bodyRoot.contains(endElement)
            ) {
                hideDragButton();
                return;
            }

            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                hideDragButton();
                return;
            }
            currentDragSelectedText = selectedText;
            showDragButton(rect, target);
        }, 150);
    }

    function handleMouseDown(event: MouseEvent) {
        if (!dragEditEnabled || hasOpenInteraction()) return;
        if (dragButtonWrapper?.contains(event.target as Node)) return;
        hideDragButton();
    }

    function handleScroll() {
        if (hasOpenInteraction()) return;
        hideBlockButton();
        hideDragButton();
    }

    function handleScreenLeave(event: MouseEvent) {
        if (hasOpenInteraction()) return;
        const relatedTarget = event.relatedTarget as HTMLElement | null;
        if (relatedTarget && blockButtonWrapper?.contains(relatedTarget)) return;
        hideBlockButton();
    }

    $effect(() => {
        if (!screenRoot) return;
        if (blockEditEnabled) document.addEventListener('mousemove', handleMove);
        if (dragEditEnabled) {
            document.addEventListener('selectionchange', handleSelectionChange);
            document.addEventListener('mousedown', handleMouseDown);
        }
        document.addEventListener('scroll', handleScroll, true);
        screenRoot.addEventListener('mouseleave', handleScreenLeave);
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('scroll', handleScroll, true);
            screenRoot.removeEventListener('mouseleave', handleScreenLeave);
            resetInteraction(true);
        };
    });

    $effect(() => {
        const identity = [characterIndex, chatPage, chatId, messages] as const;
        void identity;
        untrack(() => resetInteraction());
    });

    $effect(() => {
        if (!screenRoot) return;
        const observer = new MutationObserver(() => {
            if (activeTarget && !validateTarget(activeTarget)) resetInteraction();
        });
        observer.observe(screenRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'data-chat-index',
                'data-chat-id',
                'data-partial-edit-disabled',
                'data-partial-edit-translated',
            ],
        });
        return () => observer.disconnect();
    });

    onDestroy(() => resetInteraction(true));
</script>

{#if showMatchFailedModal}
    <ShDialog
        open={true}
        closeOnEscape={true}
        onOpenChange={(open) => { if (!open) resetInteraction(); }}
    >
        {#snippet title()}{language.partialEdit.matchFailedTitle}{/snippet}
        <p class="text-sm text-textcolor2">{language.partialEdit.matchFailedMessage}</p>
        {#snippet footer()}
            <ShButton variant="primary" size="sm" onclick={() => resetInteraction()}>
                {language.confirm}
            </ShButton>
        {/snippet}
    </ShDialog>
{/if}

{#if matchingState.mode !== null}
    <ShDialog
        open={true}
        size="lg"
        closeOnEscape={true}
        onOpenChange={(open) => { if (!open) resetInteraction(); }}
    >
        {#snippet title()}
            {matchingState.mode === 'edit'
                ? language.partialEdit.selectMatch
                : language.partialEdit.selectDeleteMatch}
        {/snippet}
        <div class="flex flex-col gap-3">
            <span class="text-xs text-textcolor2">
                {matchingState.foundMatches.length} {language.partialEdit.matchesFound}
            </span>
            <div class="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
                {#each matchingState.foundMatches as match, index}
                    <button
                        type="button"
                        class="flex flex-col gap-2 rounded-md border border-darkborderc bg-darkbg p-3 text-left text-textcolor hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-borderc/50"
                        onclick={() => selectMatchAtIndex(index)}
                    >
                        <span class="flex items-center gap-2 text-xs text-textcolor2">
                            <span>{language.partialEdit.lineNumber(match.lineNumber)}</span>
                            <span>{language.partialEdit.matchConfidence(Math.round(match.confidence * 100))}</span>
                        </span>
                        {#if match.contextBefore}
                            <span class="text-xs italic text-textcolor2">{match.contextBefore}</span>
                        {/if}
                        <span class="whitespace-pre-line text-sm">
                            {matchingState.sourceData.slice(match.start, match.end).slice(0, 150)}{matchingState.sourceData.slice(match.start, match.end).length > 150 ? '…' : ''}
                        </span>
                        {#if match.contextAfter}
                            <span class="text-xs italic text-textcolor2">{match.contextAfter}</span>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
        {#snippet footer()}
            <ShButton variant="outline" size="sm" onclick={() => resetInteraction()}>
                {language.cancel}
            </ShButton>
        {/snippet}
    </ShDialog>
{/if}

{#if isConfirmingDelete && matchingState.selectedRange}
    <ShDialog
        open={true}
        closeOnEscape={true}
        onOpenChange={(open) => { if (!open) resetInteraction(); }}
    >
        {#snippet title()}{language.partialEdit.deleteModalTitle}{/snippet}
        <div class="flex flex-col gap-3">
            <span class="text-xs text-textcolor2">
                {language.partialEdit.matchConfidence(
                    Math.round(matchingState.selectedRange.confidence * 100),
                )}
            </span>
            <p class="text-sm text-textcolor2">{language.partialEdit.deleteConfirmMessage}</p>
            <pre class="max-h-28 overflow-hidden whitespace-pre-wrap rounded-md border border-darkborderc bg-bgcolor p-3 text-sm text-textcolor">{matchingState.sourceData.slice(
                matchingState.selectedRange.start,
                matchingState.selectedRange.end,
            ).slice(0, 200)}</pre>
            {#if saveFailed}
                <p role="alert" class="text-sm text-red-400">
                    {language.partialEdit.saveFailedMessage}
                </p>
            {/if}
        </div>
        {#snippet footer()}
            <ShButton
                variant="destructive"
                size="sm"
                disabled={isSaving}
                onclick={() => void handleConfirmDelete()}
            >
                <Trash2Icon size={14} />
                {language.partialEdit.deleteYes}
            </ShButton>
            <ShButton
                variant="outline"
                size="sm"
                disabled={isSaving}
                onclick={() => resetInteraction()}
            >
                {language.partialEdit.deleteNo}
            </ShButton>
        {/snippet}
    </ShDialog>
{/if}

{#if isEditing && matchingState.selectedRange}
    <ShDialog
        bind:open={isEditing}
        closeOnEscape={true}
        closeOnOutsideClick={!isSaving}
        onOpenChange={(open) => { if (!open && !isSaving) resetInteraction(); }}
    >
        {#snippet title()}{language.partialEdit.editModalTitle}{/snippet}
        <div use:attachPartialEditTextarea>
            <TextAreaInput
                bind:value={editText}
                fullwidth
                size="sm"
                actionBar={false}
                optimaizedInput={false}
            />
        </div>
        {#if saveFailed}
            <p role="alert" class="text-sm text-red-400">
                {language.partialEdit.saveFailedMessage}
            </p>
        {/if}
        {#snippet footer()}
            <div class="flex w-full items-center justify-between gap-2">
                <span class="text-xs text-textcolor2">
                    {language.partialEdit.matchConfidence(
                        Math.round(matchingState.selectedRange.confidence * 100),
                    )}
                </span>
                <div class="flex gap-2">
                    <ShButton
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onclick={() => resetInteraction()}
                        title={language.partialEdit.cancelShortcut}
                    >
                        {language.partialEdit.cancel}
                    </ShButton>
                    <ShButton
                        variant="primary"
                        size="sm"
                        className="partial-edit-save-btn"
                        disabled={isSaving}
                        onclick={() => void handleSave()}
                        title={language.partialEdit.saveShortcut}
                    >
                        <SaveIcon size={14} />
                        {language.partialEdit.save}
                    </ShButton>
                </div>
            </div>
        {/snippet}
    </ShDialog>
{/if}

<style>
    :global(.partial-edit-btn-wrapper) {
        display: none;
    }

    :global(.partial-edit-btn) {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--partial-edit-cell-size);
        height: var(--partial-edit-cell-size);
        padding: 0;
        border: 1px solid var(--risu-theme-darkborderc);
        border-radius: 6px;
        background: var(--risu-theme-bgcolor);
        color: var(--risu-theme-textcolor);
        cursor: pointer;
        box-shadow: 0 2px 8px color-mix(in srgb, var(--risu-theme-darkbg) 70%, transparent);
    }

    :global(.partial-edit-btn svg) {
        width: var(--partial-edit-icon-size);
        height: var(--partial-edit-icon-size);
    }

    :global(.partial-edit-btn-edit:hover),
    :global(.partial-edit-btn-edit:focus-visible) {
        border-color: var(--risu-theme-primary);
        color: var(--risu-theme-primary);
        outline: none;
    }

    :global(.partial-edit-btn-delete:hover),
    :global(.partial-edit-btn-delete:focus-visible) {
        border-color: var(--risu-theme-draculared);
        color: var(--risu-theme-draculared);
        outline: none;
    }
</style>
