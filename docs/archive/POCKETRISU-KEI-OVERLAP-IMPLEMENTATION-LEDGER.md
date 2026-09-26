# PocketRisu Kei overlap follow-up implementation ledger

> **Authority:** `POCKETRISU-KEI-OVERLAP-AUDIT.md` technical
> reclassification recommendations, as explicitly approved on 2026-08-02 KST.
>
> **Boundary:** exact PocketRisu 1.9.0 only for native-owner corrections. This
> ledger does not reopen the 132-atom audit and does not authorize live apply,
> restart, push, tag, or release.

## 1. Frozen starting state

- Implementation worktree: `codex/pocketrisu-1.9-rebase` at audit authority
  commit `4275ea4` after the audit-only commit.
- Preserved K12 worktree was read-only verified at `081a32b`; its index listing
  and cached binary diff SHA-256 values matched the audit handoff. It is outside
  every revert surface below.
- User-owned dirty hunks in `POCKETRISU-KEI-INTEGRATION-STATUS.md` and
  `POCKETRISU-1.9-SESSION-HANDOFF.md` remain unstaged and must not enter a
  feature commit.
- Existing runtime authorities remain canonical. No item below creates a new
  prompt schema, regex identity, request-log database, backup database, persona
  folder schema, or generation state machine.

## 2. Admission ledger

| Feature | Existing owner | Patcher delivery | Focused tests | Receipt | Commit boundary |
| --- | --- | --- | --- | --- | --- |
| K04-F01 typed `.role` compatibility | Native 1.9 prompt normalizer | Hidden exact-1.9 `kei-prompt-role-compat-core`, required by `pocketrisu-kei` | Native-role precedence, legacy fallback, invalid alias normalization, excluded lorebook | `POCKETRISU-1.9-KEI-K04-COMPAT-VALIDATION.md` | K04 only |
| K17-F01 text-theme normalization | Native database/theme/CSS owner | Hidden exact-1.9 `kei-text-theme-normalization-core`, required by `pocketrisu-kei` | Three valid values, invalid/null load, preset boundary, runtime boundary, API source unchanged | `POCKETRISU-1.9-KEI-K17-THEME-VALIDATION.md` | K17 only |
| K23-F01 regex multiplicity | Existing `bg-preserve` `types[]` owner | Versioned extension of `bg-preserve`; no new pack/schema | Same-key disjoint merge, same-direction duplicate split, partial overlap split, order/export contract | `POCKETRISU-1.9-KEI-K23-REGEX-VALIDATION.md` | K23 only |
| K27-F01 BG log/usage delivery | Native `request-logs.cjs` owner plus `bg-preserve` transport | Versioned extension of `bg-preserve`; in-process adapter calls native `addRequestLogBatch` | owner absent/present, disabled toggle no POST, masking/caps delegated, invalid body/failure isolation | `POCKETRISU-1.9-KEI-K27-BG-LOGGING-VALIDATION.md` | K27 only |
| K26-F02 fresh pre-restore snapshot | Native 1.9 snapshot/import owner | Hidden `kei-backup-restore-safety-core` plus exactly one standard/lazy storage adapter, required by `pocketrisu-kei` | throttle bypass, unique snapshot, failure stop, bounded one-use target acknowledgement, lazy journal failure atomicity, three restore routes, disk/limit guards | `POCKETRISU-1.9-KEI-K26-RESTORE-VALIDATION.md` plus `POCKETRISU-1.9-LAZY-SNAPSHOT-RESTORE-ATOMICITY-VALIDATION.md` | Existing lazy owner atomicity infrastructure first; K26 helper/adapters/UI second |
| K29-F05 bounded overnight retention | Existing `bg-preserve` operation/result/claim/ACK owner | Versioned extension of `bg-preserve` | TTL boundary, row/byte pressure, active and live-claim protection, ACK cleanup, marker/tombstone alignment | `POCKETRISU-1.9-KEI-K29-RETENTION-VALIDATION.md` | K29 retention only |
| K29-F02 G06 | Existing BG owner considered; current caller contract blocks safe composition | Documentation-only matrix/blocker receipt; no runtime unit | Full provider/request-class source matrix and negative graph assertions | `POCKETRISU-1.9-KEI-K29-G06-MATRIX.md` | Documentation-only |
| K22-F01 P04-P06 | Existing `persona-organizer` folder/order owner | Versioned extension of `persona-organizer`; no new pack/schema | name/note search, folder/unfiled filter, selected-folder create/import, invalid-folder fallback | `POCKETRISU-1.9-KEI-K22-PICKER-VALIDATION.md` | K22 only |

The three new hidden cores are not independently user-selectable. K04 and K17
extend exact-1.9 native schema boundaries; K26 uses standard/lazy adapters so
the same feature has exactly one storage implementation in owner-absent and
owner-present graphs. K22, K23, K27, and K29 stay inside their already selected
owners.

## 3. Feature contracts and exact revert surfaces

### K04-F01 — frozen typed prompt-role compatibility

- **Purpose:** read frozen Kei typed prompt blocks without installing Kei's
  parallel prompt-role schema.
- **Trigger:** load/import/activate a prompt template containing `persona`,
  `description`, `authornote`, or `memory`.
- **State/result:** when a non-null native `.role2` exists, normalize and keep
  it authoritative. Only otherwise pass legacy `.role` through the native
  `normalizePromptRole` and write the result to `.role2` in the normalized
  clone.
- **Preservation:** plain/jailbreak/CoT `.role`, the official role aliases,
  native `.role2`, preset selection, and lorebook behavior are unchanged.
- **Revert surface:** the K04 hidden manifest, its target test, umbrella require
  entry, catalog registration, and the single managed branch in
  `src/ts/storage/database.svelte.ts`.

### K17-F01 — invalid text-theme normalization

- **Purpose:** prevent an unsupported persisted/preset value from leaving old
  CSS variables active.
- **Trigger:** database load, theme-preset activation, or runtime CSS refresh.
- **State/result:** `standard`, `highcontrast`, and `custom` pass through;
  every other value becomes `standard`.
- **Preservation:** API-v3 validation and its three existing methods/values are
  not changed. Color schemes, custom text-theme fields, fonts, and broad K17
  styling remain native.
- **Revert surface:** the K17 hidden manifest, one pure normalizer/test, three
  call-site units, umbrella require entry, and catalog registration.

### K23-F01 — regex import execution multiplicity

- **Purpose:** preserve repeated executions represented by same-key,
  same-direction imported records.
- **Trigger:** import vanilla regex records into the canonical `types[]` owner.
- **State/result:** for one merge key, merge into the first existing canonical
  row whose modes are disjoint; if every row overlaps at least one incoming
  mode, append a new canonical row. Input and row order remain stable.
- **Preservation:** `types[]` stays canonical; export still splits to vanilla
  single-type records; R05-R07 keep using one canonical row; no identity or
  multi-object grouping schema is added.
- **Revert surface:** only the `bg-preserve:hook:regex-import-merge` managed
  block, focused patcher test, version/receipt changes.

### K27-F01 — BG request log and usage delivery

- **Purpose:** make server-orchestrated requests reach the same native log and
  usage transaction as browser-owned requests.
- **Trigger:** the server bundle closes a request-log scope and POSTs the
  existing `/api/request-logs` payload.
- **State/result:** the BG fetch bridge forwards the parsed batch to the native
  `requestLogs.addRequestLogBatch`; its response is returned to the bundle.
- **Preservation:** the browser toggle remains the capture gate. Native
  normalization still owns credential masking, per-field caps, 256 MiB request
  byte rotation, minimum rows, and content-free `llm` usage. Parse/write
  failures return a failed response to the best-effort logger and never throw
  into generation. No platform badge, row-delete API, or second DB is added.
- **Revert surface:** one owned bridge/test, the BG `patchFetch` adapter, and
  the existing server registration hook that passes the native owner.

### K26-F02 — fresh snapshot before destructive restore

- **Purpose:** ensure a restore has a newly created rollback point rather than
  merely invoking the five-minute-throttled helper.
- **Trigger:** local full-backup import, server-backup restore, or database
  snapshot restore after the existing two confirmations.
- **State/result:** pending DB state is flushed without its automatic snapshot;
  a force-new, collision-free snapshot is copied and rotated before the first
  destructive write. A creation error aborts and the server issues a five-minute,
  one-use confirmation token bound to that restore target. Only a second request
  carrying both the explicit-bypass marker and that token may continue after a
  repeated snapshot attempt fails; header-only, wrong-target, expired, and
  replayed requests cannot bypass the gate. The owner retains at most 128
  in-memory tokens and creates no persisted state.
- **Preservation:** automatic five-minute throttling remains the normal-save
  policy; backup upload/disk limits, snapshot count/byte rotation, storage
  queue/import lease, cache invalidation, migrations, and both original
  confirmations stay in place. The lazy owner transactionally couples snapshot
  DB replacement and journal discard, resetting journal memory only after
  commit; best-effort limit trimming runs after that commit so an
  auto-rollback-class SQLite error cannot strand the old DB without its
  journal. Boot/manual/scheduled/selective backup features are not added.
- **Revert surface:** the K26 core helper/test and common UI/transport units,
  exactly one standard/lazy server-storage adapter, umbrella/catalog entries,
  and corrected K26 catalog/completion wording. The pre-feature lazy-owner
  atomicity helper/test and exact-1.9 call site are a preceding infrastructure
  commit with their own receipt and revert surface.

### K29-F05 — bounded overnight result retention

- **Purpose:** retain a completed but unconsumed paid ordinary result across an
  overnight mobile absence without Revenant-style indefinite storage.
- **Trigger:** terminal/intermediate result persistence and the periodic
  operation-result cleanup sweep.
- **Measured inputs before policy selection:** the current live KV had zero
  rows under all three existing orchestration result/state prefixes. The
  retained PM2 output contained 3,882 distinct `S4b detached done` event
  anchors. Six `S4a full` payload-size anchors totalled 310,621 bytes (mean
  51,770.17, minimum 43,613, maximum 62,134). Thirty-two native model-job
  journals totalled 217,622 bytes (mean 6,800.69, maximum 16,865). Existing
  bounds were 30 minutes, 128 run-registry entries, 128 client pending markers,
  a two-minute result claim, and no result row/byte cap.
- **Selected state/result policy:** 48-hour TTL, 128 result rows, and 256 MiB
  aggregate result-payload budget. Oldest unclaimed terminal payloads are
  evicted first under pressure. The in-memory paid-operation tombstone uses
  the same 48-hour horizon; the browser pending marker uses 49 hours so a
  request created up to one hour before server persistence is not discarded
  first. Both client-side ledgers retain their 128-entry cap.
- **Preservation:** an in-memory active operation or a result with a live claim
  is never evicted. Such protected rows may temporarily exceed the row/byte
  target; the sweep removes evictable rows once protection ends. Exact revision
  ACK remains the immediate deletion owner, and durable delivered state is
  still written before payload deletion.
- **Revert surface:** the four owned retention/state helper and test files;
  exact-1.9 orchestrator, run-registry, pending-marker, and client sibling
  bytes; the BG pack version; focused patcher test; and receipt.

The 48-hour window supplies a full overnight plus the following day without
turning absence into indefinite retention. The 128-row bound matches both
operation and browser ledgers. At the largest observed full-result sample, 128
rows occupy about 7.58 MiB, so the row cap binds ordinary observed sizes. The
256 MiB backstop can hold 4,320 maximum-observed full results or 15,916
maximum-observed native job journals, while still bounding a pathological
small-row/large-full-chat distribution. Those ratios are evidence context, not
a claim that future results share the observed distribution.

### K29-F02 G06 — provider/request-class decision

| Provider/request family | Ordinary top-level send | Reroll/continue current owner | Cold/suspend transport | G06 decision |
| --- | --- | --- | --- | --- |
| Classic hosted non-Gemini formats | Existing whole-pipeline BG orchestration resolves the configured classic model in the cloned DB | Browser `sendChatMain`; reroll passes `noBgOrch`, continue forces it | No generic non-Gemini raw-result owner | Blocked |
| Classic reverse proxy / `xcustom` | Ordinary BG clone preserves configured URL/key resolution | Same browser blocking caller | Provider/custom URL is caller-owned; no generic result owner | Blocked; preserve custom endpoint |
| Classic local/plugin/WebLLM/Ooba/Ollama/Kobold | Ordinary eligibility is provider-dependent inside the server bundle | Same browser blocking caller | Local network, browser runtime, or plugin authority cannot be assumed server-safe | Excluded from G06 composition |
| ModelPreset `openai-compatible` | Ordinary BG clone runs it while disabling nested native jobs only in the clone | Browser blocking caller | Native model jobs can carry it when enabled, but recovery only fills/inserts by generation id | Blocked on reroll swipe epilogue |
| ModelPreset `anthropic-messages` | Same | Same | Same native job limitation | Blocked on reroll/continue operation semantics |
| ModelPreset `google-gemini` | Same | Same | Existing Gemini/native job paths already cover transport; G06 is non-Gemini | No new unit |
| Custom/local ModelPreset profiles | Ordinary BG clone retains profile/provider snapshot | Same | Native job may relay adapter bytes, but local/custom route and operation epilogue remain separate contracts | Blocked; no partial provider allowlist |
| Static/separate/provider override | Resolved by the existing request pipeline for an ordinary send | Reroll/continue still use the blocking caller | An override can change the effective family after the top-level call | Blocked; top-level provider guess is unsafe |

Exact blockers:

1. Continue mutates the prior assistant row and can leave message count
   unchanged; the current BG terminal-success predicate requires growth.
2. Reroll removes the old response, awaits generation, then restores trailing
   comments and constructs `swipes[]` from browser-local `savedSwipes`. Neither
   the operation request nor terminal result carries that replace target or
   epilogue.
3. Existing BG merge/ACK is exact-once for its append-oriented chat result, not
   an exact-once proof for those browser mutations.
4. Native ModelPreset job recovery fills/inserts by generation identity and
   text length; it does not reconstruct the reroll swipe array or trailing
   comment placement, and classic non-ModelPreset providers do not all share
   that transport.

Therefore G06 receives no runtime change in this cycle. A later admission must
first add an operation-specific append/continue/reroll contract and typed
client epilogue without generalizing G07, G08, or G12.

### K22-F01 P04-P06 — persona picker coherence

- **Purpose:** retain organizer context where a persona is actually selected.
- **Trigger:** open the native persona picker, type a query, choose a folder,
  or create/import while a folder filter is selected.
- **State/result:** ordered personas are filtered by case-insensitive name/note
  and canonical folder membership. `Unfiled` includes absent and orphaned
  references. Every filtered row retains its original persona-array index. A
  new/imported persona receives only a currently valid selected folder ID;
  import completes asset storage before it re-reads the current database,
  pushes once, and returns the actual inserted index.
- **Preservation:** selection/binding callbacks, note display, organizer
  normalization, deletion/referential cleanup, icon/gallery cleanup, and
  import encoding remain in their existing owners. P07 duplicate is absent.
- **Revert surface:** persona-organizer helper/test additions, the managed
  `listedPersona.svelte`, selected-folder Settings actions, the optional import
  folder argument, manifest/version changes, focused test, and receipt.

## 4. Explicit exclusions retained after implementation

- K29 G03 live token replay; G07/G08/G12; translation/Hypa/Lua cold consumers
  G13-G15; and server-restart partial materialization G20.
- K29 G06 has a completed provider/request-class matrix but no runtime unit;
  the current blocking reroll/continue caller cannot preserve the typed target,
  browser epilogue, cancel rollback, and exact-once materialization inside the
  append-oriented BG owner.
- K27 platform badge and per-row delete; rich accounting, an independent usage
  policy, or a new privacy policy.
- K04/K23 lorebook roles; K23 quick activation, inline rename, and regex
  search.
- K20 character presentation variants and K22 persona duplicate P07.
- K26 boot-snapshot third choice and manual, scheduled, or selective backup.
- K19 viewer reimplementation. Its existing swipe/VoiceOver/focus behavior is
  retained only as an aggregate iPhone L3 surface.

## 5. Gate sequence for every feature commit

1. Run the feature's patcher contract/adversarial test and relevant existing
   owner tests.
2. Resolve and inspect owner-absent and owner-present graphs; exactly one
   adapter must be selected where adapters exist.
3. Apply to a disposable exact-1.9 target, run the focused target test/build
   gate, reapply with zero changes, inspect status, then revert.
4. Compare managed bytes and modes to the pre-apply snapshot and run the
   feature-scoped L2.5 discovery/anchor/triage receipt.
5. If catalog or managed units changed, run the focused owner compositions and
   the maximum complete graph. The former raw-selection verifier is retired.
6. Stage only the feature's exact paths and commit it independently. Generated
   `dist/` is regenerated only by `scripts/build-installers.cjs` after source
   features close; it is never hand-edited.

## 6. Aggregate-only L3 remainder

The final aggregate receipt will retain, without asking for execution in this
session:

- K19: fullscreen viewer horizontal swipe, VoiceOver label/focus, and close
  focus restoration on iPhone.
- K29: exercise the already qualified G09 cold-reroll presentation path by
  rerolling, backgrounding/killing/reloading the PWA, returning to the same
  chat, and verifying one recovered response at the intended swipe target with
  no duplicate. This is not the blocked standard non-Gemini G06 path.

No L3 result is claimed by this ledger.
