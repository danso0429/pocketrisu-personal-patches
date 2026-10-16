'use strict';
const fs = require('node:fs');
const path = require('node:path');
const files = 'files-1.10';
const owned = [
    'server/node/usageCostStore.cjs',
    'server/node/usageCostStore.test.ts',
    'src/ts/usage/usagePricing.ts',
    'src/ts/usage/usagePricing.test.ts',
    'src/ts/usage/usageCostClient.test.ts',
    'src/lib/Setting/Pages/UsageCostPanel.svelte',
    'src/lib/Setting/Pages/UsageCostPanel.test.ts',
    'src/lib/Setting/Pages/UsageCostPanelHarness.test.svelte',
];
const related = ['bg-preserve', 'lazy-chat-bg-adapter', 'pagefold-model-preset', 'log-load-performance']
    .flatMap(name => require(`../${name}/manifest.cjs`).units);
const maintained = [...require('./client-units.cjs'), ...require('./server-units.cjs'), ...require('./ui-units.cjs')];
module.exports = {
    id: 'usage-cost-estimate', title: 'Usage cost and cache accounting', version: '0.1.0',
    targets: { pocketrisu: { verified: ['1.10.0'], reviewing: [] } }, userSelectable: true,
    units: [
        ...maintained.map(unit => ({ ...unit, after: related.filter(prior => prior.file === unit.file).map(prior => prior.id) })),
        ...owned.map(file => ({ id: `usage-cost-estimate:owned:${file}:1.10`, file, type: 'owned',
            content: fs.readFileSync(path.join(__dirname, files, file), 'utf8'), targetVersions: { pocketrisu: ['1.10.0'] } })),
    ],
};
