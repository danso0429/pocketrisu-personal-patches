'use strict'
const { owned } = require('../../manifest-helpers.cjs')
const targetVersions = { pocketrisu: ['1.10.0'] }
const prefix = 'personal-settings:external-headers:'
const units = []
function unit(id, file, type, rest) {
    const result = { id: prefix + id, file, type, targetVersions, ...rest }
    units.push(result)
    return result.id
}
for (const file of ['server/node/externalRequestHeaders.cjs', 'server/node/externalRequestHeaders.test.ts', 'server/node/externalRequestHeadersProcess.test.ts',
    'src/lib/Setting/Pages/PersonalSettings/ExternalHeadersSetting.svelte']) {
    unit(file, file, 'owned', { content: owned(__dirname, file) })
}
const page = 'src/lib/Setting/Pages/PersonalSettings.svelte'
const imported = unit('page-import', page, 'insert', {
    where: 'before', anchor: '</script>',
    content: "    import ExternalHeadersSetting from './PersonalSettings/ExternalHeadersSetting.svelte'\n",
    requires: ['personal-settings:appearance-page-tabs-1.9'],
})
const tab = unit('page-tab', page, 'insert', {
    where: 'after', anchor: '            { label: language.personalSettingsAppearanceTab, value: 1 },\n',
    content: "            { label: '외부 요청', value: 2 },\n", requires: [imported],
})
unit('page-content', page, 'insert', {
    where: 'after', anchor: '        <AppearanceSettings />\n',
    managed: '<!-- POCKETRISU-PATCH:external-header-page:START -->\n    {:else if $PersonalSubmenuIndex === 2}\n        <ExternalHeadersSetting />\n<!-- POCKETRISU-PATCH:external-header-page:END -->\n',
    markerNeedle: 'POCKETRISU-PATCH:external-header-page:START', requires: [tab],
})
unit('writer-fence', 'server/node/clientBuildFence.cjs', 'insert', {
    where: 'after', anchor: "    'PUT /api/backup/boot-reminder',\n",
    content: "    'PUT /api/external-request-headers',\n",
    requires: ['client-build-fence:server-helper:1.9'],
})
const server = 'server/node/server.cjs'
const init = unit('server-init', server, 'insert', {
    where: 'before', anchor: 'const reverseProxyFunc = async (req, res, next) => {\n',
    content: `const { configureExternalRequestHeaders, fetchWithExternalHeaders, registerExternalHeaderRoutes } = require('./externalRequestHeaders.cjs');
const externalRequestHeaders = configureExternalRequestHeaders({
    kvGet, kvSet,
    log: ({ ruleId, applied }) => console.info('[external-request-header]', ruleId, applied),
});
registerExternalHeaderRoutes(app, checkAuth, externalRequestHeaders);
`,
    requires: [prefix + 'server/node/externalRequestHeaders.cjs'],
    after: [
        'lazy-chat-bg-adapter:server-chat-commit-owner-init:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-registration:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-startup-recovery:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-backup-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-database-remove-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-save-folder-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-commit-snapshot-reset:1.10',
        'lazy-chat-bg-adapter:server-chat-owned-root-full-write:1.10',
        'lazy-chat-bg-adapter:server-chat-owned-root-patch:1.10',
    ],
})
unit('proxy-form-body', server, 'insert', {
    where: 'before', anchor: "app.use(express.text({ limit: '100mb' }));\n",
    content: String.raw`// Keep form bytes intact for the existing authenticated proxy aliases.
// JSON, text/plain, binary imports and other API parsers retain their owners.
const proxyFormBodyParser = express.raw({ type: 'application/x-www-form-urlencoded', limit: '100mb' });
app.use(/^\/proxy2?\/?$/i, proxyFormBodyParser);
`,
    // Reuse the existing server-init ancestry. Child BG anchors do not exist
    // in the pairwise baseline until their parent hooks have been composed.
    after: [init, 'pagefold-model-preset:server-binary-body-limit:1.10'],
})
for (const method of ['req.method', "'GET'"]) {
    unit('proxy-fetch-' + (method === 'req.method' ? 'write' : 'get'), server, 'replace', {
        anchor: `        originalResponse = await fetch(urlParam, {\n            method: ${method},\n`,
        content: `        originalResponse = await fetchWithExternalHeaders(fetch, urlParam, {\n            method: ${method},\n`, requires: [init],
    })
}
unit('local-stream', server, 'replace', {
    anchor: '        const headers = normalizeForwardHeaders(arg.headers);\n',
    content: '        const headers = externalRequestHeaders.apply(targetUrl, normalizeForwardHeaders(arg.headers)).headers;\n',
    requires: [init],
})
module.exports = units
