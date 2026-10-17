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

const PROMPT_INPUT_FIELDS = ['note', 'localLore', 'scriptstate', 'modules', 'bindedPersona',
    'bindedBotPreset', 'fmIndex', 'firstMessageDisabled', 'hypaV3Data', 'supaMemory',
    'savedToggleValues', 'useModelPreset', 'modelBinding', 'usePromptPresetParams'];
const PROMPT_INPUT_MESSAGE_FIELDS = ['role', 'data', 'saying', 'name', 'otherUser', 'disabled', 'isComment'];

// Field-name descriptors only; values are never copied into the result.
function diffFields(names, before, current, prefix, out) {
    for (const key of names) {
        const hadBefore = own(before, key), hasCurrent = own(current, key);
        if (!hadBefore && !hasCurrent) continue;
        const sign = (side, present) => stableJSON(present ? { [key]: side[key] } : {});
        if (sign(before, hadBefore) === sign(current, hasCurrent)) continue;
        out.push({ field: prefix + key, kind: !hadBefore ? 'added' : !hasCurrent ? 'removed' : 'changed' });
    }
}

function promptInputChanges(before, current) {
    if (!before || !current || !Array.isArray(before.message) || !Array.isArray(current.message)) {
        return [{ field: 'chat', kind: 'unavailable' }];
    }
    const changes = [];
    diffFields(PROMPT_INPUT_FIELDS, before, current, '', changes);
    if (before.message.length !== current.message.length) {
        changes.push({ field: 'message.count', from: before.message.length, to: current.message.length });
    }
    const common = Math.min(before.message.length, current.message.length);
    for (let index = 0; index < common; index += 1) {
        diffFields(PROMPT_INPUT_MESSAGE_FIELDS, before.message[index], current.message[index],
            `message[${index}].`, changes);
    }
    return changes;
}

// Conservative preparation scope: scripts/lore/memory may read history that is
// later trimmed from the main request. Ignore presentation and engine ID fields.
function promptInputsChanged(before, current) {
    return promptInputChanges(before, current).length > 0;
}

const PROMPT_INPUT_LOG_LIMIT = 32;

function describePromptInputChanges(operationId, changes) {
    const shown = changes.slice(0, PROMPT_INPUT_LOG_LIMIT).map(change => (
        change.kind ? `${change.field}:${change.kind}` : `${change.field}:${change.from}\u2192${change.to}`));
    if (changes.length > PROMPT_INPUT_LOG_LIMIT) shown.push(`+${changes.length - PROMPT_INPUT_LOG_LIMIT} more`);
    return `[bg-assembly] prompt inputs changed op=${operationId} changes=${shown.join(',')}`;
}

module.exports = { captureAssemblyChat, captureAssemblyContext, describePromptInputChanges, promptInputChanges, promptInputsChanged };
