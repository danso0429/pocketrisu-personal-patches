'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    assertOutputOutsideInputs,
    captureInputFreeze,
    compareInputFreeze,
    contentTreeDescriptor,
    parseCanonicalOutput,
    runChild,
    SOURCE_CORE_PATHS,
    targetFreezeDescriptor,
    validateCanonicalResult,
    writeJsonAtomic,
} = require('../src/verification-evidence.cjs')

function temporaryDirectory(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-verification-evidence-test-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    return root
}

test('content tree binds application contents, modes, symlinks, and topology', (t) => {
    const root = temporaryDirectory(t)
    fs.mkdirSync(path.join(root, 'dir'))
    fs.writeFileSync(path.join(root, 'dir', 'file.txt'), 'one\n')
    fs.symlinkSync('dir/file.txt', path.join(root, 'link'))
    const baseline = contentTreeDescriptor(root)
    assert.equal(contentTreeDescriptor(root).rootSha256, baseline.rootSha256)

    fs.mkdirSync(path.join(root, '.git'))
    fs.writeFileSync(path.join(root, '.git', 'noise'), 'ignored\n')
    assert.equal(contentTreeDescriptor(root).rootSha256, baseline.rootSha256)

    fs.writeFileSync(path.join(root, 'dir', 'file.txt'), 'two\n')
    assert.notEqual(contentTreeDescriptor(root).rootSha256, baseline.rootSha256)
    fs.writeFileSync(path.join(root, 'dir', 'file.txt'), 'one\n')
    const currentMode = fs.lstatSync(path.join(root, 'dir', 'file.txt')).mode & 0o7777
    fs.chmodSync(
        path.join(root, 'dir', 'file.txt'),
        currentMode === 0o600 ? 0o644 : 0o600,
    )
    assert.notEqual(contentTreeDescriptor(root).rootSha256, baseline.rootSha256)
})

async function runGit(t, args) {
    const result = await runChild('git', args)
    assert.equal(result.spawnError, null)
    assert.equal(result.signal, null)
    assert.equal(result.exitCode, 0, result.stderr)
    return result.stdout
}

test('input freeze compares pre-run and post-run source and target roots', async (t) => {
    const sourceRoot = temporaryDirectory(t)
    const targetRoot = temporaryDirectory(t)
    fs.mkdirSync(path.join(sourceRoot, 'docs'))
    fs.mkdirSync(path.join(sourceRoot, 'scripts'))
    fs.mkdirSync(path.join(sourceRoot, 'src'))
    fs.mkdirSync(path.join(sourceRoot, 'patches'))
    fs.writeFileSync(path.join(sourceRoot, 'package.json'), '{}\n')
    fs.writeFileSync(
        path.join(sourceRoot, 'docs/patch-combination-verification-instructions.md'),
        'policy\n',
    )
    for (const relative of SOURCE_CORE_PATHS.filter((value) => ![
        'package.json',
        'docs/patch-combination-verification-instructions.md',
    ].includes(value))) {
        fs.writeFileSync(path.join(sourceRoot, relative), `${relative}\n`)
    }
    fs.writeFileSync(path.join(sourceRoot, 'patches', 'manifest.cjs'), 'module.exports = {}\n')
    fs.writeFileSync(path.join(targetRoot, 'app.txt'), 'target\n')
    await runGit(t, ['init', '-q', sourceRoot])
    await runGit(t, ['-C', sourceRoot, 'config', 'user.name', 'test'])
    await runGit(t, ['-C', sourceRoot, 'config', 'user.email', 'test@example.invalid'])
    await runGit(t, ['-C', sourceRoot, 'add', '.'])
    await runGit(t, ['-C', sourceRoot, 'commit', '-qm', 'fixture'])

    const targetProvenance = `sha256:${'a'.repeat(64)}`
    const before = await captureInputFreeze({ sourceRoot, targetRoot, targetProvenance })
    assert.deepEqual(compareInputFreeze(before, before), {
        sourceMatched: true,
        targetMatched: true,
        matched: true,
    })
    fs.writeFileSync(path.join(targetRoot, 'app.txt'), 'changed\n')
    const after = await captureInputFreeze({ sourceRoot, targetRoot, targetProvenance })
    assert.deepEqual(compareInputFreeze(before, after), {
        sourceMatched: true,
        targetMatched: false,
        matched: false,
    })
})

test('canonical result validation requires exact raw coverage and worker history', () => {
    const result = {
        rawSelections: 4,
        verifiedSelections: 4,
        roundTrips: 'passed',
        workers: 2,
        workerHistory: {
            schema: 'patch-combination-worker-history-v1',
            schedule: 'stride-v1',
            workers: [
                { workerIndex: 0, orderedMasks: [0, 2] },
                { workerIndex: 1, orderedMasks: [1, 3] },
            ],
        },
    }
    assert.deepEqual(validateCanonicalResult(result), [])
    assert.deepEqual(parseCanonicalOutput(JSON.stringify(result)), result)
    assert.match(
        validateCanonicalResult({ ...result, verifiedSelections: 3 }).join('\n'),
        /verifiedSelections/,
    )
    assert.match(
        validateCanonicalResult({
            ...result,
            workerHistory: {
                ...result.workerHistory,
                workers: [
                    { workerIndex: 0, orderedMasks: [2, 0] },
                    { workerIndex: 1, orderedMasks: [1, 3] },
                ],
            },
        }).join('\n'),
        /canonical stride/,
    )
})

test('evidence output cannot mutate a frozen input tree', (t) => {
    const root = temporaryDirectory(t)
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.json`)
    assert.throws(
        () => assertOutputOutsideInputs(path.join(root, 'receipt.json'), [root]),
        /outside frozen input root/,
    )
    assert.doesNotThrow(() => assertOutputOutsideInputs(outside, [root]))
})

test('evidence output is atomic and never overwrites an existing receipt', (t) => {
    const root = temporaryDirectory(t)
    const output = path.join(root, 'receipt.json')
    writeJsonAtomic(output, { value: 'first' })
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { value: 'first' })
    assert.throws(
        () => writeJsonAtomic(output, { value: 'second' }),
        (error) => error.code === 'EEXIST',
    )
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { value: 'first' })
})

test('target identity ignores Git mtimes but binds commit, index, and application state', async (t) => {
    const root = temporaryDirectory(t)
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n')
    await runGit(t, ['init', '-q', root])
    await runGit(t, ['-C', root, 'config', 'user.name', 'test'])
    await runGit(t, ['-C', root, 'config', 'user.email', 'test@example.invalid'])
    await runGit(t, ['-C', root, 'add', 'tracked.txt'])
    await runGit(t, ['-C', root, 'commit', '-qm', 'fixture'])

    const baseline = await targetFreezeDescriptor(root)
    const gitDirectory = path.join(root, '.git')
    const shifted = new Date(Date.now() + 60_000)
    fs.utimesSync(gitDirectory, shifted, shifted)
    assert.deepEqual(await targetFreezeDescriptor(root), baseline)

    await runGit(t, ['-C', root, 'update-index', '--assume-unchanged', 'tracked.txt'])
    const indexChanged = await targetFreezeDescriptor(root)
    assert.equal(indexChanged.applicationTree.rootSha256, baseline.applicationTree.rootSha256)
    assert.notDeepEqual(indexChanged.provenance, baseline.provenance)
    await runGit(t, ['-C', root, 'update-index', '--no-assume-unchanged', 'tracked.txt'])

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'two\n')
    const applicationChanged = await targetFreezeDescriptor(root)
    assert.notEqual(
        applicationChanged.applicationTree.rootSha256,
        baseline.applicationTree.rootSha256,
    )
    assert.notEqual(applicationChanged.provenance.status, baseline.provenance.status)
})

test('non-Git target requires independent declared archive provenance', async (t) => {
    const root = temporaryDirectory(t)
    fs.writeFileSync(path.join(root, 'file.txt'), 'archive\n')
    await assert.rejects(() => targetFreezeDescriptor(root), /target-provenance/)
    const descriptor = await targetFreezeDescriptor(root, {
        targetProvenance: `sha256:${'b'.repeat(64)}`,
    })
    assert.deepEqual(descriptor.provenance, {
        kind: 'declared-archive',
        sha256: 'b'.repeat(64),
    })
})
