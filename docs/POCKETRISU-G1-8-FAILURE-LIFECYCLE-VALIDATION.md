# G1.8 failure and recovery lifecycle qualification

Candidate `0.2.4-experimental.35`, BG adapter0.7.42 and lazy-chat-sync0.5.7; baseline85cd2f9. See the [implementation plan](POCKETRISU-G1-8-FAILURE-LIFECYCLE-PLAN.md). This record distinguishes automated source qualification, OFF delivery and physical-device/activation gates.

## Resulting behavior

An exact already-applied receipt whose chat is absent from both metadata and hydrated storage is classified separately from pending publication. Real input finalization additionally requires unchanged persisted-root proof. Recovery does not restore the deleted chat or replay model/global/stat effects. Hydration-only absence, missing/corrupt journal and receipt/sequence mismatch remain unresolved rather than being treated as deletion.

Operation journal caches retain identity/pressure metadata rather than historical chat bodies. Direct recovery still validates durable payloads. The user approved automatic deletion of newly marked journal payloads after49hours with completion, exact receipt, durable-root and reference checks. Both input and response journals participate in atomic retirement with compact receipts; memory removal follows commit. All existing legacy journal bytes remain protected. Later user edits or deletion do not require restoring the old owned message merely to retire a completed new journal.

New fixed v3 notices cover final failure, interruption, concurrent chat edits not reflected in the answer, and global/stat effect conflict. They use a separate versioned namespace; old v1/v2 identities and reader contracts remain intact. Independent retry intent commits before outbox publication and settlement. Result ACK/state retention cannot remove that authority prematurely. Existing1024-row/48h notification policy is unchanged; exhausted or corrupt storage can defer delivery, and unread/corrupt data is not silently evicted. The49h recovery policy is distinct from notification TTL.

Committed partial answers carry a fingerprinted failure fact in their immutable recovery record. The answer stays committed if notice publication fails, and retry reconstructs only the notice. Existing unsupported-input producers retain ownership. Retryable queued work is not labeled interrupted; an inactive uncertain transform or lost server settings context is distinct. The common operation-state writer preserves new notice source metadata through input attachment, predecessor updates and orchestration ACK/state rewrites.

## Evidence

| Boundary | Observed control |
| --- | --- |
| Native retry and fallback | Unchanged original MARP through actual generated native callers: retry0/1/2 produces main1/2/3 and analysis3/6/9. Configured fallback preserves gpt35→gpt4o order with main2. Synthetic transports only. |
| Exhausted failure and next send | No saved answer and one failure notice; next healthy request retains two inputs, saves one answer and makes one additional main call. |
| Outbox failure with actual producer | Native failure persists a pending independent intent. Releasing only the outbox fault publishes one notice without another main call. Primary failure/raw input remain intact. |
| Process loss | Actual server input/analysis/main termination and restart preserve known durable effects, yield interrupted notice and perform zero automatic provider/analysis replay. Attached input/settings-context loss is tested separately. Unpersisted provider response bytes cannot be reconstructed from a receipt. |
| Browser return | Chromium close→server restart→home→lost first ACK→new context: five notices logged once, two ACK requests, no provider call/page error. One existing unsupported producer plus four direct durable-writer controls; this is delivery evidence, not a claim that all producers executed. |
| Genuine owners and SQLite | Concurrent edit derives its warning; committed partial answer survives outbox failure and recreates one notice without another commit/stat increment. Durable versus unflushed deletion, checksum/reappearance/next admission, age/reference/legacy protection and transaction rollback are asserted. |
| Source gates | Server555 passed/12 unchanged skip; patcher331/331; client9/9; producer/commit89/89, final source/owner/retention72/72, journal17/17 and reappearance40/40. Svelte check0 errors/0 warnings; frontend and BG build/load pass. |
| Lost terminal state | An actual native answer persists before injected commit and terminal-state write failures. Restart reconstructs one commit-failure notice, retains the answer and makes zero provider/analysis replay calls. |
| Installer composition |42 packs,1,542 units,486 managed source paths and8 qualified collisions; re-plan0, exact1,022-file byte/mode revert and absent patcher state. |

An independent reachability control observed100 historical operation bodies retained by the old cache and zero by the new cache, with100 unchanged stored rows. This is a resident-reference measurement, not an RSS, peak-decode or unlimited-storage guarantee.

Source consultation identified and Codex verified recovery ordering/durability, deletion-versus-publication, invalid-candidate isolation, repeated root decoding, archived checksum/compatibility, eager legacy outcome reads, retryable queued false notices, missing committed-partial notices and sweep coupling. Corrections use actual owner/probe controls; failed setup/cwd/ordering runs are retained separately from passes. No cap increase, assertion weakening or new skip was used as qualification.

Final follow-up consultation closed the committed-partial state/commit identity collision. Observer-derived terminal/interruption facts persist in existing state before dispatch, so result eviction cannot discard their source during intent-store failure. This first observation refreshes the state KV retention timestamp once; repeated stamped retries and already-expired observations do not write. Interruption stamps are historical facts and remain after ACK; retryable work is excluded before stamping. The fixed deferred warning is coalesced once per process, so later causes require direct source/outbox inspection. Unsupported-input publisher wiring was verified in generated server code and actual browser delivery.

The legacy prepared failure control retains its pre-seeded user message, makes two native attempts/six original analysis calls and produces one failure notice with no answer. An initial harness assertion incorrectly expected zero pre-seeded messages; the corrected strict assertion checks one, matching fixture construction. UI failure/interruption text qualifies availability of stored data rather than promising copies of unpersisted provider bytes or every legacy draft.

## Compatibility and rollback

Current v3 clients claim the merged outbox; older readers do not receive new codes. Actual old-source parsing accepts the compact absent-target archive, but that does not qualify arbitrary old-owner execution over live new v4 absence markers or new partial-failure records. After new work, code rollback must preserve the current recovery owners or separately qualify stored state. Never overwrite newer user data with an older backup merely to restore source compatibility.

Archived `publication: published` denotes historical durable settlement only when paired with the new explicit absence disposition. Live v4 stays publication-pending with separate proof. No publication timestamp is invented, and reappearance does not resurrect an old journal or mutate compact checksums.

## Remaining gates

Production plugin host stays OFF. Physical iPhone absence/return/notice/dismiss/next-send observation, actual paid providers, G1.9 stream consumers, aggregate activation and stable release remain separate. A concrete device check is to background the app during a failed request, return to inspect the retained input and failure notice, dismiss it, reopen to check it is not redisplayed, then send a healthy request and confirm exactly one answer. No stable tag is implied by automated qualification.

Final matching-source consultation and automatic source/graph gates are complete. OFF delivery and independent readback also completed: verified stopped application/state rollback set, exact planned apply, frontend/BG build/load,486 managed source hashes/modes,175 served JS hashes, five database integrity checks, unchanged header settings and operation records with no removal. Authenticated capabilities return200 with the plugin host disabled; process is online without unstable restarts or active work, and new error-log lines are zero.

Every one of the152 pre-existing operation-journal rows retains its exact bytes. Independent execution of the installed owners against read-only SQLite classifies the same13 originally pending operations/four absent targets as already applied and absent, with pending commits/inputs zero, one reconciliation pass, persistent write attempts zero and memory persist schedules zero. The journal cache has zero resident chat bodies in that probe. Legacy payload bytes remain10,812,211; this classification is not a legacy cleanup or a bound on all retained metadata. Current and previous application rollback sets and the verified full-recovery anchor remain protected; old-owner rollback restrictions above still apply after new work. Operational identities, hashes and rollback paths remain in private receipts.
