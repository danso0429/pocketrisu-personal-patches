'use strict'
const fs = require('node:fs')
const path = require('node:path')
const targetVersions = { pocketrisu: ['1.10.0'] }
module.exports = prior => {
    const units = []
    const related = ['personal-settings', 'character-organizer', 'bg-preserve', 'client-build-fence']
        .flatMap(name => require(`../${name}/manifest.cjs`).units)
    const add = (name, file, anchor, content, markup = false) => {
        units.push({ id: `lazy-chat-bg-adapter:notifications:${name}:1.10`, file,
            type: 'replace', anchor, ...(markup ? { managed: content } : { content }), targetVersions,
            after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id) })
    }
    for (const file of ['server/node/bgNotifications.cjs', 'server/node/bgNotifications.test.ts',
        'src/ts/bgNotifications.ts', 'src/ts/bgNotifications.test.ts',
        'src/lib/Others/BgNotificationDelivery.svelte']) {
        units.push({ id: `lazy-chat-bg-adapter:notifications:owned:${file}:1.10`, file,
            type: 'owned', targetVersions, content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    add('owner', 'server/node/server.cjs',
        'const serverChatInputOwner = createServerChatInputOwner({',
        `const { createBgNotifications } = require('./bgNotifications.cjs');
const bgNotifications = createBgNotifications({ db: sqliteDb, kvGet, kvSet, kvDel, kvList });
const serverChatInputOwner = createServerChatInputOwner({
    publishNotification: event => bgNotifications.publish(event),`)
    add('routes', 'server/node/server.cjs',
        '// ─── Express error middleware — must be registered after all routes ─────────',
        `app.post('/api/bg-notifications/claim', sessionAuthMiddleware, (req, res) => {
    if (typeof req.body?.consumerId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(req.body.consumerId)) {
        return res.status(400).json({ error: 'invalid-consumer' });
    }
    try { return res.json({ notifications: bgNotifications.claim(req.body.consumerId) }); }
    catch { return res.status(503).json({ error: 'notification-store-unavailable' }); }
});
app.post('/api/bg-notifications/ack', sessionAuthMiddleware, (req, res) => {
    try { return res.json({ acknowledged: bgNotifications.acknowledge(req.body?.consumerId, req.body?.claims) }); }
    catch (error) {
        return res.status(error?.message === 'notification_ack_invalid' ? 400 : 503)
            .json({ error: 'notification-ack-unavailable' });
    }
});

// ─── Express error middleware — must be registered after all routes ─────────`)
    add('writer-fence', 'server/node/clientBuildFence.cjs',
        "const EXACT_WRITER_ROUTES = new Set([",
        "const EXACT_WRITER_ROUTES = new Set([\n    'POST /api/bg-notifications/claim',\n    'POST /api/bg-notifications/ack',")
    units.at(-1).requires = ['client-build-fence:server-import:1.9']
    add('retry-intents', 'server/node/bgOrchestrator.cjs',
        '    const sweepResultRetention = () => {\n',
        `    const sweepResultRetention = () => {
      try { serverChatInputOwner?.retryNotifications?.() }
      catch { console.warn('[BGNotification] input notice retry unavailable') }
`)
    add('app-import', 'src/App.svelte', "    import Toaster from './lib/UI/GUI/Toaster.svelte';",
        "    import Toaster from './lib/UI/GUI/Toaster.svelte';\n    import BgNotificationDelivery from './lib/Others/BgNotificationDelivery.svelte';")
    add('app-mount', 'src/App.svelte', '    <Toaster />',
        '    <Toaster />\n    <BgNotificationDelivery enabled={$loadedStore} />', true)
    return units
}
