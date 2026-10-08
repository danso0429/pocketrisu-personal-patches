'use strict';

module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const related = ['bg-preserve', 'lazy-chat-sync', 'client-build-fence-bg-adapter', 'personal-settings',
        'client-build-fence', 'haejeok-persistence-safety-adapter', 'haejeok-chat-width-adapter',
        'kei-chat-render-bg-adapter', 'kei-partial-edit-bg-adapter']
        .flatMap(name => require(`../${name}/manifest.cjs`).units);
    const add = (name, file, anchor, content, first = false) => units.push({
        id: `lazy-chat-bg-adapter:recovery-owner:${name}:1.10`, file, type: 'replace', anchor,
        ...(file.endsWith('.svelte') ? { managed: content } : { content }),
        ...(first ? { anchorPolicy: 'first' } : {}), targetVersions,
        after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    const orch = 'src/ts/bgOrchestrate.ts';
    add('registry', orch, 'const foregroundPollGate = createOrchestrationPollGate()', `import { reconciliationReadiness, seedReconciliationReadiness } from './bgReconciliation'

let recoveryAdmissionDepth = 0
let terminalReconciliation = false

function preemptTerminalRecovery(): void {
    if (get(orchestrating)) return
    if (watchKey && terminalReconciliation) {
        const operationId = activeOperationId
        if (operationId) rememberRecoveryOutcome(operationId, null, 'unverified-parked')
        stopWatch({ preservePendingMarker: true })
        recoveryWakePending = true
    } else if (bootRecoveryActive && !watchKey) {
        deferBootRecovery(activeOperationId)
        recoveryWakePending = true
    }
}

function releaseTerminalGeneration(charId: string, chatId: string, operationId: string | null, terminal = true): void {
    reconciliationReadiness.register({ charId, chatId, operationId, ts: Date.now() })
    if (terminal) reconciliationReadiness.classifyTerminal(charId, chatId, operationId)
    if (activeOperationId !== operationId) return
    terminalReconciliation = true
    setServerGenerationBusy(false)
    if (!get(doingChat)) {
        chatProcessStage.set(0)
        try { clearRelayedStatuses() } catch { /* best-effort */ }
    }
}

const foregroundPollGate = createOrchestrationPollGate()`);
    add('flight-map', orch, 'const resultDeliveriesInFlight = new Set<string>()',
        'const resultDeliveriesInFlight = new Map<string, { operationId: string | null, epoch: number }>()');
    add('flight-owner', orch, 'if (resultId) resultDeliveriesInFlight.add(resultId)',
        'if (resultId) resultDeliveriesInFlight.set(resultId, { operationId, epoch: pollEpoch })');
    add('flight-epoch-cleanup', orch, '            if (resultId) resultDeliveriesInFlight.delete(resultId)',
        '            if (resultId && resultDeliveriesInFlight.get(resultId)?.epoch === pollEpoch) resultDeliveriesInFlight.delete(resultId)');
    add('heartbeat-map', orch, 'const resultClaimHeartbeatStops = new Set<() => void>()',
        'const resultClaimHeartbeatStops = new Map<() => void, string>()');
    add('heartbeat-owner', orch, 'resultClaimHeartbeatStops.add(stop)', 'resultClaimHeartbeatStops.set(stop, operationId)');
    add('heartbeat-cleanup', orch, `function stopAllResultClaimHeartbeats(): void {
    for (const stop of [...resultClaimHeartbeatStops]) stop()
}`, `function clearRecoveryOperation(operationId: string | null): void {
    if (!operationId) return
    appliedStaticsDeltaByOperation.delete(operationId)
    appliedResultOrderByOperation.delete(operationId)
    for (const [resultId, owner] of resultDeliveriesInFlight) {
        if (owner.operationId === operationId) resultDeliveriesInFlight.delete(resultId)
    }
    for (const [stop, owner] of [...resultClaimHeartbeatStops]) {
        if (owner === operationId) stop()
    }
}`);
    for (let i = 0; i < 2; i++) add(`scoped-cleanup-${i}`, orch,
        `    appliedStaticsDeltaByOperation.clear()
    resultDeliveriesInFlight.clear()
    appliedResultOrderByOperation.clear()
    stopAllResultClaimHeartbeats()`, '    clearRecoveryOperation(operationId)', true);
    add('arm-scoped', orch, `    appliedStaticsDeltaByOperation.clear()
    appliedResultOrderByOperation.clear()
    watchEpoch++`, `    clearRecoveryOperation(operationId)
    terminalReconciliation = false
    watchEpoch++`);
    add('stop-client-stage', orch, `    else setServerGenerationBusy(false)
    chatProcessStage.set(0)`, `    else setServerGenerationBusy(false)
    terminalReconciliation = false
    if (!get(doingChat)) chatProcessStage.set(0)`);
    add('boot-owner-guard', orch, `function endBootRecoveryUI(operationId: string | null): void {
    bootRecoveryEpoch++`, `function endBootRecoveryUI(operationId: string | null): void {
    clearRecoveryOperation(operationId)
    bootRecoveryEpoch++`);
    add('boot-global-owner-guard', orch, `    activeOperationId = null
    activeOperationCoordinates = null
    watchResultKeyVersion = 0
`, `    if ((activeOperationId !== null && activeOperationId !== operationId) || watchKey) return
    terminalReconciliation = false
    activeOperationId = null
    activeOperationCoordinates = null
    watchResultKeyVersion = 0
`);
    add('boot-client-stage', orch, `    setServerGenerationBusy(false)
    chatProcessStage.set(0)
    try { clearRelayedStatuses() } catch { /* best-effort */ }`, `    setServerGenerationBusy(false)
    if (!get(doingChat)) {
        chatProcessStage.set(0)
        try { clearRelayedStatuses() } catch { /* best-effort */ }
    }`);
    add('stop-status-owner', orch, `    try { clearRelayedStatuses() } catch { /* best-effort */ }
}

// Arm the watch state at delegation time (BEFORE the POST resolves) so even a delegate-POST failure
`, `    if (!get(doingChat)) { try { clearRelayedStatuses() } catch { /* best-effort */ } }
}

// Arm the watch state at delegation time (BEFORE the POST resolves) so even a delegate-POST failure
`);
    add('boot-disposition', orch, `            setServerGenerationBusy(true)
            chatProcessStage.set(4)
            const serverOwnedDisposition = serverChatDeliveryDisposition(data)`, `            const serverOwnedDisposition = serverChatDeliveryDisposition(data)
            if (serverOwnedDisposition === 'legacy-client-owned' || serverOwnedChatStillActive(data)) {
                setServerGenerationBusy(true)
                chatProcessStage.set(4)
            } else {
                releaseTerminalGeneration(charId, chatId, operationId,
                    isTerminalCommittedEvidence(data) || isFinishedServerFailure(data, baselineMsgs))
            }`);
    add('hydrate-terminal-release', orch,
        `    notifyAssemblyChange(charId, chatId, operationId, data)
    const target = mergeTargetByOperation.get(operationId)`,
        `    releaseTerminalGeneration(charId, chatId, operationId)
    notifyAssemblyChange(charId, chatId, operationId, data)
    const target = mergeTargetByOperation.get(operationId)`);
    add('hydrate-await', orch, '    return hydrateServerCommittedOrchestration({', '    const hydration = await hydrateServerCommittedOrchestration({');
    add('hydrate-readiness', orch, `    })
}

function rememberServerCommittedTarget`, `    })
    if (isCurrent() && hydration.reason === 'target-deleted') {
        reconciliationReadiness.resolveOperation(charId, chatId, operationId)
    }
    // Cached adoption can intentionally preserve an in-flight save. Suggestion
    // needs stronger no-ambiguous-write proof, checked independently of ACK.
    if (isCurrent() && (hydration.hydrated || hydration.reason === 'superseded-current')) scheduleReadinessCheck()
    return hydration
}

function rememberServerCommittedTarget`);
    add('legacy-durable-release', orch,
        `                if (!current()) throw new Error('Legacy recovery ownership changed while saving')`,
        `                if (!current()) throw new Error('Legacy recovery ownership changed while saving')
                if (data.final !== false && data.kind !== 'intermediate') {
                    releaseTerminalGeneration(charId, chatId, operationId)
                    if (operationId) reconciliationReadiness.resolveOperation(charId, merge.savedChatId, operationId)
                }`);
    add('raw-admission-entry', orch, `    try {
        return await submitServerInputCommand({`, `    recoveryAdmissionDepth++
    preemptTerminalRecovery()
    try {
        return await submitServerInputCommand({`);
    add('raw-admission-finally', orch, `        return { kind: 'blocked', reason: 'admission-unavailable' }
    }
}`, `        return { kind: 'blocked', reason: 'admission-unavailable' }
    } finally {
        recoveryAdmissionDepth--
        seedReconciliationReadiness()
        scheduleReadinessCheck()
        if (recoveryWakePending) wakeParkedRecoveries()
        setTimeout(scheduleNextBootRecovery, 0)
    }
}`);
    add('prepared-preempt', orch, `        if (bootRecoveryActive && !watchKey) {
            // A user send won the short pre-confirmation boot probe window. Invalidate that poll and
            // retain its marker for a later boot instead of letting it replace this foreground watch.
            deferBootRecovery(activeOperationId)
        }`, '        preemptTerminalRecovery()');
    add('wake-admission-guard', orch, 'if (watchKey || bootRecoveryActive || get(doingChat)) { recoveryWakePending = true; return }',
        'if (recoveryAdmissionDepth || watchKey || bootRecoveryActive || get(doingChat)) { recoveryWakePending = true; return }');
    for (let i = 0; i < 2; i++) add(`boot-admission-guard-${i}`, orch, '        if (watchKey || activeOperationId || get(doingChat)) {',
        '        if (recoveryAdmissionDepth || watchKey || activeOperationId || get(doingChat)) {', true);
    add('queue-admission-guard', orch, '    if (bootRecoveryActive) return\n    const marker = bootRecoveryQueue.shift()',
        '    if (recoveryAdmissionDepth || bootRecoveryActive || watchKey || get(doingChat)) return\n    const marker = bootRecoveryQueue.shift()');
    add('raw-seed', orch, '    const pending = await readServerPendingInputCommands(charId, chatId, chat)',
        '    seedReconciliationReadiness()\n    const pending = await readServerPendingInputCommands(charId, chatId, chat)');
    add('watch-register', orch, '    watchKey = { charId, chatId }',
        '    reconciliationReadiness.register({ charId, chatId, operationId, ts: Date.now() })\n    watchKey = { charId, chatId }');
    add('client-preempt', orch, `    doingChat.subscribe((busy) => {
        if (!busy && !bootRecoveryActive`, `    doingChat.subscribe((busy) => {
        if (busy && !get(orchestrating)) preemptTerminalRecovery()
        if (!busy && recoveryWakePending) setTimeout(wakeParkedRecoveries, 0)
        if (!busy && !bootRecoveryActive`);
    add('watch-drain', orch, `    pollingActive = false
    watchResultKeyVersion = 0
    if (options.handoffToClient)`, `    pollingActive = false
    watchResultKeyVersion = 0
    setTimeout(() => {
        if (recoveryWakePending) wakeParkedRecoveries()
        scheduleNextBootRecovery()
    }, 0)
    if (options.handoffToClient)`);
    add('watch-retired-readiness', orch, '    const operationId = activeOperationId\n    watchEpoch++', `    const operationId = activeOperationId
    if (!options.preservePendingMarker && operationId && watchKey) {
        reconciliationReadiness.resolveOperation(watchKey.charId, watchKey.chatId, operationId)
    }
    watchEpoch++`);
    add('boot-finished-classification', orch, `function finishBootRecovery(operationId: string | null): void {
    clearPendingMarker(operationId)`, `function finishBootRecovery(operationId: string | null): void {
    if (activeOperationCoordinates && activeOperationId === operationId) {
        reconciliationReadiness.classifyTerminal(activeOperationCoordinates.charId, activeOperationCoordinates.chatId, operationId)
    }
    clearPendingMarker(operationId)`);
    add('readiness-evidence', orch, 'async function pollOrchestrationResult(): Promise<void> {',
        require('./recovery-readiness-client.cjs') + '\nasync function pollOrchestrationResult(): Promise<void> {');
    const stream = 'src/ts/bgStreamPreserve.svelte.ts';
    add('draft-import', stream, "const LS_PREFIX = 'bg-stream-draft:'", `import { reconciliationReadiness } from './bgReconciliation'

const LS_PREFIX = 'bg-stream-draft:'`);
    add('draft-readiness', stream, '        for (const d of merged) {', `        for (const d of merged) {
            if (reconciliationReadiness.pending(d.charId, d.chatId)) continue`);
    add('draft-after-hydration', stream, '            if (isLost(d)) {', `            if (reconciliationReadiness.pending(d.charId, d.chatId)) continue
            if (isLost(d)) {`);
    add('draft-before-restore', stream, '        for (const d of lost) {', `        for (const d of lost) {
            if (reconciliationReadiness.pending(d.charId, d.chatId)) continue`);
    add('draft-restore-entry', stream, '    const navigate = opts.navigate !== false', `    if (reconciliationReadiness.pending(draft.charId, draft.chatId)) return
    const navigate = opts.navigate !== false`);
    add('draft-restore-hydrated', stream, '        const chat: any = char.chats[loc.chatIdx]', `        if (reconciliationReadiness.pending(draft.charId, draft.chatId)
            || (DBState as any).db.characters[loc.charIdx] !== char
            || char.chats[loc.chatIdx]?.id !== draft.chatId
            || findCharChat(draft)?.charIdx !== loc.charIdx || findCharChat(draft)?.chatIdx !== loc.chatIdx) return
        const chat: any = char.chats[loc.chatIdx]`);
    add('draft-trigger-current', stream, '            if (r && r.chat) {', `            if (r && r.chat && !reconciliationReadiness.pending(draft.charId, draft.chatId)
                && char.chats[loc.chatIdx] === chat) {`);
    add('draft-ready-trigger', stream, `    inited = true
    // Stage B: register the background-resilient streaming fetch (gemini) unless the
`, `    inited = true
    reconciliationReadiness.subscribe(() => { setTimeout(() => { void scanForLostDrafts() }, 0) })
    // Stage B: register the background-resilient streaming fetch (gemini) unless the
`);
    const busy = 'src/ts/generationBusy.ts';
    add('busy-interface', busy, `    setServerBusy: (active: boolean) => void
    handoffServerToClient: () => void`, `    setServerBusy: (active: boolean, owner?: string | null) => boolean
    handoffServerToClient: (owner?: string | null) => boolean`);
    add('busy-owner', busy, '    const serverBusy = writable(false)', `    const serverBusy = writable(false)
    let serverOwner: string | null | undefined = undefined`);
    add('busy-token', busy, '        setServerBusy: (active) => serverBusy.set(active),', `        setServerBusy: (active, owner) => {
            if (!active && serverOwner !== owner) return false
            serverOwner = active ? owner : undefined
            serverBusy.set(active)
            return true
        },`);
    add('handoff-token', busy, `        handoffServerToClient: () => {
            clientBusy.set(true)
            serverBusy.set(false)
        },`, `        handoffServerToClient: (owner) => {
            if (serverOwner !== owner) return false
            clientBusy.set(true)
            serverOwner = undefined
            serverBusy.set(false)
            return true
        },`);
    for (let i = 0; i < 4; i++) add(`busy-acquire-token-${i}`, orch,
        'setServerGenerationBusy(true)', 'setServerGenerationBusy(true, operationId)', true);
    for (let i = 0; i < 3; i++) add(`busy-release-token-${i}`, orch,
        'setServerGenerationBusy(false)', 'setServerGenerationBusy(false, operationId)', true);
    add('busy-handoff-token', orch, 'handoffServerGenerationToClient()', 'handoffServerGenerationToClient(operationId)');
    const generation = 'src/ts/process/generationState.ts';
    add('direct-lineage-field', generation, '    generationId: string\n', '    generationId: string\n    lifecycleId?: string\n');
    add('direct-lineage-map', generation, 'export const generationStates = writable<Map<string, GenState>>(new Map())',
        'const continuationLifecycleByChat = new Map<string, string>()\nexport const generationStates = writable<Map<string, GenState>>(new Map())');
    add('direct-lineage-start', generation, '    const abortController = pendingAborts.get(chatKey)',
        '    const lifecycleId = suppliedLifecycleId || continuationLifecycleByChat.get(chatKey) || generationId\n    continuationLifecycleByChat.delete(chatKey)\n    const abortController = pendingAborts.get(chatKey)');
    add('direct-start-token', generation, "kind: 'live' | 'background' = 'live'): void {", "kind: 'live' | 'background' = 'live', suppliedLifecycleId?: string): void {");
    add('direct-run-token', generation, '    run: () => Promise<T>,', '    run: (lifecycleId: string) => Promise<T>,');
    add('direct-token-counter', generation, 'const continuationLifecycleByChat = new Map<string, string>()', 'let directLifecycleSequence = 0\nconst continuationLifecycleByChat = new Map<string, string>()');
    add('direct-lineage-entry', generation, '        next.set(chatKey, { generationId, kind, abortController })',
        '        next.set(chatKey, { generationId, lifecycleId, kind, abortController })');
    add('direct-lineage-continue', generation, `    if (!opts?.keepPendingAbort) {
        pendingAborts.delete(chatKey)
    }`, `    const previous = get(generationStates).get(chatKey)
    if (opts?.keepPendingAbort && previous) {
        continuationLifecycleByChat.set(chatKey, previous.lifecycleId || previous.generationId)
    } else {
        continuationLifecycleByChat.delete(chatKey)
    }
    if (!opts?.keepPendingAbort) {
        pendingAborts.delete(chatKey)
    }`);
    add('direct-lineage-reset', generation, 'export function endAllGenerations(): void {',
        'export function endAllGenerations(): void {\n    continuationLifecycleByChat.clear()');
    add('direct-owner-finally', generation, `    if (isChatGenerating(chatKey)) return false
    try {
        return await run()
    } finally {
        endGeneration(chatKey)
        chatProcessStage.set(0)
        onFinish?.()
    }`, `    if (isChatGenerating(chatKey)) return false
    let ownedId = 'direct-lifecycle-' + ++directLifecycleSequence
    try {
        const pending = run(ownedId)
        const initialOwner = get(generationStates).get(chatKey)
        ownedId = initialOwner?.lifecycleId || initialOwner?.generationId || ownedId
        return await pending
    } finally {
        const currentOwner = get(generationStates).get(chatKey)
        const ownsCurrent = !!ownedId && (currentOwner?.lifecycleId || currentOwner?.generationId) === ownedId
        if (ownsCurrent) endGeneration(chatKey)
        if (!get(unifiedDoingChat)) chatProcessStage.set(0)
        if (ownsCurrent || !currentOwner) {
            onFinish?.()
        }
    }`);
    const pipeline = 'src/ts/process/index.svelte.ts';
    add('direct-caller-token', pipeline, '        () => sendChat(chatProcessIndex, arg),', '        (directLifecycleId) => sendChat(chatProcessIndex, { ...arg, directLifecycleId }),');
    add('direct-arg-token', pipeline, '    chatAdditonalTokens?:number,', '    directLifecycleId?:string,\n    chatAdditonalTokens?:number,');
    add('direct-native-token', pipeline, '    startGeneration(genKey, generationId)', "    startGeneration(genKey, generationId, 'live', arg.directLifecycleId)");
    add('direct-preparation-token', orch, '        startGeneration(preparationKey, operationId)', "        startGeneration(preparationKey, operationId, 'live', arg?.directLifecycleId)");
    const suggestion = 'src/lib/ChatScreens/Suggestion.svelte';
    add('suggestion-imports', suggestion, '    import { syncDoingChat } from "../../ts/process/generationState";', `    import { get } from 'svelte/store';
    import { reconciliationReadiness, seedReconciliationReadiness, RECONCILIATION_PENDING } from '../../ts/bgReconciliation';
    import { createSuggestionRequestOwner } from '../../ts/suggestionRequestOwner';`);
    add('suggestion-untrack', suggestion, "    import { onDestroy } from 'svelte';", "    import { onDestroy, untrack } from 'svelte';");
    add('suggestion-progress-fields', suggestion, `    let progressChatPage=-1;
    let abortController:AbortController;
    let chatPage:number = $state()`, `    let recoveryPending = $state(false);
    let manualRefresh = false;
    let lastTarget = '';
    const currentTarget = () => {
        const char = DBState.db.characters[get(selectedCharID)];
        return { char, chat: char?.chats?.[char.chatPage] };
    };
    const contextView = (chat) => JSON.stringify(chat?.message?.slice(-10).map(({role, data}) => [role, data]) ?? []);
    seedReconciliationReadiness();`);
    add('suggestion-owner', suggestion, `    const updateSuggestions = () => {
        if($selectedCharID > -1 && !$doingChat) {
            if(progressChatPage > 0 && progressChatPage != chatPage){
                progress=false
                abortController?.abort()
            }
            let currentChar = DBState.db.characters[$selectedCharID];
            suggestMessages = currentChar?.chats[currentChar.chatPage].suggestMessages
        }
    }
    

    const unsub = doingChat.subscribe(async (v) => {
        if(v) {
            progress=false
            abortController?.abort()
            suggestMessages = []
        }
        if(!v && $selectedCharID > -1 && (!suggestMessages || suggestMessages.length === 0) && !progress){
            let currentChar:character = DBState.db.characters[$selectedCharID];
            let messages:Message[] = []
            
            messages = [...messages, ...currentChar.chats[currentChar.chatPage].message];
            let lastMessages:Message[] = messages.slice(Math.max(messages.length - 10, 0));
            if(lastMessages.length === 0)
                return`, `    const requestOwner = createSuggestionRequestOwner({
        capture: () => {
            const { char, chat } = currentTarget();
            if (!char || !chat || chat._placeholder || !chat.message?.length || get(doingChat)
                || reconciliationReadiness.pending(char.chaId, chat.id)
                || (!manualRefresh && chat.suggestMessages?.length)) return null;
            return { char, chat, view: contextView(chat) };
        },
        current: (context) => {
            const { char, chat } = currentTarget();
            return context.char === char && context.chat === chat && !get(doingChat)
                && !reconciliationReadiness.pending(char.chaId, chat.id)
                && context.view === contextView(chat);
        },
        progress: (value) => { progress = value; },
        request: async ({ char: currentChar, chat }, signal) => {
            manualRefresh = false;
            const lastMessages:Message[] = chat.message.slice(-10);`);
    add('suggestion-request', suggestion, `            progress = true
            progressChatPage = chatPage
            abortController = new AbortController()
            requestChatData({`, '            return requestChatData({');
    add('suggestion-publish', suggestion, `            }, 'submodel', abortController.signal).then(rq2=>{
                if(rq2.type !== 'fail' && rq2.type !== 'streaming' && rq2.type !== 'multiline' && progress){
                    var suggestMessagesNew = rq2.result.split('\\n').filter(msg => msg.startsWith('-')).map(msg => msg.replace('-','').trim())
                    const db:Database = DBState.db;
                    db.characters[$selectedCharID].chats[currentChar.chatPage].suggestMessages = suggestMessagesNew
                    suggestMessages = suggestMessagesNew
                }
                progress = false
            })
            }
    })`, `            }, 'submodel', signal);
        },
        publish: ({ chat }, result) => {
            if (result.type === 'success') {
                const messages = result.result.split('\\n').filter(msg => msg.startsWith('-')).map(msg => msg.replace('-', '').trim());
                chat.suggestMessages = messages;
                suggestMessages = messages;
            }
        },
    });
    const reevaluate = () => {
        const { char, chat } = currentTarget();
        const targetKey = JSON.stringify([char?.chaId, chat?.id]);
        if (lastTarget !== targetKey) { lastTarget = targetKey; manualRefresh = false; }
        if (get(doingChat)) manualRefresh = true;
        recoveryPending = !!char && !!chat && reconciliationReadiness.pending(char.chaId, chat.id);
        if (recoveryPending && typeof window !== 'undefined') window.dispatchEvent(new Event('bg-recovery-evidence'));
        suggestMessages = get(doingChat) ? [] : chat?.suggestMessages;
        requestOwner.schedule();
    };
    const unsub = doingChat.subscribe(reevaluate);
    const unsubscribeReadiness = reconciliationReadiness.subscribe(reevaluate);`);
    add('suggestion-cleanup', suggestion, '    onDestroy(unsub)', `    onDestroy(() => { ++translationEpoch; unsub(); unsubscribeReadiness(); requestOwner.destroy(); });`);
    add('suggestion-translation-owner', suggestion, `    const translateSuggest = async (toggle, messages)=>{
        if(toggle && messages && messages.length > 0) {
            suggestMessagesTranslated = []
            for(let i = 0; i < suggestMessages.length; i++){
                let msg = suggestMessages[i]
                let translated = await translate(msg, false)
                suggestMessagesTranslated[i] = translated
            }
        }
    }`, `    let translationEpoch = 0;
    const translateSuggest = async (toggle, messages) => {
        const epoch = ++translationEpoch;
        const { char, chat } = currentTarget();
        suggestMessagesTranslated = [];
        if (!toggle || !messages?.length) return;
        for (let i = 0; i < messages.length; i++) {
            const translated = await translate(messages[i], false);
            const target = currentTarget();
            if (epoch !== translationEpoch || suggestMessages !== messages
                || target.char !== char || target.chat !== chat) return;
            suggestMessagesTranslated[i] = translated;
        }
    };`);
    add('suggestion-confirmation-target', suggestion, `                    alertConfirm(language.askReRollAutoSuggestions).then((result) => {
                        if(result) {`, `                    const requested = currentTarget();
                    alertConfirm(language.askReRollAutoSuggestions).then((result) => {
                        const current = currentTarget();
                        if(result && requested.char === current.char && requested.chat === current.chat) {`);
    add('suggestion-target', suggestion, `        $selectedCharID
        //FIXME add selectedChatPage for optimize render
        chatPage = DBState.db.characters[$selectedCharID].chatPage
        updateSuggestions()`, `        const char = DBState.db.characters[$selectedCharID];
        const chat = char?.chats?.[char.chatPage];
        chat?.id;
        contextView(chat);
        untrack(reevaluate);`);
    add('suggestion-reason', suggestion, '    {#if progress}', `    {#if recoveryPending}
        <div class="p-2 text-textcolor2" role="status">{RECONCILIATION_PENDING}</div>
    {:else if progress}`);
    add('suggestion-manual', suggestion, `                            suggestMessages = []
                            // pulse the compat store to retrigger the subscriber
                            // above, then re-converge it with generationStates
                            // (covers a generation starting in the async gap)
                            doingChat.set(true)
                            doingChat.set(false)        
                            syncDoingChat()`, `                            if (recoveryPending || get(doingChat)) return;
                            manualRefresh = true;
                            requestOwner.cancel();
                            requestOwner.schedule();`);
    return units;
};
