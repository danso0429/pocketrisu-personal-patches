import { describe, expect, test } from "vitest";
import {
  deriveHypaManualFrontier,
  getSelectedHypaManualCandidates,
  isHypaManualSnapshotCurrent,
  toggleHypaManualPrefix,
  type HypaManualCurrentState,
  type HypaManualSelectionSnapshot,
} from "./keiHypaManualSelection";

const message = (chatId: string | null | undefined, data: string) => ({
  role: "user",
  data,
  chatId,
});

describe("Hypa manual summarization frontier", () => {
  test("starts at the first greeting and keeps one contiguous prefix", () => {
    const messages = [message("a", "A"), message("b", "B")];
    const frontier = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages,
      summaries: [],
    });
    expect(frontier.status).toBe("ready");
    expect(frontier.candidates.map((candidate) => candidate.messageIndex)).toEqual([-1, 0, 1]);
    expect(frontier.selectablePrefixLength).toBe(3);

    let selected = toggleHypaManualPrefix(new Set(), 2, frontier.selectablePrefixLength);
    expect([...selected]).toEqual([0, 1, 2]);
    expect(getSelectedHypaManualCandidates(frontier, selected)).toHaveLength(3);

    selected = toggleHypaManualPrefix(selected, 1, frontier.selectablePrefixLength);
    expect([...selected]).toEqual([0]);
  });

  test("continues after a first-message summary and then after one unique memo", () => {
    const messages = [message("a", "A"), message("b", "B"), message("c", "C")];
    const afterFirst = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages,
      summaries: [{ chatMemos: [undefined] }],
    });
    expect(afterFirst.candidates.map((candidate) => candidate.messageIndex)).toEqual([0, 1, 2]);

    const afterB = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages,
      summaries: [{ chatMemos: [undefined, "a", "b"] }],
    });
    expect(afterB.candidates.map((candidate) => candidate.messageIndex)).toEqual([2]);
  });

  test("does not silently restart from the beginning for a missing frontier", () => {
    const frontier = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages: [message("a", "A")],
      summaries: [{ chatMemos: ["missing"] }],
    });
    expect(frontier.status).toBe("orphaned-frontier");
    expect(frontier.candidates).toEqual([]);
  });

  test("rejects a malformed first-message frontier with extra memos", () => {
    const frontier = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages: [message("a", "A")],
      summaries: [{ chatMemos: ["a", undefined] }],
    });
    expect(frontier.status).toBe("orphaned-frontier");
    expect(frontier.candidates).toEqual([]);
  });

  test("rejects an ambiguous duplicate frontier", () => {
    const frontier = deriveHypaManualFrontier({
      firstMessage: "Greeting",
      messages: [message("same", "A"), message("same", "B")],
      summaries: [{ chatMemos: ["same"] }],
    });
    expect(frontier.status).toBe("ambiguous-frontier");
  });

  test("a missing or duplicate message id blocks it and everything after it", () => {
    const missing = deriveHypaManualFrontier({
      firstMessage: null,
      messages: [message("a", "A"), message(undefined, "B"), message("c", "C")],
      summaries: [],
    });
    expect(missing.selectablePrefixLength).toBe(1);
    expect(missing.candidates.map((candidate) => candidate.blockReason)).toEqual([
      null,
      "missing-message-id",
      "after-blocked-message",
    ]);

    const duplicate = deriveHypaManualFrontier({
      firstMessage: null,
      messages: [message("same", "A"), message("same", "B"), message("c", "C")],
      summaries: [],
    });
    expect(duplicate.selectablePrefixLength).toBe(0);
    expect(duplicate.candidates.map((candidate) => candidate.blockReason)).toEqual([
      "duplicate-message-id",
      "after-blocked-message",
      "after-blocked-message",
    ]);
  });

  test("cannot manufacture a non-prefix selection", () => {
    const frontier = deriveHypaManualFrontier({
      firstMessage: null,
      messages: [message("a", "A"), message("b", "B")],
      summaries: [],
    });
    expect(getSelectedHypaManualCandidates(frontier, new Set([1]))).toEqual([]);
    expect(toggleHypaManualPrefix(new Set(), 5, frontier.selectablePrefixLength)).toEqual(new Set());
  });
});

describe("Hypa manual summarization snapshot", () => {
  const character = {};
  const chat = {};
  const summaries: Array<{ chatMemos: string[] }> = [];
  const preset = {};
  const messages = [message("a", "A")];
  const snapshot: HypaManualSelectionSnapshot = {
    characterRef: character,
    chatRef: chat,
    chatId: "room",
    chatPage: 0,
    firstMessage: null,
    firstMessageIndex: -1,
    summariesRef: summaries,
    summaryCount: 0,
    lastSummaryRef: null,
    lastMemo: undefined,
    presetRef: preset,
    presetIndex: 0,
    presetSignature: "{\"settings\":{\"summarizationPrompt\":\"v1\"}}",
    processRegexScript: false,
    selected: [{
      messageIndex: 0,
      messageRef: messages[0],
      memo: "a",
      role: "user",
      data: "A",
      firstMessage: false,
    }],
  };
  const current = (): HypaManualCurrentState => ({
    characterRef: character,
    chatRef: chat,
    chatId: "room",
    chatPage: 0,
    firstMessage: null,
    firstMessageIndex: -1,
    messages,
    summariesRef: summaries,
    summaries,
    presetRef: preset,
    presetIndex: 0,
    presetSignature: "{\"settings\":{\"summarizationPrompt\":\"v1\"}}",
    processRegexScript: false,
  });

  test("accepts the exact issued chat, frontier, preset, and message", () => {
    expect(isHypaManualSnapshotCurrent(snapshot, current())).toBe(true);
  });

  test("rejects replacement, content, frontier, greeting, and preset changes", () => {
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      messages: [message("a", "A")],
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      messages: [{ ...messages[0], data: "changed" }],
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      summaries: [{ chatMemos: ["a"] }],
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      firstMessage: "changed",
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      presetRef: {},
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      presetSignature: "{\"settings\":{\"summarizationPrompt\":\"v2\"}}",
    })).toBe(false);
    expect(isHypaManualSnapshotCurrent(snapshot, null)).toBe(false);
  });

  test("rejects a later duplicate that makes an issued memo ambiguous", () => {
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      messages: [
        messages[0],
        message("a", "later duplicate"),
      ],
    })).toBe(false);
  });

  test("allows an appended unique message outside the issued prefix", () => {
    expect(isHypaManualSnapshotCurrent(snapshot, {
      ...current(),
      messages: [
        messages[0],
        message("b", "later unique"),
      ],
    })).toBe(true);
  });
});
