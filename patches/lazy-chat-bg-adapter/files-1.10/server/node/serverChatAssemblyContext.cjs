'use strict';

const crypto = require('node:crypto');
const { stableJSON } = require('./serverChatCommit.cjs');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function captureAssemblyChat(currentChat, metadata) {
    const chat = structuredClone(currentChat);
    for (const field of ['name', 'lastDate', 'folderId', 'modules']) {
        if (own(metadata, field)) Object.defineProperty(chat, field, {
            value: structuredClone(metadata[field]), enumerable: true, configurable: true, writable: true,
        });
    }
    return chat;
}

// Call inside the storage queue. No secret-bearing graph or content-derived
// settings identity is returned to a durable store by this helper.
function captureAssemblyContext(database, currentChat, charId, chatId) {
    const characterIndex = database?.characters?.findIndex(character => character?.chaId === charId) ?? -1;
    const character = characterIndex >= 0 ? database.characters[characterIndex] : null;
    const chatIndex = character?.chats?.findIndex(chat => chat?.id === chatId) ?? -1;
    if (chatIndex < 0 || currentChat?.id !== chatId || !Array.isArray(currentChat.message)
        || currentChat._placeholder || currentChat._stub) {
        throw Object.assign(new Error('Assembly chat is unavailable'), { code: 'BG_ASSEMBLY_CHAT_UNAVAILABLE' });
    }
    const ownedDatabase = structuredClone(database);
    const metadata = structuredClone(character.chats[chatIndex]);
    const chat = captureAssemblyChat(currentChat, metadata);
    ownedDatabase.characters[characterIndex].chats[chatIndex] = chat;
    ownedDatabase.characters[characterIndex].chatPage = chatIndex;
    return { status: 'ready', database: ownedDatabase, chat, metadata,
        contextDigest: crypto.randomBytes(32).toString('hex') };
}

// Conservative preparation scope: scripts/lore/memory may read history that is
// later trimmed from the main request. Ignore presentation and engine ID fields.
function promptInputsChanged(before, current) {
    const fields = ['note', 'localLore', 'scriptstate', 'modules', 'bindedPersona',
        'bindedBotPreset', 'fmIndex', 'firstMessageDisabled', 'hypaV3Data', 'supaMemory',
        'savedToggleValues', 'useModelPreset', 'modelBinding', 'usePromptPresetParams'];
    const messageFields = ['role', 'data', 'saying', 'name', 'otherUser', 'disabled', 'isComment'];
    const select = chat => ({
        ...Object.fromEntries(fields.filter(key => own(chat, key)).map(key => [key, chat[key]])),
        message: chat.message.map(message => Object.fromEntries(
            messageFields.filter(key => own(message, key)).map(key => [key, message[key]]),
        )),
    });
    if (!before || !current || !Array.isArray(before.message) || !Array.isArray(current.message)) return true;
    return stableJSON(select(before)) !== stableJSON(select(current));
}

module.exports = { captureAssemblyChat, captureAssemblyContext, promptInputsChanged };
