'use strict'

const fs = require('node:fs')
const path = require('node:path')

function send(event, detail = {}) {
    if (typeof process.send === 'function' && process.connected) {
        process.send({ scope: 'pocketrisu-h1-client', event, ...detail })
    }
}

async function seedRuntime(message) {
    const targetRoot = path.resolve(message.targetRoot)
    const runtimeRoot = path.resolve(message.runtimeRoot)
    const database = JSON.parse(Buffer.from(message.databaseBase64, 'base64').toString('utf8'))
    fs.mkdirSync(path.join(runtimeRoot, 'save'), { recursive: true })
    fs.writeFileSync(path.join(runtimeRoot, 'save', '__password'), message.password, 'utf8')
    const dbModulePath = path.join(targetRoot, 'server/node/db.cjs')
    const utilsModulePath = path.join(targetRoot, 'server/node/utils.cjs')
    const dbModule = require(dbModulePath)
    const { encodeRisuSaveLegacy } = require(utilsModulePath)
    dbModule.kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(database)))
    dbModule.checkpointWal('TRUNCATE')
    dbModule.db.close()
    send('seeded')
}

async function submitRequest(message) {
    const response = await fetch(`${message.baseURL}/api/bg-orchestrate`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: message.cookie,
        },
        body: JSON.stringify(message.body),
    })
    const body = await response.json().catch(() => null)
    send('response', { status: response.status, body })
}

async function expireShortLivedState(message) {
    const targetRoot = path.resolve(message.targetRoot)
    const dbModule = require(path.join(targetRoot, 'server/node/db.cjs'))
    dbModule.kvDel(`bg-orch-result-op:${message.operationId}`)
    dbModule.kvDel(`bg-orch-state-op:${message.operationId}`)
    dbModule.checkpointWal('TRUNCATE')
    dbModule.db.close()
    send('expired')
}

process.on('message', async message => {
    if (!message || message.scope !== 'pocketrisu-h1-client') return
    try {
        if (message.command === 'seed') await seedRuntime(message)
        else if (message.command === 'submit') await submitRequest(message)
        else if (message.command === 'expire') await expireShortLivedState(message)
        else throw new Error(`Unknown H1 client command: ${message.command}`)
        process.exitCode = 0
    } catch (error) {
        send('error', { message: String(error?.stack || error) })
        process.exitCode = 1
    } finally {
        if (typeof process.disconnect === 'function' && process.connected) process.disconnect()
    }
})
