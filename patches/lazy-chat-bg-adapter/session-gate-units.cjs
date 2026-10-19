'use strict';
// Writer session headers on the session-gated BG requests (both starts, claim,
// attach) and the deactivation path for a 423 answer. Abandon, DELETE and the
// GET reads stay without session headers: they are not session-gated.
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const file = 'src/ts/bgOrchestrate.ts';
    const add = (name, anchor, content, type = 'replace', where) => units.push({
        id: 'lazy-chat-bg-adapter:session-gate:' + name + ':1.10',
        file, type, anchor, content, ...(where ? { where } : {}), targetVersions,
        ...(name === 'import' ? { requires: ['lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10'] } : {}),
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    add('import',
        "import { fetchRecoveryControl, readRecoveryJson, readRecoveryBody } from './bgRecoveryRead'\n",
        "import { writerSessionHeaders, notifySessionDeactivated } from './storage/writerSession'\n",
        'insert', 'after');
    add('server-input-start',
        `                const response = await clientBuildFetch('/api/bg-orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(body),
                    signal,
                })
`,
        `                const response = await clientBuildFetch('/api/bg-orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...writerSessionHeaders() },
                    credentials: 'same-origin',
                    body: JSON.stringify(body),
                    signal,
                })
                notifySessionDeactivated(response)
                // Final on the status alone: a stalled body must not turn it ambiguous.
                if (response.status === 423) return { status: 423, body: null }
`);
    add('claim',
        `    const response = await fetchOrchestrationControl('/api/bg-orchestrate-input/claim', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, charId, chatId, token }),
    })
`,
        `    const response = await fetchOrchestrationControl('/api/bg-orchestrate-input/claim', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...writerSessionHeaders() },
        body: JSON.stringify({ operationId, charId, chatId, token }),
    })
    notifySessionDeactivated(response)
`);
    add('attach',
        `    response = await fetchOrchestrationControl('/api/bg-orchestrate-input/attach', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
`,
        `    response = await fetchOrchestrationControl('/api/bg-orchestrate-input/attach', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...writerSessionHeaders() },
`);
    add('attach-deactivation',
        `            chatId: recovery.chatId, token: recovery.token, chat, globalIntent }),
    })
`,
        `            chatId: recovery.chatId, token: recovery.token, chat, globalIntent }),
    })
    notifySessionDeactivated(response)
`);
    add('legacy-start',
        `                const res = await fetch('/api/bg-orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: startBody,
                    credentials: 'same-origin',
                    signal,
                })
`,
        `                const res = await fetch('/api/bg-orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...writerSessionHeaders() },
                    body: startBody,
                    credentials: 'same-origin',
                    signal,
                })
                if (res.status === 423) {
                    // Refused by the session lock before admission; final on the
                    // status alone (the body is not read). The tab reloads.
                    notifySessionDeactivated(res)
                    startRejectionReason = 'session-deactivated'
                    return 'rejected'
                }
`);
    add('legacy-no-fallback',
        "                } else {\n                    triggerClientFallback('delegate-not-started')\n",
        `                } else if (startRejectionReason === 'session-deactivated') {
                    stopWatch()
                } else {
                    triggerClientFallback('delegate-not-started')
`);
    // Server side: the HTTP routes for both starts, claim and attach pass the
    // session lock before any route work. The internal input drain calls the
    // start handler directly and is not gated; abandon, DELETE and GETs stay open.
    const addServer = (name, serverFile, anchor, content) => units.push({
        id: 'lazy-chat-bg-adapter:session-gate:' + name + ':1.10',
        file: serverFile, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === serverFile).map(unit => unit.id),
    });
    addServer('server-dependency', 'server/node/server.cjs',
        "require('./bgOrchestrator.cjs')(app, Object.assign({ bgPluginDependencies, sessionAuthMiddleware,",
        "require('./bgOrchestrator.cjs')(app, Object.assign({ bgPluginDependencies, sessionAuthMiddleware, checkActiveSession,");
    addServer('start-route', 'server/node/bgOrchestrator.cjs',
        "  app.post('/api/bg-orchestrate', sessionAuthMiddleware, handleOrchestrateStart)\n",
        `  // Session lock for BG writes: answers 423 before any input, operation or run
  // is created. Compositions without the dependency keep the routes as before.
  const sessionWriteGate = (req, res, next) => {
    if (typeof deps.checkActiveSession !== 'function' || deps.checkActiveSession(req, res)) return next()
  }
  app.post('/api/bg-orchestrate', sessionAuthMiddleware, sessionWriteGate, handleOrchestrateStart)
`);
    addServer('input-routes', 'server/node/bgOrchestrator.cjs',
        "    app.post('/api/bg-orchestrate-input/' + action, sessionAuthMiddleware, async (req, res) => {\n",
        "    app.post('/api/bg-orchestrate-input/' + action, sessionAuthMiddleware,\n"
        + "      ...(action === 'abandon' ? [] : [sessionWriteGate]), async (req, res) => {\n");
    return units;
};
