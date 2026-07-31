<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import {
    CheckIcon,
    RefreshCw,
    ScrollTextIcon,
    XIcon,
  } from "@lucide/svelte";
  import { language } from "src/lang";
  import type { OpenAIChat } from "src/ts/process/index.svelte";
  import {
    summarize,
    type SerializableHypaV3Data,
  } from "src/ts/process/memory/hypav3";
  import type { Message } from "src/ts/storage/database.svelte";
  import { DBState, selectedCharID } from "src/ts/stores.svelte";
  import ShButton from "src/lib/UI/GUI/ShButton.svelte";
  import ShInput from "src/lib/UI/GUI/ShInput.svelte";
  import {
    processHypaV3Message,
    processMessageCBS,
  } from "./utils";
  import {
    deriveHypaManualFrontier,
    getSelectedHypaManualCandidates,
    isHypaManualSnapshotCurrent,
    toggleHypaManualPrefix,
    type HypaManualCandidate,
    type HypaManualCurrentState,
    type HypaManualSelectionSnapshot,
  } from "./keiHypaManualSelection";

  interface Props {
    enabled: boolean;
    hypaV3Data: SerializableHypaV3Data;
    onApplied: () => void;
  }

  type ResolvedCurrentState = HypaManualCurrentState;

  interface ManualSummaryState {
    isProcessing: boolean;
    result: string | null;
    error: string | null;
    stale: boolean;
    snapshot: HypaManualSelectionSnapshot;
    input: OpenAIChat[];
    chatMemos: Array<string | undefined>;
    selectedIndices: number[];
  }

  let {
    enabled = $bindable(),
    hypaV3Data,
    onApplied,
  }: Props = $props();

  let search = $state("");
  let selectedPositions = $state(new Set<number>());
  let summaryState = $state.raw<ManualSummaryState | null>(null);
  let activeOperation: object | null = null;
  let selectionContextIdentity = $state.raw<unknown[] | null>(null);

  function resolveFirstMessage(character: {
    firstMessage?: string;
    alternateGreetings?: string[];
  }, firstMessageIndex: number | undefined) {
    const value = firstMessageIndex === -1
      ? character.firstMessage
      : typeof firstMessageIndex === "number"
        ? character.alternateGreetings?.[firstMessageIndex]
        : undefined;
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  function serializePresetIdentity(preset: object | null) {
    if (!preset) return null;
    try {
      return JSON.stringify(preset);
    }
    catch {
      return undefined;
    }
  }

  function readCurrentState(): ResolvedCurrentState | null {
    const characterIndex = $selectedCharID;
    const character = DBState.db.characters[characterIndex];
    const chatPage = character?.chatPage;
    const chat = Number.isInteger(chatPage) ? character?.chats?.[chatPage] : null;
    if (!character || !chat || !Array.isArray(chat.message)) return null;
    const presetIndex = DBState.db.hypaV3PresetId;
    const preset = DBState.db.hypaV3Presets?.[presetIndex] ?? null;
    const presetSignature = serializePresetIdentity(preset);
    if (presetSignature === undefined) return null;
    const summaries = chat.hypaV3Data?.summaries;
    if (!Array.isArray(summaries)) return null;
    if (hypaV3Data.summaries !== summaries) return null;
    const firstMessageIndex = chat.fmIndex;
    return {
      characterRef: character,
      chatRef: chat,
      chatId: chat.id ?? null,
      chatPage,
      firstMessage: resolveFirstMessage(character, firstMessageIndex),
      firstMessageIndex,
      messages: chat.message,
      summariesRef: summaries,
      summaries,
      presetRef: preset,
      presetIndex,
      presetSignature,
      processRegexScript: preset?.settings?.processRegexScript ?? false,
    };
  }

  const currentState = $derived.by(() => readCurrentState());
  const frontier = $derived(currentState
    ? deriveHypaManualFrontier({
        firstMessage: currentState.firstMessage,
        messages: currentState.messages,
        summaries: currentState.summaries,
      })
    : null);
  const candidates = $derived((frontier?.candidates ?? []).map((candidate) => {
    let displayData = candidate.data;
    try {
      const source: Message = candidate.firstMessage
        ? { role: "char", data: candidate.data }
        : candidate.messageRef as Message;
      displayData = processMessageCBS(
        source,
        candidate.messageIndex,
        candidate.firstMessage,
      ).data;
    }
    catch {
      // Generation repeats the same processing through an awaited error path.
      // Keep raw text available here instead of crashing the whole modal.
    }
    return { ...candidate, displayData };
  }));
  const filteredCandidates = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter((candidate) =>
      String(candidate.messageIndex).includes(query)
      || candidate.role.toLowerCase().includes(query)
      || (candidate.memo ?? "").toLowerCase().includes(query)
      || candidate.displayData.toLowerCase().includes(query)
    );
  });
  const currentContextIdentity = $derived(contextIdentity(currentState));
  const selectionIsCurrent = $derived(sameContextIdentity(
    selectionContextIdentity,
    currentContextIdentity,
  ));
  const effectiveSelectedPositions = $derived(selectionIsCurrent
    ? selectedPositions
    : new Set<number>());
  const selectedCandidates = $derived(frontier
    ? getSelectedHypaManualCandidates(frontier, effectiveSelectedPositions)
    : []);
  const resultIsStale = $derived(summaryState
    ? !snapshotIsCurrent(summaryState.snapshot)
    : false);

  function contextIdentity(state: ResolvedCurrentState | null) {
    if (!state) return [null];
    const lastSummary = state.summaries.at(-1) ?? null;
    const lastMemos = lastSummary?.chatMemos ?? null;
    return [
          state.characterRef,
          state.chatRef,
          state.chatId,
          state.chatPage,
          state.firstMessage,
          state.firstMessageIndex,
          state.summariesRef,
          state.summaries.length,
          lastSummary,
          lastMemos,
          lastMemos?.length ?? 0,
          ...(lastMemos ?? []),
          state.presetRef,
          state.presetIndex,
          state.presetSignature,
          state.processRegexScript,
          ...state.messages.flatMap((message) => [
            message,
            message.chatId,
            message.role,
            message.data,
          ]),
        ];
  }

  function sameContextIdentity(
    expected: unknown[] | null,
    current: unknown[],
  ) {
    return !!expected
      && expected.length === current.length
      && current.every((value, index) => value === expected[index]);
  }

  function invalidateOperation() {
    activeOperation = null;
  }

  function resetPanel(clearSearch = false) {
    invalidateOperation();
    selectedPositions = new Set();
    selectionContextIdentity = null;
    summaryState = null;
    if (clearSearch) search = "";
  }

  $effect(() => {
    if (!enabled) untrack(() => resetPanel(true));
  });

  function toggleCandidate(candidate: HypaManualCandidate) {
    if (!frontier || summaryState?.isProcessing || !candidate.selectable) return;
    const startingSelection = selectionIsCurrent
      ? selectedPositions
      : new Set<number>();
    selectedPositions = toggleHypaManualPrefix(
      startingSelection,
      candidate.position,
      frontier.selectablePrefixLength,
    );
    selectionContextIdentity = selectedPositions.size > 0
      ? currentContextIdentity
      : null;
  }

  function captureSnapshot(
    state: ResolvedCurrentState,
    selected: HypaManualCandidate[],
  ): HypaManualSelectionSnapshot {
    const lastSummary = state.summaries.at(-1) ?? null;
    return {
      characterRef: state.characterRef,
      chatRef: state.chatRef,
      chatId: state.chatId,
      chatPage: state.chatPage,
      firstMessage: state.firstMessage,
      firstMessageIndex: state.firstMessageIndex,
      summariesRef: state.summariesRef,
      summaryCount: state.summaries.length,
      lastSummaryRef: lastSummary,
      lastMemo: (lastSummary?.chatMemos ?? []).at(-1),
      presetRef: state.presetRef,
      presetIndex: state.presetIndex,
      presetSignature: state.presetSignature,
      processRegexScript: state.processRegexScript,
      selected: selected.map((candidate) => ({
        messageIndex: candidate.messageIndex,
        messageRef: candidate.messageRef,
        memo: candidate.memo,
        role: candidate.role,
        data: candidate.data,
        firstMessage: candidate.firstMessage,
      })),
    };
  }

  function snapshotIsCurrent(snapshot: HypaManualSelectionSnapshot) {
    return isHypaManualSnapshotCurrent(snapshot, readCurrentState());
  }

  function formatError(error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return language.hypaV3Modal.manualSummarizeFailed.replace("{0}", detail);
  }

  async function prepareInput(
    token: object,
    snapshot: HypaManualSelectionSnapshot,
    selected: HypaManualCandidate[],
  ) {
    const input: OpenAIChat[] = [];
    for (const candidate of selected) {
      const source: Message = candidate.firstMessage
        ? { role: "char", data: candidate.data }
        : candidate.messageRef as Message;
      const processed = await processHypaV3Message(
        source,
        candidate.messageIndex,
        snapshot.processRegexScript,
        candidate.firstMessage,
      );
      if (activeOperation !== token || !snapshotIsCurrent(snapshot)) {
        throw new Error(language.hypaV3Modal.manualSummarizeStale);
      }
      input.push({
        role: (processed.role === "char"
          ? "assistant"
          : processed.role) as OpenAIChat["role"],
        content: processed.data,
      });
    }
    return input;
  }

  async function generateSummary() {
    if (summaryState?.isProcessing) return;
    const state = readCurrentState();
    if (!state) return;
    const issuedContextIdentity = contextIdentity(state);
    if (!sameContextIdentity(selectionContextIdentity, issuedContextIdentity)) {
      selectedPositions = new Set();
      selectionContextIdentity = null;
      return;
    }
    const issuedFrontier = deriveHypaManualFrontier({
      firstMessage: state.firstMessage,
      messages: state.messages,
      summaries: state.summaries,
    });
    const selected = getSelectedHypaManualCandidates(
      issuedFrontier,
      selectedPositions,
    );
    if (selected.length === 0) return;

    const snapshot = captureSnapshot(state, selected);
    const token = {};
    activeOperation = token;
    summaryState = {
      isProcessing: true,
      result: null,
      error: null,
      stale: false,
      snapshot,
      input: [],
      chatMemos: selected.map((candidate) => candidate.memo),
      selectedIndices: selected.map((candidate) => candidate.messageIndex),
    };

    try {
      const input = await prepareInput(token, snapshot, selected);
      if (activeOperation !== token) return;
      summaryState = { ...summaryState, input };
      const result = await summarize(input);
      if (activeOperation !== token || !summaryState) return;
      summaryState = {
        ...summaryState,
        isProcessing: false,
        result,
        stale: !snapshotIsCurrent(snapshot),
      };
    }
    catch (error) {
      if (activeOperation !== token || !summaryState) return;
      const stale = !snapshotIsCurrent(snapshot);
      summaryState = {
        ...summaryState,
        isProcessing: false,
        error: stale
          ? language.hypaV3Modal.manualSummarizeStale
          : formatError(error),
        stale,
      };
    }
  }

  async function rerollSummary() {
    const previous = summaryState;
    if (
      !previous
      || previous.isProcessing
      || previous.input.length === 0
      || !snapshotIsCurrent(previous.snapshot)
    ) {
      if (previous) {
        summaryState = {
          ...previous,
          stale: true,
          error: language.hypaV3Modal.manualSummarizeStale,
        };
      }
      return;
    }
    const token = {};
    activeOperation = token;
    summaryState = {
      ...previous,
      isProcessing: true,
      error: null,
      stale: false,
    };
    try {
      const result = await summarize(previous.input);
      if (activeOperation !== token || !summaryState) return;
      summaryState = {
        ...summaryState,
        isProcessing: false,
        result,
        stale: !snapshotIsCurrent(previous.snapshot),
      };
    }
    catch (error) {
      if (activeOperation !== token || !summaryState) return;
      const stale = !snapshotIsCurrent(previous.snapshot);
      summaryState = {
        ...summaryState,
        isProcessing: false,
        error: stale
          ? language.hypaV3Modal.manualSummarizeStale
          : formatError(error),
        stale,
      };
    }
  }

  function applySummary() {
    const state = summaryState;
    if (
      !state
      || state.isProcessing
      || state.stale
      || !state.result
      || !snapshotIsCurrent(state.snapshot)
    ) {
      if (state) {
        summaryState = {
          ...state,
          stale: true,
          error: language.hypaV3Modal.manualSummarizeStale,
        };
      }
      return;
    }
    hypaV3Data.summaries.push({
      text: state.result,
      chatMemos: state.chatMemos as string[],
      isImportant: false,
      categoryId: undefined,
      tags: [],
    });
    resetPanel(true);
    enabled = false;
    onApplied();
  }

  function discardResult() {
    if (summaryState?.isProcessing) return;
    invalidateOperation();
    summaryState = null;
  }

  function candidateBlockText(candidate: HypaManualCandidate) {
    if (candidate.blockReason === "missing-message-id") {
      return language.hypaV3Modal.manualSummarizeNoMessageId;
    }
    if (candidate.blockReason === "duplicate-message-id") {
      return language.hypaV3Modal.manualSummarizeDuplicateMessageId;
    }
    if (candidate.blockReason === "after-blocked-message") {
      return language.hypaV3Modal.manualSummarizeBlockedAfterMessage;
    }
    return "";
  }

  onDestroy(() => invalidateOperation());
</script>

{#if enabled}
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden" data-testid="kei-hypa-manual-panel">
    {#if summaryState}
      <div class="text-xs text-zinc-400">
        {language.hypaV3Modal.manualSummarizeSelectedMessages.replace(
          "{0}",
          summaryState.selectedIndices.map((index) => `#${index}`).join(", "),
        )}
      </div>

      {#if summaryState.isProcessing}
        <div class="flex flex-1 items-center justify-center py-8 text-zinc-400">
          <RefreshCw class="mr-2 h-6 w-6 animate-spin" />
          {language.hypaV3Modal.manualSummarizing}
        </div>
      {:else}
        {#if summaryState.error || resultIsStale}
          <div class="rounded-sm border border-red-800 bg-red-950/30 p-3 text-sm text-red-300" role="alert">
            {resultIsStale
              ? language.hypaV3Modal.manualSummarizeStale
              : summaryState.error}
          </div>
        {/if}
        {#if summaryState.result}
          <textarea
            class="min-h-40 w-full flex-1 resize-y rounded-sm border border-zinc-700 bg-zinc-800 p-3 text-zinc-200 focus:outline-hidden"
            readonly
            value={summaryState.result}
            aria-label={language.hypaV3Modal.manualSummarizeResult}
          ></textarea>
        {/if}
        <div class="flex flex-wrap justify-end gap-2">
          <ShButton
            variant="outline"
            disabled={summaryState.stale || resultIsStale || summaryState.input.length === 0}
            onclick={rerollSummary}
          >
            <RefreshCw class="mr-1 h-4 w-4" />
            {language.hypaV3Modal.retry}
          </ShButton>
          <ShButton variant="outline" onclick={discardResult}>
            <XIcon class="mr-1 h-4 w-4" />
            {language.cancel}
          </ShButton>
          <ShButton
            variant="primary"
            disabled={summaryState.stale || resultIsStale || !summaryState.result}
            onclick={applySummary}
          >
            <CheckIcon class="mr-1 h-4 w-4" />
            {language.apply}
          </ShButton>
        </div>
      {/if}
    {:else if !frontier || frontier.status === "orphaned-frontier" || frontier.status === "ambiguous-frontier"}
      <div class="rounded-sm border border-red-800 bg-red-950/30 p-3 text-sm text-red-300" role="alert">
        {frontier?.status === "ambiguous-frontier"
          ? language.hypaV3Modal.manualSummarizeAmbiguousFrontier
          : language.hypaV3Modal.manualSummarizeOrphanedFrontier}
      </div>
    {:else}
      <div class="text-xs text-zinc-400">
        {language.hypaV3Modal.manualSummarizePrefixHelp}
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ShInput
          placeholder={language.hypaV3Modal.manualSummarizeSearchPlaceholder}
          bind:value={search}
        />
        <ShButton
          variant="primary"
          className="w-full sm:w-28"
          disabled={selectedCandidates.length === 0}
          onclick={generateSummary}
        >
          {language.hypaV3Modal.manualSummarizeGenerate}
        </ShButton>
      </div>
      <div class="text-xs text-zinc-400">
        {language.hypaV3Modal.manualSummarizeSelectedCount.replace(
          "{0}",
          String(selectedCandidates.length),
        )}
      </div>

      {#if frontier.status === "complete" || filteredCandidates.length === 0}
        <div class="flex flex-1 flex-col items-center justify-center rounded-sm border border-zinc-700 py-12 text-center text-zinc-400">
          <ScrollTextIcon class="mb-3 h-12 w-12 opacity-50" />
          {language.hypaV3Modal.manualSummarizeNoMessages}
        </div>
      {:else}
        <div class="min-h-0 flex-1 divide-y divide-zinc-700 overflow-y-auto rounded-sm border border-zinc-700">
          {#each filteredCandidates as candidate (candidate.position)}
            <button
              type="button"
              class="flex w-full items-start gap-3 p-3 text-left transition-colors {effectiveSelectedPositions.has(candidate.position)
                ? 'bg-blue-950/50 text-zinc-100'
                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'} {candidate.selectable
                ? ''
                : 'cursor-not-allowed opacity-50'}"
              disabled={!candidate.selectable}
              aria-pressed={effectiveSelectedPositions.has(candidate.position)}
              onclick={() => toggleCandidate(candidate)}
            >
              <span class="w-10 shrink-0 text-xs text-zinc-400">#{candidate.messageIndex}</span>
              <span class="w-16 shrink-0 text-xs text-zinc-400">{candidate.role}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{candidate.displayData}</span>
                {#if !candidate.selectable}
                  <span class="mt-1 block text-xs text-red-300">{candidateBlockText(candidate)}</span>
                {:else if candidate.memo}
                  <span class="mt-1 block truncate text-xs text-zinc-500">{candidate.memo}</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}
