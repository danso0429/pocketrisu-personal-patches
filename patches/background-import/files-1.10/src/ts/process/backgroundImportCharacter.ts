import { Buffer } from 'buffer'
import type { CharacterCardV2, CharacterCardV3 } from '@risuai/ccardlib'
import type { character, loreBook, loreSettings } from '../storage/database.svelte'

export interface CharacterPreparationDependencies {
    freshId(): string
    defaultSdData(): unknown
    newChatDefaults(): Record<string, unknown>
    saveAsset(data: Uint8Array, fileName?: string): Promise<string>
    fetchHubResource?(value: string): Promise<Uint8Array>
    isKnownUri?(value: string): boolean
}

export interface CharacterPreparationOptions {
    image?: Uint8Array
    mode?: 'normal' | 'hub'
    assetDict?: Readonly<Record<string, string>>
    overrideLorebook?: loreBook[] | null
    authorized?: boolean
    maxInlineAssetBytes: number
}

type Card = CharacterCardV2 | CharacterCardV3 | Record<string, any>

function importError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { name: 'CharacterPreparationError', code })
}

function clone<T>(value: T): T {
    return structuredClone(value)
}

function currentChat(deps: CharacterPreparationDependencies) {
    return {
        id: deps.freshId(),
        message: [],
        note: '',
        name: 'Chat 1',
        localLore: [],
        ...deps.newChatDefaults(),
    }
}

function resolveBook(
    input: any,
    initialLorebook: loreBook[] = [],
): { lorebook: loreBook[]; loresettings?: loreSettings; loreExt?: any } {
    if (!input) return { lorebook: initialLorebook }
    const charbook = clone(input)
    let loresettings: loreSettings | undefined
    if (
        charbook.recursive_scanning !== null && charbook.recursive_scanning !== undefined
        && charbook.scan_depth !== null && charbook.scan_depth !== undefined
        && charbook.token_budget !== null && charbook.token_budget !== undefined
    ) {
        loresettings = {
            tokenBudget: charbook.token_budget,
            scanDepth: charbook.scan_depth,
            recursiveScanning: charbook.recursive_scanning,
            fullWordMatching: charbook?.extensions?.risu_fullWordMatching ?? false,
        }
    }
    const lorebook = [...initialLorebook]
    for (const rawBook of charbook.entries ?? []) {
        const book = clone(rawBook)
        let content = book.content ?? ''
        if (book.use_regex && !book.keys?.[0]?.startsWith('/')) book.use_regex = false
        const extensions = clone(book.extensions ?? {})
        if (extensions.useProbability && extensions.probability !== undefined && extensions.probability !== 100) {
            content = `@@probability ${extensions.probability}\n${content}`
            delete extensions.useProbability
            delete extensions.probability
        }
        if (extensions.position === 4 && typeof extensions.depth === 'number' && typeof extensions.role === 'number') {
            content = `@@depth ${extensions.depth}\n@@role ${['system', 'user', 'assistant'][extensions.role]}\n${content}`
            delete extensions.position
            delete extensions.depth
            delete extensions.role
        }
        if (typeof extensions.selectiveLogic === 'number' && book.secondary_keys?.length > 0) {
            switch (extensions.selectiveLogic) {
                case 0:
                    if (!book.secondary_keys?.length) book.selective = false
                    break
                case 1:
                    book.selective = false
                    content = `@@exclude_keys_all ${book.secondary_keys.join(',')}\n${content}`
                    break
                case 2:
                    book.selective = false
                    for (const key of book.secondary_keys) content = `@@exclude_keys ${key}\n${content}`
                    break
                case 3:
                    book.selective = false
                    for (const key of book.secondary_keys) content = `@@additional_keys ${key}\n${content}`
                    break
            }
        }
        if (typeof extensions.delay === 'number' && extensions.delay > 0) {
            content = `@@activate_only_after ${extensions.delay}\n${content}`
            delete extensions.delay
        }
        if (extensions.match_whole_words === true) {
            content = `@@match_full_word\n${content}`
            delete extensions.match_whole_words
        } else if (extensions.match_whole_words === false) {
            content = `@@match_partial_word\n${content}`
            delete extensions.match_whole_words
        }
        lorebook.push({
            key: (book.keys ?? []).join(', '),
            secondkey: book.secondary_keys?.join(', ') ?? '',
            insertorder: book.insertion_order,
            comment: book.name ?? book.comment ?? '',
            content,
            mode: book.mode ?? 'normal',
            alwaysActive: book.constant ?? false,
            selective: book.selective ?? false,
            extentions: { ...extensions, risu_case_sensitive: book.case_sensitive },
            activationPercent: book.extensions?.risu_activationPercent,
            loreCache: book.extensions?.risu_loreCache ?? null,
            useRegex: book.use_regex ?? false,
            folder: book.folder,
        } as loreBook)
    }
    return { lorebook, loresettings, loreExt: charbook.extensions }
}

async function sourceAsset(
    value: string,
    deps: CharacterPreparationDependencies,
    options: CharacterPreparationOptions,
    fileName = '',
): Promise<string> {
    if (value.startsWith('__asset:')) {
        const key = value.slice('__asset:'.length)
        const resolved = options.assetDict?.[key]
        if (!resolved) throw importError('IMPORT_MISSING_ASSET', 'Referenced character asset is missing')
        return resolved
    }
    let data: Uint8Array
    if ((options.mode ?? 'normal') === 'hub') {
        if (!deps.fetchHubResource) throw importError('IMPORT_HUB_SOURCE_UNAVAILABLE', 'Hub asset source is unavailable')
        data = await deps.fetchHubResource(value)
    } else {
        data = Buffer.from(value, 'base64')
    }
    if (data.byteLength > options.maxInlineAssetBytes) {
        throw importError('IMPORT_LIMIT_EXCEEDED', 'Inline character asset exceeds the limit')
    }
    return deps.saveAsset(data, fileName)
}

export function characterCardRequiresLowLevel(card: Card): boolean {
    return card?.data?.extensions?.risuai?.lowLevelAccess === true
}

export async function prepareCharacterCard(
    cardInput: Card,
    deps: CharacterPreparationDependencies,
    options: CharacterPreparationOptions,
): Promise<character> {
    if (!cardInput || (cardInput.spec !== 'chara_card_v2' && cardInput.spec !== 'chara_card_v3')) {
        throw importError('IMPORT_INVALID_CHARACTER', 'Unsupported character card')
    }
    if (!Number.isSafeInteger(options.maxInlineAssetBytes) || options.maxInlineAssetBytes <= 0) {
        throw importError('IMPORT_LIMIT_INVALID', 'Inline asset limit is invalid')
    }
    const card = clone(cardInput)
    const data: any = card.data
    const risu: any = clone(data.extensions?.risuai)
    if (risu?.lowLevelAccess && options.authorized !== true) {
        throw importError('IMPORT_AUTHORIZATION_REQUIRED', 'Low-level character import requires authorization')
    }

    let image = options.image ? await deps.saveAsset(options.image) : undefined
    const emotions: [string, string][] = []
    const bias: [string, number][] = risu?.bias ?? []
    const viewScreen = risu?.viewScreen ?? 'none'
    const customScripts = risu?.customScripts ?? []
    const utilityBot = risu?.utilityBot ?? false
    const sdData = risu?.sdData ?? deps.defaultSdData()
    const additionalAssets: [string, string, string][] = []
    const ccAssets: Array<{ type: string; uri: string; name: string; ext: string }> = []
    let vits: any = null

    if (risu && card.spec === 'chara_card_v2') {
        for (const emotion of risu.emotions ?? []) {
            emotions.push([emotion[0], await sourceAsset(emotion[1], deps, options)])
        }
        for (const asset of risu.additionalAssets ?? []) {
            const fileName = asset.length >= 3 ? asset[2] : ''
            additionalAssets.push([asset[0], await sourceAsset(asset[1], deps, options, fileName), fileName])
        }
        const voiceKeys = Object.keys(risu.vits ?? {})
        const voiceFiles: Record<string, string> = {}
        for (const key of voiceKeys) voiceFiles[key] = await sourceAsset(risu.vits[key], deps, options)
        if (voiceKeys.length > 0) {
            vits = { name: 'Imported VITS', files: voiceFiles, id: deps.freshId().replace(/-/g, '') }
        }
    }

    if (card.spec === 'chara_card_v3') {
        for (const asset of data.assets ?? []) {
            const fileName = asset.name ?? ''
            let resolved: string | undefined
            if (asset.uri.startsWith('__asset:')) {
                resolved = options.assetDict?.[asset.uri.slice('__asset:'.length)] ?? ''
                if (!resolved) throw importError('IMPORT_MISSING_ASSET', 'Referenced character asset is missing')
            } else if (asset.uri === 'ccdefault:') {
                resolved = image
            } else if (asset.uri.startsWith('embeded://')) {
                resolved = options.assetDict?.[asset.uri.slice('embeded://'.length)] ?? ''
                if (!resolved) throw importError('IMPORT_MISSING_ASSET', 'Embedded character asset is missing')
            } else if (asset.uri.startsWith('data:')) {
                const separator = asset.uri.indexOf(',')
                if (separator < 0) throw importError('IMPORT_INVALID_CHARACTER', 'Character data URI is invalid')
                const bytes = Buffer.from(asset.uri.slice(separator + 1), 'base64')
                if (bytes.byteLength > options.maxInlineAssetBytes) {
                    throw importError('IMPORT_LIMIT_EXCEEDED', 'Character data URI exceeds the limit')
                }
                resolved = await deps.saveAsset(bytes)
            } else if (deps.isKnownUri?.(asset.uri)) {
                continue
            } else {
                continue
            }
            if (asset.type === 'emotion') emotions.push([fileName, resolved as string])
            else if (asset.type === 'x-risu-asset') additionalAssets.push([fileName, resolved as string, asset.ext ?? 'unknown'])
            else if (asset.type === 'icon' && asset.name === 'main') image = resolved
            else ccAssets.push({
                type: asset.type ?? 'asset', uri: resolved as string,
                name: fileName, ext: asset.ext ?? 'unknown',
            })
        }
    }

    const convertedBook = resolveBook(
        data.character_book,
        options.overrideLorebook ? [] : [],
    )
    const lorebook = options.overrideLorebook
        ? clone(options.overrideLorebook)
        : convertedBook.lorebook
    const extensions = clone(data.extensions ?? {})
    delete extensions.risuai
    delete extensions.depth_prompt

    const output: character = {
        name: data.name ?? '',
        firstMessage: data.first_mes ?? '',
        desc: data.description ?? '',
        notes: '',
        chats: [currentChat(deps) as any],
        chatPage: 0,
        image,
        emotionImages: emotions,
        bias,
        globalLore: lorebook,
        viewScreen: viewScreen as any,
        chaId: deps.freshId(),
        sdData: sdData as any,
        utilityBot,
        customscript: customScripts,
        exampleMessage: data.mes_example ?? '',
        creatorNotes: data.creator_notes ?? '',
        systemPrompt: data.system_prompt ?? '',
        postHistoryInstructions: '',
        alternateGreetings: data.alternate_greetings ?? [],
        tags: data.tags ?? [],
        creator: data.creator ?? '',
        characterVersion: `${data.character_version}` || '',
        personality: data.personality ?? '',
        scenario: data.scenario ?? '',
        firstMsgIndex: -1,
        removedQuotes: false,
        loreSettings: convertedBook.loresettings,
        loreExt: convertedBook.loreExt,
        additionalData: {
            tag: data.tags ?? [], creator: data.creator,
            character_version: data.character_version,
        },
        additionalAssets,
        replaceGlobalNote: data.post_history_instructions ?? '',
        backgroundHTML: risu?.backgroundHTML,
        license: risu?.license,
        triggerscript: risu?.triggerscript ?? [],
        private: risu?.private ?? false,
        additionalText: risu?.additionalText ?? '',
        virtualscript: '',
        extentions: extensions,
        largePortrait: risu?.largePortrait ?? !risu,
        inlayViewScreen: risu?.inlayViewScreen ?? false,
        newGenData: risu?.newGenData ?? undefined,
        vits,
        ttsMode: vits ? 'vits' : 'normal',
        imported: true,
        source: data.extensions?.risuai?.source ?? [],
        ccAssets,
        lowLevelAccess: risu?.lowLevelAccess ?? false,
        defaultVariables: risu?.defaultVariables ?? '',
        chatFolders: [],
        prebuiltAssetCommand: risu?.prebuiltAssetCommand ?? '',
        prebuiltAssetExclude: risu?.prebuiltAssetExclude ?? [],
        prebuiltAssetStyle: risu?.prebuiltAssetStyle ?? '',
        customModuleToggle: risu?.toggles ?? '',
    }
    if (card.spec === 'chara_card_v3') {
        output.group_only_greetings = data.group_only_greetings ?? []
        output.nickname = data.nickname ?? ''
        output.source = data.source ?? data.extensions?.risuai?.source ?? []
        output.creation_date = data.creation_date ?? 0
        output.modification_date = data.modification_date ?? 0
    }
    return output
}

export function prepareOffSpecCharacter(
    cardInput: Record<string, any>,
    image: string | undefined,
    deps: CharacterPreparationDependencies,
): character {
    const card = clone(cardInput)
    const data = card.spec_version === '2.0' ? card.data : card
    const convertedBook = resolveBook(card.spec_version === '2.0' ? card.data.character_book : null)
    return {
        name: data.name ?? 'unknown name',
        firstMessage: data.first_mes ?? 'unknown first message',
        desc: data.description ?? '',
        notes: '',
        chats: [currentChat(deps) as any],
        chatPage: 0,
        image,
        emotionImages: [],
        bias: [],
        globalLore: convertedBook.lorebook,
        viewScreen: 'none',
        chaId: deps.freshId(),
        sdData: deps.defaultSdData() as any,
        utilityBot: false,
        customscript: [],
        exampleMessage: data.mes_example,
        creatorNotes: '',
        systemPrompt: (card.spec_version === '2.0' ? card.data.system_prompt : '') ?? '',
        postHistoryInstructions: (card.spec_version === '2.0' ? card.data.post_history_instructions : '') ?? '',
        alternateGreetings: [],
        tags: [],
        creator: '',
        characterVersion: '',
        personality: data.personality ?? '',
        scenario: data.scenario ?? '',
        firstMsgIndex: -1,
        replaceGlobalNote: '',
        triggerscript: [],
        additionalText: '',
        loreExt: convertedBook.loreExt,
        loreSettings: convertedBook.loresettings,
        chatFolders: [],
    } as character
}
