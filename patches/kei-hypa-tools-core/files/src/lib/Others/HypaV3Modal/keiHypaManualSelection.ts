export interface HypaManualMessage {
  role: string;
  data: string;
  chatId?: string | null;
}

export interface HypaManualSummary {
  chatMemos?: Array<string | null | undefined>;
}

export type HypaManualBlockReason =
  | "missing-message-id"
  | "duplicate-message-id"
  | "after-blocked-message";

export interface HypaManualCandidate {
  position: number;
  messageIndex: number;
  memo: string | undefined;
  role: string;
  data: string;
  messageRef: HypaManualMessage | null;
  firstMessage: boolean;
  selectable: boolean;
  blockReason: HypaManualBlockReason | null;
}

export type HypaManualFrontierStatus =
  | "ready"
  | "complete"
  | "orphaned-frontier"
  | "ambiguous-frontier";

export interface HypaManualFrontier {
  status: HypaManualFrontierStatus;
  candidates: HypaManualCandidate[];
  selectablePrefixLength: number;
  lastSummaryRef: HypaManualSummary | null;
  lastMemo: string | null | undefined;
}

export function deriveHypaManualFrontier({
  firstMessage,
  messages,
  summaries,
}: {
  firstMessage: string | null;
  messages: HypaManualMessage[];
  summaries: HypaManualSummary[];
}): HypaManualFrontier {
  const lastSummaryRef = summaries.at(-1) ?? null;
  const lastMemos = lastSummaryRef?.chatMemos ?? [];
  const lastMemo = lastMemos.at(-1);
  let includeFirstMessage = false;
  let startMessageIndex = 0;

  if (!lastSummaryRef) {
    includeFirstMessage = firstMessage !== null && firstMessage !== "";
  }
  else if (lastMemos.length === 0) {
    return {
      status: "orphaned-frontier",
      candidates: [],
      selectablePrefixLength: 0,
      lastSummaryRef,
      lastMemo,
    };
  }
  else if (lastMemo == null) {
    if (
      lastMemos.length !== 1
      || firstMessage === null
      || firstMessage === ""
    ) {
      return {
        status: "orphaned-frontier",
        candidates: [],
        selectablePrefixLength: 0,
        lastSummaryRef,
        lastMemo,
      };
    }
  }
  else {
    const matchingIndices: number[] = [];
    messages.forEach((message, index) => {
      if (message.chatId === lastMemo) matchingIndices.push(index);
    });
    if (matchingIndices.length === 0) {
      return {
        status: "orphaned-frontier",
        candidates: [],
        selectablePrefixLength: 0,
        lastSummaryRef,
        lastMemo,
      };
    }
    if (matchingIndices.length !== 1) {
      return {
        status: "ambiguous-frontier",
        candidates: [],
        selectablePrefixLength: 0,
        lastSummaryRef,
        lastMemo,
      };
    }
    startMessageIndex = matchingIndices[0] + 1;
  }

  const idCounts = new Map<string, number>();
  for (const message of messages) {
    if (typeof message.chatId === "string" && message.chatId.length > 0) {
      idCounts.set(message.chatId, (idCounts.get(message.chatId) ?? 0) + 1);
    }
  }

  const candidates: HypaManualCandidate[] = [];
  if (includeFirstMessage) {
    candidates.push({
      position: 0,
      messageIndex: -1,
      memo: undefined,
      role: "char",
      data: firstMessage ?? "",
      messageRef: null,
      firstMessage: true,
      selectable: true,
      blockReason: null,
    });
  }

  let blocked = false;
  for (let messageIndex = startMessageIndex; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    const memo = typeof message.chatId === "string" && message.chatId.length > 0
      ? message.chatId
      : undefined;
    let blockReason: HypaManualBlockReason | null = null;
    if (blocked) {
      blockReason = "after-blocked-message";
    }
    else if (!memo) {
      blockReason = "missing-message-id";
      blocked = true;
    }
    else if ((idCounts.get(memo) ?? 0) !== 1) {
      blockReason = "duplicate-message-id";
      blocked = true;
    }
    candidates.push({
      position: candidates.length,
      messageIndex,
      memo,
      role: message.role,
      data: message.data,
      messageRef: message,
      firstMessage: false,
      selectable: blockReason === null,
      blockReason,
    });
  }

  const selectablePrefixLength = candidates.findIndex((candidate) => !candidate.selectable);
  const boundedPrefixLength = selectablePrefixLength === -1
    ? candidates.length
    : selectablePrefixLength;

  return {
    status: candidates.length === 0 ? "complete" : "ready",
    candidates,
    selectablePrefixLength: boundedPrefixLength,
    lastSummaryRef,
    lastMemo,
  };
}

export function toggleHypaManualPrefix(
  selectedPositions: Set<number>,
  targetPosition: number,
  selectablePrefixLength: number,
) {
  if (
    !Number.isInteger(targetPosition)
    || targetPosition < 0
    || targetPosition >= selectablePrefixLength
  ) {
    return new Set(selectedPositions);
  }
  const endExclusive = selectedPositions.has(targetPosition)
    ? targetPosition
    : targetPosition + 1;
  return new Set(Array.from({ length: endExclusive }, (_, index) => index));
}

export function getSelectedHypaManualCandidates(
  frontier: HypaManualFrontier,
  selectedPositions: Set<number>,
) {
  if (
    selectedPositions.size === 0
    || selectedPositions.size > frontier.selectablePrefixLength
  ) {
    return [];
  }
  for (let index = 0; index < selectedPositions.size; index++) {
    if (!selectedPositions.has(index)) return [];
  }
  return frontier.candidates.slice(0, selectedPositions.size);
}

export interface HypaManualSelectionSnapshot {
  characterRef: object;
  chatRef: object;
  chatId: string | null;
  chatPage: number;
  firstMessage: string | null;
  firstMessageIndex: number | undefined;
  summariesRef: object;
  summaryCount: number;
  lastSummaryRef: object | null;
  lastMemo: string | null | undefined;
  presetRef: object | null;
  presetIndex: number;
  presetSignature: string | null;
  processRegexScript: boolean;
  selected: Array<{
    messageIndex: number;
    messageRef: object | null;
    memo: string | undefined;
    role: string;
    data: string;
    firstMessage: boolean;
  }>;
}

export interface HypaManualCurrentState {
  characterRef: object;
  chatRef: object;
  chatId: string | null;
  chatPage: number;
  firstMessage: string | null;
  firstMessageIndex: number | undefined;
  messages: HypaManualMessage[];
  summariesRef: object;
  summaries: HypaManualSummary[];
  presetRef: object | null;
  presetIndex: number;
  presetSignature: string | null;
  processRegexScript: boolean;
}

export function isHypaManualSnapshotCurrent(
  snapshot: HypaManualSelectionSnapshot,
  current: HypaManualCurrentState | null,
) {
  if (
    !current
    || snapshot.selected.length === 0
    || current.characterRef !== snapshot.characterRef
    || current.chatRef !== snapshot.chatRef
    || current.chatId !== snapshot.chatId
    || current.chatPage !== snapshot.chatPage
    || current.firstMessage !== snapshot.firstMessage
    || current.firstMessageIndex !== snapshot.firstMessageIndex
    || current.summariesRef !== snapshot.summariesRef
    || current.summaries.length !== snapshot.summaryCount
    || (current.summaries.at(-1) ?? null) !== snapshot.lastSummaryRef
    || (current.summaries.at(-1)?.chatMemos ?? []).at(-1) !== snapshot.lastMemo
    || current.presetRef !== snapshot.presetRef
    || current.presetIndex !== snapshot.presetIndex
    || current.presetSignature !== snapshot.presetSignature
    || current.processRegexScript !== snapshot.processRegexScript
  ) {
    return false;
  }

  const frontier = deriveHypaManualFrontier({
    firstMessage: current.firstMessage,
    messages: current.messages,
    summaries: current.summaries,
  });
  if (
    frontier.status !== "ready"
    || frontier.selectablePrefixLength < snapshot.selected.length
  ) {
    return false;
  }

  return snapshot.selected.every((selected, position) => {
    const candidate = frontier.candidates[position];
    return !!candidate
      && candidate.position === position
      && candidate.selectable
      && candidate.messageIndex === selected.messageIndex
      && candidate.messageRef === selected.messageRef
      && candidate.memo === selected.memo
      && candidate.role === selected.role
      && candidate.data === selected.data
      && candidate.firstMessage === selected.firstMessage;
  });
}
