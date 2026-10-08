import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Execute the generated native save control flow, not a rewritten approximation.
// Persistence is the fault-injected leaf; baseline/dirty and strict-error routing
// remain the actual triggerSave implementation.
function nativeSave() {
    const source = ts.createSourceFile('globalApi.svelte.ts', readFileSync('src/ts/globalApi.svelte.ts', 'utf8'), ts.ScriptTarget.ES2022, true)
    const pieces: string[] = []
    const visit = (node: ts.Node) => {
        if ((ts.isClassDeclaration(node) && node.name?.text === 'ManualSaveConflictError')
            || (ts.isFunctionDeclaration(node) && node.name?.text === 'triggerSave')) pieces.push(node.getText(source))
        else ts.forEachChild(node, visit)
    }
    visit(source)
    if (pieces.length !== 2) throw new Error('Native save boundaries changed')
    const emitted = ts.transpileModule(pieces.join('\n'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText
    return new Function(`
        let saveInFlight = null, changed = false, savetrys = 0, deferredFailureRetries = 0, deferredRecoveryTimer = null;
        let requeued = 0, alerts = 0;
        const saving = { state: false }, changeTracker = { root: true };
        const takeTrackedChanges = () => ({ root: true });
        const hasTrackedChanges = value => value.root === true;
        const requeueTrackedChanges = () => { requeued++; changeTracker.root = true; };
        const alertError = () => { alerts++; };
        const scheduleDeferredRecovery = () => {};
        const sleep = () => Promise.resolve();
        ${emitted}
        const error = new ManualSaveConflictError('synthetic manual conflict');
        const persistTrackedChanges = async () => { throw error; };
        return { triggerSave, error, saving, facts: () => ({ requeued, alerts }) };
    `)() as {
        triggerSave: (options: { rejectOnError: boolean }) => Promise<void>
        error: Error
        saving: { state: boolean }
        facts: () => { requeued: number, alerts: number }
    }
}

describe('native manual conflict in legacy durable save', () => {
    it('rejects the strict save instead of falsely allowing a result ACK', async () => {
        const native = nativeSave()
        await expect(native.triggerSave({ rejectOnError: true })).rejects.toBe(native.error)
        expect(native.facts()).toEqual({ requeued: 1, alerts: 1 })
        expect(native.saving.state).toBe(false)
    })

    it('preserves ordinary autosave notification and retained dirty work', async () => {
        const native = nativeSave()
        await expect(native.triggerSave({ rejectOnError: false })).resolves.toBeUndefined()
        expect(native.facts()).toEqual({ requeued: 1, alerts: 1 })
        expect(native.saving.state).toBe(false)
    })
})
