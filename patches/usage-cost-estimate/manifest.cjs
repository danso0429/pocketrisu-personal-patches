'use strict';
const fs = require('node:fs');
const path = require('node:path');
const files = 'files-1.10';
const files116 = 'files-1.16';
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
const testUnits = [
    ['usage-cost-estimate:usage-cost-server-tests:1.16', 'server/node/usage-cost-estimate.e2-5.test.ts'],
    ['usage-cost-estimate:model-job-tests:1.16', 'server/node/model-jobs.e2-5.test.ts'],
    ['usage-cost-estimate:usage-cost-request-tests:1.16', 'src/ts/process/request/usage-cost-request.e2-5.test.ts'],
    ['usage-cost-estimate:pagefold-binding-tests:1.16', 'src/ts/process/request/pagefold-retire.e2-5.test.ts'],
    ['usage-cost-estimate:pagefold-storage-tests:1.16', 'src/ts/storage/pagefold-retire.e2-5.test.ts'],
];
const related = ['bg-preserve', 'lazy-chat-bg-adapter', 'log-load-performance']
    .flatMap(name => require(`../${name}/manifest.cjs`).units);
const maintained = [...require('./client-units.cjs'), ...require('./server-units.cjs'), ...require('./ui-units.cjs')];
module.exports = {
    id: 'usage-cost-estimate', title: 'Usage cost and cache accounting', version: '0.1.4',
    targets: { pocketrisu: { verified: [], reviewing: ['1.16.1'] } }, userSelectable: true,
    units: [
        ...maintained.map(unit => ({ ...unit, after: related.filter(prior => prior.file === unit.file).map(prior => prior.id) })),
        ...owned.map(file => ({ id: `usage-cost-estimate:owned:${file}:1.10`, file, type: 'owned',
            content: fs.readFileSync(path.join(__dirname, files, file), 'utf8') })),
        ...testUnits.map(([id, file]) => ({ id, file, type: 'owned',
            content: fs.readFileSync(path.join(__dirname, files116, file), 'utf8') })),
    ],
};
