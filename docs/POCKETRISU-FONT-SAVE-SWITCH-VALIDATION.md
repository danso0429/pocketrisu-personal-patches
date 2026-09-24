# Font selection reuse, direct CSS switches, and compact recovery

Candidate: `0.2.3-experimental.5`, Personal settings `0.5.4`, PocketRisu 1.10.0.

## Behavior

- Individual CSS enable/disable switches save directly without the trial
  overlay, countdown, or confirmation. They change only the enabled leaf.
  Strict persistence acknowledgement, conflict checks, and recovery gates
  remain in effect. CSS text/order edits and explicit recovery exit retain
  their existing trials.
- The recovery block is part of the top Standard-only notice, including its
  recovery address, status, and recovery-exit actions. The notice and recovery
  summary both render at 12px; touch controls retain their minimum height.
- Selecting an already selected font does not issue another save request.
- A ready, verified font face can be shared by independent live consumers.
  Preview/selection ownership is reference-counted; the last owner releases
  the native face. Identity includes ID, digest, asset path, byte length, and
  format. Same-owner preparation still returns independent rollback handles.
- Font-name previews depend on font identity rather than an appearance-object
  clone or name-only change. Post-save font synchronization runs after the
  saving lane closes. A distinct invalidation sentinel ensures choosing the
  app font clears the old custom-font state.

## Measurements

The built app used an isolated native SQLite server, the same small synthetic
database/font, and a 390px Chromium viewport. This is a loopback measurement,
not an iPhone or production-database latency claim.

| Warm custom-font selection | Before | After |
| --- | --- | --- |
| Additional font asset reads per selection | 2 | 0 |
| Observed completion times, two samples | 100ms, 95ms | 90ms, 71ms |
| Acknowledged persistence | patch + flush | patch + flush |

A separate initial quick-selection trace observed three reads before the
change. An intermediate timing run overlapped other validation work and was
excluded from timing comparison. The final comparison ran after those jobs
finished. Already-selected clicks emitted no read/patch/flush requests.

Cold fonts still require acquisition and integrity validation. File uploads
still wait for asset persistence/read-back and strict database acknowledgement.
Large-root and physical-device save latency were not measured by this fixture.

## Runtime audit and validation

Discovery followed visible preview → verified face registration → selection
borrow → strict save → activation → consumer release, and switch event →
enabled-leaf mutation → strict save → runtime reconciliation.

| Adversarial case | Resolution / observed anchor |
| --- | --- |
| Closing a preview removes the selected font | Independent owner claims; unit and actual browser close/reopen checks retain one active face. |
| A failed same-owner preparation releases an existing active handle | Same-owner cache reuse is excluded; rollback-handle test keeps the active face. |
| Different path or integrity metadata reuses an unchecked face | Full identity key; mismatched-path and invalid-digest tests require reads and reject bad bytes. |
| A late read/load registers after teardown | Existing generation guards remain before registration; delayed-read/load tests pass. |
| Root metadata cloning repeatedly reloads unchanged previews | Primitive derived identity plus untracked metadata snapshot; warm selection traces contain zero font reads. |
| App-font selection leaves stale custom-font state | Post-lane synchronization with a distinct invalidation sentinel; browser verifies the ready attribute is removed. |
| Direct switching rewrites CSS or adds confirmation UI | Enabled-only action test preserves source/unknown fields; browser observer recorded zero confirmation overlays across off/on. |
| Moving recovery breaks the fallback route | Actual browser verifies top placement, 12px notice/summary, recovery suppression, cancelled exit, and confirmed exit. |

Patcher 51 files and the complete Personal suite's 90 tests passed. Svelte
diagnostics were 0 errors/0 warnings; production build transformed 7,990 modules.
All five owner graphs passed runtime tests, current/zero-change reapply,
compatibility rollback/old-reader preservation, and exact byte/mode restoration.
The complete graph has 42 packs, 984 units, 366 paths, and 13 ordered collisions.
Real-browser font add/select/rename/replace/delete and selection restoration
passed after the sharing change. No page errors were observed.

Both installer aliases were reproduced byte-identically, 8,127,332 bytes,
mode 0755, SHA-256
`7ce8000b7f0aa22f25aa6091ec3006adc09ed2e692a5fd43cd568ae869ceeca8`.
Physical iPhone qualification and stable promotion remain pending.
