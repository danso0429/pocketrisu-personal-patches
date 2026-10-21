'use strict'

// Writer session on the external request header settings write. Active only
// with lazy chat storage, which owns the writer session helper; without it the
// page keeps sending no session id (an id-less write passes the server check).

const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const file = 'src/lib/Setting/Pages/PersonalSettings/ExternalHeadersSetting.svelte'
const owner = 'personal-settings:external-headers:' + file

module.exports = {
    id: 'personal-settings-lazy-session-adapter',
    title: 'Personal settings lazy-storage session adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: { verified: ['1.10.0'], reviewing: [] },
    },
    userSelectable: false,
    requires: ['personal-settings', 'lazy-chat-sync'],
    autoWhen: {
        all: ['personal-settings', 'lazy-chat-sync'],
    },
    units: [
        {
            id: 'personal-settings-lazy-session-adapter:external-headers-import:1.10',
            file,
            type: 'insert',
            where: 'after',
            anchor: "    import { clientBuildFetch } from 'src/ts/storage/clientBuildHandshake'\n",
            content: "    import { notifySessionDeactivated, writerSessionHeaders } from 'src/ts/storage/writerSession'\n",
            requires: [
                owner,
                'lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            // PUT /api/external-request-headers: session headers on the save,
            // and a 423 goes to the deactivation notice before any other handling.
            id: 'personal-settings-lazy-session-adapter:external-headers-write:1.10',
            file,
            type: 'replace',
            anchor: `            const response = await clientBuildFetch('/api/external-request-headers', {
                method: save ? 'PUT' : 'GET',
                headers: { 'Content-Type': 'application/json', 'risu-auth': auth },
                ...(save ? { body: JSON.stringify({ revision, rules }) } : {}),
                signal: controller.signal,
            })
`,
            content: `            const response = await clientBuildFetch('/api/external-request-headers', {
                method: save ? 'PUT' : 'GET',
                headers: { 'Content-Type': 'application/json', 'risu-auth': auth, ...(save ? writerSessionHeaders() : {}) },
                ...(save ? { body: JSON.stringify({ revision, rules }) } : {}),
                signal: controller.signal,
            })
            if (response.status === 423) {
                notifySessionDeactivated(response)
                return
            }
`,
            requires: ['personal-settings-lazy-session-adapter:external-headers-import:1.10'],
            targetVersions: pocketRisu1100,
        },
    ],
}
