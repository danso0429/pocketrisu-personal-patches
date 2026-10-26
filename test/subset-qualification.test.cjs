'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    DEFAULT_STATE_PATH,
} = require('../src/manager.cjs')

function qualificationRunner() {
    let loaded
    try {
        loaded = require('../scripts/qualify-subset.cjs')
    } catch {
        loaded = null
    }
    assert.equal(
        typeof loaded?.runSubsetQualification,
        'function',
        'expected scripts/qualify-subset.cjs to export runSubsetQualification',
    )
    return loaded.runSubsetQualification
}

function write(root, relative, content, mode) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    if (mode !== undefined) fs.chmodSync(target, mode)
}

function git(root, args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function makeRoot({ gitCheckout = true } = {}) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'subset-qualification-'))
    const root = path.join(parent, 'root')
    const outDir = path.join(parent, 'out')
    fs.mkdirSync(root)
    write(root, 'package.json', `${JSON.stringify({
        name: 'pocketrisu',
        version: '1.16.1',
        packageManager: 'pnpm@10.34.1',
    }, null, 2)}\n`)
    write(root, 'src/base.ts', 'BASE\n', 0o755)
    write(root, '.gitignore', [
        'node_modules/',
        'dist/',
        'server/node/bgOrchBundle.css',
        'server/node/bgOrchBundle.mjs',
        'src/generated.ts',
        'foo.tmp',
    ].join('\n') + '\n')
    if (gitCheckout) {
        git(root, ['init', '-q'])
        git(root, ['config', 'user.name', 'Subset Test'])
        git(root, ['config', 'user.email', 'subset@example.test'])
        git(root, ['add', '.'])
        git(root, ['commit', '-qm', 'fixture'])
    }
    return { parent, root, outDir }
}

function removeFixture(fixture) {
    fs.rmSync(fixture.parent, { recursive: true, force: true })
}

function syntheticInput(options = {}) {
    const id = options.id ?? 'subset-pack'
    const targetDeclared = options.targetDeclared ?? true
    const pack = {
        id,
        version: '1.0.1',
        userSelectable: options.userSelectable ?? true,
        requires: options.requires ?? [],
        targets: {
            pocketrisu: {
                verified: ['1.10.0'],
                reviewing: targetDeclared ? ['1.16.1'] : [],
            },
        },
        units: options.units ?? [{
            id: `${id}:base`,
            file: 'src/base.ts',
            type: 'insert',
            where: 'after',
            anchor: 'BASE\n',
            content: 'PATCHED\n',
            targetVersions: { pocketrisu: ['1.10.0', '1.16.1'] },
        }],
    }
    return {
        catalog: [pack, ...(options.extraPacks ?? [])],
        coverage: {
            [id]: {
                '1.16.1': {
                    from: '1.10.0',
                    retained: 'all',
                    replaced: {},
                    added: {},
                    retired: {},
                },
            },
            ...(options.extraCoverage ?? {}),
        },
        baseline: {
            format: 1,
            packs: {
                [id]: { units110: pack.units.map(({ id: unitId }) => unitId) },
                ...(options.extraBaseline ?? {}),
            },
        },
        packIds: [id],
    }
}

function commandLine(check) {
    if (typeof check === 'string') return check
    if (Array.isArray(check)) return check.join(' ')
    const command = Array.isArray(check.command) ? check.command.join(' ') : check.command
    return [command, ...(check.args ?? [])].filter(Boolean).join(' ')
}

function passingRunner(calls, hook = () => {}) {
    return (check, root) => {
        const command = commandLine(check)
        calls.push(command)
        hook(command, root)
        return {
            exitCode: 0,
            stdoutTail: command === 'pnpm --version' ? '10.34.1\n' : '',
            stderrTail: '',
        }
    }
}

function optionsFor(fixture, input, checkRunner, env = {}) {
    let instant = 1000
    return {
        root: fixture.root,
        outDir: fixture.outDir,
        checkRunner,
        env: {
            ...process.env,
            NODE_OPTIONS: '--no-experimental-webstorage',
            ...env,
        },
        now: () => ++instant,
        ...input,
    }
}

async function runAndRead(options) {
    const run = qualificationRunner()
    let thrown = null
    try {
        await run(options)
    } catch (error) {
        thrown = error
    }
    const receiptPath = path.join(options.outDir, 'receipt.json')
    assert.equal(fs.existsSync(receiptPath), true, thrown?.stack ?? 'receipt.json was not written')
    return { thrown, receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')) }
}

function objects(value, found = []) {
    if (!value || typeof value !== 'object') return found
    if (!Array.isArray(value)) found.push(value)
    for (const child of Object.values(value)) objects(child, found)
    return found
}

function recordedCommand(receipt, command) {
    return objects(receipt).find((entry) => commandLine(entry) === command)
}

function assertNoManagerMetadata(root) {
    for (const relative of [
        DEFAULT_STATE_PATH,
        DEFAULT_INTENT_PATH,
        DEFAULT_JOURNAL_PATH,
        DEFAULT_LOCK_PATH,
    ]) assert.equal(fs.existsSync(path.join(root, relative)), false, relative)
}

const normalCommands = [
    'pnpm --version',
    'pnpm install --frozen-lockfile',
    'pnpm test',
    'pnpm test:compat',
    'pnpm check',
    'pnpm build',
]

test.describe('[E2-1a] Subset verification harness', () => {
    test('[new] completes a subset receipt in order and restores bytes, mode, metadata, and lock', async () => {
        const fixture = makeRoot()
        try {
            const calls = []
            const before = fs.readFileSync(path.join(fixture.root, 'src/base.ts'))
            const beforeMode = fs.statSync(path.join(fixture.root, 'src/base.ts')).mode & 0o7777
            const runner = passingRunner(calls, (command, root) => {
                if (command === 'pnpm install --frozen-lockfile') {
                    write(root, 'node_modules/.fixture', 'allowed\n')
                }
                if (command === 'pnpm build') write(root, 'dist/.fixture', 'allowed\n')
            })
            const { receipt } = await runAndRead(optionsFor(
                fixture,
                syntheticInput(),
                runner,
            ))

            assert.deepEqual(calls, normalCommands)
            assert.equal(receipt.qualification, false)
            assert.equal(receipt.failure, null)
            assert.equal(receipt.cleanup, 'reverted')
            assert.deepEqual(fs.readFileSync(path.join(fixture.root, 'src/base.ts')), before)
            assert.equal(fs.statSync(path.join(fixture.root, 'src/base.ts')).mode & 0o7777, beforeMode)
            assert.equal(git(fixture.root, ['status', '--porcelain', '--untracked-files=all']), '')
            assertNoManagerMetadata(fixture.root)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] runs the bundle build last when bg-preserve enters the closure', async () => {
        const fixture = makeRoot()
        try {
            const calls = []
            const input = syntheticInput({ id: 'bg-preserve' })
            const { receipt } = await runAndRead(optionsFor(
                fixture,
                input,
                passingRunner(calls),
            ))
            assert.equal(receipt.failure, null)
            assert.deepEqual(calls, [
                ...normalCommands,
                'node server/node/bgOrchBundle.build.cjs',
            ])
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] rejects every preflight violation before apply and records cleanup', async () => {
        const cases = [
            {
                name: 'not-git',
                make: () => makeRoot({ gitCheckout: false }),
            },
            {
                name: 'dirty-tracked',
                mutate: ({ root }) => fs.appendFileSync(path.join(root, 'src/base.ts'), 'dirty\n'),
            },
            ...[DEFAULT_STATE_PATH, DEFAULT_INTENT_PATH, DEFAULT_JOURNAL_PATH, DEFAULT_LOCK_PATH]
                .map((relative) => ({
                    name: relative,
                    mutate: ({ root }) => write(root, relative, '{}\n'),
                })),
            {
                name: 'owned-path-even-ignored',
                input: syntheticInput({
                    units: [{
                        id: 'subset-pack:owned',
                        file: 'src/generated.ts',
                        type: 'owned',
                        content: 'generated\n',
                        targetVersions: { pocketrisu: ['1.10.0', '1.16.1'] },
                    }],
                }),
                mutate: ({ root }) => write(root, 'src/generated.ts', 'already here\n'),
            },
            {
                name: 'pnpm-version-mismatch',
                runner: (check) => ({
                    exitCode: 0,
                    stdoutTail: commandLine(check) === 'pnpm --version' ? '9.0.0\n' : '',
                    stderrTail: '',
                }),
            },
            {
                name: 'node-options',
                env: { NODE_OPTIONS: '' },
            },
        ]

        for (const item of cases) {
            const fixture = item.make?.() ?? makeRoot()
            try {
                const input = item.input ?? syntheticInput()
                item.mutate?.(fixture)
                const before = fs.readFileSync(path.join(fixture.root, 'src/base.ts'))
                const calls = []
                const runner = item.runner ?? passingRunner(calls)
                const { receipt } = await runAndRead(optionsFor(
                    fixture,
                    input,
                    runner,
                    item.env,
                ))
                assert.equal(receipt.failure?.step, 'preflight', item.name)
                assert.equal(typeof receipt.failure?.code, 'string', item.name)
                assert.equal(receipt.failure.code.length > 0, true, item.name)
                assert.notEqual(receipt.cleanup, undefined, item.name)
                assert.deepEqual(
                    fs.readFileSync(path.join(fixture.root, 'src/base.ts')),
                    before,
                    item.name,
                )
                assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_STATE_PATH)),
                    item.name === DEFAULT_STATE_PATH, item.name)
            } finally {
                removeFixture(fixture)
            }
        }
    })

    test('[new] rejects a closure pack without a target declaration before apply', async () => {
        const fixture = makeRoot()
        try {
            const dependency = syntheticInput({ id: 'dependency', targetDeclared: false }).catalog[0]
            const input = syntheticInput({
                requires: ['dependency'],
                extraPacks: [dependency],
                extraBaseline: { dependency: { units110: dependency.units.map(({ id }) => id) } },
                extraCoverage: {},
            })
            const { receipt } = await runAndRead(optionsFor(
                fixture,
                input,
                passingRunner([]),
            ))
            assert.ok(receipt.failure)
            assert.equal(fs.readFileSync(path.join(fixture.root, 'src/base.ts'), 'utf8'), 'BASE\n')
            assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_STATE_PATH)), false)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] stops on coverage violations before apply', async () => {
        const fixture = makeRoot()
        try {
            const input = syntheticInput()
            delete input.coverage['subset-pack']['1.16.1']
            const { receipt } = await runAndRead(optionsFor(
                fixture,
                input,
                passingRunner([]),
            ))
            assert.ok(receipt.failure)
            assert.equal(receipt.coverage.ok, false)
            assert.equal(fs.readFileSync(path.join(fixture.root, 'src/base.ts'), 'utf8'), 'BASE\n')
            assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_STATE_PATH)), false)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] short-circuits checks after a failure and reverts once', async () => {
        const fixture = makeRoot()
        try {
            const calls = []
            const runner = (check) => {
                const command = commandLine(check)
                calls.push(command)
                return {
                    exitCode: command === 'pnpm test' ? 1 : 0,
                    stdoutTail: command === 'pnpm --version' ? '10.34.1\n' : 'stdout marker',
                    stderrTail: command === 'pnpm test' ? 'stderr marker' : '',
                }
            }
            const { receipt } = await runAndRead(optionsFor(fixture, syntheticInput(), runner))
            assert.deepEqual(calls, normalCommands.slice(0, 3))
            assert.ok(receipt.failure)
            assert.equal(receipt.cleanup, 'reverted')
            for (const command of normalCommands.slice(3)) {
                assert.equal(recordedCommand(receipt, command)?.status, 'skipped', command)
            }
            const failed = recordedCommand(receipt, 'pnpm test')
            assert.equal(failed.exitCode, 1)
            assert.match(JSON.stringify(failed), /stdout marker/)
            assert.match(JSON.stringify(failed), /stderr marker/)
            assert.equal(fs.readFileSync(path.join(fixture.root, 'src/base.ts'), 'utf8'), 'BASE\n')
            assertNoManagerMetadata(fixture.root)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] preserves managed drift when normal revert refuses it', async () => {
        const fixture = makeRoot()
        try {
            const runner = passingRunner([], (command, root) => {
                if (command === 'pnpm test') fs.appendFileSync(path.join(root, 'src/base.ts'), 'DRIFT\n')
            })
            const { receipt } = await runAndRead(optionsFor(fixture, syntheticInput(), runner))
            assert.ok(receipt.failure)
            assert.equal(receipt.cleanup, 'preserved-drift')
            assert.match(fs.readFileSync(path.join(fixture.root, 'src/base.ts'), 'utf8'), /DRIFT/)
            assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_LOCK_PATH)), false)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] fails post-revert cleanliness for an unnamed ignored artifact', async () => {
        const fixture = makeRoot()
        try {
            const runner = passingRunner([], (command, root) => {
                if (command === 'pnpm build') write(root, 'foo.tmp', 'unexpected\n')
            })
            const { receipt } = await runAndRead(optionsFor(fixture, syntheticInput(), runner))
            assert.ok(receipt.failure)
            assert.equal(fs.existsSync(path.join(fixture.root, 'foo.tmp')), true)
            assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_LOCK_PATH)), false)
        } finally {
            removeFixture(fixture)
        }
    })

    test('[new] a second run refuses an existing harness lock without replacing it', async () => {
        const fixture = makeRoot()
        try {
            const lockBody = 'in-flight-owner\n'
            write(fixture.root, DEFAULT_LOCK_PATH, lockBody)
            const { receipt } = await runAndRead(optionsFor(
                fixture,
                syntheticInput(),
                passingRunner([]),
            ))
            assert.equal(receipt.failure?.step, 'preflight')
            assert.equal(fs.readFileSync(path.join(fixture.root, DEFAULT_LOCK_PATH), 'utf8'), lockBody)
            assert.equal(fs.existsSync(path.join(fixture.root, DEFAULT_STATE_PATH)), false)
        } finally {
            removeFixture(fixture)
        }
    })
})
