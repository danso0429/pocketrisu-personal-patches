'use strict'

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0'] }

function createHypaToolsAdapterManifest({
    id,
    title,
    adapter,
    bgPreserve,
}) {
    const prefix = `${id}:`
    const marker = (name) =>
        `POCKETRISU-PATCH:kei-hypa-tools:${adapter}:${name}`

    const units181 = [
            {
                id: `${prefix}utils-hypa-import`,
                file: 'src/lib/Others/HypaV3Modal/utils.ts',
                type: 'replace',
                anchor: `import { language } from "src/lang";
`,
                managed: `import { language } from "src/lang";
/* ${marker('utils-hypa-import')} */
import {
  getCurrentHypaV3Preset,
  type SerializableHypaV3Data,
} from "src/ts/process/memory/hypav3";
import { deriveHypaManualFrontier } from "./keiHypaManualSelection";
`,
                markerNeedle: marker('utils-hypa-import'),
                anchorPolicy: 'first',
                requires: ['kei-hypa-tools-core:selection'],
            },
            {
                id: `${prefix}utils-message-processing`,
                file: 'src/lib/Others/HypaV3Modal/utils.ts',
                type: 'replace',
                anchor: `export async function processRegexScript(
  msg: Message,
  msgIndex: number = -1
): Promise<Message> {
  const char = DBState.db.characters[get(selectedCharID)];
  const newData: string = (
    await processScriptFull(
      char,
      risuChatParser(msg.data, { chara: char, role: msg.role }),
      "editprocess",
      msgIndex,
      {
        chatRole: msg.role,
      }
    )
  ).data;

  return {
    ...msg,
    data: newData,
  };
}
`,
                managed: `/* ${marker('utils-message-processing')}:START */
export function processMessageCBS(
  msg: Message,
  msgIndex: number = -1,
  firstMessage: boolean = false
): Message {
  const char = DBState.db.characters[get(selectedCharID)];
  return {
    ...msg,
    data: risuChatParser(msg.data, {
      chara: char,
      chatID: msgIndex,
      role: msg.role,
      rmVar: true,
      cbsConditions: {
        chatRole: msg.role,
        firstmsg: firstMessage,
      },
    }),
  };
}

export async function processHypaV3Message(
  msg: Message,
  msgIndex: number = -1,
  applyRegexScript: boolean = false,
  firstMessage: boolean = false
): Promise<Message> {
  const char = DBState.db.characters[get(selectedCharID)];
  const cbsProcessedMessage = processMessageCBS(msg, msgIndex, firstMessage);
  if (!applyRegexScript) return cbsProcessedMessage;
  const newData = (
    await processScriptFull(
      char,
      cbsProcessedMessage.data,
      "editprocess",
      msgIndex,
      {
        chatRole: msg.role,
        firstmsg: firstMessage,
      }
    )
  ).data;
  return {
    ...msg,
    data: newData,
  };
}

export async function processRegexScript(
  msg: Message,
  msgIndex: number = -1
): Promise<Message> {
  return await processHypaV3Message(msg, msgIndex, true, msgIndex === -1);
}

export async function getNextSummarizationTarget(
  hypaV3Data: SerializableHypaV3Data
): Promise<Message | null> {
  const char = DBState.db.characters[get(selectedCharID)];
  const chat = char.chats[char.chatPage];
  const firstMessage = getFirstMessage();
  const frontier = deriveHypaManualFrontier({
    firstMessage,
    messages: chat.message,
    summaries: hypaV3Data.summaries,
  });
  if (
    frontier.status === "orphaned-frontier"
    || frontier.status === "ambiguous-frontier"
  ) {
    throw new Error(
      frontier.status === "ambiguous-frontier"
        ? language.hypaV3Modal.manualSummarizeAmbiguousFrontier
        : language.hypaV3Modal.manualSummarizeOrphanedFrontier
    );
  }
  const candidate = frontier.candidates[0];
  if (!candidate) return null;
  const shouldProcess = getCurrentHypaV3Preset().settings.processRegexScript;
  const message: Message = candidate.firstMessage
    ? { role: "char", chatId: "first", data: candidate.data }
    : candidate.messageRef as Message;
  return await processHypaV3Message(
    message,
    candidate.messageIndex,
    shouldProcess,
    candidate.firstMessage
  );
}
/* ${marker('utils-message-processing')}:END */
`,
                markerNeedle: `${marker('utils-message-processing')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}utils-hypa-import`],
            },
            {
                id: `${prefix}footer-imports`,
                file: 'src/lib/Others/HypaV3Modal/modal-footer.svelte',
                type: 'replace',
                anchor: `  import {
    type SerializableHypaV3Data,
    getCurrentHypaV3Preset,
  } from "src/ts/process/memory/hypav3";
  import { type Message } from "src/ts/storage/database.svelte";
  import { DBState, selectedCharID } from "src/ts/stores.svelte";
  import { language } from "src/lang";
  import { getFirstMessage, processRegexScript } from "./utils";
`,
                managed: `  import { type SerializableHypaV3Data } from "src/ts/process/memory/hypav3";
  import { language } from "src/lang";
  /* ${marker('footer-imports')} */
  import { getFirstMessage, getNextSummarizationTarget } from "./utils";
`,
                markerNeedle: marker('footer-imports'),
                anchorPolicy: 'first',
                requires: [`${prefix}utils-message-processing`],
            },
            {
                id: `${prefix}footer-remove-local-target`,
                file: 'src/lib/Others/HypaV3Modal/modal-footer.svelte',
                type: 'replace',
                anchor: `  async function getNextSummarizationTarget(): Promise<Message | null> {
    const char = DBState.db.characters[$selectedCharID];
    const chat = char.chats[DBState.db.characters[$selectedCharID].chatPage];
    const shouldProcess = getCurrentHypaV3Preset().settings.processRegexScript;

    // Summaries exist
    if (hypaV3Data.summaries.length > 0) {
      const lastSummary = hypaV3Data.summaries.at(-1);
      const lastMessageIndex = chat.message.findIndex(
        (m) => m.chatId === lastSummary.chatMemos.at(-1)
      );

      if (lastMessageIndex !== -1) {
        const next = chat.message[lastMessageIndex + 1] ?? null;

        return next && shouldProcess
          ? await processRegexScript(next, lastMessageIndex + 1)
          : next;
      }
    }

    // When no summaries exist OR couldn't find last connected message,
    // check if first message is available
    const firstMessage = getFirstMessage();

    if (!firstMessage) {
      const next = chat.message[0] ?? null;

      return next && shouldProcess ? await processRegexScript(next, 0) : next;
    }

    // Will summarize first message
    const next: Message = { role: "char", chatId: "first", data: firstMessage };

    return shouldProcess ? await processRegexScript(next) : next;
  }
`,
                managed: `  /* ${marker('footer-remove-local-target')} */
`,
                markerNeedle: marker('footer-remove-local-target'),
                anchorPolicy: 'first',
                requires: [`${prefix}footer-imports`],
            },
            {
                id: `${prefix}footer-target-arg`,
                file: 'src/lib/Others/HypaV3Modal/modal-footer.svelte',
                type: 'replace',
                anchor: `  {#await getNextSummarizationTarget() then nextMessage}
`,
                managed: `  <!-- ${marker('footer-target-arg')} -->
  {#await getNextSummarizationTarget(hypaV3Data) then nextMessage}
`,
                markerNeedle: marker('footer-target-arg'),
                anchorPolicy: 'first',
                requires: [`${prefix}footer-remove-local-target`],
            },
            {
                id: `${prefix}summary-item-helper-import`,
                file: 'src/lib/Others/HypaV3Modal/modal-summary-item.svelte',
                type: 'replace',
                anchor: `    processRegexScript,
`,
                managed: `    /* ${marker('summary-item-helper-import')} */
    processHypaV3Message,
`,
                markerNeedle: marker('summary-item-helper-import'),
                anchorPolicy: 'first',
                requires: [`${prefix}utils-message-processing`],
            },
            {
                id: `${prefix}summary-item-helper-call`,
                file: 'src/lib/Others/HypaV3Modal/modal-summary-item.svelte',
                type: 'replace',
                anchor: `    return shouldProcess ? await processRegexScript(msg, msgIndex) : msg;
`,
                managed: `    /* ${marker('summary-item-helper-call')} */
    return await processHypaV3Message(
      msg,
      msgIndex,
      shouldProcess,
      chatMemo == null
    );
`,
                markerNeedle: marker('summary-item-helper-call'),
                anchorPolicy: 'first',
                requires: [`${prefix}summary-item-helper-import`],
            },
            {
                id: `${prefix}modal-panel-import`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'replace',
                anchor: `  import BulkResummaryResult from "./HypaV3Modal/bulk-resummary-result.svelte";
`,
                managed: `  import BulkResummaryResult from "./HypaV3Modal/bulk-resummary-result.svelte";
  /* ${marker('modal-panel-import')} */
  import KeiHypaManualSummaryPanel from "./HypaV3Modal/KeiHypaManualSummaryPanel.svelte";
`,
                markerNeedle: marker('modal-panel-import'),
                anchorPolicy: 'first',
                requires: ['kei-hypa-tools-core:manual-panel'],
            },
            {
                id: `${prefix}modal-panel-state`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'replace',
                anchor: `  let bulkResummaryState = $state<BulkResummaryState | null>(null);
`,
                managed: `  let bulkResummaryState = $state<BulkResummaryState | null>(null);
  /* ${marker('modal-panel-state')} */
  let manualSummaryMode = $state(false);
`,
                markerNeedle: marker('modal-panel-state'),
                anchorPolicy: 'first',
                requires: [`${prefix}modal-panel-import`],
            },
            {
                id: `${prefix}modal-panel-functions`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'insert',
                where: 'after',
                anchor: `  function handleOpenTagManager(summaryIndex: number) {
    tagManagerState.currentSummaryIndex = summaryIndex;
    tagManagerState.isOpen = true;
  }
`,
                content: `
  /* ${marker('modal-panel-functions')}:START */
  function handleToggleManualSummaryMode() {
    if (bulkResummaryState) return;
    manualSummaryMode = !manualSummaryMode;
    searchState = null;
    bulkEditState.isEnabled = false;
    bulkEditState.selectedSummaries = new Set();
    categoryManagerState.isOpen = false;
    tagManagerState.isOpen = false;
  }

  function handleManualSummaryApplied() {
    uiState.collapsedSummaries = new Set(
      hypaV3Data.summaries.map((_, index) => index)
    );
  }
  /* ${marker('modal-panel-functions')}:END */
`,
                markerNeedle: `${marker('modal-panel-functions')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}modal-panel-state`],
            },
            {
                id: `${prefix}modal-height`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'replace',
                anchor: `        .summaries.length === 0
`,
                managed: `        .summaries.length === 0 && !manualSummaryMode /* ${marker('modal-height')} */
`,
                markerNeedle: marker('modal-height'),
                anchorPolicy: 'first',
                requires: [`${prefix}modal-panel-functions`],
            },
            {
                id: `${prefix}modal-header-props`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'replace',
                anchor: `        onResetData={handleResetData}
        onToggleBulkEditMode={handleToggleBulkEditMode}
        onOpenCategoryManager={handleOpenCategoryManager}
`,
                managed: `        onResetData={handleResetData}
        onToggleBulkEditMode={handleToggleBulkEditMode}
        onOpenCategoryManager={handleOpenCategoryManager}
        manualSummaryMode={manualSummaryMode /* ${marker('modal-header-props')} */}
        manualSummaryDisabled={bulkResummaryState !== null}
        onToggleManualSummaryMode={handleToggleManualSummaryMode}
`,
                markerNeedle: marker('modal-header-props'),
                anchorPolicy: 'first',
                requires: [`${prefix}modal-height`],
            },
            {
                id: `${prefix}modal-panel-open`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'replace',
                anchor: `      <!-- Scrollable Container -->
`,
                managed: `      <!-- ${marker('modal-panel-open')}:START -->
      <KeiHypaManualSummaryPanel
        bind:enabled={manualSummaryMode}
        {hypaV3Data}
        onApplied={handleManualSummaryApplied}
      />

      {#if !manualSummaryMode}
      <!-- Scrollable Container -->
`,
                markerNeedle: `${marker('modal-panel-open')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}modal-header-props`],
            },
            {
                id: `${prefix}modal-panel-close`,
                file: 'src/lib/Others/HypaV3Modal.svelte',
                type: 'insert',
                where: 'after',
                anchor: `      <BulkEditActions
        {bulkEditState}
        {categories}
        showImportantOnly={filterState.showImportantOnly}
        selectedCategoryFilter={filterState.selectedCategoryFilter}
        onResummarize={resummarizeBulkSelected}
        onClearSelection={handleBulkEditClearSelection}
        onUpdateSelectedCategory={handleBulkEditUpdateSelectedCategory}
        onUpdateBulkSelectInput={handleBulkEditUpdateBulkSelectInput}
        onApplyCategory={handleBulkEditApplyCategory}
        onToggleImportant={handleBulkEditToggleImportant}
        onParseAndSelectSummaries={handleBulkEditParseAndSelectSummaries}
      />
`,
                managed: `      {/if}
      <!-- ${marker('modal-panel-close')} -->
`,
                markerNeedle: marker('modal-panel-close'),
                anchorPolicy: 'first',
                requires: [`${prefix}modal-panel-open`],
            },
            {
                id: `${prefix}header-icon-import`,
                file: 'src/lib/Others/HypaV3Modal/modal-header.svelte',
                type: 'replace',
                anchor: `    SquarePenIcon,
    TagIcon,
`,
                managed: `    SquarePenIcon,
    TagIcon,
    /* ${marker('header-icon-import')} */
    ScrollTextIcon,
`,
                markerNeedle: marker('header-icon-import'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}header-prop-types`,
                file: 'src/lib/Others/HypaV3Modal/modal-header.svelte',
                type: 'replace',
                anchor: `    onOpenCategoryManager?: () => void;
`,
                managed: `    onOpenCategoryManager?: () => void;
    /* ${marker('header-prop-types')} */
    manualSummaryMode: boolean;
    manualSummaryDisabled?: boolean;
    onToggleManualSummaryMode: () => void;
`,
                markerNeedle: marker('header-prop-types'),
                anchorPolicy: 'first',
                requires: [`${prefix}header-icon-import`],
            },
            {
                id: `${prefix}header-prop-values`,
                file: 'src/lib/Others/HypaV3Modal/modal-header.svelte',
                type: 'replace',
                anchor: `    onOpenCategoryManager,
  }: Props = $props();
`,
                managed: `    onOpenCategoryManager,
    /* ${marker('header-prop-values')} */
    manualSummaryMode,
    manualSummaryDisabled = false,
    onToggleManualSummaryMode,
  }: Props = $props();
`,
                markerNeedle: marker('header-prop-values'),
                anchorPolicy: 'first',
                requires: [`${prefix}header-prop-types`],
            },
            {
                id: `${prefix}header-manual-button`,
                file: 'src/lib/Others/HypaV3Modal/modal-header.svelte',
                type: 'insert',
                where: 'before',
                anchor: `    <!-- Open Search Button -->
`,
                managed: `    <!-- ${marker('header-manual-button')}:START -->
    <button
      class="p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 {manualSummaryMode
        ? 'text-blue-400 hover:text-blue-300'
        : 'text-zinc-400 hover:text-zinc-200'}"
      title={language.hypaV3Modal.manualSummarize}
      aria-label={language.hypaV3Modal.manualSummarize}
      aria-pressed={manualSummaryMode}
      disabled={manualSummaryDisabled}
      onclick={onToggleManualSummaryMode}
    >
      <ScrollTextIcon class="w-6 h-6" />
    </button>
    <!-- ${marker('header-manual-button')}:END -->

`,
                markerNeedle: `${marker('header-manual-button')}:START`,
                anchorPolicy: 'first',
                requires: [`${prefix}header-prop-values`],
            },
            {
                id: `${prefix}lang-en`,
                file: 'src/lang/en.ts',
                type: 'replace',
                anchor: `        searchPlaceholder: "Enter #N, ID, or query",
`,
                managed: `        searchPlaceholder: "Enter #N, ID, or query",
        /* ${marker('lang-en')} */
        manualSummarize: "Manual Summarize",
        manualSummarizeSearchPlaceholder: "Search unsummarized messages...",
        manualSummarizeGenerate: "Summarize",
        manualSummarizing: "Summarizing...",
        manualSummarizeResult: "Manual summarization result",
        manualSummarizeNoMessages: "No eligible unsummarized messages",
        manualSummarizeNoMessageId: "This message has no stable message ID, so it and later messages cannot be selected.",
        manualSummarizeDuplicateMessageId: "This message ID is duplicated, so the summary frontier would be ambiguous.",
        manualSummarizeBlockedAfterMessage: "An earlier message has no unique stable ID.",
        manualSummarizeSelectedCount: "Selected messages: {0}",
        manualSummarizeSelectedMessages: "{0} selected",
        manualSummarizePrefixHelp: "Choosing a message includes every eligible unsummarized message before it.",
        manualSummarizeOrphanedFrontier: "The last summary no longer points to a message in this chat. Repair or remove that orphaned summary before manual summarization.",
        manualSummarizeAmbiguousFrontier: "The last summary points to a duplicated message ID. Resolve the duplicate before manual summarization.",
        manualSummarizeStale: "The chat, selected messages, summary frontier, or Hypa preset changed. This result cannot be applied.",
        manualSummarizeFailed: "Manual summarization failed: {0}",
`,
                markerNeedle: marker('lang-en'),
                anchorPolicy: 'first',
            },
            {
                id: `${prefix}lang-ko`,
                file: 'src/lang/ko.ts',
                type: 'replace',
                anchor: `    searchPlaceholder: "#N, ID 또는 검색어 입력",
`,
                managed: `    searchPlaceholder: "#N, ID 또는 검색어 입력",
    /* ${marker('lang-ko')} */
    manualSummarize: "수동 요약",
    manualSummarizeSearchPlaceholder: "요약되지 않은 메시지 검색...",
    manualSummarizeGenerate: "요약",
    manualSummarizing: "요약 중...",
    manualSummarizeResult: "수동 요약 결과",
    manualSummarizeNoMessages: "요약할 수 있는 미요약 메시지가 없습니다",
    manualSummarizeNoMessageId: "이 메시지는 안정적인 메시지 ID가 없어 이 메시지와 이후 메시지를 선택할 수 없습니다.",
    manualSummarizeDuplicateMessageId: "이 메시지 ID가 중복되어 요약 경계를 확정할 수 없습니다.",
    manualSummarizeBlockedAfterMessage: "앞선 메시지에 고유하고 안정적인 ID가 없습니다.",
    manualSummarizeSelectedCount: "선택한 메시지: {0}",
    manualSummarizeSelectedMessages: "{0} 선택됨",
    manualSummarizePrefixHelp: "메시지를 고르면 그보다 앞선 요약 가능한 미요약 메시지도 모두 포함됩니다.",
    manualSummarizeOrphanedFrontier: "마지막 요약이 현재 채팅의 메시지를 가리키지 않습니다. 고아 요약을 복구하거나 제거한 뒤 수동 요약하세요.",
    manualSummarizeAmbiguousFrontier: "마지막 요약이 중복 메시지 ID를 가리킵니다. 중복을 해소한 뒤 수동 요약하세요.",
    manualSummarizeStale: "채팅, 선택 메시지, 요약 경계 또는 Hypa 프리셋이 바뀌어 이 결과를 적용할 수 없습니다.",
    manualSummarizeFailed: "수동 요약 실패: {0}",
`,
                markerNeedle: marker('lang-ko'),
                anchorPolicy: 'first',
                requires: [`${prefix}lang-en`],
            },
        ]

    const bySuffix = (suffix) => units181.find((unit) =>
        unit.id === `${prefix}${suffix}`
    )
    const utilsMessageProcessing190 = {
        id: `${prefix}utils-message-processing`,
        file: 'src/lib/Others/HypaV3Modal/utils.ts',
        type: 'insert',
        where: 'after',
        anchor: `export async function processMessageForPreview(
  msg: Message,
  msgIndex: number = -1,
  applyRegexScripts: boolean = false
): Promise<Message> {
  const char = DBState.db.characters[get(selectedCharID)];
  const parsed: string = risuChatParser(msg.data, {
    chara: char,
    role: msg.role,
  });

  if (!applyRegexScripts) {
    return {
      ...msg,
      data: parsed,
    };
  }

  const newData: string = (
    await processScriptFull(char, parsed, "editprocess", msgIndex, {
      chatRole: msg.role,
    })
  ).data;

  return {
    ...msg,
    data: newData,
  };
}
`,
        content: `
/* ${marker('utils-message-processing')}:START */
export function processMessageCBS(
  msg: Message,
  msgIndex: number = -1,
  firstMessage: boolean = false
): Message {
  const char = DBState.db.characters[get(selectedCharID)];
  return {
    ...msg,
    data: risuChatParser(msg.data, {
      chara: char,
      chatID: msgIndex,
      role: msg.role,
      rmVar: true,
      cbsConditions: {
        chatRole: msg.role,
        firstmsg: firstMessage,
      },
    }),
  };
}

export async function processHypaV3Message(
  msg: Message,
  msgIndex: number = -1,
  applyRegexScript: boolean = false,
  firstMessage: boolean = false
): Promise<Message> {
  const char = DBState.db.characters[get(selectedCharID)];
  const cbsProcessedMessage = processMessageCBS(msg, msgIndex, firstMessage);
  if (!applyRegexScript) return cbsProcessedMessage;
  const newData = (
    await processScriptFull(
      char,
      cbsProcessedMessage.data,
      "editprocess",
      msgIndex,
      {
        chatRole: msg.role,
        firstmsg: firstMessage,
      }
    )
  ).data;
  return {
    ...msg,
    data: newData,
  };
}

export async function getNextSummarizationTarget(
  hypaV3Data: SerializableHypaV3Data
): Promise<Message | null> {
  const char = DBState.db.characters[get(selectedCharID)];
  const chat = char.chats[char.chatPage];
  const firstMessage = getFirstMessage();
  const frontier = deriveHypaManualFrontier({
    firstMessage,
    messages: chat.message,
    summaries: hypaV3Data.summaries,
  });
  if (
    frontier.status === "orphaned-frontier"
    || frontier.status === "ambiguous-frontier"
  ) {
    throw new Error(
      frontier.status === "ambiguous-frontier"
        ? language.hypaV3Modal.manualSummarizeAmbiguousFrontier
        : language.hypaV3Modal.manualSummarizeOrphanedFrontier
    );
  }
  const candidate = frontier.candidates[0];
  if (!candidate) return null;
  const shouldProcess = getCurrentHypaV3Preset().settings.processRegexScript;
  const message: Message = candidate.firstMessage
    ? { role: "char", chatId: "first", data: candidate.data }
    : candidate.messageRef as Message;
  return await processMessageForPreview(
    message,
    candidate.messageIndex,
    shouldProcess
  );
}
/* ${marker('utils-message-processing')}:END */
`,
        markerNeedle: `${marker('utils-message-processing')}:START`,
        anchorPolicy: 'first',
        requires: [`${prefix}utils-hypa-import`],
    }
    const footerImports190 = {
        ...bySuffix('footer-imports'),
        anchor: `  import {
    type SerializableHypaV3Data,
    getCurrentHypaV3Preset,
  } from "src/ts/process/memory/hypav3";
  import { type Message } from "src/ts/storage/database.svelte";
  import { DBState, selectedCharID } from "src/ts/stores.svelte";
  import { language } from "src/lang";
  import { getFirstMessage, processMessageForPreview } from "./utils";
`,
    }
    const footerRemoveLocalTarget190 = {
        ...bySuffix('footer-remove-local-target'),
        anchor: `  async function getNextSummarizationTarget(): Promise<Message | null> {
    const char = DBState.db.characters[$selectedCharID];
    const chat = char.chats[DBState.db.characters[$selectedCharID].chatPage];
    const shouldProcess = getCurrentHypaV3Preset().settings.processRegexScript;

    // Summaries exist
    if (hypaV3Data.summaries.length > 0) {
      const lastSummary = hypaV3Data.summaries.at(-1);
      const lastMessageIndex = chat.message.findIndex(
        (m) => m.chatId === lastSummary.chatMemos.at(-1)
      );

      if (lastMessageIndex !== -1) {
        const next = chat.message[lastMessageIndex + 1] ?? null;

        return next
          ? await processMessageForPreview(
              next,
              lastMessageIndex + 1,
              shouldProcess
            )
          : next;
      }
    }

    // When no summaries exist OR couldn't find last connected message,
    // check if first message is available
    const firstMessage = getFirstMessage();

    if (!firstMessage) {
      const next = chat.message[0] ?? null;

      return next
        ? await processMessageForPreview(next, 0, shouldProcess)
        : next;
    }

    // Will summarize first message
    const next: Message = { role: "char", chatId: "first", data: firstMessage };

    return await processMessageForPreview(next, -1, shouldProcess);
  }
`,
    }
    const replacements190 = new Map([
        [`${prefix}utils-message-processing`, utilsMessageProcessing190],
        [`${prefix}footer-imports`, footerImports190],
        [`${prefix}footer-remove-local-target`, footerRemoveLocalTarget190],
    ])
    const units190Source = units181
        .filter((unit) => !unit.id.startsWith(`${prefix}summary-item-helper-`))
        .map((unit) => replacements190.get(unit.id) ?? unit)
    const units190Ids = new Set(units190Source.map((unit) => unit.id))
    const target190Dependency = (dependency) =>
        units190Ids.has(dependency) ? `${dependency}:1.9` : dependency
    const units190 = units190Source.map((unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        requires: unit.requires?.map(target190Dependency),
        after: unit.after?.map(target190Dependency),
        targetVersions: pocketRisu190,
    }))

    return {
        id,
        title,
        version: '0.2.1',
        userSelectable: false,
        targets: {
            pocketrisu: {
                verified: ['1.8.1', '1.9.0'],
                reviewing: [],
            },
        },
        requires: bgPreserve
            ? ['kei-hypa-tools-core', 'bg-preserve']
            : ['kei-hypa-tools-core'],
        conflicts: bgPreserve
            ? ['kei-hypa-tools-base-adapter']
            : ['bg-preserve', 'kei-hypa-tools-bg-adapter'],
        autoWhen: bgPreserve
            ? {
                all: ['kei-hypa-tools-core', 'bg-preserve'],
            }
            : {
                all: ['kei-hypa-tools-core'],
                none: ['bg-preserve'],
            },
        units: [
            ...units181.map((unit) => ({
                ...unit,
                targetVersions: pocketRisu181,
            })),
            ...units190,
        ],
    }
}

module.exports = {
    createHypaToolsAdapterManifest,
}
