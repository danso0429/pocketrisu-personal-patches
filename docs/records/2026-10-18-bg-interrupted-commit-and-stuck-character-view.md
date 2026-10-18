# 2026-10-18 — Interrupted BG commit and a non-interactive character view

Status: diagnosed; the view was recovered by removing the anomalous message;
no code change. Prevention remains open (section 7). Times are UTC (KST = UTC+9). Identifiers are shortened; no chat
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

## 5. Isolated browser reproduction

A copy of the application with consistent snapshots of the live databases ran
inside a network namespace with only loopback (outbound connections verified
to fail; browser requests to non-loopback hosts aborted). Login used a copied
session token; no password was changed. The copy, including its data and
secrets, was deleted afterwards; regular-expression sources and message text
were not recorded.

- WebKit (iPhone engine) could not be launched on this host: Playwright's
  WebKit build needs system libraries that are not installed. iPhone behavior
  was therefore not measured.
- Chromium, desktop speed: no hang. Longest main-thread gap 1.35 s; the chat
  rendered.
- Chromium, phone viewport with 4x CPU throttling: the page did not respond
  for about 12–22 s after the tap, then recovered and rendered the chat; the
  sidebar animation end arrived about 12 s late. A control character with 160
  normal messages stalled about 5 s under the same conditions.
- CPU profile (source-mapped):
  - about 3.3 s in one enabled module's per-message regular-expression script
    (type `editprocess`; module `353cfd93`, script 74), executed from
    `ts/process/scripts.ts:211` (`executeScript`, via `processScriptFull`).
    Its cost grows quadratically with line length: 12, 46, 190 and 760 ms for
    6k, 12k, 24k and 47.8k characters in V8, with zero matches. Only the
    anomalous message exceeds 5 ms;
  - about 7.3 s loading the BPE tokenizer (`ts/tokenizer.ts:235`), paid
    equally by every character;
  - about 0.9 s in the chat parser and about 0.8 s each in database proxy
    setters.
- Disabling script 74 in the copy removed the regular-expression cost, but an
  8 s stall remained from the tokenizer and parser costs.
- The slow regular expressions of a disabled module noted in section 4 are not
  applied to this chat.

Inferred, not measured: the iPhone engine may evaluate the variable-length
lookbehind in that script much more slowly than V8; combined with a slower CPU
and the tokenizer load, the stall could last long enough to look permanent.

## 6. Script measurement and recovery

The slow script (module `353cfd93`, script 74, "line break before dialogue
after narration") inserts a line break between narration and the first quoted
dialogue on a line. Its pattern lets a lazy prefix grow one character at a
time and evaluates a variable-length lookbehind before checking whether a
quote follows, so a long line without quotes costs roughly quadratic time.
The script's flag is `g<order 300>m`; the app removes the `<...>` part
before compiling (`ts/process/scripts.ts` ~368–385), so it runs with `gm`. (An
earlier note that a `d` from `order` remained was wrong.)

A reordered pattern adds a quote lookahead before the lookbehind:
`^([^"\r\n“”]*?\S)[ \t]*(?=["“])((?<!<[^>\r\n]*)(?:"[^"\r\n]*"|“[^”\r\n]*”))`.
On a backup copy, applied to the anomalous message in Node (V8): original
765.6 ms, reordered 0.5 ms. After the recovery, a run with the correct `gm`
flags over all 1,805 remaining messages took 6,052 ms in total with the
original (one message of another chat took 5,751.5 ms) and 38 ms with the
reordered pattern (maximum 1.1 ms), with identical results for every message;
the risk therefore remains until the script is changed. Results were identical on all 32 messages of the
chat and on 200,012 synthetic strings. Synthetic ASCII-only long lines did not
reproduce the slow case for either pattern. The iPhone engine was not
measured. The script was not changed; that is the user's decision.

Recovery, with the user's approval (2026-10-18): after an idle check and a
consistent backup of the database (`backups/20261018-pre-msg31-delete`,
`quick_check` ok), the anomalous message was removed through the app's own
"remove this message only" action in a headless browser against the live
server (outbound requests from that browser blocked). The app saved the chat
(`POST /api/chat-content` 200) and the database (`/api/patch` 200).
Comparison with the backup: 32 → 31 messages, the remaining 31 unchanged by
fingerprint, 34 characters before and after, `quick_check` ok. The user then
confirmed the character opens normally. The backup holds the only remaining
copy of the removed message.

## 7. Open items (not started)

1. The user's module script: adopting the reordered pattern of section 6 is
   the user's decision.
2. Prevention candidates for a reviewed plan: an input-length limit for
   per-message regular-expression scripts; loading the tokenizer off the
   render path; a terminal state for interrupted operations whose commit
   receipt is invalid; operation-state records left `running` after an
   interruption.
3. The pre-deletion backup, which held the only copy of the removed message,
   was deleted at the user's request after the recovery was confirmed.
