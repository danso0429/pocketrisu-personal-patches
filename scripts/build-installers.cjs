'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog } = require('../src/catalog.cjs')
const packageJson = require('../package.json')

const repositoryRoot = path.resolve(__dirname, '..')

function moduleWrapper(name, source) {
    return `const ${name} = { exports: {} };\n((module, exports, require) => {\n${source}\n})(${name}, ${name}.exports, embeddedRequire);\n`
}

function build(profile, catalog) {
    const compose = fs.readFileSync(path.join(repositoryRoot, 'src/compose.cjs'), 'utf8')
    const resolver = fs.readFileSync(path.join(repositoryRoot, 'src/resolver.cjs'), 'utf8')
    const compatibility = fs.readFileSync(path.join(repositoryRoot, 'src/compatibility.cjs'), 'utf8')
    const report = fs.readFileSync(path.join(repositoryRoot, 'src/report.cjs'), 'utf8')
    const risuReport = fs.readFileSync(path.join(repositoryRoot, 'src/risu-report.cjs'), 'utf8')
    const updateFeed = fs.readFileSync(path.join(repositoryRoot, 'src/update-feed.cjs'), 'utf8')
    const updateChannel = fs.readFileSync(path.join(repositoryRoot, 'src/update-channel.cjs'), 'utf8')
    const manager = fs.readFileSync(path.join(repositoryRoot, 'src/manager.cjs'), 'utf8')
    const staging = fs.readFileSync(path.join(repositoryRoot, 'src/staging.cjs'), 'utf8')
    const catalogSource = fs.readFileSync(path.join(repositoryRoot, 'src/catalog.cjs'), 'utf8')
    const cli = fs.readFileSync(path.join(repositoryRoot, 'src/cli.cjs'), 'utf8')

    return [
        '#!/usr/bin/env node',
        "'use strict'",
        `const EMBEDDED_CATALOG = ${JSON.stringify(catalog)};`,
        `function embeddedRequire(id) {
    if (id === './compose.cjs') return composeModule.exports;
    if (id === './resolver.cjs') return resolverModule.exports;
    if (id === './compatibility.cjs') return compatibilityModule.exports;
    if (id === './report.cjs') return reportModule.exports;
    if (id === './risu-report.cjs') return risuReportModule.exports;
    if (id === './update-feed.cjs') return updateFeedModule.exports;
    if (id === './update-channel.cjs') return updateChannelModule.exports;
    if (id === './manager.cjs') return managerModule.exports;
    if (id === './staging.cjs') return stagingModule.exports;
    if (id === './catalog.cjs') return catalogModule.exports;
    return require(id);
}`,
        moduleWrapper('composeModule', compose),
        moduleWrapper('resolverModule', resolver),
        moduleWrapper('compatibilityModule', compatibility),
        moduleWrapper('reportModule', report),
        moduleWrapper('risuReportModule', risuReport),
        moduleWrapper('updateFeedModule', updateFeed),
        moduleWrapper('updateChannelModule', updateChannel),
        moduleWrapper('managerModule', manager),
        moduleWrapper('stagingModule', staging),
        moduleWrapper('catalogModule', catalogSource),
        moduleWrapper('cliModule', cli),
        `cliModule.exports.runCli({
    catalog: EMBEDDED_CATALOG,
    fixedProfile: ${JSON.stringify(profile)},
    patcherVersion: ${JSON.stringify(packageJson.version)},
}).catch(cliModule.exports.handleCliFailure);`,
        '',
    ].join('\n')
}

function main() {
    const catalog = loadCatalog(repositoryRoot)
    const outputDirectory = path.join(repositoryRoot, 'dist')
    fs.mkdirSync(outputDirectory, { recursive: true })
    for (const retired of ['features', 'hardening']) {
        fs.rmSync(path.join(outputDirectory, `pocketrisu-${retired}.cjs`), { force: true })
    }
    for (const name of ['patcher', 'all']) {
        const output = path.join(outputDirectory, `pocketrisu-${name}.cjs`)
        fs.writeFileSync(output, build('all', catalog), { mode: 0o755 })
        console.log(`${name}: ${output} (${fs.statSync(output).size} bytes)`)
    }
}

if (require.main === module) main()

module.exports = { build }
