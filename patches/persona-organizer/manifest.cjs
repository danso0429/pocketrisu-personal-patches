'use strict'

const fs = require('node:fs')
const path = require('node:path')

const replacementPath = path.join(
    __dirname,
    'files/src/lib/Setting/Pages/PersonaSettings.svelte',
)
const originalPath = path.join(__dirname, 'anchors/PersonaSettings.svelte')

module.exports = {
    id: 'persona-organizer',
    version: '0.7.0',
    units: [
        {
            id: 'persona-organizer:logic',
            file: 'src/ts/personaOrganizer.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaOrganizer.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:logic-tests',
            file: 'src/ts/personaOrganizer.test.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaOrganizer.test.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:model-normalization',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `    data.personas ??= [{
        name: data.username,
        personaPrompt: "",
        icon: data.userIcon,
        note: data.userNote,
        largePortrait: false
    }]
`,
            content: `    data.personaFolders ??= []
    if (!Array.isArray(data.personaFolders)) data.personaFolders = []
    const personaFolderIds = new Set<string>()
    data.personaFolders = data.personaFolders.filter((folder) => {
        if (!folder || typeof folder.id !== 'string' || !folder.id || personaFolderIds.has(folder.id)) return false
        personaFolderIds.add(folder.id)
        if (typeof folder.name !== 'string' || !folder.name.trim()) folder.name = 'Folder'
        return true
    })
    for (const persona of data.personas) {
        if (persona.folderId && !personaFolderIds.has(persona.folderId)) persona.folderId = undefined
    }
`,
        },
        {
            id: 'persona-organizer:persona-folder-field',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '    note?:string\n',
            content: '    folderId?:string\n',
        },
        {
            id: 'persona-organizer:folder-interface',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `export interface RisuPersona {
    personaPrompt:string
    name:string
    icon:string
    largePortrait?:boolean
    id?:string
    note?:string
    embeddedModule?:RisuModule
}
`,
            content: `export interface RisuPersonaFolder {
    id:string
    name:string
}
`,
        },
        {
            id: 'persona-organizer:database-folder-field',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '    personas:RisuPersona[]\n',
            content: '    personaFolders:RisuPersonaFolder[]\n',
        },
        {
            id: 'persona-organizer:settings-page',
            file: 'src/lib/Setting/Pages/PersonaSettings.svelte',
            type: 'replace',
            anchor: fs.readFileSync(originalPath, 'utf8'),
            managed: fs.readFileSync(replacementPath, 'utf8'),
            markerNeedle: 'POCKETRISU-PATCH:persona-organizer:START',
        },
    ],
}
