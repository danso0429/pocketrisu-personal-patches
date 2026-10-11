'use strict';
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const add = (name, file, anchor, content) => units.push({
        id: 'lazy-chat-bg-adapter:statistics-preflight:' + name + ':1.10',
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    add('prepared-refusal', 'server/node/bgOrchestrator.cjs',
        "                reason: 'server-chat-commit-base-read-failed',",
        "                reason: error?.code === 'SERVER_CHAT_STATISTICS_INVALID'\n                  ? 'server_statistics_invalid' : 'server-chat-commit-base-read-failed',");
    add('no-client-replay', 'src/ts/bgOrchestrate.ts',
        "                if (startRejectionReason === 'chat-generation-active') {",
        "                if (startRejectionReason === 'server_statistics_invalid') {\n                    stopWatch()\n                    try { notifyWarning('채팅 저장 상태를 확인할 수 없어 생성을 시작하지 않았어요. 상태를 확인한 뒤 다시 시도해 주세요.', { source: 'bg-input' }) }\n                    catch { /* A known pre-effect refusal must not run the model in the client. */ }\n                } else if (startRejectionReason === 'chat-generation-active') {");
    return units;
};
