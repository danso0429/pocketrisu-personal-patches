'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog } = require('../src/catalog.cjs')

const repositoryRoot = path.resolve(__dirname, '..')

function moduleWrapper(name, source) {
    return `const ${name} = { exports: {} };\n((module, exports, require) => {\n${source}\n})(${name}, ${name}.exports, embeddedRequire);\n`
}

function build(profile, catalog) {
    const compose = fs.readFileSync(path.join(repositoryRoot, 'src/compose.cjs'), 'utf8')
    const manager = fs.readFileSync(path.join(repositoryRoot, 'src/manager.cjs'), 'utf8')
    const catalogSource = fs.readFileSync(path.join(repositoryRoot, 'src/catalog.cjs'), 'utf8')
    const cli = fs.readFileSync(path.join(repositoryRoot, 'src/cli.cjs'), 'utf8')

    return [
        '#!/usr/bin/env node',
        "'use strict'",
        `const EMBEDDED_CATALOG = ${JSON.stringify(catalog)};`,
        `function embeddedRequire(id) {
    if (id === './compose.cjs') return composeModule.exports;
    if (id === './manager.cjs') return managerModule.exports;
    if (id === './catalog.cjs') return catalogModule.exports;
    return require(id);
}`,
        moduleWrapper('composeModule', compose),
        moduleWrapper('managerModule', manager),
        moduleWrapper('catalogModule', catalogSource),
        moduleWrapper('cliModule', cli),
        `cliModule.exports.runCli({
    catalog: EMBEDDED_CATALOG,
    fixedProfile: ${JSON.stringify(profile)},
}).catch((error) => {
    console.error('[pocketrisu-patches] ' + error.message);
    if (error.code) console.error('[' + error.code + ']');
    process.exitCode = 1;
});`,
        '',
    ].join('\n')
}

function main() {
    const catalog = loadCatalog(repositoryRoot)
    const outputDirectory = path.join(repositoryRoot, 'dist')
    fs.mkdirSync(outputDirectory, { recursive: true })
    for (const profile of ['features', 'all']) {
        const output = path.join(outputDirectory, `pocketrisu-${profile}.cjs`)
        fs.writeFileSync(output, build(profile, catalog), { mode: 0o755 })
        console.log(`${profile}: ${output} (${fs.statSync(output).size} bytes)`)
    }
}

if (require.main === module) main()

module.exports = { build }
