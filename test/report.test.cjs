'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { compose } = require('../src/compose.cjs')
const {
    makeConflictReport,
    markdownReport,
    writeConflictReport,
} = require('../src/report.cjs')

function withRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-report-'))
    try {
        return fn(root)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

test('anchor failures identify the pack, file, candidate lines, and cause', () =>
    withRoot((root) => {
        fs.mkdirSync(path.join(root, 'src'), { recursive: true })
        fs.writeFileSync(
            path.join(root, 'package.json'),
            JSON.stringify({ name: 'pocketrisu', version: '2.0.0' }),
        )
        fs.writeFileSync(
            path.join(root, 'src/example.ts'),
            ['const before = true', 'const renamed = 2', 'const after = true', ''].join('\n'),
        )
        const pack = {
            id: 'example-pack',
            version: '1.0.0',
            units: [{
                id: 'example-pack:value',
                file: 'src/example.ts',
                type: 'replace',
                anchor: 'const original = 1\n',
                content: 'const patched = 1\n',
            }],
        }
        let failure
        try {
            compose(pack.units, new Map([[
                'src/example.ts',
                fs.readFileSync(path.join(root, 'src/example.ts'), 'utf8'),
            ]]))
        } catch (error) {
            failure = error
        }
        const report = makeConflictReport({
            root,
            catalog: [pack],
            error: failure,
            requestedPacks: ['example-pack'],
            patcherVersion: '0.2.0-test',
            now: new Date('2026-07-29T00:00:00.000Z'),
        })

        assert.equal(report.error.code, 'ANCHOR_COUNT')
        assert.deepEqual(report.packs, ['example-pack'])
        assert.deepEqual(report.files, ['src/example.ts'])
        assert.equal(report.units[0].observed.closestCandidate.start >= 1, true)
        assert.equal(report.writeSafety.liveSourceFilesChanged, false)
        assert.equal(report.writeSafety.stagingSourceFilesChanged, false)
        assert.doesNotMatch(JSON.stringify(report), new RegExp(root.replaceAll('/', '\\/')))
        assert.match(markdownReport(report), /Closest target lines/)
        assert.match(markdownReport(report), /Error evidence/)

        const paths = writeConflictReport(root, report)
        assert.equal(fs.existsSync(path.join(root, paths.jsonPath)), true)
        assert.equal(fs.existsSync(path.join(root, paths.markdownPath)), true)
        assert.equal(fs.statSync(path.join(root, paths.jsonPath)).mode & 0o777, 0o600)
    }))

test('a trailing anchor newline does not overstate its exact line range', () =>
    withRoot((root) => {
        fs.mkdirSync(path.join(root, 'src'), { recursive: true })
        fs.writeFileSync(
            path.join(root, 'package.json'),
            JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }),
        )
        fs.writeFileSync(
            path.join(root, 'src/example.ts'),
            'first\nconst exact = true\nthird\n',
        )
        const pack = {
            id: 'example-pack',
            version: '1.0.0',
            units: [{
                id: 'example-pack:exact',
                file: 'src/example.ts',
                type: 'replace',
                anchor: 'const exact = true\n',
                content: 'const patched = true\n',
            }],
        }
        const error = Object.assign(new Error('contract evidence'), {
            code: 'CONTRACT_FAILED',
            details: {
                unit: 'example-pack:exact',
            },
        })
        const report = makeConflictReport({
            root,
            catalog: [pack],
            error,
            requestedPacks: ['example-pack'],
        })

        assert.deepEqual(report.units[0].observed.exactAnchorRanges, [{
            start: 2,
            end: 2,
        }])
    }))

test('report inspection never follows a target symlink outside the installation', () =>
    withRoot((root) => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-report-outside-'))
        try {
            fs.mkdirSync(path.join(root, 'src'), { recursive: true })
            fs.writeFileSync(
                path.join(root, 'package.json'),
                JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }),
            )
            fs.writeFileSync(
                path.join(outside, 'private.ts'),
                'private-report-material\n',
            )
            fs.symlinkSync(
                path.join(outside, 'private.ts'),
                path.join(root, 'src/example.ts'),
            )
            const unit = {
                id: 'example-pack:symlink',
                file: 'src/example.ts',
                type: 'replace',
                anchor: 'private-report-material\n',
                content: 'replacement\n',
            }
            const error = Object.assign(new Error('unsafe target'), {
                code: 'SYMLINK_PATH',
                details: { unit: unit.id, file: unit.file },
            })
            const report = makeConflictReport({
                root,
                catalog: [{
                    id: 'example-pack',
                    version: '1.0.0',
                    units: [unit],
                }],
                error,
                requestedPacks: ['example-pack'],
            })

            assert.equal(report.units[0].observed.exists, false)
            assert.doesNotMatch(
                JSON.stringify(report.units[0].observed),
                /private-report-material/,
            )
        } finally {
            fs.rmSync(outside, { recursive: true, force: true })
        }
    }))
