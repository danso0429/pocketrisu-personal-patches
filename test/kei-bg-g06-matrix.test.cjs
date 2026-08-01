'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const manifest = require('../patches/bg-preserve/manifest.cjs')
const { unitMatchesTarget } = require('../src/manager.cjs')

const target190 = { packageName: 'pocketrisu', packageVersion: '1.9.0' }

function unit(id) {
    const value = manifest.units.find((candidate) => candidate.id === id)
    assert.ok(value, `missing unit ${id}`)
    return value
}

function activeOwned(file) {
    const value = manifest.units.find((candidate) =>
        candidate.type === 'owned' && candidate.file === file
        && unitMatchesTarget(candidate, target190)
    )
    assert.ok(value, `missing exact-1.9 owned unit ${file}`)
    return value.content
}

test('G06 stays on the blocking browser owner until BG has a typed operation contract', () => {
    const redirect = unit('bg-preserve:hook:index-orchestrate-redirect')
    const reroll = unit('bg-preserve:hook:defaultchatscreen-reroll-blocking-call')
    const forward = unit('bg-preserve:hook:defaultchatscreen-forward-nobgorch')

    assert.match(redirect.managed, /!arg\.noBgOrch/)
    assert.match(reroll.managed, /false, true/)
    assert.match(forward.managed, /noBgOrch: noBgOrch \|\| continued/)
    assert.match(forward.managed, /append-only/)
})

test('current exact-1.9 BG request and materializer remain ordinary append only', () => {
    const client = activeOwned('src/ts/bgOrchestrate.ts')
    const server = activeOwned('server/node/bgOrchestrator.cjs')
    const start = client.indexOf('const startBody = JSON.stringify({')
    const end = client.indexOf('\n        })', start)
    assert.ok(start >= 0 && end > start, 'missing exact BG start body')
    const startBody = client.slice(start, end)

    assert.doesNotMatch(startBody, /operationKind|continueTarget|rerollTarget|savedSwipes|trailingComments/)
    assert.match(server, /idx\.sendChat\(-1, \{ signal: llmAbort\.signal \}\)/)
    assert.match(server, /const hasMainReply = baselineMsgs >= 0 && resultMsgs > baselineMsgs/)
    assert.match(client, /newMsgs > baselineMsgs/)
})

test('provider allowlisting cannot bypass the browser epilogue owner', () => {
    const redirect = unit('bg-preserve:hook:index-orchestrate-redirect').managed
    assert.match(redirect, /requiresClientGenerationEpilogue/)
    assert.doesNotMatch(redirect, /openai|anthropic|mistral|xcustom|reverse_proxy/i)
})
