# PocketRisu PageFold stable `v0.2.1` release receipt

Date: 2026-08-26 KST

## Outcome

`v0.2.1` retains the accepted stable `v0.2.0` exact-PocketRisu-1.10 graph and
promotes two additional resolved owners:

- visible `pagefold-model-preset`; and
- hidden `pagefold-bg-adapter` when bg-preserve is present.

The stable delivery surface remains one all-or-nothing installer, not partial
pack combinations. PageFold is an opt-in ModelPreset transform; old presets
remain off and an eligible explicit `on` request uses PDF from its first
request.

| Boundary | Observed value |
| --- | ---: |
| Requested roots | 14 |
| Effective roots | 13 |
| Resolved packs/adapters | 40 |
| Ordered units | 934 |
| Managed source paths | 340 |
| Deterministic ordering collisions | 13 |
| Verified / under-review / review-required | 40 / 0 / 0 |

The 13 inactive legacy, base, standard-storage, or superseded catalog entries
remain unverified on 1.10. Retired background import remains outside the
catalog and installers.

## Stable PageFold contract

- The selected Vertex or Google AI Studio Gemini ModelPreset remains provider,
  credential, endpoint, model, generation-parameter, and streaming authority.
- Existing presets default off. Main, sub, memory, translation, emotion, and
  other-aux bindings keep independent `inherit/on/off` overrides.
- Canonical input is the final post-replacer, request-trigger, reformater, and
  ordinary-conversion `AdapterChatMessage[]`, serialized as deterministic UTF-8
  JSONL and rendered server-side to PDF.
- Browser HTTP and BG in-process paths implement the same binary
  `PageFoldRenderPort`. BG operation/result/claim/ACK/cancel/no-resurrection
  ownership is unchanged.
- `preset.maxContext` remains source-plus-output assembly authority; known wire
  context is separate. PageFold-off keeps ordinary tokenizer, budget, request
  bytes, and fallback behavior.
- Image, tool, explicit-cache, unsupported adapter, and malformed credential
  combinations stop before provider work. Every admitted PageFold route
  forbids classic fallback and permits only bounded same-route retry.
- Request preview and SQLite logging retain usage/status/PDF MIME metadata but
  remove PDF Base64, canonical markers, API keys, access tokens, and private
  keys. No plugin array is written and no PageFold plugin secret/statistic is
  migrated.
- Service Account import is independent, bounded, direct-entry-only, and
  identifier-free in its success UI.
- Request status, model badges, and the dedicated PageFold detail tab expose
  bounded page/mode/source/wire/savings/cost metadata without pricing-evidence
  identifiers.

OpenRouter and non-Gemini adapters do not gain a PageFold PDF wire. Native
Vertex `gemini-3.7-flash` low remains the frozen paid semantic evidence cell;
other selected Gemini models retain Google PDF transport support without
inheriting that semantic label. Verbatim-copy and broader quality/cost
evaluation remain explicitly deferred follow-up work.

## Physical L3

The user reported all presented remaining PageFold scenarios normal and
explicitly authorized stable `0.2.1`. The physical scope includes the revised
preset UI, direct Service Account import/save placement, selected model
authority, request progress, model badge, dedicated PageFold detail tab,
savings label, removed pricing evidence, successful replies, and the presented
role/background/return flows.

Content-free production request-log evidence retained seven successful native
Vertex PageFold requests: IDs 5,886, 5,887, 5,889, and 5,891 through 5,894.
Each returned 200 with PDF MIME/redaction and prompt/output usage. ID 5,885
truthfully remains a 400 caused by the preset's unsupported
`THINKING_LEVEL_MINIMAL` setting before correction. HTTP success is not used to
claim every untested model's semantic quality.

## Automatic qualification

### Patcher and deterministic artifacts

- patcher source: 46/46 test files passed;
- primary and `all` compatibility installers: byte-identical;
- two consecutive builds: byte-identical;
- both artifacts: mode 0755, 7,847,429 bytes, CJS syntax-valid;
- both SHA-256:
  `a406e48ad8ffded50a7a6bc4a18cbb4204c1bae23f305ebb0e625c93b2426a9c`.

### Ordinary distributed-installer lifecycle

On a fresh clone of official PocketRisu `v1.10.0`, the generated stable
installer itself, without the maintainer qualifier, completed:

1. plan: compatibility `verified`, 40 packs, 934 units, 342 writes;
2. ordinary apply: passed;
3. status: 340/340 current managed paths, drift 0;
4. second plan: zero changed files, 340 skipped current paths;
5. ordinary revert: clean tracked source and no untracked source files; and
6. ordinary reapply: passed.

### Patched target

- frozen offline install: 493/493 packages reused, zero downloaded;
- frontend: 151/151 files and 1,731/1,731 tests passed;
- server: 22/22 files, 232 passed and 12 explicit provider-gated skips;
- compatibility: ten files passed, one environment-dependent file skipped,
  74 tests passed and five skipped;
- Svelte diagnostics: 0 errors and 0 warnings;
- help audit: 439 English / 439 Korean keys, zero missing Korean keys and 37
  existing unreferenced warnings;
- production client: 7,940 modules transformed;
- BG bundle: 8,844,679 bytes, SHA-256
  `54a190b0cb3da64fa2d7e05c6aea0ec38fd12726267998791fa20fa815b77c17`,
  `sendChat=function` before production prune;
- production prune and post-prune dependency/BG load: passed; and
- final plan: verified 40 packs / 934 units / 340 skipped paths / zero changed
  files / 13 collisions.

## Live stable metadata application

The experimental.26 live tree already contained byte-identical stable runtime
source. The ordinary stable plan therefore named only
`save/pocketrisu-patches/state.json`; all 340 managed source paths were current.

The first preflight found PM2 online at restart count 6, unstable restarts 0,
native running/pending 0, BG active/result 0, and 149 delivered BG states. Four
SQLite databases returned `quick_check=ok`. A second read found a new BG
operation and payload, so application waited without cancellation or ACK. That
operation naturally reached delivered 150 with payload 0 before the metadata
write.

The stable transaction changed only patch state. It did not stop, rebuild, or
restart PocketRisu and did not write runtime source, intent, user databases, or
BG payload/state. Immediate readback reported:

- compatibility `verified`, 40 packs / 934 units;
- status 340/340 current, drift 0;
- next plan zero changed files / 340 skipped paths;
- under-review 0 / review-required 0;
- PM2 still online, restart count 6, unstable restarts 0;
- root and main asset HTTP 200;
- served/local `index-CUGfscHE.js` both 2,047,743 bytes and SHA-256
  `a42018fd3336351a5214f1bf87e79eb1d7268db192143cb2cb6ebdf7d4516eb8`;
- served/local build stamp
  `1.10.0-347e425225d1cece027bf0b8eccd13bb2fae595bad6c8bf32ab886909a496c96`;
- four post-apply SQLite `quick_check=ok` results; and
- unchanged main/model/request/import DB inode-size pairs and unchanged intent
  inode/size.

More user BG requests arrived during readback and naturally finished at 152
delivered states with active/result 0. Request logs moved from 3,931 / max ID
5,904 / usage 5,257 to 3,934 / max ID 5,907 / usage 5,260. The PM2 error log
grew 78,792 bytes during that concurrent activity. Its content-free delta
classification contains PageFold 0, patch/state/version 0, credential terms 0,
regex terms 78, and tokenizer terms 18. This concurrent runtime growth is
disclosed rather than falsely reported as a zero-byte release delta.

No operation or user data was cancelled, deleted, claimed, or rewritten by the
stable metadata application.

## Release boundary

- Stable support is exact official PocketRisu `1.10.0`; later versions start
  fail-closed review.
- The accepted residuals in the `v0.2.0` receipt remain accepted residuals and
  are not turned into new physical passes by PageFold admission.
- Source provenance and `THIRD_PARTY_NOTICES.md` boundaries are unchanged. The
  supplied PageFold 0.1.1 artifact remains behavioral-reference-only.
- The public update feed remains disabled. Distribution is the private
  annotated tag, non-prerelease GitHub Release, and two attached installers.

The annotated `v0.2.1` tag and non-draft/non-prerelease GitHub Release close
publication after the release commit's `patch-integrity` workflow succeeds.
