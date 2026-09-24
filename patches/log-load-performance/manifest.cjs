'use strict'

const fs = require('node:fs')
const path = require('node:path')

const files = path.join(__dirname, 'files-1.10')
const read = (relative) => fs.readFileSync(path.join(files, relative), 'utf8')
const target1100 = { pocketrisu: ['1.10.0'] }

module.exports = {
    id: 'log-load-performance',
    title: 'Log loading performance',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        {
            id: 'log-load-performance:request-size-covering-index:1.10',
            file: 'server/node/request-logs.cjs',
            type: 'insert',
            where: 'after',
            anchor: '        CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);\n',
            content: '        CREATE INDEX IF NOT EXISTS idx_requests_size_bytes ON requests(size_bytes);\n',
            targetVersions: target1100,
        },
        {
            id: 'log-load-performance:request-size-covering-index-test:1.10',
            file: 'server/node/requestLogStorageIndex.test.ts',
            type: 'owned',
            content: read('server/node/requestLogStorageIndex.test.ts'),
            requires: ['log-load-performance:request-size-covering-index:1.10'],
            targetVersions: target1100,
        },
    ],
}
