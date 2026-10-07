'use strict';
const fs = require('node:fs');
const path = require('node:path');
module.exports = prior => {
    const targetVersions = { pocketrisu: ['1.10.0'] }, units = [];
    const related = ['bg-preserve', 'lazy-chat-sync', 'client-build-fence-bg-adapter']
        .flatMap(name => require(`../${name}/manifest.cjs`).units);
    const add = (name, file, anchor, content, first = false) => units.push({
        id: `lazy-chat-bg-adapter:recovery-timing:${name}:1.10`, file, type: 'replace', anchor, content,
        ...(first ? { anchorPolicy: 'first' } : {}), targetVersions,
        after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    for (const file of ['src/ts/bgRecoveryTiming.ts', 'src/ts/bgRecoveryTiming.test.ts']) units.push({
        id: `lazy-chat-bg-adapter:recovery-timing:owned:${file}:1.10`, file, type: 'owned', targetVersions,
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8'),
    });
    const orch = 'src/ts/bgOrchestrate.ts', chat = 'src/ts/storage/chatStorage.ts';
    add('orchestration-import', orch, 'async function fetchOrchestrationControl(',
        "import { bgRecoveryTiming } from './bgRecoveryTiming'\n\nasync function fetchOrchestrationControl(");
    add('control-timer', orch,
        '    const timer = setTimeout(() => controller.abort(), ORCH_CONTROL_FETCH_TIMEOUT_MS)',
        `    const timing = bgRecoveryTiming.control(url, init.method)
    const timer = setTimeout(() => { timing.timerFired(); controller.abort() }, ORCH_CONTROL_FETCH_TIMEOUT_MS)`);
    add('control-headers', orch,
        '        return await clientBuildFetch(url, { ...init, signal: controller.signal })',
        `        try {
            const response = await clientBuildFetch(url, { ...init, signal: controller.signal })
            timing.headers(response)
            return response
        } catch (error) { timing.error(error); throw error }`);
    for (const [variable, count] of [['res', 7], ['response', 7], ['statusResponse', 1]]) {
        for (let index = 0; index < count; index++) add(`body-${variable}-${index}`, orch,
            `await ${variable}.json()`, `await bgRecoveryTiming.json(${variable})`, true);
    }
    add('watch-start', orch, '    watchBaselineMsgs = baselineMsgs',
        "    bgRecoveryTiming.start('watch', operationId, charId, chatId)\n    watchBaselineMsgs = baselineMsgs");
    add('watch-stop', orch, '    const operationId = activeOperationId\n    watchEpoch++',
        "    const operationId = activeOperationId\n    bgRecoveryTiming.finishContext('watch', operationId, options.preservePendingMarker ? 'deferred' : options.handoffToClient ? 'handoff' : 'finished')\n    watchEpoch++");
    add('boot-start', orch, '    const readyStart = Date.now()',
        "    bgRecoveryTiming.start('boot', operationId, charId, chatId)\n    const readyStart = Date.now()");
    add('boot-ready-timeout', orch, '            appliedStaticsDeltaByOperation.clear()\n            bootRecoveryActive = false',
        "            bgRecoveryTiming.finish(operationId, 'character-unavailable')\n            appliedStaticsDeltaByOperation.clear()\n            bootRecoveryActive = false");
    add('boot-finish', orch, 'function finishBootRecovery(operationId: string | null): void {',
        "function finishBootRecovery(operationId: string | null): void {\n    bgRecoveryTiming.finishContext('boot', operationId, 'finished')");
    add('boot-defer', orch, 'function deferBootRecovery(operationId: string | null): void {',
        "function deferBootRecovery(operationId: string | null): void {\n    bgRecoveryTiming.finishContext('boot', operationId, 'deferred')");
    add('boot-character-ready', orch, '    const readinessEpoch = bootRecoveryEpoch',
        "    bgRecoveryTiming.milestone(operationId, 'character-ready')\n    const readinessEpoch = bootRecoveryEpoch");
    add('boot-hydrated', orch, '        if (watchKey || activeOperationId || get(doingChat)) {\n            bootRecoveryQueue.unshift(marker)',
        "        bgRecoveryTiming.milestone(operationId, 'chat-hydrated')\n        if (watchKey || activeOperationId || get(doingChat)) {\n            bgRecoveryTiming.finishContext('boot', operationId, 'requeued')\n            bootRecoveryQueue.unshift(marker)");
    add('boot-ready-requeued', orch,
        '            if (bootRecoveryReadyTimer === iv) bootRecoveryReadyTimer = null\n            bootRecoveryQueue.unshift(marker)',
        "            if (bootRecoveryReadyTimer === iv) bootRecoveryReadyTimer = null\n            bgRecoveryTiming.finishContext('boot', operationId, 'requeued')\n            bootRecoveryQueue.unshift(marker)");
    add('adoption-result', orch,
        '        },\n    })\n}\n\nfunction rememberServerCommittedTarget',
        "        },\n    }).then(result => { bgRecoveryTiming.milestone(operationId, 'adoption'); return result })\n}\n\nfunction rememberServerCommittedTarget");
    add('snapshot-import', chat, 'export async function peekServerChatSnapshot(',
        "import { bgRecoveryTiming } from '../bgRecoveryTiming'\n\nexport async function peekServerChatSnapshot(");
    add('snapshot-peek', chat,
        '    return forageStorage.realStorage.peekChatContentSnapshot(chaId, chatIndex, chatId)',
        '    return bgRecoveryTiming.snapshot(chaId, chatId, chatIndex, () => forageStorage.realStorage.peekChatContentSnapshot(chaId, chatIndex, chatId))');
    add('snapshot-adoption', chat,
        '        const snapshot = await forageStorage.realStorage.peekChatContentSnapshot(\n            chaId,\n            initialIndex,\n            chatId,\n        )',
        '        const snapshot = await bgRecoveryTiming.snapshot(chaId, chatId, initialIndex, () => forageStorage.realStorage.peekChatContentSnapshot(\n            chaId,\n            initialIndex,\n            chatId,\n        ))');
    add('snapshot-hydration', chat,
        '                ? await storage.peekChatContentSnapshot(chaId, index, chatId) : null',
        '                ? await bgRecoveryTiming.snapshot(chaId, chatId, index, () => storage.peekChatContentSnapshot(chaId, index, chatId)) : null');
    return units;
};
