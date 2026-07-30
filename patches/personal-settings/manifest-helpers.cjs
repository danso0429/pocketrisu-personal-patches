'use strict'

const fs = require('node:fs')
const path = require('node:path')

function owned(moduleDirectory, relative) {
    return fs.readFileSync(path.join(moduleDirectory, 'files', relative), 'utf8')
}

function managedTypeScript(id, content) {
    const body = content.endsWith('\n') ? content : `${content}\n`
    return `/* POCKETRISU-PATCH:${id}:START */\n${body}/* POCKETRISU-PATCH:${id}:END */\n`
}

module.exports = {
    managedTypeScript,
    owned,
}
