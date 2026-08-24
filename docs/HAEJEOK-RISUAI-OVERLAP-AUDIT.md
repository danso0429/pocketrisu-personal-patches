# Haejeok RisuAI overlap audit

> Status date: 2026-08-24 KST
>
> Decision: focused admitted scope complete. HJ04 persistence ordering, HJ03
> Korean search, and HJ01 Small chat width are adapted through internal patcher
> payloads. There is no new active HJ queue: HJ02/HJ05/HJ07 are trigger-gated,
> HJ06 is blocked, and the frozen HJ08 implementation is rejected.
>
> The three admitted HJ features passed their six-scenario live iPhone L3 on
> 2026-08-24 KST.

## Executive conclusion

[Haejeok RisuAI](https://github.com/nevaeh5379/HaejeokRisuai) is not a
PocketRisu modification. Its README and Git ancestry identify it as an
independently maintained fork of
[RisuAI](https://github.com/kwaroran/RisuAI). PocketRisu, PocketRisu Kei, and
Haejeok therefore share older RisuAI ancestry, but Haejeok is not downstream
of PocketRisu 1.10 and cannot be reviewed as a small patch on that target.

The useful Haejeok ideas fall into three groups:

1. **architectural alternatives** such as relational SQL/domain stores and
   S3/RustFS assets, which conflict with the current PocketRisu SQLite,
   lazy-chat, point-in-time backup, and asset-reference owners;
2. **distinct reviewed outcomes** such as bounded low-spec rendering,
   Node-side token/lore/vector computation, Korean fuzzy character search,
   configurable chat width, resizable text areas, and ZIP64 streaming; and
3. **duplicate or already stronger local outcomes** such as ordinary
   character search, safe orphan-media cleanup, parser fixes, background
   generation preservation, and stale-client fencing. HJ session-level recent
   and favorite/hidden/sort views are real source gaps, but their user value and
   safe metadata/state policy are unqualified.

No whole Haejeok subsystem should be cherry-picked. A retained idea must be
reduced to an owner-local PocketRisu 1.10 change and requalified inside the
single complete patch graph. HJ04 persistence ordering, HJ03 Korean matching,
and HJ01 Small width met that boundary. The five other numbered ideas did not;
their trigger/blocked/rejected states are documented separately rather than
retained as an ambiguous priority queue.

## Frozen comparison basis

| Item | Frozen revision |
| --- | --- |
| Official PocketRisu | `v1.10.0` / `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Haejeok RisuAI `main` | `e9d035683cdf9f0207eed193ee36f9bdb117f658` / tag `b6254` |
| RisuAI common point used to isolate Haejeok work | `22ea4a64b7a2178ca10957dc53f14a0404e31587` |
| PocketRisu/Haejeok older common ancestor | `b8b4de1d1d1072815d8f6ca957fec0a9e6a95dee` |
| PocketRisu Kei source already used by this patcher | `cc1d1b195babd887577ebf943d5e82f01f58135c` |
| Patcher before this audit | `e1b10347c29a2cf5c2cc4efd6211c5d60f0d6f5a` / `0.2.0-experimental.19` |

The Haejeok repository had three remote feature branches at the frozen fetch.
This audit covers only `main`. In particular, the unmerged
`feature/asset-manager` branch is not treated as shipped Haejeok behavior.

## Ancestry and measured surface

- PocketRisu 1.10 and Haejeok share the March 2026 RisuAI commit `b8b4de1`.
  From that point, the two tips contain 958 PocketRisu-side commits and 814
  Haejeok-side commits respectively.
- Haejeok shares RisuAI through `22ea4a64` from 2026-08-17. Its frozen `main`
  contains 173 commits beyond that point and has 547 final changed paths.
- A repository-wide Prettier commit rewrites many lines. Commit subjects and
  final callers were inspected so formatting is not classified as a feature.
- A raw PocketRisu-to-Haejeok tree diff spans 1,243 paths. That number measures
  two long-lived forks, not 1,243 Haejeok features.
- The pre-HJ integration complete patch plan frozen by this audit requested 13 root
  packs, normalizes them to 12 effective roots, resolves 35 packs/adapters,
  and manages 267 source paths. Fifty-eight of
  those exact plan paths were also functionally touched on Haejeok `main`.
  Across those 35 resolved pack manifests, 25 have at least one such path.
  HJ04 changes the live integration-branch counts; its current measurements
  are recorded separately in `HAEJEOK-INTEGRATION-PLAN.md` rather than
  retroactively changing this frozen overlap sample.

These path intersections are collision surfaces only. They do not prove
equivalent behavior, and non-overlapping files can still compete for the same
state or policy.

## Product and architecture comparison

| Surface | PocketRisu 1.10 plus complete patch set | Haejeok `e9d03568` | Relationship |
| --- | --- | --- | --- |
| Base | PocketRisu NodeOnly 1.10, derived from an older RisuAI line | Current RisuAI fork with independent branding/releases | Different products and upgrade lines |
| Primary data | NodeOnly SQLite/KV plus lazy chat delta, CAS/rebase, write journal, hydration barriers | Relational PostgreSQL/Oracle/Azure SQL or Web/Tauri SQLite, domain stores, record-level commits | Competing storage authorities |
| Assets | PocketRisu local asset store, native 1.10 server-side fail-closed orphan walker, persona gallery/folder union | Local FS, S3/RustFS, or Azure SQL assets with catalog, thumbnails, browser analysis, and generic delete API | Haejeok UI is broader; deletion contract conflicts |
| Generation | Whole ax/main/post-processing server orchestration, operation-keyed result claim/ACK, cancellation, cold recovery | Provider request remains client-owned; selected tokenization, lore matching, and vector ranking move to Node | Complementary outcome, overlapping hosts |
| Mobile background | Server completes ax/main/post-processing generation after page suspension; client reconciles durable results | No equivalent whole-generation operation ledger | Local patch is a strict superset for generation |
| Imports | Foreground character/module import with indexed CharX integrity, one import lease, and server-confirmed persistence; durable background experiment retired after device UX | Request-lifetime bulk read/write, streaming backup restore, CharX ZIP export | Streaming ideas overlap; neither ships the retired durable import path |
| Backup | One pinned SQLite/WAL and verified filesystem epoch; fresh rollback snapshot before destructive restore | Offline Docker `pg_dump` + stopped RustFS + restic, plus request-lifetime application backups and SQL revision preview | Different operational models |
| Stale deployments | Build stamp on authoritative client/server writes, dirty-state freeze | Independent updater/release flow; no `x-client-build` fence | Local patch is distinct |
| Parser/streaming | ChatML/Thoughts/CBS hardening and Kei replayable OpenAI/Google SSE parser | Frozen Haejeok still has the three skipped parser cases and ad-hoc stream splitting | Local patch is distinct/stronger |
| UX | Native PocketRisu catalog plus canonical persona/character organizers and selected Kei tools | SQL explorer, storage explorer, log exporter, low-spec mode, onboarding, chat width, resize controls | Mixed admitted, trigger-gated, blocked, rejected, value-unknown, and separate-product outcomes |

## Haejeok feature clusters and disposition

| Haejeok cluster | Principal frozen source | Overlap | Current disposition |
| --- | --- | --- | --- |
| Relational SQL storage and domain stores | `server/node/{postgresStorage,oracleStorage,azureStorage,sqlStorageCommon}.cjs`, `src/ts/stores/domain/`, `src/ts/storage/sqlCommit.ts` | Replaces the same character/chat/settings persistence owned by `lazy-chat-sync`, startup cache, BG durable save, backup, and fence adapters | **Exclude as a patch.** Revisit only as a separately approved backend migration project. |
| S3/RustFS/Azure asset storage and explorer | `server/node/assetStorage.cjs`, `src/ts/storage/nodeS3Storage.ts`, `src/lib/Setting/Pages/StorageExplorer*` | Duplicates orphan inventory/cleanup and intersects persona folders/galleries, CharX, backup, and client fence | **Reference UI only.** Do not port the delete path without a server-authoritative union walker and stale-build fence. |
| Node compute offload | `server/node/{tokenizeCount,loreMatch,loreResolve,vectorIndex}.cjs`, `src/ts/tokenizer.ts`, memory/lore callers | Touches BG, K11 Hypa, tokenizer, `nodeStorage.ts`, and generation assembly, while ordinary local sends already execute the pipeline through BG | **HJ07 trigger-gated.** Reopen only for measured client-only benefit and no shared-server responsiveness regression, with abort, isolation, parity, and fallback design. |
| Low-spec mode, message paging, bounded caches | `src/ts/chatLoadPages.ts`, domain message/character stores, image/cache callers | Its main compaction win depends on Haejeok's relational message store; PocketRisu already exposes portable render controls | **HJ05 trigger-gated.** Do not add a parallel message store or one aggregate switch; reopen only the measured failing owner. |
| Streaming bulk backup/restore and ZIP64 | `server/node/zipStream.cjs`, bulk read/write routes, `src/ts/drive/backuplocal.ts`, `src/ts/characterCards.ts` | Writer passed actual 4 GiB+1/count probes, but current/HJ import limits and HJ CRC integrity do not form a round trip | **HJ06 blocked.** Writer validity is not a proxy backup or same-build import policy. |
| Character catalog, recent sessions, Korean fuzzy search | `src/lib/UI/MainMenu.svelte`, `RecentSessionsList.svelte`, `src/ts/util/koreanSearch.ts` | Organizer owns canonical order/folders; HJ favorites/hidden/sort and session-level recent are distinct but have cleanup/privacy/value gaps | **HJ03 matching admitted.** X01/X02 remain inactive value hypotheses, not silently excluded or auto-resumed. |
| Adjustable chat width and text-area resize | `Chat.svelte`, `TextAreaInput.svelte`, display settings | PocketRisu 1.10 already has one Standard/Wide/Full owner spanning cards, creator notes, composer, and theme presets; Haejeok uniquely adds 600px Small. Its global resize switch affects 105 generic-input instances. | **HJ01 Small admitted; HJ02 trigger-gated.** No second Personal width or global unbounded resize handle. |
| Message/plugin persistence ordering | `DefaultChatScreen.svelte`, `process/scriptings.ts`, `plugins/plugins.svelte.ts` | Ordinary BG sends already had a stronger canonical pre-save, but client-only sends, script clones, and plugin reload ordering retained gaps | **HJ04 admitted through a hidden patcher adapter.** Reuses lazy-chat strict save; does not import Haejeok SQL stores. |
| Native log exporter with media pipeline | `src/lib/LogExporter/`, `src/ts/logexporter/`, ffmpeg dependency | Chromium confirmed active-input/document-boundary defects; range identity, output wiring, MIME and frozen UMD media load are also unresolved | **Frozen HJ08 rejected.** Future stable-ID text range and visual/media are separate current-owner projects. |
| SQL message search and revision/database explorers | PostgreSQL full-text indexes, DB explorer components | Depends on the alternative relational backend and retains raw historical secrets without a lifecycle owner | **Separate backend/privacy project.** Do not call it qualified application restore/history. |
| Onboarding, mascot, branding, account removal, release plumbing | `WelcomeRisu.svelte`, `AirisuMascot.svelte`, release workflows, account removals | Product identity rather than a missing PocketRisu patch outcome | **Exclude.** |

## Direct overlap with current patch owners

### `lazy-chat-sync` and startup caching

Haejeok replaces the data model with relational tables, domain stores,
record-level revisions, paged messages, and multiple SQL backends. Our lazy
owner retains PocketRisu's SQLite/KV protocol and adds transport revisions,
CAS/rebase, a write journal, stable chat identity, and hydration barriers.
Stacking these implementations would create two sources of truth. HJ05 is
trigger-gated. If a measured problem later reopens one narrower outcome, it must be a
change inside the affected current lazy/render/asset owner rather than a
parallel message store.

The HJ SQL backend/client throws conflicts and failures, but final
Settings/Character/Message stores catch and normally resolve after clearing
pending state. HJ04 therefore contributes success-path ordering, not a durable
commit gate. The current adaptation remains admitted on its own strict-save and
L3 evidence.

### `bg-preserve`

Haejeok's Node compute branch moves deterministic preprocessing and vector
ranking, not provider execution or post-processing. It has no operation-keyed
generation result, lease, exact ACK, whole-pipeline cancellation, or cold
recovery. It therefore does not replace bg-preserve. HJ07 is trigger-gated; any
measured future client-only stage would have to compose around the BG request
snapshot and K11 Hypa delivery rather than copy the branch wholesale.

### Foreground import, CharX, and retired background-import evidence

Haejeok adds request-lifetime bulk file transport, server ZIP64 CharX export,
and streaming backup restore. The admitted graph keeps indexed CharX
validation, one foreground import lease, and server-confirmed persistence.
The former background-import audit demonstrates resumable verified offsets,
durable restart state, server preparation/commit, reconciliation, and ACK, but
device use found that upload path slower and less convenient, so it is absent
from the catalog and installers. The ZIP64 writer and bounded streaming
patterns remain useful references without reviving that experiment.

### Asset cleanup and persona ownership

Official PocketRisu 1.10 performs the destructive orphan decision on the
server and refuses deletion if its reference scan is not trustworthy. The
local persona pack extends that walker with every gallery image and folder
icon.

Haejeok computes orphan candidates in the browser from currently available
characters/modules/settings. `StorageExplorer/utils.ts` looks for nonexistent
`settingsStore.state.ensureCharacterDetails` rather than the real
`characterStore.ensureCharacterDetails()`, so lazy details are not loaded.
Deferred module/background/plugin references can also be absent. The server
deletes supplied keys without a canonical re-walk. This is a concrete
live-reference deletion path, not merely a theoretical fail-open difference;
the HJ analysis/delete implementation must not be used as an authority or
reference implementation.

### Build fence, backup, and restore safety

No Haejeok equivalent of the `x-client-build` authoritative-write fence was
found. Haejeok's recommended Docker backup stops the app, dumps PostgreSQL,
stops RustFS, and writes an encrypted restic snapshot. That is a coherent
offline deployment backup, but it does not replace the live PocketRisu
point-in-time source or the mandatory fresh rollback snapshot before each
destructive application restore.

Actual PG17 follow-up also confirmed replaced/deleted synthetic secret markers
remain in audit before/after rows after the live setting is gone. Revision
restore is SQL-only and does not restore an FS/S3 asset epoch. Docker/restic
restore itself remains unexecuted, so backup tooling must not be described as
qualified DR.

### Organizers and Personal settings

PocketRisu already owns name search, recent sort, chat metadata, and multiple
character views. `character-organizer` adds canonical order/folder membership;
`persona-organizer` adds persona folders, gallery assets, picker scope, and
referential cleanup. Haejeok's second character order/context-menu model must
not be stacked. Korean fuzzy matching and Small width were admitted through
those existing owners; global resize and aggregate low-spec presentation are
trigger-gated. HJ favorites/hidden/sort and session-level recent remain
unproven value hypotheses rather than duplicates.

### Parser and Kei capabilities

The frozen Haejeok `chatML.ts` still uses greedy Thoughts extraction. Its
tests still skip the terminal assistant marker, multiple Thoughts, and CBS
logical-precedence cases. Its OpenAI/Google stream paths still perform local
line splitting rather than using the replayable Kei SSE core. It also retains
the per-message `PartialEditController` and lacks the patcher's translation
cache panel, mobile-back guard, Kei manual-summary panel, and operation-aware
chat render adapters. Haejeok does not replace the admitted parser/Kei packs.

## Final numbered disposition

| ID | Outcome | Final state |
| --- | --- | --- |
| HJ01 | Small 600px chat width | Admitted through the native width owner and live-device qualified. |
| HJ02 | Global textarea resize | Trigger-gated; reject the frozen global handle. Reopen only for a named screen or explicit opt-in component need. |
| HJ03 | Korean-aware character matching | Admitted through the native catalog predicates and live-device qualified. |
| HJ04 | Persistence ordering | Admitted through the lazy/BG strict-save owner and live-device qualified. |
| HJ05 | Aggregate low-spec/paging/cache mode | Trigger-gated; portable slices require a measured owner problem and SQL compaction remains excluded. |
| HJ06 | Streaming CharX ZIP64 | Blocked; writer boundaries passed, but CRC-safe matching import/export policy is absent. |
| HJ07 | Node token/lore/vector offload | Trigger-gated; client benefit and shared-server responsiveness are unmeasured. |
| HJ08 | Full themed/media log exporter | Frozen implementation rejected; stable-ID text range and visual/media are separate future decisions. |

There is no active Haejeok implementation queue. See
[`HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md`](HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md)
for exact commits, measured owner intersections, design findings, reopen
triggers, and the mandatory gate order. `HAEJEOK-INTEGRATION-PLAN.md` records
the three admitted implementations and their receipts.

Bounded runtime observations and the 46-claim seven-axis matrix are in
[`POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md`](POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md).

## Limits

- This began as a source and Git-history audit. A bounded PG/Chromium/ZIP/test
  follow-up now exists, but it is still not Haejeok product qualification.
- Main-branch code was inspected at the pinned revision; future Haejeok commits
  require a delta audit from `e9d03568`.
- Direct-path counts are complete for the frozen revisions, but semantic
  behavior is claimed only where callers/tests were read as described above.
- Only the focused HJ04 persistence-ordering, HJ03 Korean-search, and HJ01
  Small-width adaptations documented in `THIRD_PARTY_NOTICES.md` are
  redistributed at this checkpoint; no other Haejeok subsystem or asset is
  included.
