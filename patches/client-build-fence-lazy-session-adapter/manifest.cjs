'use strict'

// Writer session on the two session-checked SystemBackup writes
// (PUT /api/db/snapshots/limits and PUT /api/backup/server/path). Active only
// with lazy chat storage, which owns the writer session helper; without it the
// page keeps sending no session id (an id-less write passes the server check).

const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
const file = 'src/lib/Setting/Pages/SystemBackup.svelte'
const prefix = 'client-build-fence-lazy-session-adapter:'

// The request line itself belongs to the client build fence unit, so the
// anchor starts at the headers line. A 423 goes to the deactivation notice
// before the body is parsed or a generic error is shown.
function write(name, route, body, owner) {
    const parse = '            const json = await res.json().catch(() => ({}))\n'
    const anchor = `                headers: { 'risu-auth': auth, 'content-type': 'application/json' },
                body: ${body},
            })
${parse}`
    return {
        id: `${prefix}${name}:1.10`,
        file,
        type: 'replace',
        anchor,
        content: `                headers: { 'risu-auth': auth, 'content-type': 'application/json', ...writerSessionHeaders() },
                body: ${body},
            })
            // PUT ${route} is session-checked: another session holds the write lock.
            if (res.status === 423) {
                notifySessionDeactivated(res)
                return
            }
${parse}`,
        requires: [`${prefix}import:1.10`, owner],
        targetVersions: pocketRisu1100,
    }
}

module.exports = {
    id: 'client-build-fence-lazy-session-adapter',
    title: 'Client build fence lazy-storage session adapter',
    version: '0.1.0',
    targets: {
        pocketrisu: { verified: ['1.10.0'], reviewing: [] },
    },
    userSelectable: false,
    requires: ['client-build-fence', 'lazy-chat-sync'],
    autoWhen: {
        all: ['client-build-fence', 'lazy-chat-sync'],
    },
    units: [
        {
            id: `${prefix}import:1.10`,
            file,
            type: 'insert',
            where: 'after',
            // Upstream anchor (the client build fence import uses the same one),
            // so the pairwise analysis with the other packs' units on this file
            // runs on the unpatched baseline.
            anchor: "    import { forageStorage } from 'src/ts/globalApi.svelte'\n",
            content: "    import { notifySessionDeactivated, writerSessionHeaders } from 'src/ts/storage/writerSession'\n",
            requires: [
                'client-build-fence:system-backup-import:1.9',
                'lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10',
            ],
            // Optional order: this unit's anchor does not exist in the
            // unpatched file (absent ids are ignored).
            after: ['client-build-fence-kei-adapter:snapshot-restore:1.9'],
            targetVersions: pocketRisu1100,
        },
        write('snapshot-limits', '/api/db/snapshots/limits',
            'JSON.stringify({ maxCount: c, maxBytes: mb * 1024 * 1024 })',
            'client-build-fence:system-backup-snapshot-limits:1.9'),
        write('backup-path', '/api/backup/server/path',
            'JSON.stringify({ path: trimmed })',
            'client-build-fence:system-backup-backup-path:1.9'),
    ],
}
