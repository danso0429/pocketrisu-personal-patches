// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let selectedValue = 0;
  return {
    DBState: { db: {} as any },
    selectedCharID: {
      subscribe(run: (value: number) => void) {
        run(selectedValue);
        return () => {};
      },
      set(value: number) {
        selectedValue = value;
      },
    },
    summarize: vi.fn(),
    processMessageCBS: vi.fn((message) => ({ ...message })),
    processHypaV3Message: vi.fn(async (message) => ({ ...message })),
  };
});

vi.mock("src/ts/stores.svelte", () => ({
  DBState: mocks.DBState,
  selectedCharID: mocks.selectedCharID,
}));

vi.mock("src/ts/process/memory/hypav3", () => ({
  summarize: mocks.summarize,
}));

vi.mock("./utils", () => ({
  processMessageCBS: mocks.processMessageCBS,
  processHypaV3Message: mocks.processHypaV3Message,
}));

vi.mock("src/lang", () => ({
  language: {
    apply: "Apply",
    cancel: "Cancel",
    hypaV3Modal: {
      retry: "Retry",
      manualSummarize: "Manual Summarize",
      manualSummarizeSearchPlaceholder: "Search",
      manualSummarizeGenerate: "Summarize",
      manualSummarizing: "Summarizing",
      manualSummarizeResult: "Manual result",
      manualSummarizeNoMessages: "No messages",
      manualSummarizeNoMessageId: "Missing ID",
      manualSummarizeDuplicateMessageId: "Duplicate ID",
      manualSummarizeBlockedAfterMessage: "Blocked",
      manualSummarizeSelectedCount: "Selected: {0}",
      manualSummarizeSelectedMessages: "{0} selected",
      manualSummarizePrefixHelp: "Prefix only",
      manualSummarizeOrphanedFrontier: "Orphaned",
      manualSummarizeAmbiguousFrontier: "Ambiguous",
      manualSummarizeStale: "Stale result",
      manualSummarizeFailed: "Failed: {0}",
    },
  },
}));

import { mount, tick, unmount } from "svelte";
import KeiHypaManualSummaryPanel from "./KeiHypaManualSummaryPanel.svelte";

const mounted: unknown[] = [];

function setupDatabase(messages: Array<{
  role: "user" | "char";
  data: string;
  chatId?: string;
}>, firstMessage = "Greeting") {
  const hypaV3Data = { summaries: [] as any[] };
  mocks.DBState.db = {
    hypaV3PresetId: 0,
    hypaV3Presets: [{
      settings: {
        processRegexScript: false,
        summarizationPrompt: "before",
      },
    }],
    characters: [{
      chatPage: 0,
      firstMessage,
      alternateGreetings: [],
      chats: [{
        id: "room",
        fmIndex: -1,
        message: messages,
        hypaV3Data,
      }],
    }],
  };
  return hypaV3Data;
}

function renderPanel(hypaV3Data: { summaries: any[] }) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const onApplied = vi.fn();
  const component = mount(KeiHypaManualSummaryPanel, {
    target,
    props: {
      enabled: true,
      hypaV3Data,
      onApplied,
    },
  });
  mounted.push(component);
  return { target, component, onApplied };
}

beforeEach(() => {
  mocks.selectedCharID.set(0);
  mocks.summarize.mockReset();
  mocks.processMessageCBS.mockClear();
  mocks.processHypaV3Message.mockClear();
});

afterEach(async () => {
  const components = mounted.splice(0);
  await Promise.all(components.map((component) => unmount(component as never)));
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("KeiHypaManualSummaryPanel", () => {
  it("selects a contiguous frontier prefix and applies only the issued result", async () => {
    const messages = [
      { role: "user" as const, data: "A", chatId: "a" },
      { role: "char" as const, data: "B", chatId: "b" },
    ];
    const hypaV3Data = setupDatabase(messages);
    mocks.summarize.mockResolvedValue("summary");
    const { target, onApplied } = renderPanel(hypaV3Data);
    await tick();

    const candidates = [...target.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(candidates).toHaveLength(3);
    candidates[2].click();
    await tick();
    expect(candidates.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    expect(target.textContent).toContain("Selected: 3");

    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());
    expect(mocks.processHypaV3Message).toHaveBeenNthCalledWith(
      1,
      { role: "char", data: "Greeting" },
      -1,
      false,
      true,
    );
    expect(mocks.summarize).toHaveBeenCalledWith([
      { role: "assistant", content: "Greeting" },
      { role: "user", content: "A" },
      { role: "assistant", content: "B" },
    ]);

    await vi.waitFor(() => {
      const applyButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Apply"));
      expect(applyButton?.disabled).toBe(false);
    });
    const applyButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Apply"));
    applyButton?.click();
    await tick();

    expect(hypaV3Data.summaries).toEqual([{
      text: "summary",
      chatMemos: [undefined, "a", "b"],
      isImportant: false,
      categoryId: undefined,
      tags: [],
    }]);
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("marks a result stale when a selected message changes during generation", async () => {
    const messages = [
      { role: "user" as const, data: "A", chatId: "a" },
    ];
    const hypaV3Data = setupDatabase(messages, "");
    let resolveSummary: (value: string) => void = () => {};
    mocks.summarize.mockReturnValue(new Promise<string>((resolve) => {
      resolveSummary = resolve;
    }));
    const { target } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());
    messages[0].data = "changed";
    resolveSummary("stale summary");
    await vi.waitFor(() =>
      expect(target.textContent).toContain("Stale result")
    );

    const applyButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Apply"));
    expect(applyButton?.disabled).toBe(true);
    expect(hypaV3Data.summaries).toEqual([]);
  });

  it("refuses stale selection before preprocessing starts", async () => {
    const messages = [
      { role: "user" as const, data: "A", chatId: "a" },
    ];
    const hypaV3Data = setupDatabase(messages, "");
    const { target } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    messages[0].data = "changed";
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await tick();

    expect(mocks.processHypaV3Message).not.toHaveBeenCalled();
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("refuses an in-place summary frontier change before preprocessing", async () => {
    const messages = [
      { role: "user" as const, data: "A", chatId: "a" },
      { role: "char" as const, data: "B", chatId: "b" },
    ];
    const hypaV3Data = setupDatabase(messages, "");
    hypaV3Data.summaries.push({
      chatMemos: ["a"],
      text: "old",
    });
    const { target } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    hypaV3Data.summaries[0].chatMemos[0] = "b";
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await tick();

    expect(mocks.processHypaV3Message).not.toHaveBeenCalled();
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("marks a result stale when the active preset changes in place", async () => {
    const hypaV3Data = setupDatabase([
      { role: "user", data: "A", chatId: "a" },
    ], "");
    let resolveSummary: (value: string) => void = () => {};
    mocks.summarize.mockReturnValue(new Promise<string>((resolve) => {
      resolveSummary = resolve;
    }));
    const { target } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());
    mocks.DBState.db.hypaV3Presets[0].settings.summarizationPrompt = "after";
    resolveSummary("stale summary");
    await vi.waitFor(() =>
      expect(target.textContent).toContain("Stale result")
    );

    const applyButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Apply"));
    expect(applyButton?.disabled).toBe(true);
    expect(hypaV3Data.summaries).toEqual([]);
  });

  it("rerolls the exact captured input and applies only the rerolled result", async () => {
    const hypaV3Data = setupDatabase([
      { role: "user", data: "A", chatId: "a" },
    ], "");
    mocks.summarize
      .mockResolvedValueOnce("first summary")
      .mockResolvedValueOnce("rerolled summary");
    const { target, onApplied } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(target.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("first summary")
    );

    const retryButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Retry");
    retryButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledTimes(2));
    expect(mocks.summarize.mock.calls[1][0]).toBe(
      mocks.summarize.mock.calls[0][0],
    );
    await vi.waitFor(() =>
      expect(target.querySelector<HTMLTextAreaElement>("textarea")?.value)
        .toBe("rerolled summary")
    );

    const applyButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Apply"));
    applyButton?.click();
    await tick();
    expect(hypaV3Data.summaries[0]?.text).toBe("rerolled summary");
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("coalesces duplicate generation activation before preprocessing resumes", async () => {
    const hypaV3Data = setupDatabase([
      { role: "user", data: "A", chatId: "a" },
    ], "");
    mocks.summarize.mockResolvedValue("summary");
    const { target } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    summarizeButton?.click();

    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());
    expect(mocks.processHypaV3Message).toHaveBeenCalledOnce();
  });

  it("discards a late result after the panel is destroyed", async () => {
    const hypaV3Data = setupDatabase([
      { role: "user", data: "A", chatId: "a" },
    ], "");
    let resolveSummary: (value: string) => void = () => {};
    const pendingSummary = new Promise<string>((resolve) => {
      resolveSummary = resolve;
    });
    mocks.summarize.mockReturnValue(pendingSummary);
    const { target, component, onApplied } = renderPanel(hypaV3Data);
    await tick();

    target.querySelector<HTMLButtonElement>("button[aria-pressed]")?.click();
    await tick();
    const summarizeButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Summarize");
    summarizeButton?.click();
    await vi.waitFor(() => expect(mocks.summarize).toHaveBeenCalledOnce());

    await unmount(component as never);
    mounted.splice(mounted.indexOf(component), 1);
    resolveSummary("late summary");
    await pendingSummary;
    await tick();

    expect(hypaV3Data.summaries).toEqual([]);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("blocks selection at a missing message id without calling generation", async () => {
    const hypaV3Data = setupDatabase([
      { role: "user", data: "A", chatId: "a" },
      { role: "char", data: "B" },
      { role: "user", data: "C", chatId: "c" },
    ], "");
    const { target } = renderPanel(hypaV3Data);
    await tick();

    const candidates = [...target.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(candidates).toHaveLength(3);
    expect(candidates.map((button) => button.disabled)).toEqual([false, true, true]);
    expect(target.textContent).toContain("Missing ID");
    expect(target.textContent).toContain("Blocked");
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("refuses to operate when the modal data is not owned by the current chat", async () => {
    setupDatabase([
      { role: "user", data: "A", chatId: "a" },
    ], "");
    const unrelatedHypaV3Data = { summaries: [] as any[] };
    const { target } = renderPanel(unrelatedHypaV3Data);
    await tick();

    expect(target.querySelector("button[aria-pressed]")).toBeNull();
    expect(target.textContent).toContain("Orphaned");
    expect(mocks.processHypaV3Message).not.toHaveBeenCalled();
    expect(mocks.summarize).not.toHaveBeenCalled();
  });
});
