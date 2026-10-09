'use strict';
const fs = require('node:fs'), path = require('node:path');
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const add = (name, anchor, content) => units.push({ id: `lazy-chat-bg-adapter:plugin-unavailable:${name}:1.10`,
        file: 'server/node/bgOrchestrator.cjs', type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === 'server/node/bgOrchestrator.cjs').map(unit => unit.id) });
    for (const file of ['server/node/bgPluginMetadata.cjs', 'server/node/bgPluginUnavailable.cjs', 'server/node/bgPluginUnavailable.test.ts']) {
        units.push({ id: `lazy-chat-bg-adapter:plugin-unavailable:owned:${file}:1.10`, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') });
    }
    add('fallback-predicate', '    const pluginHostEligible = canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)',
        `    const pluginHostEligible = canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)
    const { canOmitServerPlugins, publishSkippedServerPlugins } = require('./bgPluginUnavailable.cjs')
    const pluginOperation = { operationId: control?.operationId, charId: selectedCharId, chatId: selectedChatId }
    const pluginFallbackEligible = canOmitServerPlugins(mode, pluginOperation, deps.bgPluginDependencies)
    let pluginOmissionNotified = false
    const notifyPluginOmission = async () => {
      await publishSkippedServerPlugins({ mode, operation: pluginOperation, dependencies: deps.bgPluginDependencies, database: db, control })
      pluginOmissionNotified = pluginFallbackEligible
    }`);
    add('preclaim', '          if (candidate && !pluginHostEligible) return {',
        '          if (candidate && !pluginHostEligible && !pluginFallbackEligible) return {');
    add('preclaim-omitted-versions', 'bg.inputPolicy.evaluateServerInputModels(context.database, context.chat, true)',
        "bg.inputPolicy.evaluateServerInputModels(context.database, context.chat, pluginFallbackEligible && !pluginHostEligible ? 'omit' : true)");
    add('preclaim-policy', 'bg.inputPolicy.requiresClientOwnedInputPreparation(context.database, context.chat, pluginHostEligible)',
        "bg.inputPolicy.requiresClientOwnedInputPreparation(context.database, context.chat, pluginHostEligible ? true : pluginFallbackEligible ? 'omit' : false)");
    add('initial-policy', 'bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat, pluginHostEligible)',
        "bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat, pluginHostEligible ? true : pluginFallbackEligible ? 'omit' : false)");
    add('notify-before-host-assert', "    if (control?.inputCommandVersion === 1 && inputTransformClaim?.status === 'started'",
        `    if (mode === 'full' && control && !pluginHostEligible) await notifyPluginOmission()
    if (control?.inputCommandVersion === 1 && inputTransformClaim?.status === 'started'`);
    add('assert-confirmed-omission', "          && !canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)) throw Object.assign(new Error('server plugin host unavailable'), {",
        "          && !pluginOmissionNotified && !canStartPluginHost(mode, control, deps.bgPluginDependencies, bg)) throw Object.assign(new Error('server plugin host unavailable'), {");
    add('attached-policy', 'bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat, pluginHost !== null)',
        "bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat, pluginHost !== null ? true : pluginOmissionNotified ? 'omit' : false)");
    add('notify-latest', '      if (pluginHost) { refreshPluginChats(); await pluginHost.refreshIdentity() }',
        `      if (pluginHost) { refreshPluginChats(); await pluginHost.refreshIdentity() }
      else await notifyPluginOmission()`);
    units.push({ id: 'lazy-chat-bg-adapter:plugin-unavailable:model-provider-guard:1.10',
        file: 'src/ts/process/request/request.ts', type: 'replace', targetVersions,
        anchor: '    targ.modelInfo = getModelInfo(targ.aiModel)',
        content: `    // Unknown plugin metadata defaults to OpenAI in the native registry.
    // A server operation must not silently turn a missing provider into that route.
    if ((globalThis as { __bgOrchAbortSignal?: AbortSignal }).__bgOrchAbortSignal
        && targ.aiModel?.startsWith('pluginmodel:::')
        && !pluginV2.providers.has(targ.aiModel.slice('pluginmodel:::'.length))) {
        return { type: 'fail', result: 'The selected plugin model provider is unavailable on the server.', model: targ.aiModel }
    }
    targ.modelInfo = getModelInfo(targ.aiModel)`,
        after: prior.filter(unit => unit.file === 'src/ts/process/request/request.ts').map(unit => unit.id) });
    return units;
};
