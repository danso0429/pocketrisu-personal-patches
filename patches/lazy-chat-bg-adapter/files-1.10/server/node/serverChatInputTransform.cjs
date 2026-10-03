'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const executions = new AsyncLocalStorage();
// The getter exposes only the current async descendant's scope to the bundle.
// A completed transform must not erase a failed scope from delayed descendants.
globalThis.__bgGetServerInputExecution = () => executions.getStore();

async function transformServerChatInput(character, chat, command, triggers, scripts, publishChat) {
    const scope = {
        signal: globalThis.__bgOrchAbortSignal,
        failure: null,
        reject(api) {
            if (!this.failure) this.failure = Object.assign(
                new Error('Server input stopped: unsupported host operation (' + api + ')'),
                { code: 'BG_INPUT_HOST_UNSUPPORTED', reason: 'server_host_unsupported', api },
            );
            throw this.failure;
        },
    };
    return executions.run(scope, async () => {
    try {
        const result = await transformInput(character, chat, command, triggers, scripts, publishChat);
        // Lua/trigger code may catch a host error. It cannot authorize continuing
        // this input or attaching its partial effects after that error.
        if (scope.failure) throw scope.failure;
        return result;
    } catch (error) {
        if (scope.failure && globalThis.__bgOrchAbortSignal?.aborted) {
            throw Object.assign(new Error('server input aborted'), { code: 'BG_INPUT_ABORTED' });
        }
        throw scope.failure || error;
    }
    });
}

async function transformInput(character, chat, command, triggers, scripts, publishChat) {
    if (!character || typeof character !== 'object'
        || !chat || !Array.isArray(chat.message)
        || !command || typeof command.rawText !== 'string'
        || typeof command.userMessageId !== 'string'
        || !Number.isSafeInteger(command.submittedAt)
        || typeof publishChat !== 'function') {
        throw new Error('server input transform command is invalid');
    }
    let transformed = chat;
    let text = command.rawText;
    if (character.type === 'character') {
        if (typeof triggers?.runTrigger !== 'function'
            || typeof scripts?.processScript !== 'function') {
            throw new Error('server input transform owner is unavailable');
        }
        const triggered = await triggers.runTrigger(character, 'input', { chat: transformed });
        if (triggered?.chat) transformed = triggered.chat;
        if (!transformed || !Array.isArray(transformed.message)) {
            throw new Error('server input trigger returned an invalid chat');
        }
    }
    if (!transformed || !Array.isArray(transformed.message)
        || transformed.message.some((message) => message?.chatId === command.userMessageId)) {
        throw new Error('server input message identity already exists or chat is invalid');
    }
    if (executions.getStore()?.failure) throw executions.getStore().failure;
    publishChat(transformed);
    if (character.type === 'character') {
        text = await scripts.processScript(character, text, 'editinput');
    }
    if (executions.getStore()?.failure) throw executions.getStore().failure;
    transformed.message.push({
        role: 'user',
        data: text,
        time: command.submittedAt,
        name: null,
        chatId: command.userMessageId,
    });
    return transformed;
}

module.exports = { transformServerChatInput };
