# Haejeok remaining-candidate design audit

> Decision date: 2026-08-24 KST
>
> Target: official PocketRisu `v1.10.0` (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`)
>
> Complete patch baseline: `0.2.0-experimental.21`, 38 resolved packs/adapters,
> 769 exact-target units, and 280 managed source paths
>
> Haejeok source: `e9d035683cdf9f0207eed193ee36f9bdb117f658`

## Reconciled decision

The current Haejeok integration is complete with these three admitted outcomes:

- HJ04 persistence ordering;
- HJ03 Korean-aware character matching; and
- HJ01 Small 600px chat width.

HJ02, HJ05, HJ06, HJ07, and HJ08 are not queued implementation work. Their
frozen Haejeok implementations are not suitable additions to the current
all-or-nothing PocketRisu 1.10 graph, but their states are not identical:
HJ02/HJ05/HJ07 are trigger-gated research, HJ06 is blocked by a coherent
round-trip boundary, and frozen HJ08 is rejected. Reconsideration requires the
concrete trigger below and a new design review; it does not resume an approved
implementation plan.

This conclusion leaves the `0.2.0-experimental.21` installer, live PocketRisu
source, pack counts, and generated artifact bytes unchanged. The audit changes
planning and provenance records only.

## Review method and completeness boundary

The review used the pinned source rather than commit subjects alone:

1. every remaining numbered candidate commit was resolved and its final callers
   and tests were read;
2. the union of its source paths was intersected with the current complete
   patch graph;
3. native PocketRisu 1.10 and the composed `.21` target were checked for the
   same outcome and existing authority;
4. data round trips, cancellation, authentication, resource bounds, mobile
   behavior, and all-or-nothing delivery cost were reviewed; and
5. adjacent unnumbered Haejeok clusters were classified so that closing the
   numbered queue does not hide another candidate.

Path overlap is a collision surface, not proof of equivalent behavior. A
non-overlapping file can still compete for the same data or policy, while a
shared path can sometimes be composed through one existing owner.

## Final disposition matrix

| ID | Frozen Haejeok outcome | Decision for the current patch line | Reopen trigger |
| --- | --- | --- | --- |
| HJ02 | One global switch adds a drag handle to every generic `TextAreaInput` | **Trigger-gated; reject the global design.** It has unbounded geometry, incomplete pointer/a11y lifecycle, no per-call opt-out, and no tests across 105 current component instances. | A user identifies a specific screen whose fixed textarea height blocks real work. Reconsider only that screen or an explicit opt-in component prop. |
| HJ05 | Low-spec mode combines smaller render windows, SQL-backed message compaction, thumbnails, cache limits, and switch/load refactors | **Trigger-gated; reject the aggregate design.** Its main memory win depends on Haejeok's relational domain stores, while portable slices need owner-specific measurements. | A repeatable device problem remains after testing the existing initial/additional message settings, with before/after DOM, memory, image, and interaction evidence. |
| HJ06 | Server streams CharX ZIP/ZIP64, including JPEG-prefixed output | **Blocked, not writer-invalid.** Actual 4 GiB+1 and 65,536-entry writer archives passed Info-ZIP, but HJ import accepted bad CRC and keeps a 50-MiB entry limit. | A valid current failure and one matching export/import integrity and size policy are established together. |
| HJ07 | Browser callers offload token counts, lore matching/resolution, and vector ranking to Node HTTP routes | **Trigger-gated; reject unmeasured frozen offload.** Ordinary UI generation already executes the whole pipeline on the server; remaining client-only benefit and shared Node responsiveness are unmeasured. | A client-only generation path, separated from ordinary BG orchestration, shows a repeatable preprocessing bottleneck and a prototype demonstrates lower end-to-end cost without event-loop regression. |
| HJ08 | Full themed log exporter, image stitching, media conversion, and message-range export | **Reject the frozen implementation.** Chromium confirmed active-input and document-boundary defects; range identity, edit/theme/MIME wiring, and UMD media loading also fail admission. | A user explicitly requests a stable-ID TXT/Markdown range export or separately requests a visual/media product. These are different projects. |

No remaining HJ item is a stable-release gate for `.21`. Stable publication is
still governed by the broader exact-1.10 catalog qualification, not by an
inactive Haejeok research set.

## Measured ownership overlap

The commit-union measurements below were recomputed against the complete
`.21` resolution rather than copied from the older pre-HJ graph.

| ID | Frozen commit-union paths | Current managed intersections | Principal current owners at the intersections |
| --- | ---: | ---: | --- |
| HJ02 | 6 | 5 | K16 mobile navigation/hotkeys, HJ01 width, Personal settings, shared database/language owners |
| HJ05 | 87 | 23 | lazy chat, BG, K14 render, K15 partial edit, import/CharX, parser, translator, Personal settings, backup/fence/server owners |
| HJ06 | 13 | 4 | server composition, character import/CharX integrity, backup/restore, global API and lazy/BG persistence |
| HJ07 | 45 | 9 | BG, lazy chat, client build fence, tokenizer/process, K11-related memory behavior, shared database and Vite owners |
| HJ08 | 30 | 7 | K14/K15 chat render, BG/default chat, Personal select UI, build fence/Vite, and dependency/lockfile owners |

The most important consequence is that HJ05, HJ07, and HJ08 cannot be isolated
as harmless leaf UI patches. Each crosses hosts that already coordinate
storage, generation, rendering, or build identity.

### Exact managed-path intersections

HJ02 intersects:

```text
src/lang/en.ts
src/lang/ko.ts
src/lib/UI/GUI/TextAreaInput.svelte
src/ts/setting/displaySettingsData.svelte.ts
src/ts/storage/database.svelte.ts
```

HJ05 intersects:

```text
server/node/server.cjs
src/App.svelte
src/lang/en.ts
src/lang/ko.ts
src/lib/ChatScreens/Chat.svelte
src/lib/ChatScreens/DefaultChatScreen.svelte
src/lib/SideBars/CharConfig.svelte
src/ts/bootstrap.ts
src/ts/characterCards.ts
src/ts/characters.ts
src/ts/drive/backuplocal.ts
src/ts/globalApi.svelte.ts
src/ts/hotkey.ts
src/ts/parser/parser.svelte.ts
src/ts/plugins/apiV3/v3.svelte.ts
src/ts/plugins/plugins.svelte.ts
src/ts/process/files/multisend.ts
src/ts/process/index.svelte.ts
src/ts/process/modules.ts
src/ts/process/processzip.ts
src/ts/storage/database.svelte.ts
src/ts/stores.svelte.ts
src/ts/translator/translator.ts
```

HJ06 intersects:

```text
server/node/server.cjs
src/ts/characterCards.ts
src/ts/drive/backuplocal.ts
src/ts/globalApi.svelte.ts
```

HJ07 intersects:

```text
server/node/server.cjs
src/lib/ChatScreens/DefaultChatScreen.svelte
src/ts/globalApi.svelte.ts
src/ts/process/index.svelte.ts
src/ts/process/scripts.ts
src/ts/storage/database.svelte.ts
src/ts/storage/nodeStorage.ts
src/ts/tokenizer.ts
vite.config.ts
```

HJ08 intersects:

```text
package.json
pnpm-lock.yaml
src/lib/ChatScreens/Chat.svelte
src/lib/ChatScreens/Chats.svelte
src/lib/ChatScreens/DefaultChatScreen.svelte
src/lib/UI/GUI/SelectInput.svelte
vite.config.ts
```

The path lists are exact for the frozen commit groups and the current `.21`
resolution. Owner identities can change on a future target, which is why every
reopen starts by recomputing this intersection.

## Bounded runtime follow-up

The independent source review and subsequent runtime pass are recorded in
[`POCKETRISU-HAEJEOK-FEATURE-COMPARISON-INDEPENDENT-REVIEW.md`](POCKETRISU-HAEJEOK-FEATURE-COMPARISON-INDEPENDENT-REVIEW.md)
and
[`POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md`](POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md).
They add the following decision-relevant observations:

- default Haejeok tests fail on the declared-compatible Node 25 environment at
  the localStorage harness boundary; the diagnostic Web Storage-off run reaches
  503 passed / 17 skipped, while check/build complete;
- actual PostgreSQL 16/17 shipped integration runs are 10/14 because the test
  file is stale against the final v3 contracts; a diagnostic fixture aligned to
  those contracts is 14/14 on both majors;
- Settings/Character/Message failure injection confirms success-path ordering
  is not a durable retry/generation gate;
- actual PG17 retains replaced/deleted synthetic secret markers in audit
  before/after rows;
- actual Chromium confirms HJ08 input/document-boundary failures and its frozen
  UMD ffmpeg URL fails where an ESM control loads; and
- actual HJ ZIP writer passes true 4 GiB+1 and 65,536-entry Info-ZIP probes,
  while the actual HJ importer accepts a bad-CRC entry.

These results narrow the candidate states; they do not qualify Haejeok as a
whole product or create a new implementation queue.

## HJ02 — global textarea resizing

### Frozen source

- `70ff40f2ba47becaa5d3371c7543faac3ea1dc5e`: global display setting;
- `97771e17df4687661cf392f10aaca51a847138fb`: custom pointer handle; and
- `13d5ec632a145349dd5ee31fddec667d732091e4`: `preventDefault()` on pointer
  start.

Merge `a17e138f` carries this line into Haejeok `main` but adds no independent
feature diff, so it is ancestry evidence rather than another source change.

The final Haejeok implementation adds one `resizeTextarea` database flag and
renders the same handle in the generic `TextAreaInput.svelte`. Pointer movement
writes an unbounded inline pixel height directly to the component root.

### Why the frozen design is rejected

The current composed target contains 105 `<TextAreaInput>` instances across 32
files. They include highlighted/contenteditable editors, read-like playground
outputs, prompt and script editors, character fields, settings wrappers, and
K15 partial editing. The component also owns the K16 popup-editor hotkey and a
new action bar. A global switch therefore changes substantially more than the
chat composer or one long-form editor.

The Haejeok handle has no minimum or viewport maximum, no keyboard operation,
no `tabindex` or orientation semantics, and no `lostpointercapture` or
component-destroy cleanup. It reuses the literal `id="resize-handle"` for every
mounted instance and exposes no per-call opt-out. Its tests touch none of the
six changed source paths. These are design omissions rather than anchors that
can be repaired by copying the patch and adding one clamp.

### Reopen design, if a concrete screen requires it

A future request must name the screen and desired persistence lifetime. The
smallest acceptable design is an explicit component/call-site opt-in with:

- one owner for the affected screen rather than a database-wide toggle;
- min/max bounds derived from the screen and viewport;
- pointer capture release, `lostpointercapture`, cancellation, and unmount
  cleanup;
- keyboard resizing and correct separator semantics when a visible handle is
  used;
- reset behavior when layout, orientation, or fullscreen mode changes; and
- tests for highlighted and plain inputs plus the affected K15/K16 path.

That would be a new owner-local feature inspired by the desired outcome, not
admission of HJ02 as implemented by Haejeok.

## HJ05 — low-spec mode, paging, and cache policy

### Frozen source

The reviewed sequence is:

- `14be158420bc14ba9e1c2de4cad6275092ebdf1f` — domain-store paging and
  compaction foundation;
- `9c5ef6051d3842d86e7986bf68dbcc1405aadedc` — constrained-device message
  retention;
- `9021c009b3c1ba6947d4de5cfd4c0bb1debdd73e` — cached sidebar and character
  selection loaders;
- `0c6d67caa69861d2b637cccd66a77882d35cc987` — character-image preload;
- `92770ab258a666323d7362afaec7f3e4b25b19ff` — dynamic imports and cache
  management;
- `4a3d55ada490ada6f0aef859b4daba1eecdcbbce` — responsive character switching;
- `c1067fcbf459a0fbf2cecd29100c31df2ea14fac` — reduced switch rendering work;
- `6ef9592ed3954c6b18f387a9527b542a0a7f096d` — constrained-device startup work;
  and
- `e48296e3ff5601366379e41ae491de41ba38b047` — explicit low-spec policy.

At the frozen tip, ordinary/low-spec initial render counts are 12/4 and
additional counts are 8/6. Active-chat message retention is 200/40. Inactive
chat arrays can be released and later paged from SQL. Low-spec mode also asks
for thumbnails, smaller URL/cache limits, and a smaller reroll history.

### Current authority and non-equivalence

PocketRisu already exposes `chatLoadInitialPages` and
`chatLoadAdditionalPages` in Accessibility settings. Their current defaults
are 30 and 15, and a user can set 4 and 6 without another mode or database
field. This controls mounted message components; it is the portable part of
the Haejeok result.

The larger Haejeok memory reduction is not portable in isolation. Its
`MessageStore` commits each message to a relational backend, drops active or
inactive arrays, and calls SQL range loaders on demand. The local lazy-chat
owner instead keeps inactive chats as identity-bearing stubs/placeholders and
hydrates the selected chat through a full-chat CAS/delta protocol. Its current
`/api/chat-content` contract is not a message-range store. Adding Haejeok
compaction on top would create a second partial-chat authority and could make
generation, strict saves, conflict rebase, K14 streaming identity, or K15 edit
identity operate on an incomplete message array.

Other frozen parts are not direct matches either:

- Haejeok's thumbnail path depends on its alternate asset manager. PocketRisu
  has a direct cached asset endpoint and a focused inlay-thumbnail route, but
  does not expose the same character-thumbnail contract.
- Haejeok's temporary `rerolls` history is not the current PocketRisu 1.10
  swipe owner.
- Cache eviction is safe only when the owning URL/blob lifecycle is known.
  Applying one generic `BoundedCache` to current parser and asset maps could
  revoke a URL still rendered by K14, K15, translation, or an export surface.
- The commit union modifies 87 paths and intersects 23 current managed paths;
  it is not one low-risk settings toggle.

The sequence touches 13 test files, principally SQL data sessions/adapters,
message pagination, bounded cache, image/selection loaders, and deferred token
calculation. That is meaningful coverage for Haejeok's own architecture, but it
does not test PocketRisu lazy-chat CAS/rebase, BG snapshots, K14/K15 identity,
or physical iPhone memory behavior after composition.

### Reopen protocol

HJ05 stays closed until there is a measured problem. The first experiment is
to lower the existing two render settings on the affected device and compare
the same chat, asset set, and navigation sequence. A reopen report must
separate at least:

- mounted chat DOM cost;
- active message-object cost;
- decoded image/network cost;
- character/sidebar switch work; and
- parser/blob cache growth.

Only the failing owner may then change. Possible independent projects are:

1. a PocketRisu-native character-thumbnail read path with URL identity,
   invalidation, and original-image fallback;
2. owner-specific cache limits with exact blob revocation tests; or
3. a range-aware lazy-chat protocol, but only if it carries stable message
   identity, full generation snapshots, CAS/rebase, strict-save, conflict,
   scroll-anchor, K14 streaming, K15 edit, translation, and exact revert
   contracts.

These projects must not be hidden behind one `lowSpecMode` switch, and the
third is a storage-protocol redesign rather than a presentation patch.

## HJ06 — streaming CharX ZIP64

### Frozen source

- `eed465f8d3db130a5655040c8c5f914227e7be26`: streaming asset reads, a
  stored-entry ZIP/ZIP64 writer, and server CharX export jobs; and
- `a7fa3ee2cced59429801dba19a8a1c5703a63ea0`: correct ZIP offsets after a
  streamed JPEG prefix plus related backup/asset work.

The writer uses `BigInt` offsets, CRC-32, data descriptors, ZIP64 extras,
central-directory records, backpressure, and declared-size checks. It retains
central metadata but does not buffer entry bodies.

### Why export-only ZIP64 is rejected

The current PocketRisu full backup is a streaming framed `.bin` format, not a
ZIP. Haejeok's ZIP64 writer therefore does not repair the backup frame's
per-entry 32-bit boundary. Treating HJ06 as a generic “over 4 GiB backup fix”
would target the wrong format.

The relevant current format is CharX. Its importer intentionally caps:

- one uncompressed entry at 50 MiB;
- archive entries at 65,535;
- selected uncompressed payload at 1 GiB; and
- JPEG prefix and retained extraction buffers at 50 MiB.

A server exporter that succeeds beyond 4 GiB would consequently create a file
that the same PocketRisu build refuses to import. Export capability without an
agreed import/support boundary is not a complete outcome.

The frozen route also depends on Haejeok's alternate `assetStorageManager` and
places the Risu auth value in a download query string. It limits pending jobs
and inline metadata, but has no explicit archive-entry or declared-total-byte
policy. Its three focused writer tests cover a small valid archive,
declared-size overflow, and a four-byte JPEG prefix; they do not force a ZIP64
entry size, central offset, or entry count.

The bounded runtime follow-up closes that writer-test gap for two boundaries:
an actual 4 GiB+1 stored entry and an actual 65,536-entry archive both passed
Info-ZIP 6.00. It does not close the product boundary. The frozen
`CharXImporter` accepted and forwarded a bad-CRC STORE asset that Info-ZIP
rejected, and it retains the 50-MiB per-entry limit. Writer validity and
same-build round-trip support therefore remain different claims.

### Reopen design

A future archive project begins with the supported round trip, not the writer:

1. reproduce the exact current export failure and identify whether it is an
   entry-size, central-offset, count, memory, or browser-download boundary;
2. choose matching export and import limits, including whether individual
   assets over 50 MiB are supported;
3. add pure boundary tests for 32-bit size, 32-bit central offset, 65,535-entry
   transition, JPEG prefix, CRC mismatch, duplicate/path overlap, truncated
   input, and disconnect;
4. bind a one-use download capability to the authenticated session instead of
   putting the reusable auth credential in the URL;
5. cap entry count, inline bytes, declared aggregate bytes, concurrent jobs,
   and retained central metadata; and
6. stream import and export through the existing CharX integrity/foreground
   import owners with cancellation, terminal persistence, and iPhone file
   round-trip tests.

If a full-backup entry later exceeds its own frame limit, that requires a
separately versioned backup-format migration with old-reader detection. HJ06
must not be used as its proxy.

## HJ07 — Node token, lore, and vector compute

### Frozen source

- `3be25916ba66ae82386979664094c064b7d8327c`: token counting and batched lore
  matching;
- `b54922a9af9936fc95c92e1cbc2ed0624af72d02`: recursive lore resolution and
  vector index/search;
- `570b4d09ddbf1469c0384c1ebe67152863a91ed8`: generation hydration and memory
  processing changes; and
- `e2a3e96418f1a666b8f6e2a0b215ec0203b26591`: runtime/bundle refinements.

Merge `8a5d6480` is the branch integration point and adds no separate candidate
behavior beyond those four commits.

The routes authenticate callers and include several useful bounds. Token input
is limited to 4,096 texts and 32 MiB. Lore input is capped at 10,000 messages,
4,096 match requests, or 10,000 resolve entries. Vector indexes are auth
scoped and limited to 32 indexes, 100,000 vectors per index, 8,192 dimensions,
128 MiB per index, and 256 MiB total by default. Browser fallbacks remain for
unsupported tokenizers and lore directives.

### Current overlap and risk

Ordinary top-level PocketRisu sends already delegate ax, main generation, and
post-processing as one server operation. That server bundle performs token,
lore, and memory preprocessing without a browser-to-server compute round trip.
The remaining browser-owned sends are deliberately exceptional: reroll and
continue replace/append semantics, programmatic blocking loops, previews,
fallbacks, and TTS/emotion/image epilogues. No measurement shows their
preprocessing to be the limiting cost.

The frozen NodeStorage clients use direct `fetch()` calls without the caller's
abort signal or the current composed request helper. Moving user regex and
large lore/vector loops into synchronous Node handlers also moves a tab-local
stall into the shared server event loop. The general authenticated limiter is
20,000 requests per minute, lore text has no aggregate character budget beyond
the general JSON-body limit, vector search does not cap query count, and regex
matching has no worker timeout. Vector indexes are intentionally process-memory
only, so a restart causes a full warmup.

The commit union touches 12 test files. Its focused compute coverage includes
token counts, lore match/resolve examples, vector revision/ranking,
server-lore preparation, and vector signatures; the other touched tests cover
the surrounding Haejeok SQL/storage refactors. There is no differential corpus
proving browser/server parity across every directive, model/tokenizer, K11
dimension/revision case, cancellation point, and BG/client execution host.
Adding the routes now would increase authority and availability risk without a
demonstrated user outcome.

### Reopen design

Only a measured client-only path can reopen HJ07. Ordinary BG sends must be
excluded from the baseline so their already-server-side work is not counted as
an offload gain. Admission then proceeds independently:

1. supported tiktoken counts;
2. non-recursive lore matching;
3. recursive lore resolution; and
4. vector ranking/index reuse.

Each stage must beat its browser baseline in end-to-end observation, not just
report faster server compute. It also requires:

- one shared pure semantic core or differential browser/server tests;
- caller `AbortSignal`, timeout, bounded concurrency, and worker isolation for
  regex/CPU-heavy work;
- aggregate text, query, entry, dimension, and memory limits that fail before
  expensive allocation;
- authenticated scope, no sensitive request-body logging, and exact
  revision/model/dimension isolation;
- direct in-process use by the BG bundle rather than loopback HTTP where
  appropriate; and
- browser/custom/local-provider fallback with identical output and no second
  generation snapshot authority.

Failure to show a net client-only improvement closes that stage; it does not
justify continuing to lore or vector work.

## HJ08 — themed log and media exporter

### Frozen source

The reviewed line is:

- `7a7c7222424fd6afa68e068fc21b82aef838da4a` — initial 4,289-line, 27-file
  native exporter and ffmpeg media pipeline;
- `05e6019e681f40cc7e80c34a4e2f79e92ec41226` — HTML scale handling;
- `5db46bde57e6983a4f80d811aa0f4fd5339f8875` — modal styling plus an unrelated
  development-script change;
- `904f6b77f7c6035c96e64030903356e20c69da60` — native chat-component HTML
  rendering and the three focused tests;
- `1038aa02f51ef6f28d2b121c5532174959ce7068` — first-message inclusion; and
- `f9a32cb7224bb50f18ad51e777011b60f618a2e1` — modal/settings/theme redesign.

Together they change 30 union paths and add range/single-message entry points,
native chat-component rendering, first-message handling, themed UI, image
splitting/stitching, and WebM conversion.

The final dependency surface adds `@ffmpeg/ffmpeg` and `@ffmpeg/util` and
downloads `@ffmpeg/core` JavaScript and WASM from unpkg at runtime. It reuses
the already-present `html-to-image` library.

### Duplicate and distinct outcomes

PocketRisu already exports a hydrated chat as JSON, text, standalone HTML, or
HTML clipboard content. It also has a current-chat image capture path. HJ08's
distinct outcomes are therefore the themed editor, per-message/range entry
points, replacement rules, media embedding/conversion, and tall-image
stitching—not “chat export exists.”

The full Haejeok renderer is not an acceptable price for the small range
outcome. It mounts the complete native `Chats.svelte` tree offscreen and
touches K14/K15 chat hosts. It inserts rendered HTML and user custom CSS into
an export document, fetches remaining image URLs, and runs a large media
pipeline. These can be valid features, but they require explicit sanitization,
remote-resource, memory, cancellation, and iOS download review.

Only one test file with three cases is added. It checks offscreen completion
and basic HTML generation; it does not exercise image capture, split/stitch,
ffmpeg loading or failure, WebM conversion, range identity, full hydration,
large chats, cancellation, hostile markup/CSS, remote assets, offline use, or
iPhone output. The ffmpeg packages and lockfile surface would ship in every
complete installer, while opening the feature would additionally depend on a
versioned CDN URL with no shipped integrity/self-hosting contract.

The later Chromium follow-up observed the omitted boundaries rather than
clearing them: `notrim` active attributes reached the final MessageContent DOM,
custom CSS escaped the standalone style boundary, offline/CSP media loads
failed, and the frozen `dist/umd` core path failed to import after successful
CDN responses. An otherwise matching `dist/esm` diagnostic loaded. Numeric
range identity, edit/theme wiring, fake message splitting, `.webp`/PNG MIME
mismatch, and the zero-caller WebM symbol remain independent defects.

### Reopen split

An explicit range/single-message request should become a small extension of
the existing `exportChat` owner. It must reuse stable chat/message indexes,
hydrate exactly once, define whether the greeting is included, preserve full
JSON import semantics, and add only the necessary chat/menu affordance. It
must not bring in the Haejeok renderer, ffmpeg, or CDN.

A themed/image/media exporter is a separate product decision. It needs its own
owner and must first choose a pinned, licensed, offline-capable media delivery
contract; bound full-chat hydration and offscreen rendering; preserve K14/K15
identity; sanitize exported markup/styles; constrain remote-resource fetching;
and test large/split output, cancellation, and physical iPhone save/open. It is
not implicitly approved when range export is requested.

## Adjacent Haejeok clusters: no hidden remaining candidate

The 173-commit Haejeok delta was also checked for work adjacent to the five
numbered candidates.

| Cluster | Final classification |
| --- | --- |
| PostgreSQL, Oracle, Azure SQL, Web/Tauri SQLite, domain stores, revision/commit layers | Outside this patch line. They replace the PocketRisu SQLite/KV and lazy-chat authority and require a separately approved backend migration. |
| S3/RustFS/Azure asset manager, storage explorer, generic asset delete | Outside this patch line. The storage authority conflicts, and browser-selected deletion does not satisfy the current server-authoritative fail-closed reference walker. |
| SQL database explorer, full-text message search, SQL revisions | Separate relational-backend projects. Actual PG17 confirms row history works on corrected fixtures but also confirms deleted secret markers remain; retention/redaction/privacy deletion and asset consistency are mandatory. |
| Character recent/favorite/hidden/order models and alternate catalog shell | Favorites/hidden/sort and session-level recent are real source gaps, but cleanup, top-50 pre-search, empty unloaded snippets, privacy and user value remain unresolved. Only the HJ03 match predicate is admitted; X01/X02 are inactive hypotheses. |
| Bulk backup/restore transport | The current PocketRisu owner already streams its application backup and has stronger point-in-time/restore-safety composition. Format-specific size limits remain with their own owners. |
| Parser/stream splitting fixes | Current parser hardening and Kei replayable SSE behavior are distinct or stronger; no Haejeok replacement is needed. |
| Background generation and request logging | Whole-pipeline BG preservation, result claim/ACK, cancellation, cold recovery, and current request/BG diagnostics already own these outcomes. |
| Startup/cache, character-switch, and generation-hydration refactors | Any distinct performance outcome is covered by the HJ05 or HJ07 measurement boundary; broad fork refactors are not candidates by themselves. |
| Onboarding, mascot, branding, account removal, updater/release plumbing | Product identity and deployment policy, not missing PocketRisu patch outcomes. |

The unmerged Haejeok `feature/asset-manager` branch remains outside the frozen
review. A future Haejeok `main` update requires a delta audit from `e9d03568`;
it does not reopen any closed item automatically.

## Cross-candidate composition rules

If a closed outcome is later reopened, the following ordering is mandatory:

1. rebase the candidate analysis onto the then-current PocketRisu target and
   complete patch graph;
2. admit only one measured owner outcome at a time so performance and
   regression evidence are attributable;
3. keep feature and receipt commits separate even though the generated
   installer remains all-or-nothing;
4. run focused owner composition before the complete graph;
5. prove zero-change re-plan, exact clean-target revert, and reapply;
6. run target tests, Svelte diagnostics, client build, server bundle load,
   owner-specific resource/cancellation tests, and L2.5; and
7. apply live only through the complete installer after read-only active-work
   preflight, then run a concrete physical-device L3.

HJ05, HJ07, and HJ08 all intersect chat runtime hosts and must never be
developed as one “performance/export” batch. HJ06 shares CharX, backup, server,
and global API owners and must establish its round trip before composition.
HJ02 must remain screen-local if it is ever reconsidered.

## Resulting execution plan

1. Treat HJ01/HJ03/HJ04 in `0.2.0-experimental.21` as the complete current
   admitted Haejeok feature scope.
2. Keep HJ02/HJ05/HJ07 trigger-gated, HJ06 blocked, and frozen HJ08 rejected;
   none belongs to an active integration queue.
3. Keep all five source clusters, runtime counterexamples and reopen gates as
   research evidence; add no manifest, dependency, generated artifact, or live
   source change now.
4. Continue broader PocketRisu 1.10 qualification independently. Do not block
   it on a closed HJ item and do not publish a stable release merely because
   the HJ review is complete.
5. When a reopen trigger occurs, write a fresh owner report and obtain design
   approval before implementation. Update provenance and third-party notices
   only if code or focused structure is actually adapted.

This plan deliberately distinguishes an all-or-nothing **delivery** from a
monolithic implementation. Internal owner packs and separate feature commits
remain necessary for collision detection, exact revert, and regression
isolation even though users cannot select combinations.
