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
        'server/node/bgPluginDiagnostics.cjs', 'src/lib/Others/BgPluginDiagnostics.svelte',
        'src/ts/bgPluginBindings.ts']) {
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
    for (const [name, spaces] of [['early-abort-reason', 6], ['input-abort-reason', 8]]) {
        const indent = ' '.repeat(spaces);
        const anchor = `${indent}if (llmAbort.signal.aborted\n${indent}  || (control && typeof control.isCancelled === 'function' && control.isCancelled())) {`;
        add(name, 'server/node/bgOrchestrator.cjs', anchor,
            anchor + `\n${indent}  if (['plugin_notification_unavailable', 'plugin_identity_unavailable'].includes(llmAbort.signal.reason?.code)) throw llmAbort.signal.reason`);
    }
    return units;
};
