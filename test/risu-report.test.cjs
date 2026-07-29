'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DEFAULT_RECEIVER_NAME,
    chooseReceiver,
    deliverConflictReport,
    loadConflictReport,
    makeRisuReportPatch,
    reportContent,
    validateLocalServerUrl,
} = require('../src/risu-report.cjs')
const { writeConflictReport } = require('../src/report.cjs')

function sampleReport(incidentId = '20260729123456-abcdef1234') {
    return {
        schema: 1,
        incidentId,
        createdAt: '2026-07-29T12:34:56.000Z',
        patcherVersion: '0.2.0-test',
        phase: 'plan',
        target: {
            packageName: 'pocketrisu',
            packageVersion: '1.8.1',
        },
        selection: {
            requested: ['example'],
            resolved: ['example'],
            autoAdded: [],
            superseded: [],
        },
        error: {
            code: 'ANCHOR_COUNT',
            message: 'verified anchor missing',
            cause: 'The verified anchor was missing.',
            details: {
                file: 'src/example.ts',
            },
        },
        packs: ['example'],
        files: ['src/example.ts'],
        units: [],
        writeSafety: {
            liveSourceFilesChanged: false,
            stagingSourceFilesChanged: false,
            automaticFixAttempted: false,
            packsSilentlyRemoved: false,
        },
        maintainerAction: 'Send this report to the patch maintainer.',
    }
}

function withRoot(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-risu-report-'))
    fs.mkdirSync(path.join(root, 'save'), { recursive: true })
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'pocketrisu', version: '1.8.1' }),
    )
    return Promise.resolve()
        .then(() => fn(root))
        .finally(() => fs.rmSync(root, { recursive: true, force: true }))
}

test('persona and character delivery replace only their report description field', () => {
    const report = '# report'
    const persona = makeRisuReportPatch({
        database: {
            personas: [{
                name: DEFAULT_RECEIVER_NAME,
                personaPrompt: 'old',
                icon: '',
                unrelated: 'keep',
            }],
        },
        channel: 'persona',
        content: report,
        incidentId: sampleReport().incidentId,
    })
    assert.deepEqual(persona.patch, [{
        op: 'replace',
        path: '/personas/0/personaPrompt',
        value: report,
    }])

    const character = makeRisuReportPatch({
        database: {
            characters: [{
                type: 'character',
                name: DEFAULT_RECEIVER_NAME,
                desc: 'old',
                chats: [{ id: 'untouched' }],
            }],
        },
        channel: 'character',
        content: report,
        incidentId: sampleReport().incidentId,
    })
    assert.deepEqual(character.patch, [{
        op: 'replace',
        path: '/characters/0/desc',
        value: report,
    }])
    assert.equal(character.patch.some((operation) =>
        operation.path.includes('/chats')
    ), false)
})

test('module delivery creates one inactive named lorebook or replaces only its content', () => {
    const created = makeRisuReportPatch({
        database: {
            modules: [{
                id: 'module-1',
                name: DEFAULT_RECEIVER_NAME,
                description: '',
            }],
        },
        channel: 'module',
        content: '# first',
        incidentId: sampleReport().incidentId,
        randomUUID: () => 'receiver-key',
    })
    assert.equal(created.patch[0].path, '/modules/0/lorebook')
    assert.equal(created.patch[0].value[0].comment, DEFAULT_RECEIVER_NAME)
    assert.equal(created.patch[0].value[0].content, '# first')
    assert.equal(created.patch[0].value[0].alwaysActive, false)
    assert.equal(created.patch[0].value[0].key, '__pocketrisu_report_receiver-key__')
    assert.equal(created.receiver.lorebookCreated, true)

    const existing = makeRisuReportPatch({
        database: {
            modules: [{
                id: 'module-1',
                name: DEFAULT_RECEIVER_NAME,
                lorebook: [{
                    comment: 'unrelated',
                    content: 'keep',
                }, {
                    comment: DEFAULT_RECEIVER_NAME,
                    content: '# first',
                    key: '__pocketrisu_report_existing-key__',
                    mode: 'normal',
                    alwaysActive: false,
                    selective: false,
                }],
            }],
        },
        channel: 'module',
        content: '# second',
        incidentId: sampleReport().incidentId,
    })
    assert.deepEqual(existing.patch, [{
        op: 'replace',
        path: '/modules/0/lorebook/1/content',
        value: '# second',
    }])
    assert.equal(existing.receiver.lorebookCreated, false)

    assert.throws(
        () => makeRisuReportPatch({
            database: {
                modules: [{
                    id: 'module-1',
                    name: DEFAULT_RECEIVER_NAME,
                    lorebook: [{
                        comment: DEFAULT_RECEIVER_NAME,
                        content: 'user lore',
                        key: 'ordinary-key',
                        mode: 'normal',
                        alwaysActive: false,
                        selective: false,
                    }],
                }],
            },
            channel: 'module',
            content: '# report',
        }),
        (error) => error.code === 'RISU_REPORT_MODULE_UNSAFE',
    )
})

test('auto delivery requires one unique receiver and ignores character groups', () => {
    const database = {
        personas: [{ name: DEFAULT_RECEIVER_NAME }],
        characters: [{
            type: 'group',
            name: DEFAULT_RECEIVER_NAME,
        }],
    }
    assert.equal(
        chooseReceiver(database, 'auto').type,
        'persona',
    )
    assert.throws(
        () => chooseReceiver({
            personas: [{ name: DEFAULT_RECEIVER_NAME }],
            modules: [{ name: DEFAULT_RECEIVER_NAME }],
        }, 'auto'),
        (error) => error.code === 'RISU_REPORT_RECEIVER_AMBIGUOUS',
    )
    assert.throws(
        () => chooseReceiver({
            personas: [
                { name: DEFAULT_RECEIVER_NAME },
                { name: DEFAULT_RECEIVER_NAME },
            ],
        }, 'persona'),
        (error) => error.code === 'RISU_REPORT_RECEIVER_AMBIGUOUS',
    )
})

test('latest report loading validates the incident and ignores unrelated files', () =>
    withRoot((root) => {
        const older = sampleReport('20260729120000-aaaaaaaaaa')
        const newer = {
            ...sampleReport('20260729130000-bbbbbbbbbb'),
            createdAt: '2026-07-29T13:00:00.000Z',
        }
        writeConflictReport(root, older)
        writeConflictReport(root, newer)
        fs.writeFileSync(
            path.join(root, 'save/pocketrisu-patches/reports/not-a-report.json'),
            '{}',
        )

        assert.equal(loadConflictReport(root).incidentId, newer.incidentId)
        assert.equal(loadConflictReport(root, older.incidentId).incidentId, older.incidentId)
        assert.match(reportContent(newer), new RegExp(newer.incidentId))
    }))

test('RisuAI delivery uses local authenticated read, hash-guarded patch, flush, and exact verification', () =>
    withRoot(async (root) => {
        let database = {
            personas: [{
                id: 'persona-1',
                name: DEFAULT_RECEIVER_NAME,
                personaPrompt: 'old',
                icon: '',
            }],
            modules: [],
            characters: [],
        }
        const calls = []
        const codec = {
            decodeRisuSave: async (bytes) =>
                JSON.parse(Buffer.from(bytes).toString('utf8')),
            normalizeJSON: (value) => value,
            calculateHash: () => 0x1234,
        }
        const fetchImpl = async (url, init) => {
            const pathname = new URL(url).pathname
            calls.push({ pathname, method: init.method })
            if (pathname === '/api/read') {
                return new Response(JSON.stringify(database), { status: 200 })
            }
            if (pathname === '/api/session') {
                assert.equal(init.headers['risu-auth'], 'local-token')
                assert.equal(
                    Object.prototype.hasOwnProperty.call(
                        init.headers,
                        'x-session-id',
                    ),
                    false,
                )
                return Response.json(
                    { ok: true },
                    {
                        headers: {
                            'set-cookie': `risu-session=${'a'.repeat(64)}; HttpOnly; SameSite=Strict; Path=/`,
                        },
                    },
                )
            }
            if (pathname === '/api/patch') {
                const body = JSON.parse(init.body)
                assert.equal(body.expectedHash, '1234')
                assert.equal(body.patch.length, 1)
                assert.equal(body.patch[0].path, '/personas/0/personaPrompt')
                database = structuredClone(database)
                database.personas[0].personaPrompt = body.patch[0].value
                return Response.json({ success: true })
            }
            if (pathname === '/api/db/flush') {
                assert.equal(
                    init.headers.cookie,
                    `risu-session=${'a'.repeat(64)}`,
                )
                return Response.json({ success: true })
            }
            throw new Error(`unexpected path ${pathname}`)
        }

        const outcome = await deliverConflictReport({
            root,
            report: sampleReport(),
            channel: 'auto',
            serverUrl: 'http://127.0.0.1:6001',
            fetchImpl,
            codecLoader: () => codec,
            tokenFactory: () => 'local-token',
        })

        assert.deepEqual(
            calls.map((call) => `${call.method} ${call.pathname}`),
            [
                'GET /api/read',
                'POST /api/session',
                'POST /api/patch',
                'POST /api/db/flush',
                'GET /api/read',
            ],
        )
        assert.equal(outcome.status, 'delivered')
        assert.equal(outcome.receiver.type, 'persona')
        assert.equal(outcome.verified, true)
        assert.equal(outcome.directDatabaseWrite, false)
        assert.match(database.personas[0].personaPrompt, /PocketRisu patch conflict/)
    }))

test('a concurrent database change is reported without retrying or flushing', () =>
    withRoot(async (root) => {
        const database = {
            personas: [{
                name: DEFAULT_RECEIVER_NAME,
                personaPrompt: '',
            }],
        }
        let patchCalls = 0
        let flushCalls = 0
        const fetchImpl = async (url) => {
            const pathname = new URL(url).pathname
            if (pathname === '/api/read') {
                return new Response(JSON.stringify(database), { status: 200 })
            }
            if (pathname === '/api/session') {
                return Response.json(
                    { ok: true },
                    {
                        headers: {
                            'set-cookie': `risu-session=${'b'.repeat(64)}; HttpOnly; SameSite=Strict; Path=/`,
                        },
                    },
                )
            }
            if (pathname === '/api/patch') {
                patchCalls += 1
                return Response.json(
                    { code: 'HASH_MISMATCH' },
                    { status: 409 },
                )
            }
            if (pathname === '/api/db/flush') flushCalls += 1
            return Response.json({ success: true })
        }

        await assert.rejects(
            deliverConflictReport({
                root,
                report: sampleReport(),
                channel: 'persona',
                serverUrl: 'http://127.0.0.1:6001',
                fetchImpl,
                codecLoader: () => ({
                    decodeRisuSave: async (bytes) =>
                        JSON.parse(Buffer.from(bytes).toString('utf8')),
                    normalizeJSON: (value) => value,
                    calculateHash: () => 1,
                }),
                tokenFactory: () => 'local-token',
            }),
            (error) => error.code === 'RISU_REPORT_DATABASE_CONFLICT',
        )
        assert.equal(patchCalls, 1)
        assert.equal(flushCalls, 0)
    }))

test('delivery is not reported as verified without an explicit durable flush confirmation', () =>
    withRoot(async (root) => {
        const database = {
            personas: [{
                name: DEFAULT_RECEIVER_NAME,
                personaPrompt: '',
            }],
        }
        let readCalls = 0
        const fetchImpl = async (url) => {
            const pathname = new URL(url).pathname
            if (pathname === '/api/read') {
                readCalls += 1
                return new Response(JSON.stringify(database), { status: 200 })
            }
            if (pathname === '/api/session') {
                return Response.json(
                    { ok: true },
                    {
                        headers: {
                            'set-cookie': `risu-session=${'c'.repeat(64)}; HttpOnly; SameSite=Strict; Path=/`,
                        },
                    },
                )
            }
            if (pathname === '/api/patch') {
                return Response.json({ success: true })
            }
            if (pathname === '/api/db/flush') {
                return Response.json({ success: false })
            }
            throw new Error(`unexpected path ${pathname}`)
        }

        await assert.rejects(
            deliverConflictReport({
                root,
                report: sampleReport(),
                channel: 'persona',
                serverUrl: 'http://127.0.0.1:6001',
                fetchImpl,
                codecLoader: () => ({
                    decodeRisuSave: async (bytes) =>
                        JSON.parse(Buffer.from(bytes).toString('utf8')),
                    normalizeJSON: (value) => value,
                    calculateHash: () => 1,
                }),
                tokenFactory: () => 'local-token',
            }),
            (error) => error.code === 'RISU_REPORT_SERVER_REJECTED',
        )
        assert.equal(readCalls, 1)
    }))

test('delivery refuses a missing session cookie before changing the report receiver', () =>
    withRoot(async (root) => {
        const database = {
            personas: [{
                name: DEFAULT_RECEIVER_NAME,
                personaPrompt: '',
            }],
        }
        let patchCalls = 0
        const fetchImpl = async (url) => {
            const pathname = new URL(url).pathname
            if (pathname === '/api/read') {
                return new Response(JSON.stringify(database), { status: 200 })
            }
            if (pathname === '/api/session') {
                return Response.json({ ok: true })
            }
            if (pathname === '/api/patch') patchCalls += 1
            return Response.json({ success: true })
        }

        await assert.rejects(
            deliverConflictReport({
                root,
                report: sampleReport(),
                channel: 'persona',
                serverUrl: 'http://127.0.0.1:6001',
                fetchImpl,
                codecLoader: () => ({
                    decodeRisuSave: async (bytes) =>
                        JSON.parse(Buffer.from(bytes).toString('utf8')),
                    normalizeJSON: (value) => value,
                    calculateHash: () => 1,
                }),
                tokenFactory: () => 'local-token',
            }),
            (error) => error.code === 'RISU_REPORT_SESSION_INVALID',
        )
        assert.equal(patchCalls, 0)
    }))

test('report delivery URL is restricted to credential-free loopback origins', () => {
    assert.equal(
        validateLocalServerUrl('http://127.0.0.1:6001'),
        'http://127.0.0.1:6001',
    )
    assert.throws(
        () => validateLocalServerUrl('https://example.com'),
        (error) => error.code === 'RISU_REPORT_URL_UNSAFE',
    )
    assert.throws(
        () => validateLocalServerUrl('http://user:pass@localhost:6001'),
        (error) => error.code === 'RISU_REPORT_URL_UNSAFE',
    )
    assert.throws(
        () => validateLocalServerUrl('http://localhost:6001/base'),
        (error) => error.code === 'RISU_REPORT_URL_UNSAFE',
    )
})
