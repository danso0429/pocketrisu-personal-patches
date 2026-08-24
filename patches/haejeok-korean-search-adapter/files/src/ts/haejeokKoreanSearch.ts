import {
    convertHangulToQwerty,
    convertQwertyToHangul,
    disassemble,
    getChoseong,
    romanize,
} from 'es-hangul'

/**
 * PocketRisu adaptation of Haejeok RisuAI's Korean-aware character search.
 *
 * Source basis: Haejeok RisuAI e9d035683cdf9f0207eed193ee36f9bdb117f658,
 * commits 86ee613c04e88f22bfcd0fb80267eb458a1a4408 and
 * 1e5f9eeed2fa5b881502affba9d5289dca625cdb.
 */

const CHOSEONG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

const HANGUL_BASE = 0xAC00
const HANGUL_END = 0xD7A3
const JONGSEONG_COUNT = 28
const JUNGSEONG_COUNT = 21

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function charToPattern(character: string, isLastCharacter: boolean): string {
    const choseongIndex = CHOSEONG_LIST.indexOf(
        character as typeof CHOSEONG_LIST[number],
    )
    if (choseongIndex !== -1) {
        const startCode = HANGUL_BASE
            + choseongIndex * JUNGSEONG_COUNT * JONGSEONG_COUNT
        const endCode = startCode + JUNGSEONG_COUNT * JONGSEONG_COUNT - 1
        return `[${character}${String.fromCharCode(startCode)}-${String.fromCharCode(endCode)}]`
    }

    const code = character.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
        const jongseongIndex = (code - HANGUL_BASE) % JONGSEONG_COUNT

        // Only the final IME syllable can still gain a batchim. Expanding every
        // open syllable makes completed earlier syllables produce broad false positives.
        if (isLastCharacter && jongseongIndex === 0) {
            return `[${character}-${String.fromCharCode(code + JONGSEONG_COUNT - 1)}]`
        }

        if (isLastCharacter) {
            const batchimExpansions: Record<number, number[]> = {
                1: [1, 2, 3],
                4: [4, 5, 6],
                8: [8, 9, 10, 11, 12, 13, 14, 15],
                17: [17, 18],
                19: [19, 20],
            }
            const expanded = batchimExpansions[jongseongIndex]
            if (expanded?.length > 1) {
                const base = code - jongseongIndex
                return `(?:${expanded.map((index) => (
                    String.fromCharCode(base + index)
                )).join('|')})`
            }
        }

        return escapeRegExp(character)
    }

    if (/\s/.test(character)) return '\\s*'
    return escapeRegExp(character)
}

export function buildKoreanSearchRegex(query: string, flags = 'i'): RegExp | null {
    const normalized = query.normalize('NFC').trim()
    if (!normalized) return null

    const characters = Array.from(normalized)
    const pattern = characters.map((character, index) => (
        charToPattern(character, index === characters.length - 1)
    )).join('\\s*')

    try {
        return new RegExp(pattern, flags)
    } catch {
        return null
    }
}

export function normalizePhonetic(value: string): string {
    return value
        .toLowerCase()
        .replace(/[\s\-_.]+/g, '')
        .replace(/c(?=[eiy])/g, 's')
        .replace(/c/g, 'k')
        .replace(/q/g, 'k')
        .replace(/r/g, 'l')
        .replace(/sh/g, 's')
        .replace(/z/g, 'j')
        .replace(/oo/g, 'u')
        .replace(/ee/g, 'i')
        .replace(/ae/g, 'a')
        .replace(/eu$/g, '')
        .replace(/e$/g, '')
        .replace(/ng$/g, 'n')
        .replace(/([a-z])\1+/g, '$1')
}

export interface KoreanMatchResult {
    matched: boolean
    score: number
    isKeyboardConverted?: boolean
    isRomanized?: boolean
}

function matchKoreanTextInternal(
    target: string | undefined | null,
    query: string,
    allowKeyboardConversion: boolean,
): KoreanMatchResult {
    if (!target) return { matched: false, score: 0 }

    const targetNormalized = target.normalize('NFC').trim()
    const queryNormalized = query.normalize('NFC').trim()
    if (!queryNormalized) return { matched: true, score: 0 }

    const targetLower = targetNormalized.toLowerCase()
    const queryLower = queryNormalized.toLowerCase()
    if (targetLower === queryLower) return { matched: true, score: 1000 }
    if (targetLower.startsWith(queryLower)) return { matched: true, score: 800 }
    if (targetLower.includes(queryLower)) return { matched: true, score: 600 }

    const targetCompact = targetLower.replace(/[\s\-_]+/g, '')
    const queryCompact = queryLower.replace(/[\s\-_]+/g, '')
    if (targetCompact.includes(queryCompact)) return { matched: true, score: 550 }

    const expression = buildKoreanSearchRegex(queryLower)
    if (expression) {
        const index = targetNormalized.search(expression)
        if (index !== -1) return { matched: true, score: index === 0 ? 500 : 450 }
    }

    try {
        const targetDisassembled = disassemble(targetLower).replace(/\s+/g, '')
        const queryDisassembled = disassemble(queryLower).replace(/\s+/g, '')
        if (queryDisassembled && targetDisassembled.includes(queryDisassembled)) {
            return {
                matched: true,
                score: targetDisassembled.startsWith(queryDisassembled) ? 420 : 380,
            }
        }
    } catch {
        // Unusual non-text values fall through to the remaining matchers.
    }

    try {
        const targetChoseong = getChoseong(targetLower, {
            keepNonHangul: true,
        }).replace(/\s+/g, '')
        if (targetChoseong && targetChoseong.includes(queryCompact)) {
            return {
                matched: true,
                score: targetChoseong.startsWith(queryCompact) ? 400 : 350,
            }
        }
    } catch {
        // Fall through.
    }

    if (/[가-힣]/.test(queryNormalized)) {
        try {
            const romanized = romanize(queryNormalized).toLowerCase().replace(/\s+/g, '')
            if (romanized) {
                if (targetCompact === romanized) {
                    return { matched: true, score: 480, isRomanized: true }
                }
                if (targetCompact.startsWith(romanized)) {
                    return { matched: true, score: 440, isRomanized: true }
                }
                if (targetCompact.includes(romanized)) {
                    return { matched: true, score: 400, isRomanized: true }
                }

                const targetPhonetic = normalizePhonetic(targetCompact)
                const queryPhonetic = normalizePhonetic(romanized)
                if (targetPhonetic && queryPhonetic) {
                    if (targetPhonetic === queryPhonetic) {
                        return { matched: true, score: 460, isRomanized: true }
                    }
                    if (targetPhonetic.startsWith(queryPhonetic)) {
                        return { matched: true, score: 420, isRomanized: true }
                    }
                    if (targetPhonetic.includes(queryPhonetic)) {
                        return { matched: true, score: 380, isRomanized: true }
                    }
                }
            }
        } catch {
            // Fall through.
        }
    }

    if (allowKeyboardConversion) {
        const convertedQueries: string[] = []
        if (/[a-z]/i.test(queryNormalized)) {
            try { convertedQueries.push(convertQwertyToHangul(queryNormalized)) } catch { /* noop */ }
        }
        if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(queryNormalized)) {
            try { convertedQueries.push(convertHangulToQwerty(queryNormalized)) } catch { /* noop */ }
        }

        for (const converted of new Set(convertedQueries)) {
            if (!converted || converted === queryNormalized) continue
            const result = matchKoreanTextInternal(target, converted, false)
            if (result.matched) {
                return {
                    ...result,
                    score: Math.max(result.score - 150, 200),
                    isKeyboardConverted: true,
                }
            }
        }
    }

    return { matched: false, score: 0 }
}

export function matchKoreanText(
    target: string | undefined | null,
    query: string,
): KoreanMatchResult {
    return matchKoreanTextInternal(target, query, true)
}

export interface KoreanSearchableCharacter {
    name?: string
    creator?: string
    tags?: string[]
}

export function matchCharacterKorean(
    character: KoreanSearchableCharacter,
    query: string,
): KoreanMatchResult {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return { matched: true, score: 0 }

    const name = matchKoreanText(character.name, normalizedQuery)
    const creator = matchKoreanText(character.creator, normalizedQuery)
    const creatorScore = creator.matched ? creator.score * 0.6 : 0

    let tagScore = 0
    let tagMatched = false
    for (const tag of character.tags ?? []) {
        const result = matchKoreanText(tag, normalizedQuery)
        if (result.matched && result.score * 0.7 > tagScore) {
            tagScore = result.score * 0.7
            tagMatched = true
        }
    }

    if (!name.matched && !creator.matched && !tagMatched) {
        return { matched: false, score: 0 }
    }

    return {
        matched: true,
        score: Math.max(name.score, creatorScore, tagScore),
        isKeyboardConverted: name.isKeyboardConverted || creator.isKeyboardConverted,
        isRomanized: name.isRomanized || creator.isRomanized,
    }
}

export function filterCharactersKorean<T extends KoreanSearchableCharacter>(
    characters: T[],
    query: string,
): T[] {
    return characters.filter((character) => matchCharacterKorean(character, query).matched)
}
