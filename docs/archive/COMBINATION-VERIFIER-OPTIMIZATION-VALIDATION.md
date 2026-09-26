# Exhaustive combination verifier optimization validation

> **Historical:** the optimized verifier was removed in
> `0.2.0-experimental.20` together with public patch combinations. This receipt
> records an earlier infrastructure result and is not an active gate.

Date: 2026-07-31 KST

The reusable maintainer procedure is
`docs/patch-combination-verification-instructions.md`. This document is the
implementation and measurement receipt for the initial optimized verifier.

## Preserved verification contract

This change optimizes only exhaustive patch-combination verification. It does
not change a pack manifest, unit, owner path, resolver relation, state format,
or default patcher runtime behavior.

For every raw user-selectable mask, the verifier still performs:

1. `planTransition()` from a pristine managed snapshot;
2. transactional `applyTransition()`;
3. `status()` and the expected `clean` or `current` result;
4. a second plan with zero changes;
5. an empty-selection plan and transactional revert;
6. SHA-256 and POSIX-mode comparison of every catalog-managed path against
   the initial snapshot.

Raw selections are not deduplicated. Workers report the exact masks they
processed; aggregation rejects an out-of-range, duplicate, or missing mask
with `INCOMPLETE_COMBINATION_COVERAGE`.

Each worker receives an independent complete copy of the supplied source
root. Its managed byte/mode snapshot must match the supplied root before work
begins. The supplied root remains unchanged, and only verifier-created
temporary directories are removed on normal completion or a handled failure.
An abrupt process termination can leave the verifier-named temporary
directory for manual inspection or cleanup.

## Pure calculation reuse

The optional caches are passed only by
`scripts/verify-all-combinations.cjs`. Distributed patcher commands do not
enable them.

- Pair analysis is reused only for the same exact baseline string and stable
  serialization of both complete unit definitions. Incompatible analysis is
  never cached and reproduces its failure path on every encounter.
- A single recent non-empty composition is reused only after exact recursive
  comparison of the ordered unit definitions and every baseline Map entry.
  Cached plans are snapshotted and cloned on return, so caller mutation cannot
  alter a later result. Empty revert plans and thrown plans are not cached.
- Pack ETags are reused only for recursively frozen pack objects. Passing a
  mutable or shallow-frozen definition fails with
  `PACK_ETAG_CACHE_REQUIRES_FROZEN_PACK`; a distinct definition is a miss.
- The single recent encoded state is reused only after exact recursive
  comparison of every field. Its comparison snapshot is separate from the
  transition state returned to the caller.

Filesystem drift is not cached. The second plan still reads current files and
uses `stripCurrentUnits()` to validate and remove every managed block before a
composition or state cache can hit. A changed baseline or unit definition
therefore takes the uncached path.

## Isolation and parallelism

The verifier uses independent worker-thread roots and defaults to available
CPU parallelism with a four-worker automatic cap. `--jobs N` is explicit and
the final result records the effective worker count.

`TMPDIR` controls only the parent of verifier-created worker copies. The
default remains the operating system temporary directory. A Linux operator
may explicitly select a sufficiently sized tmpfs such as `/dev/shm`; the
verifier does not assume its presence or capacity.

## Adversarial tests

The patcher suite includes checks that:

- shard schedules cover a range of selection counts and worker counts exactly
  once;
- aggregation rejects missing, duplicate, and out-of-range masks;
- copy-independent graph and maximum-unit aggregation remain exact;
- pair caches miss when a baseline or unit definition changes;
- incompatible pair failures are not retained;
- composition cache hits reproduce the uncached plan, invalidate on baseline
  or unit changes, bypass empty plans, do not retain failures, and resist
  caller mutation of an earlier result;
- pack ETag caching accepts only deep-frozen definitions and misses for a
  changed definition;
- state encoding misses for a changed field and is not corrupted by mutation
  of an earlier returned transition.

`npm test` passed all 23 patcher test files.

A separate review-only differential audit used two independent source copies
and processed 1,024 masks in each shard. For all 2,048 raw selections, it
compared the complete cached and uncached `planTransition()` results before
the initial apply, the repeated zero-change apply, and the empty-selection
revert. All 6,144 complete plan comparisons were equal. The aggregate cache
counts also matched the normal exhaustive run below exactly. This audit was
not included in the performance timing and is not part of a distributed
installer.

All four installers passed `node --check`. Two consecutive builds produced
the same sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,679,700 | `9dbb2b9822348d3fae0ae0095035b81da7d930f4d0717abd0a4fbfc79c0de9a0` |
| `pocketrisu-features.cjs` | 2,679,706 | `21b827fbe91b3ddad35bd7295da6cc0c8a8f412b74a7723b24d5525877a6f141` |
| `pocketrisu-hardening.cjs` | 2,679,707 | `cd843edd0b0c3ce796253c2e22760e16de4eac696d0ea8b278fb12546fb1fcad` |
| `pocketrisu-all.cjs` | 2,679,701 | `78959af66c8e7b0be7c1b68d4d8c10a7781fc1a389764ce4729541bdf8c3f76b` |

## Measured results

Measurements used the same two-CPU host, PocketRisu 1.8.1 archive, 11 visible
packs, 2,048 raw selections, and two workers. `/tmp` was ext4. `/dev/shm` was a
6 GB tmpfs. These are observed runs, not duration predictions for another
machine.

| Candidate | Worker filesystem | Elapsed | User CPU | System CPU | Max RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| parallel, no calculation cache | ext4 | 585.51 s | 551.20 s | 274.80 s | 788,692 KB |
| exact composition and pair caches | ext4 | 452.89 s | 463.22 s | 189.29 s | 764,576 KB |
| same caches | tmpfs | 405.83 s | 436.69 s | 159.46 s | 774,792 KB |
| final exact caches | tmpfs | 358.13 s | 377.40 s | 150.55 s | 727,192 KB |

The final run was 227.38 seconds, or 38.8%, shorter than the measured
two-worker ext4 no-cache run. The older serial verifier run was not wrapped by
`/usr/bin/time`, so no serial speedup ratio is claimed.

The final exhaustive result was:

```json
{
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 156,
  "maximumResolvedUnits": 312,
  "roundTrips": "passed",
  "workers": 2,
  "compositionCache": {
    "bypasses": 2050,
    "hits": 2047,
    "misses": 2047,
    "stores": 2047
  },
  "pairAnalysisCache": {
    "entries": 344,
    "hits": 117160,
    "misses": 344
  },
  "packEtagCache": {
    "hits": 26087,
    "misses": 25
  },
  "stateEncodingCache": {
    "hits": 2047,
    "misses": 2047
  }
}
```

The per-worker timing sums were 129,749.97 ms for initial plans, 82,720.17 ms
for repeated plans, 107,164.68 ms for apply, 98,760.11 ms for revert apply,
59,558.27 ms for revert plans, 42,679.83 ms for status, and 13,109.11 ms for
the full managed-path snapshots. Because two workers overlap, these sums are
not wall-clock components.

## Rejected optimizations

Two measured candidates were removed rather than counted as progress:

- Grouping collision candidates by file eliminated 54,657 of 55,611 pair
  comparisons in the full catalog, but the same worst-case 20-plan benchmark
  changed from 4.35 seconds to 4.39 seconds. The comparisons were numerous but
  not the wall-time bottleneck.
- Reusing precondition Buffers for the transaction journal reduced a
  64-selection sample from 5.24 seconds to 4.94 seconds, but it could restore
  an older Buffer if an external writer changed a file between precondition
  validation and journal creation. The existing second read and rollback
  preservation behavior were restored.

Graph deduplication and reduced snapshot scope were not implemented because
they would stop exercising the current per-raw-selection state and exact
revert contract.

## Publication state

The work is local for review. No push, tag, release, live PocketRisu apply, or
PocketRisu restart was performed.
