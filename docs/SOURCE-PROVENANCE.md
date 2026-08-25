# Source and idea provenance

This ledger distinguishes redistributed/adapted code from design references.
A repository appearing here does not mean its whole fork or policy was copied.
Exact adapted paths remain documented in `THIRD_PARTY_NOTICES.md` and the
feature validation receipts.

## Upstream and adapted-code sources

| Source | Frozen basis | Use in this repository | License / attribution boundary |
| --- | --- | --- | --- |
| [RisuAI](https://github.com/kwaroran/RisuAI) | Ultimate ancestry of PocketRisu, Kei, and Haejeok | Ecosystem/upstream context. Current patch payloads target PocketRisu rather than a floating RisuAI tree. | GPL-3.0 upstream heritage; no claim that later RisuAI changes are local work. |
| [PocketRisu](https://github.com/PocketRisu/PocketRisu) | `v1.8.1` `63832a1`, `v1.9.0` `85a65f3`, `v1.10.0` `98e9683` | Exact patch baselines and modified source payloads. | GPL-3.0. PocketRisu remains the target authority. |
| [PocketRisu PR #49](https://github.com/PocketRisu/PocketRisu/pull/49) | Revision/path set frozen when startup/lazy storage was adapted | Startup cache, chat delta/CAS, write journal, hydration, plugin access, and conflict reconciliation foundations. | PR author at adaptation: `universebaby1020`; GPL-3.0 through PocketRisu. Local semantic revisions are separately identified. |
| [PocketRisu Kei](https://github.com/seto-sama/PocketRisu-Kei) | `cc1d1b195babd887577ebf943d5e82f01f58135c` | Focused viewer, SSE parser, stream render, mobile navigation, partial edit, Hypa tools, translation tools, and narrow compatibility/safety outcomes. | GPL-3.0. Exact adapted paths are in `THIRD_PARTY_NOTICES.md`; excluded Kei branding, broad rewrites, and Revenant are not claimed. |
| [Haejeok RisuAI](https://github.com/nevaeh5379/HaejeokRisuai) | `e9d035683cdf9f0207eed193ee36f9bdb117f658` / `b6254` | HJ04 adapts focused message/plugin persistence ordering from `0fd90fcf`, `23bb7437`, `313ecdff`, and `3b5b3d39`. HJ03 adapts Korean character matching from `86ee613c` and `1e5f9eee`. HJ01 adapts the missing Small 600px chat-width outcome from `0243d078`. HJ02 resize, HJ05 low-spec/paging, HJ06 ZIP64, HJ07 Node compute, HJ08 log export, SQL/domain storage, object storage/explorer, and product/operational changes remain research references rather than copied code. | GPL-3.0. HJ04 uses the stronger PocketRisu lazy-chat/BG strict-save owner; HJ03 keeps native catalog order; HJ01 extends the native width setting. HJ02/HJ05/HJ07 are trigger-gated, HJ06 is blocked, frozen HJ08 is rejected, and architecture/product clusters remain separate. Exact adapted paths are in `THIRD_PARTY_NOTICES.md`; evidence is in the comparison/runtime documents and future execution is bounded by `HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md`. |

## Design and reference sources

| Source | Frozen basis | Ideas reviewed or adapted | Current boundary |
| --- | --- | --- | --- |
| [`rhplus0831/PocketRisu` `serve`](https://github.com/rhplus0831/PocketRisu/tree/serve) | Build fence `3e65d76e4768b87156ba4dd93b2c954fe34cc784`; point-in-time source line from `f3efd3b1b03a9773a9121802ed3f95e8088d3353` through `3e758f9a4c95e9c18d4a9d428c85ded148cbf7ba` | Client/server build admission and pinned backup-source concepts. | GPL-3.0 reference. Local packs were rebuilt around BG, lazy storage, Kei, purge, and restore owners; the fork is not imported wholesale. |
| User-supplied PageFold plugin artifact | `0.1.1`; SHA-256 `8291b14f7330e8e4fa0438ea12d1e8f125073945d817fe74693fe9030891ef77` | Behavioral observations of dense PDF transcript delivery, the two hierarchy modes, direct provider request shapes, and renderer constraints. | Behavioral reference / independent implementation only. The artifact identifies no author, source repository, or license. No PageFold-owned source text or bundled vendor code is copied, and no upstream endorsement is claimed. |

## Independently selected PageFold renderer inputs

The PageFold integration obtains its implementation dependencies and fonts from
their authoritative distributions rather than extracting them from the supplied
artifact:

- `pdf-lib` `1.17.1`, MIT, npm integrity
  `sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==`;
- `@pdf-lib/fontkit` `1.1.1`, MIT, npm integrity
  `sha512-KjMd7grNapIWS/Dm0gvfHEilSyAmeLvrEGVcqLGi0VYebuqqzTbgF29efCx7tvx+IEbG3zQciRSWl3GkUSvjZg==`;
- Noto Sans CJK KR Regular from `notofonts/noto-cjk` revision
  `f8d157532fbfaeda587e826d4cd5b21a49186f7c`, SIL Open Font License 1.1,
  16,433,112 bytes, SHA-256
  `6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a`; and
- Noto Emoji variable font from `google/fonts` revision
  `ec626514f79f831f1ab848a82114a0ce7e2d6372`, SIL Open Font License 1.1,
  1,982,596 bytes, SHA-256
  `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551`.

PocketRisu's existing `pdfjs-dist` `4.10.38` (Apache-2.0) remains the
independent extraction oracle. Matching a dependency version or observed
behavior from the reference artifact does not change this classification into
a source-code adaptation.

## Project-owned sources

| Source | Use |
| --- | --- |
| Private `risuai-bg-stream-preserve` repository, stable `v1.0.1` | Authored source for the bg-preserve payload imported into this patcher, with patcher-specific owner exclusions/adapters. |
| This repository's issue/validation history and user requirements | Persona and character organization, Personal settings, parser/toolchain hardening, CharX integrity, exact transaction engine, reporting, qualification policy, and the now-retired background-import experiment unless a row above states another origin. |

## Attribution rule for future work

Before admitting a new feature:

1. pin the source repository and exact revision;
2. classify it as code adaptation, behavioral reference, native equivalence,
   or independent local design;
3. record exact source paths when code or structure is adapted;
4. preserve the source license and author/project attribution;
5. name the existing local authority and excluded source behavior; and
6. update this ledger, `THIRD_PARTY_NOTICES.md`, the pack receipt, and its ETag
   before publishing the complete installer.

Idea provenance is recorded even when no code is copied. Conversely, shared
ancestry or similar behavior is not attributed to the newest fork without a
commit/caller comparison.
