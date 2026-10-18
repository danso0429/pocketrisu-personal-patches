# 2026-10-18 — Interrupted BG commit and a non-interactive character view

Status: observed, not fixed. Diagnosis in progress; this record keeps what is
known so far. Times are UTC (KST = UTC+9). Identifiers are shortened; no chat
content or names are recorded.

## 1. User report

On the live installation, tapping one character opens the chat/character
slider showing only the character information. The slider cannot be collapsed
to show the chat, and taps or scrolling inside it (lorebook, regex tabs) do
nothing. It started after answers were received around 16:00–18:00
(01:00–03:00 KST).

## 2. Timeline from the client log database and server logs

| Time | Event |
|---|---|
| 12:47 | Host reboot (cause unknown; not initiated by this work). A BG generation in progress was interrupted |
| 12:48:28 – 16:26:59 | Client logged `[bg-orch] server-owned chat commit is unresolved; retaining result` 342 times for operation `cecc43c1`, state `interrupted-before-result`, reason `commit-receipt-invalid`; blocking alert "서버 소유 답변의 채팅 저장을 확인하지 못했어요…" around 12:48 and 16:16; notice "서버 요청의 실행 문맥이 사라졌어요…" |
| 14:56, 15:29, 16:15 | Application restarts for deliveries (each after a read-only idle check showing no running model job or pending send) |
| 15:07, 15:13 | Two "changed after assembly" warning pairs on a new chat's first BG answer |
| 15:30 – 16:16 | Repeated `[Save] Failed to save chat eb893015…/df0577ca…` and blocking alert `Failed to save 1 chat` |
| 16:29:50 | Server: `POST /api/chat-content/eb893015…/0 — request aborted` |
| 16:51:48 – 49 | `[ModelPreset] request failed` and blocking alert "이 채팅은 서버에서 아직 생성 중이에요…" |
| 16:53:09 | `model-job-recovery`: `recover bc0ccdf4: inserted len=2444`, `chat saved idx=0` |

Earlier days contain the same message types (server-owned commit unresolved,
chat save failed, "still generating"); the regular-expression and tokenizer
errors in the same logs are pre-existing at similar rates.

## 3. Assessment so far

- Not preventable: an unplanned host reboot interrupts a generation.
- Likely preventable in code, pending diagnosis:
  - An interrupted operation whose commit receipt is judged invalid stays in
    "retaining result" and is retried for hours. It should reach a terminal
    state that keeps the result and notifies once. Why the receipt was judged
    invalid must be established first.
  - Background operation state should not make the chat view
    non-interactive. Whether the view is blocked by a leftover state marker
    (placeholder or "server is generating") or by a render exception is not
    yet known.
- Not established: whether character `eb893015…` is the affected character,
  and whether `cecc43c1` and `bc0ccdf4` belong to its chat.

## 4. Read-only diagnosis (database snapshots, then deleted)

Confirmed:

- The affected character is `eb893015`; it has one chat, `df0577ca` (32
  messages, full payload, no stub, placeholder or generating flag). Its
  server-side state is consistent: every operation from 15:13 to 17:25 is
  `delivered`, journal and commit records agree with the database, no
  model job is running and no send is pending.
- Operation `cecc43c1` belonged to a different chat of the same character
  (`12db0d85`), which is no longer in the database. Its "retaining result"
  lines stop at 16:27. Three interrupted operation-state records (`cecc43c1`,
  `427f6e75`, `0535bfa8`) are still `running` with interruption notices.
- The only anomaly in the chat is its newest message (index 31, written
  17:22:05 by operation `a9fd9fae`): about 47.9k characters on one line,
  almost entirely punctuation and non-Hangul characters with 47 distinct
  words, ending in an unclosed tag; its generation info reports the output
  token cap (20,000). Earlier messages are normal text of about 2.2k
  characters. This looks like a degenerate model output.
- Neither sidebar store is persisted (`src/ts/stores.svelte.ts`), so no
  server data can force the slider open. The sidebar closes through an
  `onanimationend` handler (`src/lib/SideBars/Sidebar.svelte`), so a blocked
  main thread leaves it open.
- The module regular-expression errors in the logs predate this event and come
  from an enabled module, not from this character. In an offline test, two
  regular expressions of a disabled module took more than 3 s on the
  anomalous message.

Inferred, not demonstrated: rendering the anomalous message hangs or throws on
the client, leaving the slider open and the page unresponsive. The real
render path was not run, and the client's local state was not inspected.
The interrupted operation records are an unlikely cause, since the data is
consistent after 16:27.

So the visible problem appears separate from the reboot interruption: a
degenerate long model output combined with a render path that does not
tolerate it.

## 5. Next steps (not started)

1. Confirm on the device whether the whole app freezes after tapping the
   character, whether other characters open, and capture a console error if
   possible.
2. Recovery: removing or editing the anomalous message would likely restore
   the view; changing it server-side alters user data and needs the user's
   explicit approval.
3. Prevention candidates for a reviewed plan: render-time limits for very long
   or degenerate messages (and regex execution on them); a terminal state for
   interrupted operations whose commit receipt is invalid; operation-state
   records left `running` after an interruption.
