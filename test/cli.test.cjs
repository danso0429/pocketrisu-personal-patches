'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { runCli } = require('../src/cli.cjs')

test('fixed-profile list marks selectable, default, and required packs', async () => {
    const catalog = [
        { id: 'bg-preserve', version: '1', units: [] },
        { id: 'lazy-chat-sync', version: '1', units: [] },
        { id: 'lazy-chat-bg-adapter', version: '1', units: [] },
        { id: 'persona-organizer', version: '1', units: [] },
        { id: 'preset-integrity', version: '1', units: [] },
    ]
    const lines = []
    const originalLog = console.log
    console.log = (value) => lines.push(String(value))
    try {
        await runCli({
            argv: ['node', 'patcher', 'list', '--json'],
            catalog,
            fixedProfile: 'features',
        })
    } finally {
        console.log = originalLog
    }

    const listed = JSON.parse(lines.join('\n'))
    assert.deepEqual(
        listed.map((pack) => ({
            id: pack.id,
            selectable: pack.selectable,
            default: pack.default,
            required: pack.required,
        })),
        [
            { id: 'bg-preserve', selectable: false, default: false, required: false },
            { id: 'lazy-chat-sync', selectable: true, default: true, required: false },
            { id: 'lazy-chat-bg-adapter', selectable: false, default: false, required: false },
            { id: 'persona-organizer', selectable: true, default: true, required: false },
            { id: 'preset-integrity', selectable: true, default: true, required: false },
        ],
    )
})
