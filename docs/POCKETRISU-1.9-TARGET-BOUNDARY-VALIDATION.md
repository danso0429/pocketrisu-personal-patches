# PocketRisu 1.9.0 review-target boundary validation

> **Date:** 2026-08-01 KST
>
> **Scope:** Compatibility metadata and maintainer gate only.
>
> **Target:** PocketRisu `1.9.0` / `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`.

## Change

The shared catalog target metadata now keeps:

- PocketRisu `1.8.1` in `verified`;
- PocketRisu `1.9.0` in `reviewing`;
- every other version outside both lists.

No pack, unit, dependency, conflict, preset, ownership rule, managed source
payload, or resolver relation changed. Generated installers contain the same
review metadata, but their ordinary apply gate still accepts only `verified`
targets.

## Adversarial compatibility checks

The tests use the complete active catalog, not a hardcoded pack count.

- Every resolved catalog entry reports `under-review` on exact `1.9.0`.
- `assertTargetVerified()` rejects the complete selection with
  `TARGET_REVIEW_REQUIRED`.
- `assertTargetReviewable()` accepts it only for the private maintainer path.
- `1.9.1` remains `review-required` and is rejected even by the maintainer
  gate.
- The shared target object and both version arrays remain recursively frozen.

Focused `node --test test/compatibility.test.cjs test/catalog.test.cjs`
completed with both test files passing. The complete patcher suite completed
with 28 test files passing and no failed, cancelled, skipped, or todo file.

## Exact-target command observation

On a disposable copy of the exact official 1.9.0 tag, a structural plan for
`startup-cache` reported:

- target `pocketrisu 1.9.0`;
- compatibility `under-review`;
- no verified packs;
- `startup-cache 0.1.2` under review;
- no review-required pack and no collision.

Running the ordinary `apply` command for the same selection exited `1` with
`TARGET_REVIEW_REQUIRED`. Only its private conflict report was created under
the ignored patcher report directory. `git diff --exit-code` remained clean,
so no tracked target source was written.

This proves only the review boundary. It does not qualify `startup-cache` or
any other pack semantically on 1.9.0.

## Generated installer determinism

Two consecutive builds produced the same size and SHA-256 for every artifact:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 3,077,194 | `cd92bc3873a4d5422ed5bf6475425b7e5fc813666215bdabdb21bd19192c13d3` |
| `pocketrisu-features.cjs` | 3,077,200 | `e88e6e981109480539ece4756bd9fbfd5c00f189e76f8f908a161ad8d499b4e5` |
| `pocketrisu-hardening.cjs` | 3,077,201 | `a54057be409ac46f555667c6ded3c2560a4c2fa144b09bfe2409203b5b0d60e5` |
| `pocketrisu-all.cjs` | 3,077,195 | `712ea963254ff25184161b6d2f2d19b7794cbc2698c1996257fac965a0a68d60` |

All four artifacts passed `node --check`.

## Gate boundary

The raw-selection combination gate was not claimed for 1.9.0 here. Several
packs are already known to refuse their 1.8.1 anchors on that target, and this
commit changes no executable graph to repair them. The full reviewing-target
combination run belongs after those pack-specific rebases; it must not be
made green by weakening or skipping failing selections.

No target build, runtime audit, mobile gate, live apply, process restart,
push, tag, or release is claimed by this receipt.
