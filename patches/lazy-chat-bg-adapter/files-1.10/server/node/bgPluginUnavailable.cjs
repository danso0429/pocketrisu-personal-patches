'use strict';
const { identityOf, pluginMetadata } = require('./bgPluginMetadata.cjs');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const coordinate = value => typeof value === 'string' && value.length > 0 && value.length <= 255
    && !/[\u0000-\u001f\u007f]/.test(value);
function canOmitServerPlugins(mode, operation, dependencies) {
    return mode === 'full' && identifier(operation?.operationId)
        && coordinate(operation?.charId) && coordinate(operation?.chatId)
        && typeof dependencies?.publishNotification === 'function';
}
async function publishSkippedServerPlugins({ mode, operation, dependencies, database, control, now = Date.now }) {
    const plugins = Array.isArray(database?.plugins) ? database.plugins : [];
    if (mode !== 'full' || !plugins.some(plugin => plugin?.enabled)) return;
    if (!canOmitServerPlugins(mode, operation, dependencies)) {
        throw Object.assign(new Error('plugin omission notice unavailable'), { code: 'plugin_notification_unavailable' });
    }
    const api = dependencies.enabled !== true ? 'server_plugin_host_disabled'
        : control?.resultKeyVersion !== 1 || control?.serverChatCommitVersion !== 1
            ? 'server_plugin_host_ownership' : 'server_plugin_host_bindings';
    for (const [index, plugin] of plugins.entries()) {
        if (!plugin?.enabled) continue;
        const identity = identityOf(plugin);
        let outcome;
        try {
            outcome = await dependencies.publishNotification({ ...operation, ...pluginMetadata(plugin),
                eventKey: `plugin:${index}:${identity}:load:failure`, code: 'plugin_api_unsupported',
                api, phase: 'load', effectsMayHaveOccurred: false, createdAt: now() }, identity);
        } catch {
            throw Object.assign(new Error('plugin omission notice unavailable'), { code: 'plugin_notification_unavailable' });
        }
        if (!['stored', 'duplicate'].includes(outcome?.status)) {
            throw Object.assign(new Error('plugin omission notice unavailable'), { code: 'plugin_notification_unavailable' });
        }
    }
}
module.exports = { canOmitServerPlugins, publishSkippedServerPlugins };
