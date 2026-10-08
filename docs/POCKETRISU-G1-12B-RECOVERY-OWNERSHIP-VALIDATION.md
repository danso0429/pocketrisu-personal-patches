# G1.12b recovery ownership and Suggestion validation

2026-10-09 KST. Baseline CAP7047115 / experimental.23 / adapter0.7.30; candidate experimental.24 / adapter0.7.31. Original G1.12b WIP remains preserved. This checkpoint does not qualify G1 aggregate, Archive Center, physical cold-kill recovery or stable release.

## Resulting behavior

Terminal recovery releases the matching generation lease before waiting for local adoption or delivery ACK. Active and intermediate/postprocessing operations remain protected. Cleanup removes only the captured operation's ledgers, result flights and claim heartbeat; a late callback cannot release a replacement owner. A direct lifecycle token travels through awaited negotiation and native start; auto-continue preserves its lineage.

Suggestion eligibility uses a page-local target readiness registry seeded before subscriptions. Terminal execution and current canonical chat equality are separate proofs. Parked markers can be rechecked on accepted saves or target changes without ACK or replay. Strict native current-view adoption rejects pending/ambiguous writes and changed save tokens or slots. Suggestion coalesces eligibility signals, retains populated lists and existing prompt/provider branches, and fences request, translation and refresh-confirmation callbacks. Draft restore rechecks pending status and the target after hydration and before trigger publication.

## Evidence

| Check | Observed result |
| --- | --- |
| Initial full client | 2278 pass,4 existing conditional skip; no unhandled errors |
| Final post-review full client | 2288 pass,4 existing conditional skip;191 test files pass/1 conditional skip; no unhandled errors |
| Final ownership/CAP/native-publication focus | Post-review164 pass across9files |
| Actual generated draft hydration races | 4 pass including coalesced readiness wake during another draft hydration |
| Full server | 490 pass,12 existing conditional skip |
| Full compatibility | 74 pass,5 existing conditional skip |
| Patcher | 331 pass; version assertion updated to0.7.31 without weakening |
| Final type diagnostics | 0 errors,0 warnings |
| Help | 0 missing help entries; existing dead entries retained; Korean complete |
| Graph / replan | 42packs1486units7collisions; replan0 |
| Pristine revert | 1022 original files, byte/mode mismatch0 |
| Applied-state upgrade | 474 managed paths equal fresh pristine apply; mismatch0 |
| Generated busy-call AST | 8 acquire/release/handoff calls; ownerless0 |
| Frontend build | 8020 modules; successful production build |
| BG build and actual load | Built bgOrchBundle.mjs; built-in load confirmed sendChat and required trigger/script/policy exports |

Automatic function-level/mock evidence is not native storage or device proof; actual native storage/publication suites and current adoption source were checked separately. An auxiliary load command used an incorrect .cjs filename after the successful built-in .mjs load check; the built-in load result and actual .mjs syntax verification are the load evidence.

## Delivery

Runtime4d7bec8, packaginga67a22d, initial gate docs08356e6, final corrections1c59ba1 and post-review gates73af78a were pushed to the separate candidate branch before safe live delivery. Installer6921796bytes0755, SHA-256fff08ee8c1b908abfc0d9d4b7f4c12b6ac47d5cc3e9f5984711dbf58efeb3519. Final privacy sweep173 tracked paths, hits0. No main integration or stable tag.

The retained full recovery archive hash was verified. A source/application-state/notification-namespace backup verified1626 files and91519326 archive bytes. Active generation, durable inputs and native pending sends were checked before stopping; no generation was cancelled. Source apply/build did not change any DB or WAL bytes before restart. Final live replan0 and all474 managed source hashes/modes matched; all175 served JS files matched disk;5 SQLite quick_check results were ok. PM2 online/unstable restarts0, plugin hostOFF, personal settings0.5.13 and external header settings preserved. Operation records22 before/22 after, removed0; input records0, active requests0, pending sends0 at final idle. New error lines0. The post-restart active-request check waited until idle. The scoped ordinary-use device confirmation is recorded below; route-specific qualification remains open.

Backup retention review: the new pre-delivery application snapshot and prior CAP snapshot remain rollback anchors. Exact historical application controls and full-user-data recovery sets remain protected for the still-open recovery qualification; no backup or user data was deleted in this task. Task workspaces and original paused WIP11 hashes remain intact.

## Review decisions and limits

The first final review prompted a scoped correction in1c59ba1. A confirmed watch ACK no longer resolves terminal readiness before current proof; a terminal legacy/uncommitted found answer awaiting publication cannot authorize Suggestion. Interrupted saved main retains readiness if its local current proof refuses. A separately reproduced lost readiness wake during draft hydration now drains one coalesced rescan. Suggestion target changes use a readiness-specific observation event; online/visible can retry an exact observation. Focused164, patcher331, types0/0,42packs1486units and1022-file exact revert passed after these corrections; post-review full client/build and scoped final review are recorded when observed.

Post-review full client2288/4skip and the production frontend/BG actual load passed. The host-executed full suite logged refused loopback API connections on its default test origin; these were caught offline paths, with runner exit0 and no unhandled-error report. No paid or live provider endpoint was called.

Scoped Opus5.5 follow-up inspected1c59ba1 and the generated affected functions; it reported no further defect in the delta. Codex separately verified post-review frontend/BG build/load, focused tests, types, patcher and fresh-upgrade equality. The strict-proof tradeoff remains observable: a short verification message after completion is expected; interruption with saved main only on the server may remain pending until local hydration or page refresh. Legacy failure/unknown publication remains conservatively pending. Review agreement is not hardware or runtime-delivery proof.

Initial Opus5.5 read-only review identified possible missing non-terminal exits, token coverage, asynchronous native start and selection/draft races. Actual generated source confirmed asynchronous start and a global terminal reset before its ownership guard; both were corrected. Hydration already checks terminal evidence before release, and strict current adoption preserves the same slot: those two cautions were resolved by fresh source reads. All generated busy calls have explicit owners.

Registry unresolved state is bounded at512, with at most256 additional resolved identities; the two durable marker ledgers each cap128. Extreme page-local overflow keeps suggestions pending until a fresh page, preserving durable work and generation/navigation. No production occurrence or hardware pressure frequency is claimed. Marker retention follows the existing49-hour policy.

No paid provider call, generation cancellation, user-data deletion, plugin-host activation, Archive Center change or stable tag is part of this delivery. Existing personal settings0.5.13 and external header settings must be preserved in live readback.

## Device check

2026-10-09 closeout: after reporting that testing was in progress, the user reported G1.12b normal. The scoped ordinary-use device gate is closed. No per-scenario trace, loaded-build evidence, automatic-suggestion usage confirmation or cold/long-suspension/deletion evidence was supplied; those paths are not separately marked passed. This does not qualify G1 aggregate or stable release.

L6 records the confirmation, preserves the structural findings and verification in this document, and removes only the temporary scoped L3 report. The runtime audit, task workspaces, original WIP and recovery backups remain. No code/installer change, runtime rebuild/restart, paid call, main integration or release tag is part of this documentation-only closeout. Next implementation unit is G1.7 plus the G1.11 connection, followed by G1.5b.

Before checking, refresh the PocketRisu page once after delivery. The test does not require identifying an invisible preparation phase.

1. Open a usual character and existing chat. Confirm the last answer and input remain visible, with no leftover generation indicator after completion. Send one ordinary message and confirm a single answer appears.
2. During a usual generation, switch to another app as normally done. Return after the answer has completed. Confirm the saved answer appears once, then open another character from the character list and return to the original chat. Confirm navigation remains responsive and the next ordinary send works.
3. If automatic suggestions are already used, confirm the list belongs to the visible chat. While recommendations are being prepared, open another character; an old response must not overwrite the new character's recommendation list. Use the refresh icon once and confirm it refreshes recommendations without briefly showing a new main generation.
4. A short saved-chat verification message after completion is expected while recommendation context is checked. Navigation should remain available. Report whether it persists after returning to the chat or completing a normal save. If the main answer was saved only on the server after interruption, a page refresh may be needed to load it; record that case separately. Do not resend an old interrupted input just to remove the message.

Only observed paths may be closed. Ordinary-use success alone does not qualify long suspension, cold kill, deletion/conflict, exact raw/prepared routes or G1 aggregate. Stable tag remains gated on the established aggregate/device review.
