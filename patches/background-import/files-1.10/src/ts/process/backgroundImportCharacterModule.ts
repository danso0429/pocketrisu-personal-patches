import type { character } from '../storage/database.svelte'
import type { RisuModule } from './modules'

export function prepareModuleFromCharacter(
    character: character,
    freshId: () => string,
): RisuModule {
    const module: RisuModule = {
        name: character.name,
        description: character.creatorNotes,
        lorebook: structuredClone(character.globalLore || []),
        regex: character.customscript,
        trigger: character.triggerscript,
        lowLevelAccess: character.lowLevelAccess,
        hideIcon: character.hideChatIcon,
        backgroundEmbedding: character.backgroundHTML,
        assets: character.additionalAssets,
        customModuleToggle: character.customModuleToggle,
        id: freshId(),
        icon: character.image,
    }
    if (character.desc) {
        module.lorebook!.push({
            key: '',
            secondkey: '',
            insertorder: 0,
            comment: 'From Character Description',
            content: `@@indicator character_desc\n\n${character.desc}`,
            mode: 'constant',
            alwaysActive: true,
            selective: false,
        })
    }
    if (character.firstMessage || (character.alternateGreetings && character.alternateGreetings.length > 0)) {
        let firstMessages = `<FM>\n${character.firstMessage}\n</FM>`
        for (const greeting of character.alternateGreetings ?? []) {
            firstMessages += `\n<FM_alt>\n${greeting}\n</FM_alt>`
        }
        module.lorebook!.push({
            key: '',
            secondkey: '',
            insertorder: 0,
            comment: 'From First Messages',
            content: `@@indicator character_first_message\n\n${firstMessages}`,
            mode: 'constant',
            alwaysActive: false,
            selective: false,
        })
    }
    if (character.postHistoryInstructions) {
        module.lorebook!.push({
            key: '',
            secondkey: '',
            insertorder: 0,
            comment: 'From PHI',
            content: `@@indicator phi\n\n${character.postHistoryInstructions}`,
            mode: 'constant',
            alwaysActive: true,
            selective: false,
        })
    }
    return structuredClone(module)
}
