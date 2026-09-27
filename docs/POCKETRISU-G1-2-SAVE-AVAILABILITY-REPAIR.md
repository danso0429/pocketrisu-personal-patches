# G1.2 save availability and live-view repair

Date: 2026-09-28 KST
Candidate: `0.2.4-experimental.9`
Status: implementation, automated validation and final scoped consultation complete; live delivery pending. Physical device observation remains open.

## Problem and behavior

The preceding G1.2 candidate saved a merged server answer while leaving the client view unchanged. Correctness then depended on retaining two snapshots in an evictable cache. Opening four other chats could evict that basis, and a 4.5 MiB chat could exceed the combined per-entry limit immediately. Subsequent normal saves refused indefinitely even though no new conflict had occurred. Reopening an already-hydrated chat did not repair the state.

The repair publishes merged remote effects into the current client view before retrying the conditional write. It first reconciles the submitted payload with the fresh server revision, then preserves edits made locally while the request was in flight. A successful acknowledgement records only the payload actually saved. A failed retry leaves the fresh server baseline and the still-unsaved local edits available for another attempt.

Internally derived trigger copies and input preparation merge message changes before applying them. The composer uses a trigger's latest applied message basis when a script has already performed an intermediate save. Message/array references are retained during publication. Overlapping input changes keep the composer draft and stop the send; text entered during preparation is not cleared by completion of an older input. Reroll also preserves unsubmitted composer text. Explicit untracked plugin whole-chat replacement retains its prior contract.

Deletion confirmation captures its actual target and checks it again after the dialog returns. An inserted answer cannot redirect deletion to the old numeric index. If a confirmed cascade range, target text or selected chat changes, the stale action is not applied.

## Preservation boundaries

- Existing server CAS, create-only semantics, per-chat save serialization, adoption tokens and the maximum of two rebase retries remain.
- Publication checks the actual current reactive chat slot and rejects active generation/streaming ownership. Index-based generation writers therefore cannot be displaced by an inserted answer.
- Canonical server snapshots remain distinct from display-only streaming flags. Publishing an answer does not reactivate a persisted spinner flag.
- A positive write acknowledgement without revision metadata triggers a confirmation read. Its accepted-view basis survives a failed confirmation. A constant-size SHA256 fingerprint permits reconstruction after cache eviction if either the current local view or the fresh server view still matches that accepted content. Snapshots are not pinned or exempted from the existing memory limits.
- Registered trigger copies acknowledge the fields actually applied to the live view. A later unrelated user edit therefore does not conflict against a stale trigger basis. WeakMap entries do not independently retain their keys; an owning engine may retain its last draft and associated basis until replacement.
- Script variables retain PocketRisu's immediate-effect contract so CBS expressions can read writes within the same trigger. An input conflict does not roll back already-applied trigger effects, including script-edited/added messages, variables, globals or plugin/external actions. Sending again reruns preparation; the input conflict notice states this limitation.
- A dedicated trigger-view conflict is handled inside the generation body, releasing only its matching generation owner and pending-send state. Manual trigger callers do not leave an unhandled conflict or duplicate notice. Failed developer previews stop before displaying stale preview data and clear only their own waiting alert.
- Failed previews also release the generation they actually started, preserving pre-existing and replacement owners. Early input-trigger conflicts retain the draft, show the same notice and restore an unchanged display context on a best-effort basis.
- A newly created chat can prepare input before the existing save owner assigns its permanent ID. An ID-less input must still refer to the captured chat object; a replaced slot is rejected. Its input-draft ID is used only for pure message comparison and is never assigned to the chat or persisted. Known chat IDs retain strict identity checks.
- Duplicate message IDs do not alias two slots onto one object during publication. Immutable nested data and nonwritable array lengths are rejected before another field is changed.
- The repair introduces no persistent database schema, browser-local chat archive, provider request, generation cancellation, or user-data cleanup. Personal settings and the MARP header rule are outside the changed contract.

Versions: lazy-chat-sync `0.5.4`, lazy-chat-bg-adapter `0.7.16`, Haejeok persistence adapter `0.1.1`. No dependency version changed; the SHA implementation already existed in the target dependency set.

## Verification

| Check | Observed result |
| --- | --- |
| Full frontend | 1,990 passed; three conditional skips |
| Full server | 388 passed; 12 existing skips |
| Compatibility | 74 passed; five existing skips |
| Patcher | 51/51 test groups |
| Final focused storage/reactive/caller tests | 133/133 |
| Final Svelte diagnostics | Zero errors and warnings |
| Final frontend build | 8,008 modules; production build passed |
| Final BG bundle | 8,704 KB; sendChat, trigger and script load check passed |
| Final composition | 42 packs, 1,175 units, seven declared collisions; replan zero |
| Final exact revert | 1,021 baseline files; content/mode mismatch zero |
| Installer | 5,528,775 bytes; mode 0755; SHA-256 `2f5b5c65e41f65aa569522094ec564c11de44377c6bc3860f5bf8fe98672a36f` |

The full frontend run precedes the final ID-less-input compatibility branch; the final focused suite includes its four identity cases. Final type/build and exact-revert gates include that branch. Existing bundler externalization/timing warnings remain. The full server suite includes the actual server-process boundary tests.

Tests cover the original 4.5 MiB and browse/eviction reproductions, actual storage codec including undefined values, repeated saves against actual SQLite/HTTP processes, lost acknowledgements and in-flight edits, unknown-ack create/update recovery, real Svelte proxy notification and slot identity, and failed writes after publication. Generated caller-body tests execute the actual input, script payload, delete-confirmation, preview and generation-cleanup code with UI effects observed. Complete runTrigger-function tests use actual variable accessors and the registered CBS getter to protect read-your-writes; the Lua engine itself is stubbed while its supplied setter callback is exercised. These are not physical browser tests. The prior expectation that the client should remain stale was replaced by agreement between the saved and displayed messages.

## Limits and remaining goal work

When both sides changed and no reliable merge basis can be reconstructed, the save still reports a conflict and preserves the local view. The repair does not invent a winner for edit/edit, delete/edit, ambiguous legacy identity or order conflicts. A preparation step racing a new server revision can fail before provider start while generation ownership is active; cleanup and later retry remain available.

Physical iPhone rendering, background suspension, modal timing and perceived latency remain unmeasured. The separate intermittent home-navigation report is not resolved by this work. Question deletion is not reinterpreted as cancellation, and the existing orphan-answer policy is unchanged.

The final read-only Opus consultation found no new direct defect in the last preview/input guards or the ID-less-input compatibility handling. It did not rerun the tests. A primitive null display-context value cannot distinguish every overlapping manual/input clear; that possible transient display race remains a limitation. Existing non-conflict exception behavior in developer preview and the save owner's refusal to invent IDs for server-known chats are unchanged.

G1.1 remains necessary for the reverse ordering in which a client edit reaches the server before generation completion. This repair is not full G1 qualification or a stable release.
