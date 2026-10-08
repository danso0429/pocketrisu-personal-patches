import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Execute the generated production restore function; isolate only its I/O leaves.
function restoreFixture() {
    const source = readFileSync('src/ts/bgStreamPreserve.svelte.ts', 'utf8')
    const ast = ts.createSourceFile('draft.ts', source, ts.ScriptTarget.Latest, true)
    const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'restoreDraft')!
    const body = ts.transpileModule(declaration.getText(ast).replace('export async', 'async'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText
    const chat = { id: 'chat', message: [{ role: 'char', chatId: 'generation', data: 'already-completed' }] }
    const char = { chaId: 'char', chats: [chat] }
    const state = { db: { characters: [char] } }
    let pending = false, release!: () => void
    const hydrate = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const dismiss = vi.fn(), save = vi.fn(), abort = vi.fn()
    const restore = new Function('reconciliationReadiness', 'abortGen', 'findCharChat', 'DBState',
        'ensureChatHydrated', 'findGenIdx', 'dismissDraft', 'requestImmediateSave', 'selectedCharID',
        body + '\nreturn restoreDraft')(
        { pending: () => pending }, abort, () => ({ charIdx: 0, chatIdx: 0 }), state,
        hydrate, () => 0, dismiss, save, { set: vi.fn() },
    )
    const draft = { charId: 'char', chatId: 'chat', generationId: 'generation', data: 'saved-draft' }
    return { restore, draft, chat, state, dismiss, save, abort, release: () => release(), setPending: () => { pending = true } }
}

describe('actual lost-draft recovery ownership', () => {
    it('drains a readiness release received while another draft is hydrating', async () => {
        vi.useFakeTimers()
        try {
            const source = readFileSync('src/ts/bgStreamPreserve.svelte.ts', 'utf8')
            const ast = ts.createSourceFile('draft.ts', source, ts.ScriptTarget.Latest, true)
            const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'scanForLostDrafts')!
            const body = ts.transpileModule(declaration.getText(ast), {
                compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
            }).outputText
            const a = { charId: 'a', chatId: 'chat-a', final: true }
            const b = { charId: 'b', chatId: 'chat-b', final: false }
            let pending = true, release!: () => void, firstHydration = true
            const restore = vi.fn(async () => {})
            const scan = new Function('reconciliationReadiness', 'readLocalDrafts', 'readServerDrafts',
                'mergeDrafts', 'findCharChat', 'DBState', 'ensureChatHydrated', 'isLost', 'dismissDraft',
                'bgRecoveringMainGens', 'restoreDraft', 'reportBgPreserveSignal', 'bgRestoreState',
                'let scanning=false; let scanAgain=false;' + body + '\nreturn scanForLostDrafts')(
                { pending: (charId: string) => charId === 'a' && pending }, () => [], async () => [a, b],
                (_local, server) => server, draft => ({ charIdx: draft === a ? 0 : 1, chatIdx: 0 }),
                { db: { characters: [{ chaId: 'a', chats: [] }, { chaId: 'b', chats: [] }] } },
                async (_chats, _index, charId) => {
                    if (charId === 'b' && firstHydration) {
                        firstHydration = false
                        await new Promise<void>(resolve => { release = resolve })
                    }
                }, draft => draft === a, async () => {}, new Set(), restore, vi.fn(), { candidates: [] },
            )
            const running = scan()
            for (let i = 0; i < 8; i++) await Promise.resolve()
            expect(release).toBeTypeOf('function')
            pending = false
            await scan()
            release(); await running
            expect(restore).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1)
            expect(restore).toHaveBeenCalledExactlyOnceWith(a, { navigate: false })
            expect(vi.getTimerCount()).toBe(0)
        } finally { vi.useRealTimers() }
    })
    it.each(['pending', 'replacement'] as const)('preserves the draft when %s wins during hydration', async mode => {
        const f = restoreFixture()
        const before = structuredClone(f.chat)
        const restoring = f.restore(f.draft, { navigate: false })
        if (mode === 'pending') f.setPending()
        else f.state.db.characters[0] = { ...f.state.db.characters[0] }
        f.release(); await restoring
        expect(f.chat).toEqual(before)
        expect(f.dismiss).not.toHaveBeenCalled()
        expect(f.save).not.toHaveBeenCalled()
        expect(f.abort).toHaveBeenCalledExactlyOnceWith('generation')
    })
    it('still retires a completed duplicate draft after unchanged hydration', async () => {
        const f = restoreFixture()
        const restoring = f.restore(f.draft, { navigate: false })
        f.release(); await restoring
        expect(f.dismiss).toHaveBeenCalledExactlyOnceWith(f.draft)
        expect(f.save).not.toHaveBeenCalled()
    })
})
