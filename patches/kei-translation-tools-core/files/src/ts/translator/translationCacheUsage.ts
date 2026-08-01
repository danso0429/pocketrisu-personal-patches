import type { Chat, Message } from '../storage/database.svelte'
import {
    raceTranslationAbort,
    throwIfTranslationAborted,
} from './translationTask'

interface TranslationSourceCharacter {
    chaId: string
    firstMessage?: string
    alternateGreetings?: string[]
    chats?: Chat[]
}

export interface TranslationSourceDatabase {
    characters?: TranslationSourceCharacter[]
}

export interface TranslationSourceScanOptions {
    signal?: AbortSignal
    batchSize?: number
    yieldToEventLoop?: () => Promise<void>
    fetchChat: (
        characterId: string,
        chatIndex: number,
        chatId: string,
    ) => Promise<Chat | null>
    onProgress?: (current: number, total: number) => void
}

function addText(keys: Set<string>, text?: string | null): void {
    if (typeof text === 'string' && text.trim().length > 0) {
        keys.add(text)
    }
}

function addMessage(keys: Set<string>, message: Message): void {
    if (message.isComment) {
        return
    }
    addText(keys, message.data)
    for (const swipe of message.swipes ?? []) {
        addText(keys, swipe)
    }
}

export async function collectKnownTranslationSourceKeys(
    database: TranslationSourceDatabase,
    options: TranslationSourceScanOptions,
): Promise<Set<string>> {
    const signal = options.signal
    const characters = database.characters ?? []
    const total = characters.reduce(
        (sum, character) => sum
            + 1
            + (character.alternateGreetings?.length ?? 0)
            + (character.chats?.length ?? 0),
        0,
    )
    let current = 0
    const keys = new Set<string>()
    const progress = () => options.onProgress?.(++current, total)
    const batchSize = Math.max(1, Math.floor(options.batchSize ?? 200))
    let processedSinceYield = 0
    const checkpoint = async () => {
        throwIfTranslationAborted(signal)
        processedSinceYield++
        if (processedSinceYield < batchSize) {
            return
        }
        processedSinceYield = 0
        await (options.yieldToEventLoop?.()
            ?? new Promise<void>((resolve) => setTimeout(resolve, 0)))
        throwIfTranslationAborted(signal)
    }

    for (const character of characters) {
        await checkpoint()
        addText(keys, character.firstMessage)
        progress()

        for (const greeting of character.alternateGreetings ?? []) {
            await checkpoint()
            addText(keys, greeting)
            progress()
        }

        const chats = character.chats ?? []
        for (let chatIndex = 0; chatIndex < chats.length; chatIndex++) {
            await checkpoint()
            let chat = chats[chatIndex]
            if (chat._placeholder) {
                if (!chat.id) {
                    throw new Error(
                        `Missing chat id while scanning ${character.chaId} #${chatIndex}`,
                    )
                }
                const hydrated = await raceTranslationAbort(
                    options.fetchChat(
                        character.chaId,
                        chatIndex,
                        chat.id,
                    ),
                    signal,
                )
                throwIfTranslationAborted(signal)
                if (!hydrated) {
                    throw new Error(
                        `Failed to load chat while scanning ${character.chaId}/${chat.id}`,
                    )
                }
                chat = hydrated
            }

            for (const message of chat.message ?? []) {
                await checkpoint()
                addMessage(keys, message)
            }
            for (const suggestion of chat.suggestMessages ?? []) {
                await checkpoint()
                addText(keys, suggestion)
            }
            for (const summary of chat.hypaV3Data?.summaries ?? []) {
                await checkpoint()
                addText(keys, summary.text)
            }
            progress()
        }
    }

    throwIfTranslationAborted(signal)
    return keys
}
