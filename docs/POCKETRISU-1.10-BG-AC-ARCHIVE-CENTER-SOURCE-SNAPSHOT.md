# Archive Center PocketRisu BG×AC candidate source snapshot

- Patch: `artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch`
- Patch format: Git full-index binary diff
- Patch size: 428,942 bytes
- Patch mode: 0644
- Patch SHA-256: `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d`
- Required public base: `026dcbf3b45adcf69b254673d439b24e943115b3`
- Candidate source tip: `9e23861901f15cae46817158a21ea873bbde6fe1`
- Expected candidate tree: `7806dd39f4acfa294ee67f9d7834bc6fed448730`
- Candidate history: 15 local commits
- Candidate changed paths: 28

## Purpose

The Archive Center candidate was developed as local commits on top of the
public 4.3.1 source but was not pushed to the upstream repository. This
full-index source patch preserves the exact final candidate tree in the same
private delivery branch as the PocketRisu integration evidence without
claiming upstream publication or write authority.

The patch intentionally contains no Git commit objects or author metadata. It
preserves the base-to-candidate source result rather than serving as a backup
of the original 15 commit objects. The source commit IDs remain provenance;
the expected tree ID is the exact restored-source authority.

## Verification

From this repository root:

```bash
sha256sum artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
git -C /path/to/archive-center-at-026dcbf apply --check \
  /path/to/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
```

## Restore into a public-base checkout

Start with a clean checkout at the required public base. Use a disposable or
new worktree; do not replace an unrelated worktree or discard local changes.

```bash
git switch --detach 026dcbf3b45adcf69b254673d439b24e943115b3
git apply --index /path/to/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
git diff --cached --name-only
git write-tree
```

The path list must contain 28 unique paths and `git write-tree` must print:

```text
7806dd39f4acfa294ee67f9d7834bc6fed448730
```

This is source recovery evidence, not proof that tests, MariaDB migrations,
race detection, ARM64 builds, or runtime integration passed in the restoring
environment.

On 2026-09-20, an empty temporary repository fetched the exact public base from
the public remote and applied this patch with `git apply --index`. The staged
diff contained 28 paths and `git write-tree` exactly matched the candidate
source tree above.

## Source commit provenance

The patch restores the final tree, while the original local history remains:

```text
a932234 test(host): characterize PocketRisu server contract gap
2b16b56 feat(store): add durable host execution claims
3fad4ae docs(host): record C0 execution claim validation
486e599 docs(host): record C0 runtime readback
17fcdd1 feat(store): add ordered host change receipts
d063b68 feat(store): fence host source invalidation
6866ccd test(store): verify durable host vector deletes
701f1ad docs(host): record C0 change-stream validation
31e3651 feat(store): add durable host prepare registry
d15acbd fix(store): fence prepare on pending host changes
043b587 fix(store): release skipped fenced prepare claims
7decdbb docs(host): record C0 prepare registry validation
694c6e8 feat(host): freeze PocketRisu execution context
c6ec332 docs(host): record C4 execution context validation
9e23861 feat(host): resolve captured execution settings
```

## Publication boundary

- This artifact does not modify or publish to the Archive Center upstream.
- No live Archive Center binary, schema, service, or data was changed while
  creating or verifying the patch.
- A future private mirror may import the original commit tip and retire this
  source patch only after exact commit/tree comparison and explicit artifact-
  retention review.
