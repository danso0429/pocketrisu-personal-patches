import { expect, test, vi } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'
import { appearanceSaveFailure, type AppearanceWriter } from './appearancePersistence'

const source = ts.createSourceFile('globalApi.ts', fs.readFileSync('src/ts/globalApi.svelte.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const saveDb = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'saveDb') as ts.FunctionDeclaration
const registration = saveDb.body!.statements.find(n => ts.isExpressionStatement(n) && n.getText(source).startsWith('registerAppearanceWriter('))
if (!registration) throw new Error('Standalone/composed appearance writer is missing')
const js = ts.transpileModule(registration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness(options: { outcome?: 'saved' | 'noop' | 'retry'; reject?: Error; flushReject?: boolean; prior?: Promise<void> } = {}) {
    let writer!: AppearanceWriter
    const events: string[] = []
    const state = { value: 'before', unrelated: 'keep' }
    const context = {
        saveInFlight: options.prior ?? null, supportsPatchSync: true, safeStructuredClone: structuredClone,
        patcher: { lastSyncedDb: { original: true }, init: async () => { events.push('baseline-restored') } },
        registerAppearanceWriter: (fn: AppearanceWriter) => writer = fn,
        tick: async () => {}, changeTracker: { root: false }, takeTrackedChanges: () => ({ root: true }), saving: { state: false },
        persistTrackedChanges: async (_scope: unknown, strict: unknown) => {
            events.push('persist')
            expect(strict).toEqual({ personalStrict: true })
            if (options.reject) throw options.reject
            return options.outcome ?? 'saved'
        },
        forageStorage: { realStorage: { flushPersonalAppearance: async () => { events.push('flush'); if (options.flushReject) throw new Error('transport') } } },
        requeueTrackedChanges: () => events.push('requeue'), changed: false, appearanceSaveFailure,
    }
    new Function(...Object.keys(context), js)(...Object.values(context))
    return { state, events, save: () => writer(() => {
        events.push('mutate'); state.value = 'after'
        return () => { events.push('undo'); if (state.value === 'after') state.value = 'before' }
    }, () => { events.push('verify') }) }
}
test('standalone writer waits for the previous save, then mutates, persists, flushes and acknowledges', async () => {
    let resolve!: () => void
    const h = harness({ prior: new Promise<void>(r => resolve = r) })
    const save = h.save()
    expect(h.state.value).toBe('before')
    resolve(); await save
    expect(h.events).toEqual(['verify', 'mutate', 'persist', 'flush', 'verify'])
    expect(h.state).toEqual({ value: 'after', unrelated: 'keep' })
})
test('definite rejection invokes only the supplied target compare-and-swap undo', async () => {
    const h = harness({ reject: appearanceSaveFailure(false) })
    await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
    expect(h.state).toEqual({ value: 'before', unrelated: 'keep' })
    expect(h.events).not.toContain('flush')
})
test.each([{ reject: new Error('lost response') }, { flushReject: true }, { outcome: 'retry' as const }])('ambiguity never claims rollback or durable success: %j', async options => {
    const h = harness(options)
    await expect(h.save()).rejects.toMatchObject({ ambiguous: true })
    expect(h.state.value).toBe('after')
    expect(h.events).not.toContain('undo')
    expect(h.events).toContain('requeue')
})
test('a definite deferred/noop save does not flush or claim success', async () => {
    const h = harness({ outcome: 'noop' })
    await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
    expect(h.state.value).toBe('before')
    expect(h.events).not.toContain('flush')
})
test('strict composed persistence refuses patch fallback and rebase before running them', () => {
    const persist = saveDb.body!.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'persistTrackedChanges') as ts.FunctionDeclaration
    const body = persist.getText(source)
    const reject = body.indexOf('if ((options as any)?.personalStrict && (!patchResult.success')
    expect(reject).toBeGreaterThan(0)
    expect(reject).toBeLessThan(body.indexOf('saved = patchResult.success'))
    expect(body.indexOf('personalStrict && !saved && supportsPatchSync')).toBeLessThan(body.indexOf("await forageStorage.setItem('database/database.bin'"))
    const guard = body.slice(body.indexOf('if ((options as any)?.personalStrict && conflictErr'), body.indexOf('if ((options as any)?.personalStrict && conflictErr') + 180)
    expect(guard).toContain('throw appearanceSaveFailure(false)')
    expect(body).toContain('personalStrict && !currentEtag')
})
