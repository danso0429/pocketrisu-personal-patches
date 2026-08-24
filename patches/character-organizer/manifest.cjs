'use strict'

const fs = require('node:fs')
const path = require('node:path')

function owned(relative) {
    return fs.readFileSync(path.join(__dirname, 'files', relative), 'utf8')
}

module.exports = {
    id: 'character-organizer',
    title: 'Character organizer',
    version: '0.1.1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        {
            id: 'character-organizer:logic',
            file: 'src/ts/characterOrganizer.ts',
            type: 'owned',
            content: owned('src/ts/characterOrganizer.ts'),
        },
        {
            id: 'character-organizer:logic-tests',
            file: 'src/ts/characterOrganizer.test.ts',
            type: 'owned',
            content: owned('src/ts/characterOrganizer.test.ts'),
            requires: ['character-organizer:logic'],
        },
        {
            id: 'character-organizer:state',
            file: 'src/ts/characterOrganizerState.svelte.ts',
            type: 'owned',
            content: owned('src/ts/characterOrganizerState.svelte.ts'),
        },
        {
            id: 'character-organizer:screen',
            file: 'src/lib/Others/CharacterOrganizer.svelte',
            type: 'owned',
            content: owned('src/lib/Others/CharacterOrganizer.svelte'),
            requires: [
                'character-organizer:logic',
                'character-organizer:state',
            ],
        },
        {
            id: 'character-organizer:app-imports',
            file: 'src/App.svelte',
            type: 'insert',
            where: 'after',
            anchor: "    import sendSound from './etc/send.mp3'\n",
            content: `    import CharacterOrganizer from './lib/Others/CharacterOrganizer.svelte'
    import { characterOrganizerState } from './ts/characterOrganizerState.svelte'
`,
            requires: [
                'character-organizer:state',
                'character-organizer:screen',
            ],
        },
        {
            id: 'character-organizer:app-screen',
            file: 'src/App.svelte',
            type: 'insert',
            where: 'before',
            anchor: '    <AlertComp />\n',
            managed: `    <!-- POCKETRISU-PATCH:character-organizer:app-screen:START -->
    {#if characterOrganizerState.open}
        <CharacterOrganizer close={() => characterOrganizerState.open = false} />
    {/if}
    <!-- POCKETRISU-PATCH:character-organizer:app-screen:END -->
`,
            markerNeedle: 'POCKETRISU-PATCH:character-organizer:app-screen:START',
            requires: ['character-organizer:app-imports'],
        },
    ],
}
