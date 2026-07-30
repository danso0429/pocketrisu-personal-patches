'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPack } = require('../scripts/import-bg-preserve.cjs')

function installerSource(hooks, payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
    return [
        `const PAYLOAD_B64 = "${encoded}"`,
        `const HOOKS = ${JSON.stringify(hooks)}`,
        '// @@HOOKS-END@@',
        '',
    ].join('\n')
}

function hook(id, unique) {
    return {
        id,
        file: 'src/ts/storage/nodeStorage.ts',
        where: 'after',
        anchor: 'anchor\n',
        block: `/* ${unique} */\n`,
        unique,
    }
}

test('bg-preserve import delegates nodeStorage hooks to composition adapters', () => {
    const pack = buildPack(installerSource([
        hook('nodeStorage: asset upload retry import', 'asset-upload-retry-import'),
        hook('nodeStorage: adaptive asset upload retry', 'asset-upload-adaptive-retry'),
        hook('nodeStorage: asset upload error detail', 'asset-upload-error-detail'),
        hook('nodeStorage: future retained hook', 'future-retained-hook'),
    ], {
        'src/ts/bgPreserveInstaller.test.ts': 'standalone-only\n',
        'src/ts/process/retained.ts': 'retained\n',
    }), 'test')

    assert.equal(pack.title, 'Background generation preservation')
    assert.equal(pack.userSelectable, true)
    assert.deepEqual(pack.units.map((unit) => unit.id), [
        'bg-preserve:hook:nodestorage-future-retained-hook',
        'bg-preserve:owned:src/ts/process/retained.ts',
    ])
    assert.equal(pack.units[0].after, undefined)
})
