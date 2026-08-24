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

## Design and reference sources

| Source | Frozen basis | Ideas reviewed or adapted | Current boundary |
| --- | --- | --- | --- |
| [`rhplus0831/PocketRisu` `serve`](https://github.com/rhplus0831/PocketRisu/tree/serve) | Build fence `3e65d76e4768b87156ba4dd93b2c954fe34cc784`; point-in-time source line from `f3efd3b1b03a9773a9121802ed3f95e8088d3353` through `3e758f9a4c95e9c18d4a9d428c85ded148cbf7ba` | Client/server build admission and pinned backup-source concepts. | GPL-3.0 reference. Local packs were rebuilt around BG, lazy storage, Kei, purge, and restore owners; the fork is not imported wholesale. |
| [Haejeok RisuAI](https://github.com/nevaeh5379/HaejeokRisuai) | `e9d035683cdf9f0207eed193ee36f9bdb117f658` / `b6254` | SQL/domain storage, object storage/explorer, low-spec paging, server compute, ZIP64 streaming, Korean search, layout controls, and operational backup were compared. | GPL-3.0 research reference only at this checkpoint. No Haejeok code is redistributed. See `HAEJEOK-RISUAI-OVERLAP-AUDIT.md`. |

## Project-owned sources

| Source | Use |
| --- | --- |
| Private `risuai-bg-stream-preserve` repository, stable `v1.0.1` | Authored source for the bg-preserve payload imported into this patcher, with patcher-specific owner exclusions/adapters. |
| This repository's issue/validation history and user requirements | Persona and character organization, Personal settings, parser/toolchain hardening, CharX integrity, background import, exact transaction engine, reporting, and qualification policy unless a row above states another origin. |

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
