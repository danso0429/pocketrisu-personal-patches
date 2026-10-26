'use strict'

// Unit coverage for every PocketRisu target a pack declares besides the frozen
// 1.10.0 baseline (test/fixtures/target-baseline-1.10.0.json). Maintainer data:
// read by scripts/lib/target-coverage.cjs, scripts/qualify-subset.cjs and the
// catalog test, never by the installer.
//
// Shape:
// {
//     [packId]: {
//         [target]: {
//             from: '1.10.0',
//             retained: [oldUnitId, ...] | 'all',
//             replaced: { [oldUnitId]: [newUnitId, ...] },
//             added: { [newUnitId]: 'reason' },
//             retired: { [oldUnitId]: 'evidence' },
//         },
//     },
// }
module.exports = {}
