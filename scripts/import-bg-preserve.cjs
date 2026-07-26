'use strict'

const fs = require('node:fs')
const path = require('node:path')

function parseInstaller(source) {
    const payloadMatch = source.match(/const PAYLOAD_B64 = "([^"]+)"/)
    if (!payloadMatch) throw new Error('Could not locate PAYLOAD_B64')
    const payload = JSON.parse(Buffer.from(payloadMatch[1], 'base64').toString('utf8'))

    const prefix = 'const HOOKS = '
    const hooksStart = source.indexOf(prefix)
    const hooksEnd = source.indexOf('\n// @@HOOKS-END@@', hooksStart)
    if (hooksStart === -1 || hooksEnd === -1) throw new Error('Could not locate HOOKS')
    const hooks = JSON.parse(source.slice(hooksStart + prefix.length, hooksEnd))
    return { hooks, payload }
}

function sanitizeId(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

function buildPack(source, version) {
    const { hooks, payload } = parseInstaller(source)
    const previousByFile = new Map()
    const units = []

    for (const hook of hooks) {
        const id = `bg-preserve:hook:${sanitizeId(hook.id)}`
        const previous = previousByFile.get(hook.file)
        units.push({
            id,
            file: hook.file,
            type: hook.where === 'replace' ? 'replace' : 'insert',
            where: hook.where === 'replace' ? undefined : hook.where,
            anchor: hook.anchor,
            managed: hook.block,
            markerNeedle: hook.unique,
            anchorPolicy: 'first',
            after: previous ? [previous] : undefined,
        })
        previousByFile.set(hook.file, id)
    }

    for (const [file, content] of Object.entries(payload)) {
        units.push({
            id: `bg-preserve:owned:${file}`,
            file,
            type: 'owned',
            content,
        })
    }

    return {
        id: 'bg-preserve',
        version,
        source: 'bg-preserve-install.cjs',
        units,
    }
}

function main() {
    const installer = process.argv[2]
    const output = process.argv[3]
    const version = process.argv[4] ?? 'unknown'
    if (!installer || !output) {
        throw new Error('Usage: node scripts/import-bg-preserve.cjs <installer> <output> [version]')
    }
    const source = fs.readFileSync(installer, 'utf8')
    const pack = buildPack(source, version)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(pack, null, 2)}\n`)
    console.log(JSON.stringify({
        output,
        version,
        units: pack.units.length,
        hooks: pack.units.filter((unit) => unit.type !== 'owned').length,
        owned: pack.units.filter((unit) => unit.type === 'owned').length,
    }))
}

if (require.main === module) main()

module.exports = { buildPack, parseInstaller }
