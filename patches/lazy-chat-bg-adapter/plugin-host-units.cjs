'use strict';
const fs = require('node:fs');
const path = require('node:path');
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const related = ['bg-preserve', 'lazy-chat-sync'].flatMap(name => require(`../${name}/manifest.cjs`).units);
    const add = (name, file, anchor, content, markup = false) => units.push({ id: `lazy-chat-bg-adapter:plugin-host:${name}:1.10`,
        file, type: 'replace', anchor, ...(markup ? { managed: content } : { content }), targetVersions,
        after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id) });
    for (const file of ['server/node/bgPluginSandbox.cjs', 'server/node/bgPluginWorker.cjs',
        'server/node/bgPluginSession.cjs', 'server/node/bgPluginStorage.cjs', 'server/node/bgPluginHost.cjs', 'server/node/bgPluginValue.cjs',
        'server/node/bgPluginDiagnostics.cjs', 'server/node/bgCurrentLorebookEntries.test.ts', 'server/node/bgPostResponseHost.test.ts',
        'server/node/bgPostResponseOrchestrator.test.ts', 'server/node/bgPluginMcp.test.ts',
        'server/node/bgPluginMcpExposure.test.ts',
        'src/lib/Others/BgPluginDiagnostics.svelte', 'src/ts/bgPluginBindings.ts', 'src/ts/process/request/bgPluginMcpRequest.test.ts',
        'src/ts/process/request/bgPluginMcpProviders.test.ts']) {
        units.push({ id: `lazy-chat-bg-adapter:plugin-host:owned:${file}:1.10`, file,
            type: 'owned', targetVersions, content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') });
    }
    add('bundle-import', 'server/node/bgOrchBundle.build.cjs',
        "import * as inputPolicy from 'src/ts/bgServerInputProviderPolicy';\\n",
        "import * as inputPolicy from 'src/ts/bgServerInputProviderPolicy';\\nimport { bgPluginBindings } from 'src/ts/bgPluginBindings';\\n");
    add('bundle-export', 'server/node/bgOrchBundle.build.cjs',
        '{ idx, stores, dbmod, status, triggers, scripts, policy, inputPolicy }',
        '{ idx, stores, dbmod, status, triggers, scripts, policy, inputPolicy, bgPluginBindings }');
    add('direct-fetch-context', 'server/node/bgOrchestrator.cjs',
        '  globalThis.fetch = function (u, ...a) {',
        `  globalThis.fetch = function (u, ...a) {
    const pluginDirectFetch = (url, options) => require('./bgPluginSession.cjs').isPluginInvocation()
      ? fetchWithExternalHeaders(realFetch.bind(this), url, options)
      : realFetch.call(this, url, options)`);
    add('direct-fetch', 'server/node/bgOrchestrator.cjs',
        '    return realFetch.call(this, u, ...a)',
        '    return pluginDirectFetch(u, a[0])');
    add('direct-model-fetch', 'server/node/bgOrchestrator.cjs',
        '      return llmMark(u, realFetch.call(this, u, ...a))',
        '      return llmMark(u, pluginDirectFetch(u, a[0]))');
    add('direct-token-fetch', 'server/node/bgOrchestrator.cjs',
        '            return await realFetch.call(this, tokenUri, {',
        '            return await pluginDirectFetch(tokenUri, {');
    add('cold-decode-bound', 'server/node/server.cjs',
        '    const { allowPlainJson = false } = options;\n    try {\n        const decompressed = zlib.gunzipSync(buffer);',
        `    const { allowPlainJson = false, maxBytes } = options;
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1
        || Buffer.byteLength(buffer) > maxBytes)) throw Object.assign(new Error('plugin_budget_exceeded'), { code: 'plugin_budget_exceeded' });
    try {
        const decompressed = zlib.gunzipSync(buffer, maxBytes === undefined ? undefined : { maxOutputLength: maxBytes });`);
    add('cold-inflate-limit-code', 'server/node/server.cjs',
        '    } catch (gzipError) {\n        if (!allowPlainJson) {',
        `    } catch (gzipError) {
        if (maxBytes !== undefined && gzipError?.code === 'ERR_BUFFER_TOO_LARGE') {
            throw Object.assign(new Error('plugin_budget_exceeded'), { code: 'plugin_budget_exceeded' });
        }
        if (!allowPlainJson) {`);
    add('cold-reader-bound', 'server/node/server.cjs',
        '        allowPlainJson: allowPlainJsonFallback || storageKey !== canonicalKey,',
        '        allowPlainJson: allowPlainJsonFallback || storageKey !== canonicalKey,\n        maxBytes: options.maxBytes,');
    add('metadata-projector-export', 'src/ts/plugins/apiV3/pluginChatAccess.ts',
        'function projectChatMetadata(chat:', 'export function projectChatMetadata(chat:');
    add('diagnostic-owner', 'server/node/server.cjs',
        'const bgNotifications = createBgNotifications({ db: sqliteDb, kvGet, kvSet, kvDel, kvList });',
        `const { createBgPluginDiagnostics } = require('./bgPluginDiagnostics.cjs');
const bgPluginDiagnostics = createBgPluginDiagnostics({ kvGet, kvSet, kvDel, kvList,
    transaction: task => sqliteDb.transaction(task)() });
const bgNotifications = createBgNotifications({ db: sqliteDb, kvGet, kvSet, kvDel, kvList });`);
    add('diagnostic-route', 'server/node/server.cjs',
        '// ─── Express error middleware — must be registered after all routes ─────────',
        `
app.get('/api/bg-plugin-diagnostics', sessionAuthMiddleware, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json({ summaries: bgPluginDiagnostics.list() }); }
    catch { res.status(503).json({ error: 'plugin-diagnostics-unavailable' }); }
});
// ─── Express error middleware — must be registered after all routes ─────────`);
    add('diagnostic-log-import', 'src/lib/Setting/Pages/RequestLogs.svelte',
        "    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'",
        "    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'\n    import BgPluginDiagnostics from 'src/lib/Others/BgPluginDiagnostics.svelte'");
    add('diagnostic-log-panel', 'src/lib/Setting/Pages/RequestLogs.svelte',
        '</script>', '</script>\n\n<BgPluginDiagnostics />', true);
    add('canonical-owner', 'server/node/server.cjs',
        "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware,",
        `const bgPluginDependencies = {
    publishDiagnostic: value => bgPluginDiagnostics.publish(value),
    // Internal candidate only. No HTTP/client flag can enable plugin execution.
    enabled: process.env.POCKETRISU_BG_PLUGIN_HOST_CANDIDATE === '1',
    hydrate: (characters, snapshots) => queueStorageOperation(() => {
        const { clonePluginValue, measurePluginValue } = require('./bgPluginValue.cjs');
        const unavailable = () => { throw Object.assign(new Error('plugin_chat_snapshot_unavailable'), { code: 'plugin_chat_snapshot_unavailable' }); };
        let remaining = 4 * 1024 * 1024;
        const result = characters.map(character => {
            remaining -= measurePluginValue({ ...character, chats: [] });
            if (remaining < 1 || character.coldstorage) unavailable();
            const chats = (character.chats || []).map(stub => {
                let chat = stub._stub || stub._placeholder ? snapshots?.get(character.chaId)?.get(stub.id) : stub;
                if (!chat || chat._stub || chat._placeholder) unavailable();
                if (isColdStorageChat(chat)) {
                    const entry = readColdStorageJsonEntry(chat.message[0].data.slice(COLD_STORAGE_HEADER.length), {
                        maxBytes: remaining,
                        reader: { kvGet: key => {
                            if ((kvSize(key) || 0) > remaining) throw Object.assign(new Error('plugin_budget_exceeded'), { code: 'plugin_budget_exceeded' });
                            return kvGet(key);
                        } },
                    });
                    const cold = entry?.coldData;
                    if (!cold || (!Array.isArray(cold) && !Array.isArray(cold.message))) unavailable();
                    chat = { ...chat, message: Array.isArray(cold) ? cold : cold.message };
                    if (!Array.isArray(cold)) for (const key of ['hypaV3Data', 'scriptstate', 'localLore']) {
                        if (cold[key]) chat[key] = cold[key];
                    }
                }
                const merged = stub._stub || stub._placeholder ? mergeChatStubWithFullChat({ ...stub, _stub: true }, chat) : chat;
                remaining -= measurePluginValue(merged);
                if (remaining < 0) unavailable();
                return merged;
            });
            return { ...character, chats };
        });
        return clonePluginValue(result);
    }),
    publishNotification: (event, identity) => identity
        ? bgNotifications.publishPluginFailure(event, identity) : bgNotifications.publish(event),
    storageOwner: {
        kvGet, kvSet, kvDel, kvList,
        peekRoot: () => dbCache[DB_HEX_KEY],
        transaction: task => sqliteDb.transaction(task)(),
        getRoot: () => queueStorageOperation(async () => {
            await ensureServerChatCommitCanonicalState();
            return dbCache[DB_HEX_KEY];
        }),
        writeRoot: mutate => queueStorageOperation(async () => {
            await ensureServerChatCommitCanonicalState();
            const next = mutate(dbCache[DB_HEX_KEY]);
            const full = reassembleFullDb(next);
            if (findStubFlagLossChats(full).length) throw new Error('plugin_storage_chat_incomplete');
            const encoded = Buffer.from(encodeRisuSaveLegacy(full));
            const strippedEncoded = Buffer.from(encodeRisuSaveLegacy(next));
            kvSet('database/database.bin', encoded);
            try { cacheStrippedDatabase(next, strippedEncoded); }
            catch (error) { invalidateStrippedDatabaseCache(); throw error; }
            scheduleChatStorePersist();
        }),
    },
};
require('./bgOrchestrator.cjs')(app, Object.assign({ bgPluginDependencies, sessionAuthMiddleware,`);
    // The host must be in the enclosing lock's finally, including pre-send errors.
    add('host-scope', 'server/node/bgOrchestrator.cjs',
        '  const llmTimer = llmAbort ? setTimeout(() => llmAbort.abort(), 600000) : null',
        '  let pluginHost = null\n  const llmTimer = llmAbort ? setTimeout(() => llmAbort.abort(), 600000) : null');
    add('detached-dependencies', 'server/node/bgOrchestrator.cjs',
        '{ getDbCache, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }',
        '{ getDbCache, getFullChatStore: deps.getFullChatStore, bgPluginDependencies: deps.bgPluginDependencies, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }');
    add('effect-latch', 'server/node/bgOrchestrator.cjs',
        '    const { idx, stores, dbmod, status } = bg',
        `    const { idx, stores, dbmod, status } = bg
    let effectMarked = false
    const markProviderEffects = () => {
      if (effectMarked) return
      if (control && typeof control.onProviderStart === 'function') control.onProviderStart()
      effectMarked = true
    }`);
    add('input-lifecycle-flag', 'server/node/bgOrchestrator.cjs',
        '        let serverInputProviderStarted = false',
        '        let serverInputProviderStarted = false\n        let serverPluginInputContextStarted = false');
    add('input-lifecycle-control', 'server/node/bgOrchestrator.cjs',
        '                onInputCommitted: (record) => {',
        '                onPluginInputContextStarted: () => { serverPluginInputContextStarted = true },\n                onInputCommitted: (record) => {');
    add('host-start', 'server/node/bgOrchestrator.cjs',
        '    let serverInputAttachment = null',
        `    let serverInputAttachment = null
    let pluginChatSnapshot = null
    const refreshPluginChats = () => {
      // Native chat writes replace map entries. Preserve those references here,
      // and clone only requested payloads under a byte bound, not the whole DB.
      const source = typeof deps.getFullChatStore === 'function' ? deps.getFullChatStore() : null
      pluginChatSnapshot = new Map([...(source || [])].map(([id, chats]) => [id, new Map(chats)]))
    }
    if (mode === 'full' && deps.bgPluginDependencies?.enabled === true
      && control?.resultKeyVersion === 1 && control?.serverChatCommitVersion === 1) {
      refreshPluginChats()
      const { createBgPluginHost } = require('./bgPluginHost.cjs')
      if (control.inputCommandVersion === 1 && inputTransformClaim?.status === 'started'
        && db.plugins?.some(plugin => plugin?.enabled)) control.onPluginInputContextStarted()
      pluginHost = await runWithOrchestrationAbort(() => createBgPluginHost({
        database: db, bindings: bg.bgPluginBindings, getDatabase: () => dbmod.getDatabase(),
        getSelection: () => ({ characterIndex: charIdx, chatIndex: chatIdx }),
        hydrate: characters => deps.bgPluginDependencies.hydrate(characters, pluginChatSnapshot),
        storageOwner: deps.bgPluginDependencies.storageOwner,
        publishNotification: deps.bgPluginDependencies.publishNotification,
        publishDiagnostic: deps.bgPluginDependencies.publishDiagnostic,
        onCriticalFailure: error => llmAbort.abort(error),
        operation: { operationId: control.operationId, charId: selectedCharId, chatId: selectedChatId,
          inputPreparedOnClient: control.inputCommandVersion !== 1 || control.inputPreparedOnClient === true },
        signal: llmAbort.signal,
        beforeEffect: () => {
          // A claimed, unattached raw transform already becomes unknown after
          // restart. Do not manufacture provider-started + unattached state.
          if (control.inputCommandVersion === 1 && inputTransformClaim?.status === 'started' && !serverInputAttachment) return
          markProviderEffects()
        },
      }))
    }`);
    add('host-refresh', 'server/node/bgOrchestrator.cjs',
        '      dbmod.setDatabase(db)\n      stores.selectedCharID.set(charIdx)',
        `      dbmod.setDatabase(db)
      stores.selectedCharID.set(charIdx)
      if (pluginHost) { refreshPluginChats(); await pluginHost.refreshIdentity() }`);
    add('native-effect-latch', 'server/node/bgOrchestrator.cjs',
        "        if (control && typeof control.onProviderStart === 'function') control.onProviderStart()",
        '        markProviderEffects()');
    add('notice-completion', 'server/node/bgOrchestrator.cjs',
        '    if (llmAbort && llmAbort.signal.aborted) {',
        `    if (pluginHost) {
      try { await pluginHost.assertNotifications() } catch (error) { fullThrew = fullThrew || error }
    }
    if (llmAbort && llmAbort.signal.aborted) {
      if (['plugin_notification_unavailable', 'plugin_identity_unavailable'].includes(llmAbort.signal.reason?.code)) throw llmAbort.signal.reason`);
    add('unsupported-effect-failure', 'server/node/bgOrchestrator.cjs',
        "                  try { serverChatInputOwner.markRunFailureSynchronously(operationId, false) } catch {}\n                  terminalState = 'retryable-no-provider'",
        "                  try { serverChatInputOwner.markRunFailureSynchronously(operationId, serverInputProviderStarted) } catch {}\n                  terminalState = serverInputProviderStarted ? 'delivery-failed' : 'retryable-no-provider'");
    add('lost-input-plugin-context', 'server/node/bgOrchestrator.cjs',
        "              const assemblyConflict = e && e.code === 'BG_ASSEMBLY_CONFLICT'",
        `              // The per-operation plugin process has ended. Revoke its
              // volatile execution basis even if durable error publication fails.
              if (serverPluginInputContextStarted) serverChatInputOwner.releaseSettingsContext(operationId)
              if (serverPluginInputContextStarted && !serverInputProviderStarted
                && !unsupportedInput && e?.code !== 'BG_ASSEMBLY_CONFLICT') {
                let attached
                try { attached = !!(serverInputReceipt || serverChatInputOwner.read(operationId)?.inputReceipt) }
                catch { terminalState = 'delivery-failed'; return }
                if (attached) e = Object.assign(new Error('server plugin input context cannot be replayed'), {
                  code: 'BG_ASSEMBLY_CONFLICT', reason: 'plugin_execution_context_unavailable',
                })
              }
              const assemblyConflict = e && e.code === 'BG_ASSEMBLY_CONFLICT'`);
    add('assembly-effect-failure', 'server/node/bgOrchestrator.cjs',
        "                    terminalState = 'retryable-no-provider'\n                    return // Retain the command if its failure could not be recorded.",
        "                    terminalState = serverInputProviderStarted ? 'delivery-failed' : 'retryable-no-provider'\n                    return // Retain the command without replaying prior effects.");
    add('host-finally', 'server/node/bgOrchestrator.cjs',
        '    if (llmTimer) clearTimeout(llmTimer)\n    release()',
        '    if (llmTimer) clearTimeout(llmTimer)\n    try { if (pluginHost) await pluginHost.close() } finally { release() }');
    // Foreground capability exposure: the guest proxy exposes only function-valued
    // own keys of the host apiFactory, captured when the guest document is built.
    add('guest-capability-proxy', 'src/ts/plugins/apiV3/factory.ts',
        `    window.risuai = new Proxy({}, {
        get: (target, prop) => {
            if (propertyCache.has(prop)) {
                return propertyCache.get(prop);
            }
            return (...args) => sendRequest('CALL_ROOT', { method: prop, args: args });
        }
    });
`,
        `    const supportedRootMethods = new Set(__POCKETRISU_SUPPORTED_ROOT_METHODS__);
    const isSupportedRoot = (prop) => typeof prop === 'string' && supportedRootMethods.has(prop);
    window.risuai = new Proxy({}, {
        get: (target, prop) => {
            if (propertyCache.has(prop)) {
                return propertyCache.get(prop);
            }
            if (!isSupportedRoot(prop)) return undefined;
            return (...args) => sendRequest('CALL_ROOT', { method: prop, args: args });
        },
        has: (target, prop) => propertyCache.has(prop) || isSupportedRoot(prop)
    });
`);
    add('guest-capability-list', 'src/ts/plugins/apiV3/factory.ts',
        `        this.messageHandlerRef = messageHandler;
        window.addEventListener('message', this.messageHandlerRef);
`,
        String.raw`        this.messageHandlerRef = messageHandler;
        window.addEventListener('message', this.messageHandlerRef);

        // Escaped so no apiFactory key can close the script element or break the literal.
        const supportedRootMethods = Object.keys(this.apiFactory).filter((key) => typeof this.apiFactory[key] === 'function');
        const supportedRootLiteral = JSON.stringify(supportedRootMethods).replace(/[^\x20-\x3b\x3d\x3f-\x7e]/g,
            (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
        const guestBridgeScript = GUEST_BRIDGE_SCRIPT.replace('__POCKETRISU_SUPPORTED_ROOT_METHODS__', () => supportedRootLiteral);
`);
    add('guest-capability-bridge', 'src/ts/plugins/apiV3/factory.ts',
        '                ${GUEST_BRIDGE_SCRIPT}\n', '                ${guestBridgeScript}\n');
    for (const [name, spaces] of [['early-abort-reason', 6], ['input-abort-reason', 8]]) {
        const indent = ' '.repeat(spaces);
        const anchor = `${indent}if (llmAbort.signal.aborted\n${indent}  || (control && typeof control.isCancelled === 'function' && control.isCancelled())) {`;
        add(name, 'server/node/bgOrchestrator.cjs', anchor,
            anchor + `\n${indent}  if (['plugin_notification_unavailable', 'plugin_identity_unavailable'].includes(llmAbort.signal.reason?.code)) throw llmAbort.signal.reason`);
    }
    // Plugin MCP tools in BG requests. Every change below applies only while a BG
    // job runs (its abort signal is on globalThis); foreground requests and
    // tool-free requests keep their existing behavior. The effect latch, the
    // step cap, the single follow-up and the expiry stop apply only when the
    // request's tools include a plugin MCP tool, so BG requests with external
    // MCP tools only, or explicit arg.tools without plugin tools, are unchanged.
    const bgJob = '(globalThis as { __bgOrchAbortSignal?: AbortSignal }).__bgOrchAbortSignal';
    const bgPluginTools = tools => `(!!${bgJob} && (${tools} ?? []).some(tool => `
        + `String((tool as { mcpURL?: unknown }).mcpURL ?? '').startsWith('plugin:')))`;
    // A plugin MCP call that rejects because the session expired or the job
    // closed ends the request; no further model send follows.
    const terminalCall = error => `['plugin_invocation_expired', 'plugin_operation_closed']`
        + `.includes(String((${error} as { code?: unknown } | null | undefined)?.code))`;
    const cap = 'BG: maximum tool steps (8) reached';
    const mcp = 'src/ts/process/mcp/mcp.ts';
    add('mcp-bg-tool-owners', mcp,
        `export async function getMCPTools(additionalMCPs?:string[]) {
    await initializeMCPs(additionalMCPs);
    const tools:MCPToolWithURL[] = [];
    for(const key of Object.keys(MCPs)) {
        const t = (await MCPs[key].getToolList()).map(tool => {
            return {
                ...tool,
                mcpURL: key
            }
        })

        tools.push(...t);
    }
    return tools;
}
`,
        `// BG: the clients that offered each tool name in the latest tool list of the
// running BG job. A BG call of a name that a plugin client offered there runs
// only on that client and is refused when the list offered it more than once.
let bgToolOwners: { signal: AbortSignal, owners: Map<string, { key: string, client: MCPClient|MCPClientLike }[]> } | null = null

export async function getMCPTools(additionalMCPs?:string[]) {
    await initializeMCPs(additionalMCPs);
    const tools:MCPToolWithURL[] = [];
    const bgSignal = ${bgJob}
    const owners = new Map<string, { key: string, client: MCPClient|MCPClientLike }[]>()
    for(const key of Object.keys(MCPs)) {
        const client = MCPs[key]
        const t = (await client.getToolList()).map(tool => {
            return {
                ...tool,
                mcpURL: key
            }
        })
        if(bgSignal){
            for(const tool of t){
                const offered = owners.get(tool.name) ?? []
                offered.push({ key, client })
                owners.set(tool.name, offered)
            }
        }

        tools.push(...t);
    }
    if(bgSignal) bgToolOwners = { signal: bgSignal, owners }
    return tools;
}
`);
    add('mcp-bg-tool-binding', mcp,
        'export async function callMCPTool(methodName:string, args:any):Promise<RPCToolCallContent[]> {\n    await initializeMCPs();\n',
        `export async function callMCPTool(methodName:string, args:any):Promise<RPCToolCallContent[]> {
    await initializeMCPs();
    const bgSignal = ${bgJob}
    const offered = bgSignal && bgToolOwners?.signal === bgSignal ? bgToolOwners.owners.get(methodName) : undefined
    if(offered && offered.some(owner => owner.key.startsWith('plugin:'))){
        if(offered.length !== 1){
            throw new Error(\`Tool \${methodName} was offered by more than one MCP in this request\`)
        }
        const [{ key, client }] = offered
        // The offering client was cleaned up (session expiry, closed job, entry
        // disabled or unregistered): a terminal plugin failure, not a tool error.
        if(MCPs[key] !== client){
            throw Object.assign(new Error(\`Tool \${methodName} is no longer available\`), { code: 'plugin_operation_closed' })
        }
        return await client.callTool(methodName, args);
    }
`);
    const request = 'src/ts/process/request/request.ts';
    add('mcp-request-import', request,
        'import { getTools, callTool, encodeToolCall, decodeToolCall } from "../mcp/mcp";',
        'import { getTools, callTool, encodeToolCall, decodeToolCall, MCPs } from "../mcp/mcp";');
    add('mcp-deferred-flag', request,
        '    const tools = arg.tools ?? (await getTools())\n',
        `    // A BG job reads plugin MCP tools after beforeRequest preparation, once for
    // each prepared attempt. Explicit arg.tools, including [], are used as given.
    const deferBgTools = arg.tools == null && !!${bgJob}
    let tools = arg.tools ?? (deferBgTools ? [] : await getTools())
`);
    add('mcp-deferred-read', request,
        '            da = await requestChatDataMain({\n',
        `            // A PageFold retry that skips the source transforms reuses its list.
            if(deferBgTools && !pageFoldRouteState){
                tools = await getTools()
                if(abortSignal?.aborted){
                    return {
                        type: 'fail',
                        result: 'Aborted'
                    }
                }
            }
            da = await requestChatDataMain({
`);
    units[units.length - 1].requires = ['pagefold-model-preset:request-outer-route-state:1.10'];
    add('mcp-effect-latch', request,
        "            if(da.type === 'success' && arg.escape){\n",
        `            // BG with plugin MCP tools: a provider marks a result after a tool ran,
            // including a failure. A prompt retry or fallback would run it again.
            if(da.type === 'fail' && da.toolExecuted && ${bgPluginTools('tools')}){
                return {
                    ...da,
                    noRetry: true,
                    model: fallBackModels[fallbackIndex] || da.model
                }
            }
            if(da.type === 'success' && arg.escape){
`);
    add('mcp-unsupported-variants', request,
        '    targ.formated = reformater(targ.formated, targ.modelInfo)\n',
        `    targ.formated = reformater(targ.formated, targ.modelInfo)
    // BG: OpenAIResponseAPI and Anthropic streaming have no tool loop. Plugin MCP
    // tools are not sent there, generation continues, and each affected plugin
    // records one plugin_mcp_unsupported notice per operation (host-enforced).
    if (${bgJob} && targ.tools?.length
        && (format === LLMFormat.OpenAIResponseAPI || format === LLMFormat.NanoGPTResponses
            || (targ.useStreaming && (format === LLMFormat.Anthropic || format === LLMFormat.AnthropicLegacy
                || format === LLMFormat.AWSBedrockClaude || format === LLMFormat.NanoGPTMessages)))) {
        const reporters = new Set<(event: { code: string, phase: string }) => void>()
        targ.tools = targ.tools.filter(tool => {
            const url = (tool as { mcpURL?: unknown }).mcpURL
            if (typeof url !== 'string' || !url.startsWith('plugin:')) return true
            const report = (MCPs[url] as { bgReportUnsupported?: unknown } | undefined)?.bgReportUnsupported
            if (typeof report === 'function') reporters.add(report as (event: { code: string, phase: string }) => void)
            return false
        })
        for (const report of reporters) report({ code: 'plugin_mcp_unsupported', phase: 'mcp_list' })
    }
`);
    // ModelPreset: an expired or closed plugin MCP call ends the tool loop
    // (runToolLoop sends nothing after a tool throws) and the request fails
    // without a retry or fallback instead of returning the partial result.
    add('mcp-preset-expired-result', request,
        `            const { result, toolsExecuted } = await runModelPresetToolLoop(arg, preset, kind, credential, fetchImpl, messages, tools, abortSignal)
            // The tool loop issues one request per turn; each is its own log
            // entry and all of them flush together here.
            void logScope.close()
`,
        `            const { result, toolsExecuted, terminalCall } = await runModelPresetToolLoop(arg, preset, kind, credential, fetchImpl, messages, tools, abortSignal)
            // The tool loop issues one request per turn; each is its own log
            // entry and all of them flush together here.
            void logScope.close()
            if (terminalCall) {
                const error = terminalCall.error
                return { type: 'fail', result: 'Tool call failed: ' + (error instanceof Error ? error.message : String(error)),
                    model: wireModel, noRetry: true, toolExecuted: true }
            }
`);
    add('mcp-preset-expired-state', request,
        `): Promise<{ result: string; toolsExecuted: boolean }> {
    // Tracks whether any tool actually ran, so the caller can block outer
    // success-path retries that would otherwise re-execute side-effecting tools.
    let toolsExecuted = false
`,
        `): Promise<{ result: string; toolsExecuted: boolean; terminalCall?: { error: unknown } }> {
    // Tracks whether any tool actually ran, so the caller can block outer
    // success-path retries that would otherwise re-execute side-effecting tools.
    let toolsExecuted = false
    let terminalCall: { error: unknown } | undefined
`);
    add('mcp-preset-expired-loop', request,
        '            toolsExecuted = true\n            const executed = await executeModelPresetTool(arg, call)\n',
        `            toolsExecuted = true
            let executed: Awaited<ReturnType<typeof executeModelPresetTool>>
            try {
                executed = await executeModelPresetTool(arg, call)
            } catch (e) {
                terminalCall = { error: e }
                throw e
            }
`);
    add('mcp-preset-expired-return', request,
        '    return { result, toolsExecuted }\n}\n',
        '    return terminalCall ? { result, toolsExecuted, terminalCall } : { result, toolsExecuted }\n}\n');
    add('mcp-preset-expired-call', request,
        `    } catch (e) {
        return { text: 'Tool call failed: ' + (e instanceof Error ? e.message : String(e)), response: [] }
`,
        `    } catch (e) {
        if (${bgPluginTools('arg.tools')} && ${terminalCall('e')}) throw e
        return { text: 'Tool call failed: ' + (e instanceof Error ? e.message : String(e)), response: [] }
`);
    const openai = 'src/ts/process/request/openAI/requests.ts';
    add('mcp-openai-cap', openai,
        `            if(dat.choices?.[0]?.message?.tool_calls && dat.choices[0].message.tool_calls.length > 0){
                const toolCalls = dat.choices[0].message.tool_calls as ToolCall[]
`,
        String.raw`            if(dat.choices?.[0]?.message?.tool_calls && dat.choices[0].message.tool_calls.length > 0){
                // BG: at most eight tool steps (nine model sends) per request. The
                // capped result is a success with the text produced so far.
                const bgTools = ${bgPluginTools('arg.tools')}
                const bgArg = arg as typeof arg & { bgToolSteps?: number, bgTerminalCall?: boolean }
                if(bgTools && (bgArg.bgToolSteps ?? 0) >= 8){
                    return {
                        type: 'success',
                        result: (db.simplifiedToolUse ? '' : (processTextResponse(dat) ?? '') + '\n\n') + '[${cap}]',
                        toolExecuted: true
                    }
                }
                if(bgTools) bgArg.bgToolSteps = (bgArg.bgToolSteps ?? 0) + 1
                const toolCalls = dat.choices[0].message.tool_calls as ToolCall[]
`);
    add('mcp-openai-tool-abort', openai,
        `                for(const toolCall of toolCalls){
                    if(!toolCall.function || !toolCall.function.name || toolCall.function.arguments === undefined || toolCall.function.arguments === null){
`,
        `                for(const toolCall of toolCalls){
                    if(bgTools && arg.abortSignal?.aborted){
                        return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
                    }
                    if(!toolCall.function || !toolCall.function.name || toolCall.function.arguments === undefined || toolCall.function.arguments === null){
`);
    add('mcp-openai-tool-expired', openai,
        `                    } catch (error) {
                        messages.push({
                            role: 'tool',
                            content: 'Tool call failed with error: ' + error,
`,
        `                    } catch (error) {
                        if(bgTools && ${terminalCall('error')}){
                            bgArg.bgTerminalCall = true
                            return { type: 'fail', result: 'Tool call failed with error: ' + error, noRetry: true, toolExecuted: true }
                        }
                        messages.push({
                            role: 'tool',
                            content: 'Tool call failed with error: ' + error,
`);
    add('mcp-openai-followup-abort', openai,
        '                // Send the next request recursively\n                let resRec\n                let attempt = 0\n',
        `                // Send the next request recursively
                let resRec
                let attempt = 0
                if(bgTools && arg.abortSignal?.aborted){
                    return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
                }
`);
    add('mcp-openai-followup-once', openai,
        "                } while (attempt <= db.requestRetrys) // Retry up to db.requestRetrys times\n\n                const callCode = callCodes.join(",
        "                } while (!bgTools && attempt <= db.requestRetrys) // Retry up to db.requestRetrys times; BG: never after a tool effect\n\n                const callCode = callCodes.join(");
    // An expired or closed plugin MCP call in a later round ends the whole
    // request; it is not turned into this round's partial result.
    add('mcp-openai-terminal-propagate', openai,
        "                if(resRec.type === 'fail') {\n                    notifyError(`Failed to fetch model response after tool execution`)\n",
        `                if(resRec.type === 'fail' && bgTools && bgArg.bgTerminalCall) {
                    return resRec
                }
                if(resRec.type === 'fail') {
                    notifyError(\`Failed to fetch model response after tool execution\`)
`);
    add('mcp-openai-effect-result', openai,
        String.raw`                        result: result
                    }
                } else if(resRec.type === 'success') {
                    return {
                        type: 'success',
                        result: result + '\n\n' + resRec.result
                    }
`,
        String.raw`                        result: result,
                        ...(bgTools ? { toolExecuted: true } : {})
                    }
                } else if(resRec.type === 'success') {
                    return {
                        type: 'success',
                        result: result + '\n\n' + resRec.result,
                        ...(bgTools ? { toolExecuted: true } : {})
                    }
`);
    add('mcp-openai-stream-state', openai,
        "            let prefix = ''\n            let lastValue\n",
        `            let prefix = ''
            let lastValue
            // BG: tool steps are capped and cancellation is checked as in the
            // non-stream loop; a follow-up request is not retried after a tool.
            const bgTools = ${bgPluginTools('arg.tools')}
            let bgToolSteps = 0
`);
    add('mcp-openai-stream-cap', openai,
        `                    if(toolCalls && toolCalls.length > 0){
                        const messages = body.messages as OpenAIChatExtra[]
`,
        String.raw`                    if(bgTools && bgToolSteps >= 8 && toolCalls && toolCalls.length > 0){
                        controller.enqueue({"0": (prefix ? prefix + '\n\n' : '') + content + '\n\n[${cap}]'})
                    }
                    else if(toolCalls && toolCalls.length > 0){
                        if(bgTools) bgToolSteps++
                        const messages = body.messages as OpenAIChatExtra[]
`);
    add('mcp-openai-stream-tool-abort', openai,
        `                        for(const toolCall of toolCalls){
                            if(!toolCall.function || !toolCall.function.name || !toolCall.function.arguments){
`,
        `                        for(const toolCall of toolCalls){
                            if(bgTools && arg.abortSignal?.aborted) return controller.error(new Error('Aborted'))
                            if(!toolCall.function || !toolCall.function.name || !toolCall.function.arguments){
`);
    add('mcp-openai-stream-tool-expired', openai,
        `                            } catch (error) {
                                messages.push({
                                    role: 'tool',
                                    content: 'Tool call failed with error: ' + error,
`,
        `                            } catch (error) {
                                if(bgTools && ${terminalCall('error')}) return controller.error(error)
                                messages.push({
                                    role: 'tool',
                                    content: 'Tool call failed with error: ' + error,
`);
    add('mcp-openai-stream-followup-abort', openai,
        '                        let resRec\n                        let attempt = 0\n                        let errorFlag = true\n',
        `                        let resRec
                        let attempt = 0
                        let errorFlag = true
                        if(bgTools && arg.abortSignal?.aborted) return controller.error(new Error('Aborted'))
`);
    add('mcp-openai-stream-followup-once', openai,
        '                        } while (attempt <= db.requestRetrys) // Retry up to db.requestRetrys times\n',
        '                        } while (!bgTools && attempt <= db.requestRetrys) // Retry up to db.requestRetrys times; BG: never after a tool effect\n');
    const google = 'src/ts/process/request/google.ts';
    add('mcp-google-cap', google,
        '    if(calls.length > 0){\n        const chat = body.contents as GeminiChat[]\n',
        String.raw`    if(calls.length > 0){
        // BG: at most eight tool steps (nine model sends) per request. The
        // capped result is a success with the text produced so far.
        const bgTools = ${bgPluginTools('arg.tools')}
        const bgArg = arg as typeof arg & { bgToolSteps?: number }
        if(bgTools && (bgArg.bgToolSteps ?? 0) >= 8){
            return {
                type: 'success',
                result: (db.simplifiedToolUse ? '' : processTextResponse(rDatas) + '\n\n') + '[${cap}]',
                toolExecuted: true
            }
        }
        if(bgTools) bgArg.bgToolSteps = (bgArg.bgToolSteps ?? 0) + 1
        const chat = body.contents as GeminiChat[]
`);
    add('mcp-google-tool-abort', google,
        '        for(const call of calls){\n            const functionName = call.name\n',
        `        for(const call of calls){
            if(bgTools && arg.abortSignal?.aborted){
                return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
            }
            const functionName = call.name
`);
    add('mcp-google-followup-abort', google,
        '        // Send the next request recursively\n        let resRec\n        let attempt = 0\n',
        `        // Send the next request recursively
        let resRec
        let attempt = 0
        if(bgTools && arg.abortSignal?.aborted){
            return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
        }
`);
    add('mcp-google-followup-once', google,
        '                break\n            }\n        } while (attempt <= db.requestRetrys) // Retry up to db.requestRetrys times\n',
        '                break\n            }\n        } while (!bgTools && attempt <= db.requestRetrys) // Retry up to db.requestRetrys times; BG: never after a tool effect\n');
    add('mcp-google-effect-result', google,
        String.raw`                result: result
            }
        } else if(resRec.type === 'success'){
            return {
                type: 'success',
                result: result + '\n\n' + resRec.result
            }
`,
        String.raw`                result: result,
                ...(bgTools ? { toolExecuted: true } : {})
            }
        } else if(resRec.type === 'success'){
            return {
                type: 'success',
                result: result + '\n\n' + resRec.result,
                ...(bgTools ? { toolExecuted: true } : {})
            }
`);
    add('mcp-google-stream-state', google,
        "            let prefix = ''\n            let lastValue = initStreamState()\n",
        `            let prefix = ''
            let lastValue = initStreamState()
            // BG: tool steps are capped and cancellation is checked as in the
            // non-stream loop; a follow-up request is not retried after a tool.
            const bgTools = ${bgPluginTools('arg.tools')}
            let bgToolSteps = 0
`);
    add('mcp-google-stream-cap', google,
        '                    if(calls && calls.length > 0){\n                        const chat = body.contents as GeminiChat[]\n',
        String.raw`                    if(bgTools && bgToolSteps >= 8 && calls && calls.length > 0){
                        controller.enqueue({"0": (prefix ? prefix + '\n\n' : '')
                            + (thoughts + lastThought ? '<Thoughts>\n\n' + thoughts + lastThought + '\n\n</Thoughts>\n\n' : '')
                            + content + '\n\n[${cap}]'})
                    }
                    else if(calls && calls.length > 0){
                        if(bgTools) bgToolSteps++
                        const chat = body.contents as GeminiChat[]
`);
    add('mcp-google-stream-tool-abort', google,
        '                        for(const call of calls){\n                            const functionName = call.name\n',
        `                        for(const call of calls){
                            if(bgTools && arg.abortSignal?.aborted) return controller.error(new Error('Aborted'))
                            const functionName = call.name
`);
    add('mcp-google-stream-followup-abort', google,
        '                        let resRec\n                        let attempt = 0\n                        let errorFlag = true\n',
        `                        let resRec
                        let attempt = 0
                        let errorFlag = true
                        if(bgTools && arg.abortSignal?.aborted) return controller.error(new Error('Aborted'))
`);
    add('mcp-google-stream-followup-once', google,
        '                        } while (attempt <= db.requestRetrys) // Retry up to db.requestRetrys times\n',
        '                        } while (!bgTools && attempt <= db.requestRetrys) // Retry up to db.requestRetrys times; BG: never after a tool effect\n');
    const anthropic = 'src/ts/process/request/anthropic.ts';
    add('mcp-anthropic-cap', anthropic,
        '    if(hasToolUse){\n\n        const messages:Claude3ExtendedChat[] = body.messages\n',
        String.raw`    if(hasToolUse){
        // BG: at most eight tool steps (nine model sends) per request. The
        // capped result is a success with this response's text.
        const bgTools = ${bgPluginTools('arg.tools')}
        const bgArg = arg as typeof arg & { bgToolSteps?: number }
        if(bgTools && (bgArg.bgToolSteps ?? 0) >= 8){
            return {
                type: 'success',
                result: (contents as { type?: string, text?: string }[]).filter(v => v.type === 'text')
                    .map(v => v.text ?? '').join('') + '\n\n[${cap}]',
                toolExecuted: true
            }
        }
        if(bgTools) bgArg.bgToolSteps = (bgArg.bgToolSteps ?? 0) + 1

        const messages:Claude3ExtendedChat[] = body.messages
`);
    add('mcp-anthropic-tool-abort', anthropic,
        "            if(content.type === 'tool_use'){\n                const used = await callTool(content.name, content.input)\n",
        `            if(content.type === 'tool_use'){
                if(bgTools && arg.abortSignal?.aborted){
                    return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
                }
                const used = await callTool(content.name, content.input)
`);
    add('mcp-anthropic-followup', anthropic,
        '        body.messages = messages\n        body.stream = false\n\n        return requestClaudeHTTP(replacerURL, headers, body, arg)\n',
        `        body.messages = messages
        body.stream = false

        if(!bgTools){
            return requestClaudeHTTP(replacerURL, headers, body, arg)
        }
        // BG: the follow-up result carries the tool effect, so the outer
        // request loop neither retries the prompt nor falls back after it.
        if(arg.abortSignal?.aborted){
            return { type: 'fail', result: 'Aborted', noRetry: true, toolExecuted: true }
        }
        const next = await requestClaudeHTTP(replacerURL, headers, body, arg)
        return next.type === 'success' || next.type === 'fail' ? { ...next, toolExecuted: true } : next
`);
    return units;
};
