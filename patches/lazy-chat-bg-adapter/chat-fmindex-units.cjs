'use strict';
// New and imported chats carry fmIndex -1 from their first local write, so the
// local and server revisions of a new chat agree before its first save.
// Creation literals add `fmIndex: -1` (the character literals there set
// firstMsgIndex: -1, so this is the value characterFormatUpdate's fill would
// give); the empty-chats default in characterFormatUpdate uses
// `cha.firstMsgIndex ?? -1` like that fill. Import boundaries use `??= -1` before
// normalization so an imported value is kept. normalizeChat stays unchanged:
// it also runs on existing chats (snapshots, rebase, plugin writes).
// The server's reset default chat is set in lazy-chat-sync's storageResetPrepare.cjs.
const hostOwners = [
    require('../character-import-ux/manifest.cjs'),
    require('../personal-settings/manifest.cjs'),
    require('../charx-archive-integrity/manifest.cjs'),
].flatMap(pack => pack.units);

module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const add = (name, file, type, anchor, content, where) => units.push({
        id: 'lazy-chat-bg-adapter:chat-fmindex:' + name + ':1.10',
        file, type, anchor, content, ...(where ? { where } : {}), targetVersions,
        after: [...hostOwners, ...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    const defaultChatTail = image => `            name: 'Chat 1',
            localLore: [],
            ...newChatModelDefaults()
        }],
        chatPage: 0,
        image: ${image},
`;
    const withFmIndex = text => text.replace("            localLore: [],\n", "            localLore: [],\n            fmIndex: -1,\n");
    add('png-character-default', 'src/ts/characterCards.ts', 'replace',
        defaultChatTail('imgp'), withFmIndex(defaultChatTail('imgp')));
    add('card-character-default', 'src/ts/characterCards.ts', 'replace',
        defaultChatTail('im'), withFmIndex(defaultChatTail('im')));
    const formatUpdateDefault = `    if(cha.chats.length === 0){
        cha.chats = [{
            message: [],
            note: '',
            name: 'Chat 1',
            localLore: [],
`;
    // Same value the fill at the end of characterFormatUpdate would give this chat.
    add('format-update-default', 'src/ts/characters.ts', 'replace',
        formatUpdateDefault, formatUpdateDefault.replace("            localLore: [],\n",
            "            localLore: [],\n            fmIndex: cha.firstMsgIndex ?? -1,\n"));
    const blankCharacterDefault = `            name: 'Chat 1',
            localLore: [],
            ...newChatModelDefaults()
        }],
        chatFolders: [],
`;
    add('blank-character-default', 'src/ts/characters.ts', 'replace',
        blankCharacterDefault, withFmIndex(blankCharacterDefault));
    add('json-v2-import', 'src/ts/characters.ts', 'insert',
        '                    chat.id = v4()\n',
        '                    chat.fmIndex ??= -1\n', 'after');
    add('html-import', 'src/ts/characters.ts', 'insert',
        '            if(json.message && json.note && json.name && json.localLore){\n',
        '                json.fmIndex ??= -1\n', 'after');
    add('package-import', 'src/ts/characterPackage.ts', 'insert',
        '        chat.id = v4()\n',
        '        chat.fmIndex ??= -1\n', 'after');
    return units;
};
