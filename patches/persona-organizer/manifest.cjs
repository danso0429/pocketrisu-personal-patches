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
    title: 'Persona organizer',
    version: '0.9.0',
    userSelectable: true,
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
            id: 'persona-organizer:image-gallery-logic',
            file: 'src/ts/personaImages.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaImages.ts'), 'utf8'),
        },
        {
            id: 'persona-organizer:image-gallery-tests',
            file: 'src/ts/personaImages.test.ts',
            type: 'owned',
            content: fs.readFileSync(path.join(__dirname, 'files/src/ts/personaImages.test.ts'), 'utf8'),
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
        if (typeof folder.icon !== 'string') folder.icon = ''
        return true
    })
    for (const persona of data.personas) {
        if (persona.folderId && !personaFolderIds.has(persona.folderId)) persona.folderId = undefined
    }
`,
        },
        {
            id: 'persona-organizer:image-gallery-normalization',
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
            content: `    for (const persona of data.personas) {
        const gallery = Array.isArray(persona.imageGallery)
            ? persona.imageGallery.filter((path, index, values) =>
                typeof path === 'string' && !!path && values.indexOf(path) === index
            )
            : []
        if (typeof persona.icon !== 'string') persona.icon = ''
        if (persona.icon && !gallery.includes(persona.icon)) gallery.unshift(persona.icon)
        if (!persona.icon && gallery.length > 0) persona.icon = gallery[0]
        persona.imageGallery = gallery
    }
`,
            requires: ['persona-organizer:model-normalization'],
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
            id: 'persona-organizer:persona-image-gallery-field',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '    note?:string\n',
            content: '    imageGallery?:string[]\n',
            requires: ['persona-organizer:persona-folder-field'],
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
    icon?:string
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
            id: 'persona-organizer:persona-helper-import',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { v4 } from "uuid"\n',
            content: 'import { normalizePersonaImageGallery } from "./personaImages"\n',
        },
        {
            id: 'persona-organizer:single-image-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: `    db.personas[db.selectedPersona] = {
        ...db.personas[db.selectedPersona],
        name: db.username,
        icon: db.userIcon,
        personaPrompt: db.personaPrompt,
        note: db.userNote,
        id: db.personas[db.selectedPersona].id ?? v4()
    }
`,
            content: '    normalizePersonaImageGallery(db.personas[db.selectedPersona])\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:save-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: '    db.personas[db.selectedPersona].note = db.userNote\n',
            content: '    normalizePersonaImageGallery(db.personas[db.selectedPersona])\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:change-gallery-sync',
            file: 'src/ts/persona.ts',
            type: 'insert',
            where: 'after',
            anchor: '    const pr = db.personas[id]\n',
            content: '    normalizePersonaImageGallery(pr)\n',
            requires: ['persona-organizer:persona-helper-import'],
        },
        {
            id: 'persona-organizer:export-image-parameter',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: `export async function exportUserPersona() {
    let db = getDatabase({ snapshot: true })`,
            content: `export async function exportUserPersona(imagePath?: string) {
    let db = getDatabase({ snapshot: true })
    const exportImage = imagePath ?? db.userIcon
`,
        },
        {
            id: 'persona-organizer:export-image-fallback',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: '    if (!db.userIcon) {',
            content: '    if (!exportImage) {\n',
            requires: ['persona-organizer:export-image-parameter'],
        },
        {
            id: 'persona-organizer:export-selected-image',
            file: 'src/ts/persona.ts',
            type: 'replace',
            anchor: '        img = await readImage(db.userIcon)',
            content: '        img = await readImage(exportImage)\n',
            requires: ['persona-organizer:export-image-fallback'],
        },
        {
            id: 'persona-organizer:uncleanable-gallery-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: '            addUncleanable(v.icon);\n',
            content: `            if (v.imageGallery) {
                for (const image of v.imageGallery) addUncleanable(image)
            }
`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:uncleanable-folder-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: '    if (db.characterOrder) {\n',
            content: `    if (db.personaFolders) {
        for (const folder of db.personaFolders) addUncleanable(folder.icon ?? '')
    }

`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:replace-gallery-assets',
            file: 'src/ts/globalApi.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: `    return db;
}

/**
 * Checks and updates the character order in the database.
`,
            content: `    for (const persona of db.personas ?? []) {
        persona.icon = replaceData(persona.icon)
        if (persona.imageGallery) {
            persona.imageGallery = persona.imageGallery.map((path) => replaceData(path))
        }
    }
    for (const folder of db.personaFolders ?? []) {
        folder.icon = replaceData(folder.icon ?? '')
    }
`,
            after: ['lazy-chat-bg-adapter:durable-flush'],
        },
        {
            id: 'persona-organizer:server-gallery-assets',
            file: 'server/node/server.cjs',
            type: 'replace',
            anchor: '    if (Array.isArray(dbObj.personas)) for (const p of dbObj.personas) add(p?.icon);',
            content: `    if (Array.isArray(dbObj.personas)) {
        for (const persona of dbObj.personas) {
            add(persona?.icon);
            if (Array.isArray(persona?.imageGallery)) {
                for (const image of persona.imageGallery) add(image);
            }
        }
    }
    if (Array.isArray(dbObj.personaFolders)) {
        for (const folder of dbObj.personaFolders) add(folder?.icon);
    }

`,
            after: ['bg-preserve:hook:server-cjs-register-routes'],
        },
        {
            id: 'persona-organizer:backup-gallery-assets',
            file: 'src/ts/drive/backuplocal.ts',
            type: 'insert',
            where: 'after',
            anchor: `    if (db.personas) {
        for (const persona of db.personas) {
            if (persona && persona.icon) {
                assetMap.set(persona.icon, { charName: 'Persona', assetName: \`\${persona.name} Icon\` })
            }
        }
    }
`,
            content: `    if (db.personas) {
        for (const persona of db.personas) {
            for (const [index, image] of (persona.imageGallery ?? []).entries()) {
                assetMap.set(image, {
                    charName: 'Persona',
                    assetName: \`\${persona.name} Gallery \${index + 1}\`,
                })
            }
        }
    }
    for (const folder of db.personaFolders ?? []) {
        if (folder.icon) {
            assetMap.set(folder.icon, { charName: 'Persona Folder', assetName: \`\${folder.name} Image\` })
        }
    }
`,
        },
        {
            id: 'persona-organizer:plugin-gallery-type',
            file: 'src/ts/plugins/apiV3/risuai.d.ts',
            type: 'insert',
            where: 'after',
            anchor: `    /** Persona icon */
    icon: string;
`,
            content: `    /** Persona image gallery; icon remains the active image */
    imageGallery?: string[];
`,
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
