'use strict';

async function transformServerChatInput(character, chat, command, triggers, scripts, publishChat) {
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
    publishChat(transformed);
    if (character.type === 'character') {
        text = await scripts.processScript(character, text, 'editinput');
    }
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
