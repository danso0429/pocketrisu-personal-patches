# Open issues in the G2.2 NF-1 session records (2026-10-25 KST)

This document lists the defects found in two session records and in the local quota tooling used to write them. Each item gives the location, what is wrong, the correct value where it is known, why it matters, and what fixing it would involve. Items 1–3 and 5 were fixed on 2026-10-25; the status line of each item and §6 give the result.

Records concerned:

| Record | Commit | Period |
|---|---|---|
| `docs/records/2026-10-22-g22-nf1-d2-d3-planning-session.md` (the planning-session record) | `533ca2e` | 2026-10-22 12:37 UTC – 2026-10-23 04:04:50 UTC |
| `docs/records/2026-10-23-g22-nf1-closeout-session.md` (the close-out record) | `962d083` | 2026-10-23 04:04:50 – 04:53 UTC |

## 1. Planning-session record states an end time later than its commit

- **Location:** §0 paragraph 1 ("to 2026-10-23 04:10 UTC") and the §12 heading ("2026-10-23 02:43–04:10 UTC").
- **Problem:** the record was committed at 04:04:50 UTC. Work after that point (push, CI, usage ledger, handoff) is not in it; it is in the close-out record.
- **Correct value:** the record covers the session to 04:04:50 UTC. Its §12.5 cost table already uses 04:04 as its end.
- **Why it matters:** a reader who takes 04:10 as the end assumes the push and CI check are covered and does not look for the close-out record.
- **Fix:** change both times to 04:04:50 and add a pointer to the close-out record in §0.
- **Status:** fixed in the commit that adds this document. §0 now ends at 04:04:50 UTC and points to the close-out record; the §12 heading ends at 04:04:50.

## 2. Planning-session record claims a push that had not happened at commit time

- **Location:** §11, line 427: "The patcher `docs/records` commit that contains this record was pushed together with NF-1."
- **Problem:** when this was written, nothing had been pushed. The push (`d476d60..533ca2e`) happened after the commit and is recorded in close-out record §3.1.
- **Current state:** the statement is now true, but it was unverified when committed.
- **Fix:** reword it as a past event with its evidence ("pushed as `d476d60..533ca2e`; see the close-out record §3.1"), or remove it and keep the pointer from item 1.
- **Status:** fixed in the commit that adds this document. The line now states that `533ca2e` was pushed after the record was committed, as `d476d60..533ca2e`, and points to close-out record §3.1.

## 3. Planning-session record has two commit placeholders in Appendix A

- **Location:** Appendix A, two rows whose commit cell reads "(end of session)".
- **Correct values:**

  | Row | Commit |
  |---|---|
  | Planning — NF-1 implementation record and ordered-goals current state | `321e500` |
  | Patcher — this record | `533ca2e` |

- **Why it matters:** Appendix A is the commit list a reader uses to restore or check the period. With two hashes missing, it is incomplete.
- **Fix:** replace the placeholders with the hashes above. A record cannot contain its own commit hash at the time of that commit, so the patcher row is better described as "the commit that adds this file" or filled in by a follow-up commit.
- **Status:** fixed in the commit that adds this document (a follow-up commit). Both rows now carry the hashes above.

The correct values for items 1–3 are also stated in close-out record §4 item 1.

## 4. Close-out record's next-work section is superseded

- **Location:** close-out record §6 item 1 and §3.4 (next-session start instructions), which name D2 as the next unit, to be started from `533ca2e`.
- **Problem:** a separate Claude Code session implemented D2 after the close-out period:
  - `5ab963b` feat(bg-plugin-host): run plugin MCP tools in background requests;
  - `8a18c1a` and `d1565c3`: that session's record, `docs/records/2026-10-23-g22-d2-session.md`;
  - the planning repository's ordered-goals state was updated in `0af7f16`.
- **Current next order** (ordered-goals document, current-state paragraph): D3 output sync, with measurements P1 and P2 run on HEAD after the D2 commit before test authoring; then the D2 original-RCM measurement; then the remaining G2.2 items in that document.
- **Note:** the same applies to the next-session start instructions given in the conversation at the end of the close-out period. They were not saved to a file, and they also start from D2.
- **Fix:** none needed in the close-out record, which describes the state at 04:53 UTC. Next-session instructions should be taken from the ordered-goals document, not from §6 of the close-out record.

## 5. Claude Code session overlap is not shown by the quota tooling

- **Problem:** the rate-limit log written by the status-line wrapper stores a session id (`sid`) per sample. The quota-usage script reports overlapping Codex sessions but does not break the Claude Code samples down by `sid`. Because of this, the first draft of the close-out record marked the Claude Code overlap as "not checked". Reading the `sid` column by hand showed the D2 session reporting from 04:49:58 UTC. The D2 record gives its first user request as 04:50:05 UTC.
- **Related entries:** the local, untracked usage ledger has seven notes saying that an overlap with another Claude Code session is possible. They were written the same way, without reading `sid`. They have not been rechecked.
- **Why it matters:** Claude Code deltas are account-wide. Without a per-session breakdown, every ledger row either over-attributes the delta to one task or leaves the overlap unverified.
- **Fix (needs an owner decision):**
  - add a per-`sid` summary (sample count, first and last time, first and last percent) to the quota-usage script's Claude Code section;
  - recheck the seven ledger notes against the log.
- **Status:** fixed.
  - The quota-usage script now prints one `claude sid` line per Claude Code session that reported in the range: sample count, first and last time, first and last 5-hour and weekly percent, and the other sessions it overlapped. The values remain account-wide; the lines show which sessions were running, not each session's share. Checked on 04:04:50–04:53 UTC, where it shows the close-out session and the D2 session (from 04:49:58) overlapping.
  - The seven ledger notes were rechecked with it and replaced. Three ranges had another reporting session: the D2 range (the close-out session, 04:52–07:40 UTC), the 2026-10-22 14:54–21:32 range (one session, 15:02–19:00 UTC), and the 2026-10-21 23:58 – 10-22 01:32 range (two sessions with two samples each and no change in value). The other four ranges had one reporting session only.
  - The ledger method section now requires the per-session check instead of an unchecked "overlap possible" note.

## 6. Summary

| # | Item | Fixed | Needs an owner decision |
|---|---|---|---|
| 1 | Planning-session record end time 04:10 vs commit 04:04:50 | Yes | — |
| 2 | Push claim written before the push | Yes | — |
| 3 | Two Appendix A placeholders | Yes | — |
| 4 | Close-out next-work section superseded by D2 | Not needed | — |
| 5 | No per-session Claude Code breakdown in the quota tooling; seven ledger notes unverified | Yes | — |
