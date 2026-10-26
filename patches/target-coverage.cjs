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
const unchangedFrom1100 = () => ({
    from: '1.10.0',
    retained: 'all',
    replaced: {},
    added: {},
    retired: {},
})

module.exports = {
    'charx-archive-integrity': { '1.16.1': unchangedFrom1100() },
    'parser-hardening': { '1.16.1': unchangedFrom1100() },
    'log-load-performance': { '1.16.1': unchangedFrom1100() },
    'kei-prompt-role-compat-core': { '1.16.1': unchangedFrom1100() },
    'kei-text-theme-normalization-core': { '1.16.1': unchangedFrom1100() },
    'kei-fullscreen-image-viewer-core': { '1.16.1': unchangedFrom1100() },
}
