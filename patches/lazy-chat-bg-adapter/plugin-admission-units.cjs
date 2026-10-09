'use strict';
const fs = require('node:fs');
const path = require('node:path');
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const add = (name, file, anchor, content) => units.push({
        id: `lazy-chat-bg-adapter:plugin-admission:${name}:1.10`, file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    for (const file of ['server/node/bgPluginEligibility.cjs', 'server/node/bgPluginEligibility.test.ts',
        'src/ts/bgServerPluginCapability.ts', 'src/ts/bgServerPluginCapability.test.ts']) {
        units.push({ id: `lazy-chat-bg-adapter:plugin-admission:owned:${file}:1.10`, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') });
    }
    add('server-import', 'server/node/bgOrchestrator.cjs',
        "const BUNDLE = path.join(__dirname, 'bgOrchBundle.mjs')",
        "const { hasPluginBindings, canStartPluginHost } = require('./bgPluginEligibility.cjs')\nconst BUNDLE = path.join(__dirname, 'bgOrchBundle.mjs')");
    add('execution-predicate', 'server/node/bgOrchestrator.cjs',
        '    const bg = await loadBundle(deps.requestLogs)',
        `    const bg = await loadBundle(deps.requestLogs)
    const pluginHostEligible = canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)`);
    add('preclaim-policy', 'server/node/bgOrchestrator.cjs',
        `          return bg.policy.requiresClientGenerationEpilogue(context.database, character)
            || bg.inputPolicy.requiresClientOwnedInputPreparation(context.database, context.chat)
            ? 'latest_settings_require_client' : null`,
        `          const current = bg.inputPolicy.evaluateServerInputModels(context.database, context.chat)
          const candidate = current.kind === 'client-prepared' && current.reason === 'plugin-host-unqualified'
            && bg.inputPolicy.evaluateServerInputModels(context.database, context.chat, true).kind === 'server-input'
          if (candidate && !pluginHostEligible) return {
            reason: 'server_host_unsupported', api: 'server_plugin_host', effectsMayHaveOccurred: false,
          }
          return bg.policy.requiresClientGenerationEpilogue(context.database, character)
            || bg.inputPolicy.requiresClientOwnedInputPreparation(context.database, context.chat, pluginHostEligible)
            ? 'latest_settings_require_client' : null`);
    add('initial-policy', 'server/node/bgOrchestrator.cjs',
        'bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat)',
        'bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat, pluginHostEligible)');
    add('start-predicate', 'server/node/bgOrchestrator.cjs',
        `    if (mode === 'full' && deps.bgPluginDependencies?.enabled === true
      && control?.resultKeyVersion === 1 && control?.serverChatCommitVersion === 1) {`,
        `    if (pluginHostEligible) {`);
    add('attached-policy', 'server/node/bgOrchestrator.cjs',
        'bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat)',
        'bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat, pluginHost !== null)');
    add('host-assert', 'server/node/bgOrchestrator.cjs',
        '    if (pluginHostEligible) {',
        `    if (control?.inputCommandVersion === 1 && inputTransformClaim?.status === 'started'
      && !control.inputPreparedOnClient && db.plugins?.some(plugin => plugin.enabled)
          && bg.inputPolicy.evaluateServerInputModels(db, currentChat).kind === 'client-prepared'
          && bg.inputPolicy.evaluateServerInputModels(db, currentChat, true).kind === 'server-input'
          && !canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)) throw Object.assign(new Error('server plugin host unavailable'), {
            code: 'BG_INPUT_HOST_UNSUPPORTED', api: 'server_plugin_host',
          })
    if (pluginHostEligible) {`);
    add('capability', 'server/node/bgOrchestrator.cjs',
        `  app.get('/api/bg-orchestrate-capabilities', sessionAuthMiddleware, (_req, res) => {
    res.json({`,
        `  app.get('/api/bg-orchestrate-capabilities', sessionAuthMiddleware, async (_req, res) => {
    let serverPluginHostVersion = 0
    if (deps.bgPluginDependencies?.enabled === true) {
      try { serverPluginHostVersion = hasPluginBindings(await loadBundle(deps.requestLogs)) ? 1 : 0 }
      catch { /* Preserve existing capabilities when only the host bundle is unavailable. */ }
    }
    res.json({
      serverPluginHostVersion,`);
    add('client-import', 'src/ts/bgOrchestrate.ts',
        "import { get } from 'svelte/store'",
        "import { get } from 'svelte/store'\nimport { canUseServerPluginHost, observeServerPluginCapability, isServerPluginHostKnownOff } from './bgServerPluginCapability'\nimport { evaluateServerInputModels } from './bgServerInputProviderPolicy'");
    add('client-precheck', 'src/ts/bgOrchestrate.ts',
        `    if (inputPreparation !== 'client' && requiresClientOwnedInputPreparation((DBState as any)?.db, selectedChat)) {`,
        `    const decision = inputPreparation === 'client' ? null
        : evaluateServerInputModels((DBState as any)?.db, selectedChat)
    const pluginCandidate = decision?.kind === 'client-prepared'
        && decision.reason === 'plugin-host-unqualified'
        && evaluateServerInputModels((DBState as any)?.db, selectedChat, true).kind === 'server-input'
    if (decision?.kind === 'client-prepared' && (!pluginCandidate || isServerPluginHostKnownOff())) {
        return { kind: 'unsupported' }
    }`);
    add('client-precheck-tail', 'src/ts/bgOrchestrate.ts',
        `        return { kind: 'unsupported' }
    }
    const charId = character?.chaId`,
        '    const charId = character?.chaId');
    add('client-live-before-markers', 'src/ts/bgOrchestrate.ts',
        '        return await submitServerInputCommand({',
        `        if (pluginCandidate) {
            const supported = await canUseServerPluginHost(async () => {
            const response = await fetchOrchestrationControl('/api/bg-orchestrate-capabilities',
                { method: 'GET', credentials: 'same-origin' })
            return response.ok ? await readRecoveryJson(response) : null
            })
            if (!isCurrent()) return { kind: 'blocked', reason: 'selection-changed' }
            if (!supported) return { kind: 'unsupported' }
        }
        return await submitServerInputCommand({`);
    add('client-config-recheck', 'src/ts/bgOrchestrate.ts',
        '            flushSettings: async () => {',
        `            configurationAllowed: capability => {
                observeServerPluginCapability(capability)
                return inputPreparation === 'client'
                    || !requiresClientOwnedInputPreparation((DBState as any)?.db, currentChat(),
                        capability.serverPluginHostVersion === 1)
            },
            flushSettings: async () => {`);
    add('client-legacy-hint', 'src/ts/bgOrchestrate.ts',
        '                const capability = await readRecoveryJson(capabilityResponse)',
        '                const capability = await readRecoveryJson(capabilityResponse)\n                observeServerPluginCapability(capability)');
    add('screen-hint-import', 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        "    import { requiresClientOwnedInputPreparation } from '../../ts/bgServerInputProviderPolicy';",
        "    import { requiresClientOwnedInputPreparation } from '../../ts/bgServerInputProviderPolicy';\n    import { serverPluginHostSupport } from '../../ts/bgServerPluginCapability';");
    add('screen-retry-hint', 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        'requiresClientOwnedInputPreparation(DBState.db, pendingChat)',
        'requiresClientOwnedInputPreparation(DBState.db, pendingChat, $serverPluginHostSupport !== false)');
    add('screen-send-policy', 'src/lib/ChatScreens/DefaultChatScreen.svelte',
        `            && !requiresClientOwnedInputPreparation(DBState.db,
                DBState.db.characters[selectedChar]?.chats?.[DBState.db.characters[selectedChar]?.chatPage])) {`,
        `            ) {`);
    return units;
};
