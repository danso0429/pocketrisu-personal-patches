import { describe, expect, test } from 'vitest'
import {
    buildKoreanSearchRegex,
    filterCharactersKorean,
    matchCharacterKorean,
    matchKoreanText,
} from './haejeokKoreanSearch'

describe('Haejeok Korean character search adaptation', () => {
    test('preserves ordinary exact, substring, and compact matching', () => {
        expect(matchKoreanText('홍길동', '홍길동').score).toBe(1000)
        expect(matchKoreanText('홍길동전', '홍길동').matched).toBe(true)
        expect(matchKoreanText('메이드 로봇', '메이드로봇').matched).toBe(true)
        expect(matchKoreanText('GPT-4o Assistant', 'gpt_4o').matched).toBe(true)
        expect(matchKoreanText('홍길동', '김유신').matched).toBe(false)
    })

    test('matches pure and mixed choseong', () => {
        expect(matchKoreanText('홍길동', 'ㅎㄱㄷ').matched).toBe(true)
        expect(matchKoreanText('블루 아카이브', 'ㅂㄹㅇㅋㅇㅂ').matched).toBe(true)
        expect(matchKoreanText('홍길동', '홍ㄱㄷ').matched).toBe(true)
        expect(matchKoreanText('메이드 로봇', '메ㅇㄷ').matched).toBe(true)
        expect(matchKoreanText('홍길동', 'ㅅㄱㄷ').matched).toBe(false)
    })

    test('matches only the final in-progress IME syllable broadly', () => {
        expect(matchKoreanText('홍길동', '호').matched).toBe(true)
        expect(matchKoreanText('홍길동', '홍기').matched).toBe(true)
        expect(matchKoreanText('학교', '하').matched).toBe(true)
        expect(matchKoreanText('각목', '가').matched).toBe(true)
        expect(matchKoreanText('각나다', '가나다').matched).toBe(false)
    })

    test('supports both keyboard-layout mistake directions without recursion', () => {
        expect(matchKoreanText('홍길동', 'ghdrlfehd')).toMatchObject({
            matched: true,
            isKeyboardConverted: true,
        })
        expect(matchKoreanText('리수', 'fltn').matched).toBe(true)
        expect(matchKoreanText('Arona', 'ㅁ개ㅜㅁ')).toMatchObject({
            matched: true,
            isKeyboardConverted: true,
        })
        expect(matchKoreanText('unrelated', 'ㅁ개ㅜㅁ').matched).toBe(false)
    })

    test('matches common English names through Korean romanization', () => {
        for (const [target, query] of [
            ['Arona', '아로나'],
            ['Sakura Matou', '사쿠라'],
            ['Megumin', '메구밍'],
            ['Karin Kakudate', '카린'],
            ['Shiroko', '시로코'],
            ['Alice', '앨리스'],
        ]) {
            expect(matchKoreanText(target, query)).toMatchObject({
                matched: true,
                isRomanized: true,
            })
        }
    })

    test('searches name, creator, and tags while retaining field weights', () => {
        const character = {
            name: '홍길동',
            creator: '허균',
            tags: ['조선', '의적', '도술'],
        }
        expect(matchCharacterKorean(character, 'ㅎㄱㄷ').matched).toBe(true)
        expect(matchCharacterKorean(character, 'ㅎㄱ').matched).toBe(true)
        expect(matchCharacterKorean(character, 'ㅇㅈ').matched).toBe(true)

        const name = matchCharacterKorean({ name: '의적 홍길동' }, '의적')
        const tag = matchCharacterKorean({ name: '이순신', tags: ['의적'] }, '의적')
        expect(name.score).toBeGreaterThan(tag.score)
    })

    test('filters without replacing the catalog order', () => {
        const characters = [
            { name: '홍길동', id: 'first' },
            { name: '이순신', tags: ['의적'], id: 'second' },
            { name: '김유신', id: 'third' },
        ]
        expect(filterCharactersKorean(characters, '의적').map((item) => item.id))
            .toEqual(['second'])
        expect(filterCharactersKorean(characters, '').map((item) => item.id))
            .toEqual(['first', 'second', 'third'])
    })

    test('escapes regex syntax and rejects an empty expression', () => {
        expect(buildKoreanSearchRegex('')).toBeNull()
        expect(buildKoreanSearchRegex('[test]')?.test('[test]')).toBe(true)
    })
})
