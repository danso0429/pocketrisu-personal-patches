# PocketRisu Kei integration catalog

## Status and comparison basis

This is the planning authority for selectively integrating
[PocketRisu Kei](https://github.com/seto-sama/PocketRisu-Kei) into this
patcher. It records ownership and composition decisions; it is not an
implementation receipt.

The comparison is frozen to:

| Item | Revision |
| --- | --- |
| PocketRisu base | `v1.8.1` / `63832a138c14cc7f11364cf7efdcb61950e7894c` |
| PocketRisu Kei | `cc1d1b195babd887577ebf943d5e82f01f58135c` |
| Patcher before this catalog | `77e23c0` / `v0.2.0-experimental.9` |

PocketRisu 1.9.0 later changed the target baseline. The target-specific
overlap and rebase decisions are recorded in
`docs/POCKETRISU-1.9-REBASE-AUDIT.md`. That overlay updates applicability
against 1.9.0 without silently changing this catalog's frozen Kei comparison
or its ownership and preservation contracts.

Kei is explicitly described by its maintainer as a nightly build. Its source,
callers, and tests therefore take precedence over README wording, and no Kei
behavior is admitted merely because it appears in the feature list.

The frozen diff contains 582 changed paths. The current patcher catalog has 12
packs, 327 units, and 152 distinct managed paths. Forty paths occur in both
sets. Those 40 are **collision surfaces**, not 40 proven conflicts: a textual
overlap can be composable, while two different files can still conflict by
owning the same state or policy.

## Disposition codes

Every feature cluster has one or more of these dispositions:

- **U — umbrella child:** an internal, non-user-selectable capability delivered
  by the user-facing `pocketrisu-kei` meta pack.
- **A — hidden adapter:** an internal composition pack selected by `autoWhen`
  for one feature and one existing authority. It owns glue only.
- **M — merge into existing authority:** the behavior belongs in an existing
  pack because that pack already owns the state machine, invariant, or policy.
- **T — separate top-level pack:** independently user-selectable because it
  changes privacy, network, provider, storage, or concurrency policy.
- **X — exclude or defer:** no direct port. This covers branding, broad
  refactors without an independent outcome, destructive behavior without an
  accepted contract, and replacements that would remove supported paths.

Evidence labels used below:

- **V:** the implementation and relevant callers or tests were inspected.
- **S:** the changed-file cluster and wiring were inspected, but the behavior
  still needs an acceptance contract before implementation.

An entry can combine dispositions. For example, a reusable capability may be
`U`, its bg-preserve wiring `A`, and a conflicting preset invariant `M`.

## Delivery architecture

### User-facing meta pack

`pocketrisu-kei` will be the only new user-facing pack for the admitted
low-policy-risk Kei capabilities. Its planned manifest shape is:

```js
{
    id: 'pocketrisu-kei',
    userSelectable: true,
    units: [],
    requires: [
        // Only children that have individually passed their gates.
    ],
}
```

The current manager accepts an empty `units` array, and the resolver expands
`requires` and conditional internal packs. No resolver feature is needed for
this shape. The meta pack must initially omit `presetDefaults`, so it joins the
rolling universal `all` preset without silently changing the narrower
`features` or `hardening` wrappers.

Each admitted child remains independently versioned and testable. Adding a
child to the meta pack is a publication decision made only after that child
passes clean-base, combined-graph, exact-revert, and target gates.

### Capability and adapter split

The standard shape is:

```text
kei-<feature>-core
├── kei-<feature>-base-adapter
└── kei-<feature>-<existing-owner>-adapter
```

The core owns only new files, pure logic, types, and focused tests. A base
adapter owns upstream PocketRisu wiring when no conflicting authority is
selected. A composition adapter owns wiring for exactly one existing owner,
such as `bg-preserve`, `lazy-chat-sync`, or `preset-integrity`.

There will be no monolithic `kei-bg-adapter`. Feature-by-owner adapters keep
failure and revert boundaries small and prevent one feature from silently
changing another feature's policy.

### Separate top-level packs

These capabilities must not become umbrella defaults:

- `kei-model-runtime`
- `kei-multidevice-sync`
- `kei-request-logs`
- `kei-usage-insights`

Their internal implementation may use hidden children, but the user must
select the top-level policy explicitly.

## Feature disposition catalog

| ID | Kei feature or source cluster | Evidence | Disposition | Planned authority and preservation contract |
| --- | --- | --- | --- | --- |
| K01 | Package, workspace, TypeScript, Vite, and Vitest refactor | S | X, M | Do not rebase the patcher target onto Kei's toolchain. Port only a concrete fix into `toolchain-hardening`, with both `package.json` and `pnpm-lock.yaml` qualified together. Do not copy deleted `.npmrc` or workspace layout merely for parity. |
| K02 | Shared UI controls and settings wrappers | S | U, X | `kei-ui-foundation-core` may contain only components consumed by an admitted child. Exclude the blanket UI/settings rewrite and Kei branding. Existing Personal and Admin Stats routes remain intact. |
| K03 | Preset folders and sortable picker layout | V | U, A, M | `kei-preset-folders-core` plus base and `preset-integrity` adapters. Prompt-preset selection validity remains owned by `preset-integrity`; persona and character picker behavior remains owned by their organizer packs. |
| K04 | Prompt roles and preset behavior | V | U, A, M | Admit only independently testable role/picker behavior. Any create, delete, import, restore, or active-index invariant merges into `preset-integrity`; do not port deleted legacy UI wholesale. |
| K05 | Model preset compiler, additional parameters, thinking controls, HTTP transport, and provider-neutral runtime | V | T | Root of `kei-model-runtime`. Preserve custom endpoints, local LLMs, Vertex/environment branches, plugin overrides, and existing provider defaults. It receives no umbrella default. |
| K06 | Amazon Bedrock, Cloudflare, Developer Custom, OpenAI Responses/API mode, and related adapters | V | T | Hidden children of `kei-model-runtime`, independently gated per provider. Credential transport, streaming format, tool calls, and error mapping require provider-specific tests. |
| K07 | `models.dev` remote catalog and six-hour cache | V | T | Optional child of `kei-model-runtime`. Implement an additive overlay with an offline/static fallback. Reject Kei's deletion of 168 bundled provider/profile JSON files and retain Developer Custom, local, plugin, and Vertex paths. |
| K08 | Model preset credentials and API key pools | V | T | Child of `kei-model-runtime`. Preserve existing credential scopes and custom endpoint overrides; never migrate or rewrite secrets merely by selecting the pack. |
| K09 | Plugin-provided models in model presets | V | T, A | Child of `kei-model-runtime` with a focused API-v3 composition adapter. Do not assign plugin-model semantics to `lazy-chat-sync` just because that pack currently replaces API-v3 files. Preserve other plugin APIs and storage behavior. |
| K10 | Consolidated plugin, module, and MCP/add-on settings tabs | S | X | Structural consolidation has no independent user outcome. Revisit only when required by an admitted capability, and then port the minimum route/component surface. |
| K11 | HypaMemory management, manual summarization, search, and next-target UI | V | U, A | `kei-hypa-tools-core` with base and bg-preserve adapters. Keep the UI and deterministic selection logic independent of generation delivery. Bg-selected generation must use bg-preserve rather than Revenant. |
| K12 | Translation cache list/search/edit/delete/import/export/clear/unused cleanup and abortable loading | V | U, A | `kei-translation-tools-core` with base and bg-preserve adapters. Destructive clear/delete remains explicit UI action. Preserve translation cancellation and isolate cache entries by the complete translation identity. |
| K13 | Robust OpenAI and Google SSE parsing, including split UTF-8, multiline events, split JSON, tool calls, reasoning, multi-choice, and one-time signatures | V | U, A | `kei-stream-parser-core`. OpenAI can use a base adapter; Google request delivery needs a bg-preserve adapter when selected. Keep parsing pure and replayable, and preserve bg streaming completeness. |
| K14 | Chat render stability during streaming | V | U, A | `kei-chat-render-core` plus base and bg-preserve adapters. Preserve the active chat component and scroll state without weakening bg completion, result claim, or reconnect behavior. |
| K15 | Partial message editing and shared edit listener | V | U, A | `kei-partial-edit-core` plus base and bg-preserve adapters. Resolve the intended message once, cancel stale targets, and prevent translation-cache cross-message writes. |
| K16 | Chat navigation, hotkeys, and mobile back behavior | V | U, A | `kei-mobile-navigation-core` plus base and `lazy-chat-sync` bootstrap adapters. Keep existing startup cache/lazy hydration ordering and route restoration intact. |
| K17 | Themes, chat text display, and broad styling controls | V | U, X | Keep the broad refactor excluded. Audit-admitted K17-F01 adds only defensive normalization of unsupported text-theme values at native load, preset-activation, and runtime-CSS boundaries; `standard`, `highcontrast`, `custom`, and the existing API-v3 validation remain native and authoritative. |
| K18 | Reorganized image, TTS, and inlay settings | S | X | Exclude the route and settings reorganization. Port only a feature with an independent outcome; fullscreen viewing is split into K19. |
| K19 | Fullscreen image viewer with gallery and character-image navigation | V | U | `kei-fullscreen-image-viewer-core`. Retain keyboard, pointer, and mobile navigation behavior and avoid taking ownership of unrelated image/TTS settings. |
| K20 | Character list/sidebar ordering, folders, search, recent items, and list/grid presentation | V | M | Merge selected behavior into `character-organizer`, which remains canonical for order and folders. Search/recent/view controls may be added there only if they preserve its ordering model. Do not add a second character-order schema. |
| K21 | Character trash/restore/permanent delete and `localOnly` filtering | V | T, M, X | `localOnly` visibility belongs to an explicitly selected multi-device policy. Non-destructive search/restore UI may merge into `character-organizer`. Permanent deletion is excluded until a separate opt-in pack has confirmation, restore, and retention contracts; it is never an umbrella child. |
| K22 | Persona picker/list improvements | V | M | Merge only missing behavior into `persona-organizer`. Preserve its folder schema, order, deletion plan, database normalization, and import/export behavior. Do not install Kei's parallel persona organization model. |
| K23 | Regex and lorebook grouping/editing | V | M, X | Keep `bg-preserve`'s `types[]` schema canonical. Audit-admitted K23-F01 changes only regex import bucketing so equal-key rows merge when their mode sets are disjoint and any overlapping direction starts another canonical row. R05-R07 already use one canonical row; Kei's multi-object helper, regex search, lorebook roles, quick activation, inline rename, and broad UI rewrite remain excluded. |
| K24 | Remote-only chat/folder filtering | V | T | Part of `kei-multidevice-sync`, not the umbrella. It requires an explicit trust/exposure policy and must not infer “remote” solely from a Cloudflare hostname in environments using another tunnel or tailnet. |
| K25 | WebSocket multi-device database synchronization and self-echo suppression | V | T, possible later M | Initially a separate `kei-multidevice-sync` pack. It must preserve unsaved local edits through versioned merge/rebase or produce an explicit conflict; remote `setDatabase()` must not silently discard pending local state. If adopted as the universal storage protocol later, merge a qualified major version into `lazy-chat-sync` instead of stacking two writers. |
| K26 | Manual snapshots, boot-time automatic backups, missing-asset recovery, and management UI | V | U, A | `kei-backup-tools-core` plus standard-storage, lazy-storage, and character-import lease adapters. Preserve existing v1.8.1 backup/import/snapshot behavior. Restore requires confirmation, a pre-restore backup, strict storage flush, and exact failure reporting. |
| K27 | Persistent request logs | V | M for K27-F01; T, X as-is for remaining policy | Audit-admitted K27-F01 extends `bg-preserve` only: the server bundle's existing native log POST is delivered to official 1.9's already-open `requestLogs` owner. Its toggle, masking, body caps, 256 MiB rotation, pagination, and schema remain canonical. Platform metadata and per-row deletion stay excluded; a future safer content/retention policy remains a separate explicit pack. |
| K28 | Usage tracking, token/cache/reasoning/service-tier fields, gateway cost, and price estimation | V | M for U03 through K27-F01; T for remaining policy | K27-F01 also lets the native owner's content-free usage transaction observe BG requests. Rich cache/service-tier/gateway/pricing dimensions, independent enablement, retention, and pagination remain future `kei-usage-insights` scope. Accounting failure must never fail generation. |
| K29 | Revenant server-side generation | V | M, X direct port | Do not create `kei-revenant`. Mine only demonstrably missing improvements into `bg-preserve`, whose operation-keyed result/claim/ACK, whole-pipeline cancellation, reconnect, cold recovery, and delivery contracts remain canonical. |
| K30 | Data-restore server refactor and legacy restore paths | V | X, U only through K26 | Do not replace current migration/import behavior as a structural cleanup. Reuse a narrowly needed helper only within K26 after proving round-trip compatibility with existing RisuAI and PocketRisu backups. |
| K31 | Consolidated UI/settings structures, Kei sticker/branding, and legacy-code deletion | S | X | No direct integration. Deletion and branding are not functional dependencies. Minimal required UI pieces remain governed by K02. |

## PocketRisu 1.9 completion overlay

The frozen table above remains the source-comparison record. For the current
exact-1.9 aggregate, these later decisions control admission:

| Rows | Current aggregate decision |
| --- | --- |
| K03 | Distinct but deferred future child; preset folders were never admitted before the target pivot. |
| K04 | Broad direct port remains dropped. Audit-admitted K04-F01 adds one-way frozen typed `.role` compatibility inside the native `.role2` normalizer; native `.role2` wins, lorebook is excluded, and `preset-integrity` retains active-selection invariants. |
| K17 | Broad styling remains excluded. Audit-admitted K17-F01 is the hidden exact-1.9 `kei-text-theme-normalization-core`; it admits only the three native values and falls back to `standard` at load, preset activation, and runtime CSS without changing API-v3. |
| K20/K22 | No parallel character/persona organization schema; missing presentation outcomes remain future owner-local changes. |
| K23 | Direct port remains excluded. Audit-admitted K23-F01 preserves same-direction import multiplicity inside `bg-preserve`'s canonical `types[]` owner; R05-R07 are not reimplemented. |
| K29 | Direct Revenant port remains excluded; qualified `bg-preserve` generation authority stays canonical. |
| K26 | Combined port dropped because exact 1.9 owns snapshots and backup/restore. Only separately admitted missing-asset or schedule outcomes may return later. |
| K27/K28 | Audit-admitted K27-F01 closes only BG delivery L02/U03 inside the existing `bg-preserve` and native request-log owners. Exact 1.9 request bodies remain bounded/cursor-paginated/masked but default on; usage remains content-free and failure-isolated but unbounded/unpaginated and coupled to the log toggle. Platform/delete, rich accounting, independent usage, and safer privacy/retention policy remain deferred explicit features. |

The evidence and exact source anchors are in
`docs/POCKETRISU-1.9-CATALOG-COMPLETION-DECISIONS.md`. The seven original
children and the later audit-admitted K04/K17 corrections enter aggregate
qualification without claiming deferred rows as implemented.

That exact-1.9 aggregate qualification subsequently passed and is recorded in
`docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. This result advances the
existing admitted children; it does not change any deferred disposition in
this catalog.

## Existing-authority merge ledger

The following decisions are based on state and policy ownership, not file
ownership alone.

### `bg-preserve`

Merge or adapt:

- K11 Hypa generation delivery
- K12 translation request delivery and cancellation
- K13 Google stream delivery
- K14 streaming render/reconnect integration
- K15 partial-edit interaction with in-flight generation
- K23 multi-type regex schema compatibility
- K29 selected Revenant improvements

Preserve:

- operation-keyed result, claim, and ACK
- whole-pipeline cancellation and no resurrection
- stream completeness and reconnect behavior
- cold-boot recovery and persisted canonical bases
- lazy-chat composition and current GigaTrans delivery behavior

### `lazy-chat-sync` and `startup-cache`

Adapt:

- K16 bootstrap/navigation wiring
- K25 only if multi-device sync is later adopted as the canonical writer
- K26 backup/restore flush and storage leases

Preserve:

- single active-writer protection
- ETag/CAS and three-way rebase
- startup cache reconstruction and fallback
- new-chat durable WAL/quarantine behavior
- pending local changes across hydration and reconnect

K25 may not disable the active-writer protocol as an incidental side effect.
Its alternative concurrency model must be selected and validated explicitly.

### `preset-integrity`

Merge or adapt K03 and K04. It remains authoritative for valid active preset
selection across deletion, import, restore, and empty-list recovery.

### `persona-organizer` and `character-organizer`

Merge K20 and K22 into the corresponding organizer. Existing folder/order
schemas remain canonical. A Kei UI component may render those schemas; it may
not create a parallel source of truth.

### `character-import-ux`

Adapt K26 where backup, restore, or migration overlaps its import lease and
non-blocking import flow.

### `personal-settings`

Preserve its settings route and unrelated personal options when K02 or another
child needs settings navigation.

### `parser-hardening`

K13 may share parser test techniques, but protocol SSE parsing and chat text
parsing remain separate responsibilities. Merge only a truly shared primitive
with unchanged semantics.

### `toolchain-hardening`

K01 fixes merge here individually. A model/provider pack that needs a
dependency must compose with this authority and qualify manifest and lockfile
together; it does not inherit Kei's entire workspace.

## Planned adapter matrix

Names are provisional until units are constructed, but the boundaries are
normative.

| Capability core | Upstream/base adapter | Composition adapter(s) |
| --- | --- | --- |
| `kei-ui-foundation-core` | none; consumed components only | none |
| `kei-preset-folders-core` | `kei-preset-folders-base-adapter` | `kei-preset-folders-preset-integrity-adapter`; organizer-owned pickers merge instead |
| `kei-prompt-roles-core` | `kei-prompt-roles-base-adapter` | `kei-prompt-roles-preset-integrity-adapter` |
| `kei-hypa-tools-core` | `kei-hypa-tools-base-adapter` | `kei-hypa-tools-bg-adapter` |
| `kei-translation-tools-core` | `kei-translation-tools-base-adapter` | `kei-translation-tools-bg-adapter` |
| `kei-stream-parser-core` | `kei-stream-parser-base-adapter` | `kei-stream-parser-bg-adapter` |
| `kei-chat-render-core` | `kei-chat-render-base-adapter` | `kei-chat-render-bg-adapter` |
| `kei-partial-edit-core` | `kei-partial-edit-base-adapter` | `kei-partial-edit-bg-adapter` |
| `kei-mobile-navigation-core` | `kei-mobile-navigation-base-adapter` | `kei-mobile-navigation-lazy-adapter` |
| `kei-fullscreen-image-viewer-core` | direct focused UI hooks | none unless a later owner reaches the same gallery state |
| `kei-backup-tools-core` | `kei-backup-standard-adapter` | `kei-backup-lazy-adapter`, `kei-backup-character-import-adapter` |

An adapter is selected only for its exact graph condition. For example, the
base partial-edit adapter requires the core and excludes `bg-preserve`, while
the bg adapter requires both the core and `bg-preserve`. Both must produce the
same user-visible edit contract.

## Forty current collision surfaces

This ledger prevents the raw overlap count from being mistaken for a conflict
decision. Each path is listed exactly once with its current local owner or
owners.

| Path | Current local owner(s) | Planned handling |
| --- | --- | --- |
| `package.json` | `toolchain-hardening` | K01 merge or K05–K09 dependency composition; no wholesale replacement |
| `pnpm-lock.yaml` | `toolchain-hardening` | Same transaction and qualification boundary as `package.json` |
| `server/node/server.cjs` | `bg-preserve`, `lazy-chat-sync`, `persona-organizer`, `startup-cache` | Feature-specific server adapters; K24–K29 never receive a broad replacement unit |
| `src/App.svelte` | `bg-preserve`, `character-organizer` | Focused UI adapter only; preserve both mounts and state |
| `src/lang/en.ts` | `bg-preserve` | Additive feature strings through the owning adapter |
| `src/lang/ko.ts` | `bg-preserve` | Additive feature strings through the owning adapter |
| `src/lib/ChatScreens/Chat.svelte` | `bg-preserve` | K14/K15 bg adapters |
| `src/lib/ChatScreens/DefaultChatScreen.svelte` | `bg-preserve`, `lazy-chat-sync` | K14–K16 owner-specific adapters |
| `src/lib/Setting/Pages/Model/ModelPresetSettings.svelte` | `bg-preserve` | K05/K09 separate model-runtime composition |
| `src/lib/Setting/Pages/PersonaSettings.svelte` | `persona-organizer` | K22 merge |
| `src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte` | `preset-integrity` | K03/K04 integrity adapters |
| `src/lib/Setting/Pages/SystemBackup.svelte` | `character-import-ux` | K26 import/restore lease adapter |
| `src/lib/Setting/ServerBackupList.svelte` | `character-import-ux` | K26 import/restore lease adapter |
| `src/lib/Setting/Settings.svelte` | `personal-settings` | Additive route composition; preserve existing pages |
| `src/lib/SideBars/Scripts/RegexData.svelte` | `bg-preserve` | K23 merge; retain multi-type schema |
| `src/ts/bootstrap.ts` | `lazy-chat-sync`, `startup-cache` | K16 lazy adapter; preserve hydration/cache order |
| `src/ts/characterCards.ts` | `character-import-ux`, `personal-settings` | K20/K21 merge only with import and navigation contracts intact |
| `src/ts/characters.ts` | `personal-settings` | K20 merge only; preserve post-import setting behavior |
| `src/ts/drive/backuplocal.ts` | `character-import-ux`, `persona-organizer` | K26 adapter; preserve organizer/import migrations |
| `src/ts/globalApi.svelte.ts` | `bg-preserve`, `lazy-chat-bg-adapter`, `lazy-chat-sync`, `persona-organizer` | K25 cannot replace pending-save semantics; K29 remains bg-owned |
| `src/ts/network/proxyJobWs.ts` | `bg-preserve` | K13/K29 merge or bg adapter |
| `src/ts/parser/parser.svelte.ts` | `parser-hardening` | Keep K13 protocol parsing separate unless a primitive is genuinely shared |
| `src/ts/persona.ts` | `persona-organizer` | K22 merge |
| `src/ts/plugins/apiV3/risuai.d.ts` | `lazy-chat-sync`, `persona-organizer` | K09 focused type/API adapter |
| `src/ts/plugins/apiV3/v3.svelte.ts` | `bg-preserve`, `lazy-chat-sync` | K09 focused API adapter; preserve all unrelated plugin methods |
| `src/ts/preset/adapter/googleGemini.ts` | `bg-preserve` | K13 bg adapter; K05/K06 model-runtime composition |
| `src/ts/preset/adapter/types.ts` | `bg-preserve` | K05/K06 additive model-runtime composition |
| `src/ts/process/index.svelte.ts` | `bg-preserve`, `parser-hardening` | K11–K15 feature-specific adapters |
| `src/ts/process/modules.ts` | `bg-preserve` | K11/K12/K29 merge or bg adapter |
| `src/ts/process/request/google.ts` | `bg-preserve` | K13 bg adapter |
| `src/ts/process/request/request.ts` | `bg-preserve` | K05/K06/K11–K15 composition, never a broad replacement |
| `src/ts/process/scripts.ts` | `bg-preserve` | Preserve orchestration hooks; feature-specific adapter only |
| `src/ts/routing.ts` | `personal-settings` | K16 additive navigation composition |
| `src/ts/status/requestStatus.ts` | `bg-preserve` | K14/K29 bg-owned status behavior |
| `src/ts/storage/autoStorage.ts` | `lazy-chat-sync`, `startup-cache` | K25/K26 storage-policy adapter |
| `src/ts/storage/database.svelte.ts` | `bg-preserve`, `persona-organizer`, `personal-settings`, `preset-integrity` | Schema fields merge into the relevant authority; no whole-database replacement |
| `src/ts/storage/nodeStorage.ts` | `bg-preserve-storage-base`, `lazy-chat-bg-adapter`, `lazy-chat-sync`, `startup-cache` | K25/K26 exact storage adapter per resolved graph |
| `src/ts/tokenizer.ts` | `bg-preserve` | K11/K28 accounting or generation changes preserve bg token flow |
| `src/ts/translator/translator.ts` | `bg-preserve` | K12 bg adapter |
| `vitest.setup.ts` | `toolchain-hardening` | K01 merge only if a concrete test-environment fix is retained |

## Policy contracts for separate packs

### `kei-model-runtime`

- additive provider/runtime integration, not static-catalog replacement;
- no credential migration on install;
- custom endpoint, local LLM, Vertex, plugin, and offline paths retained;
- each provider has request, stream, tool-call, error, and cancellation tests;
- `models.dev` failure leaves the last valid cache or bundled fallback usable.

### `kei-multidevice-sync`

- explicit opt-in and documented exposure boundary;
- versioned writes with merge/rebase or visible conflict;
- no pending local edit is cleared merely because a remote snapshot arrived;
- self-echo suppression is not treated as concurrency control;
- remote filtering is configured by trust policy, not one hostname heuristic;
- canonical behavior is qualified against lazy hydration, new-chat WAL, backup,
  restore, and bg result writes.

### `kei-request-logs`

- redacted metadata by default;
- bounded rows, age, and total bytes;
- paginated queries;
- no authorization tokens, cookies, raw credentials, or full prompt/response
  capture by default;
- any temporary full-content diagnostic mode is explicit, expires, and reports
  its storage footprint.

### `kei-usage-insights`

- no prompt or response content;
- bounded retention and paginated reads;
- accounting errors cannot fail or delay generation;
- price estimates identify their source and age;
- remote pricing is optional and has an offline fallback.

## Admission order

This order controls risk and dependency flow; it is not a schedule or size
estimate.

1. Add resolver/catalog tests for the empty meta pack, hidden required
   children, rolling `all` inclusion, and omission from narrow presets.
2. Admit the minimal K02 UI primitives required by K19, then K19 fullscreen
   viewing.
3. Admit K13 stream parsing, K14 render stability, and K16 navigation/hotkeys
   with base and existing-owner graphs.
4. Admit state-editing features K15 partial edit, K11 Hypa tools, and K12
   translation tools one at a time.
5. Against PocketRisu 1.9, record K03/K04/K26 as native, dropped, or deferred
   before aggregate qualification; do not create placeholder children.
6. Keep K20/K22/K23/K29 under their existing authorities. Admit a later
   independently specified missing outcome only through its own gates.
7. Design and qualify K05–K09 and K24/K25 as separate top-level policy packs.
   For K27/K28, keep only audited BG delivery K27-F01 inside `bg-preserve`;
   design every remaining privacy, retention, platform, deletion, rich
   accounting, and independent-usage outcome as a separate explicit feature.

The `pocketrisu-kei` meta pack gains a child only after that child's individual
release gate. A partially implemented child is never hidden behind the meta
pack.

## Verification gates per child

Before any child or merge is published:

1. Record the exact Kei source paths, caller chain, upstream base anchors, and
   behavior being retained. Copy no deletion without a separate justification.
2. Write the preservation contract and at least one adversarial scenario that
   would violate it.
3. Keep owned files and touched anchors to the smallest feature boundary.
4. Test clean PocketRisu, every applicable existing-owner graph, and graphs
   where the feature is absent.
5. Verify `plan`, apply, zero-change second plan, current status, and exact
   revert including file modes.
6. Run resolver graph tests, upstream/ported focused tests, the patcher suite,
   frozen install when dependencies change, Svelte diagnostics, production
   build, and the bg bundle builder when `bg-preserve` participates.
7. Perform concrete iPhone checks for user-visible behavior. Relevant examples
   are: stream while the app backgrounds and returns, edit a partial response,
   back-swipe through chat/settings history, navigate a fullscreen gallery,
   reorder/select presets, and restore a snapshot after an automatic
   pre-restore backup.
8. Update the individual pack version and source/provenance notice. Preserve
   PocketRisu Kei's GPL-3.0 attribution and the exact source revision used.

Passing one graph does not qualify another adapter. Passing automated gates
does not replace the user-visible mobile gate for a UI child.

## README feature cross-check

Every item under Kei's “Changes from the original PocketRisu” list is mapped:

| README order | Feature | Catalog entry |
| --- | --- | --- |
| 1 | Toolchain refactor | K01 |
| 2 | Shared UI/settings controls | K02 |
| 3 | Preset folders/sortable pickers | K03 |
| 4 | Prompt roles/preset behavior | K04 |
| 5 | Model runtime/adapters | K05, K06 |
| 6 | `models.dev` catalog | K07 |
| 7 | Preset/credential management | K08 |
| 8 | Plugin/module tab consolidation | K10 |
| 9 | Plugin-provided models | K09 |
| 10 | HypaMemory tools | K11 |
| 11 | Translation cache/cancellation | K12 |
| 12 | Chat streaming/rendering | K13, K14 |
| 13 | Partial editing | K15 |
| 14 | Navigation/shortcuts/mobile back | K16 |
| 15 | Themes/text styling | K17 |
| 16 | Image/TTS/inlay settings | K18, K19 |
| 17 | Character/sidebar UI | K20, K21 |
| 18 | Regex/lorebook editing | K23 |
| 19 | Remote filter/multi-device sync | K24, K25 |
| 20 | Snapshots/backups/asset recovery | K26 |
| 21 | Persistent request logs | K27 |
| 22 | Usage/cost | K28 |
| 23 | Server-side generation | K29 |
| 24 | UI/settings consolidation/legacy removal | K31 |

Code-derived clusters not stated separately in that list are also covered:
fullscreen viewing by K19, provider-specific runtime additions by K06, data
restore by K30, and the concrete request-log and usage retention risks by K27
and K28.

## Non-goals

- No direct merge or cherry-pick of the Kei source tree.
- No `kei-revenant` duplicate of bg-preserve.
- No deletion of bundled model/provider catalogs.
- No blanket UI, settings, package, workspace, or branding rebase.
- No automatic user-data deletion, cache clearing, credential migration, or
  permanent trash purge.
- No weakening of existing writer, storage, preset, organizer, plugin, custom
  endpoint, local-model, backup, or bg-generation paths to make a patch apply.
- No claim that the 40 shared paths are 40 conflicts.

## Re-evaluation rule

This catalog is revision-specific. A later Kei commit must be compared from
the pinned Kei SHA, and only changed feature rows should be re-opened. A row
changes disposition only after its caller chain, policy boundary, preservation
contract, and combined graph have been re-evaluated.
