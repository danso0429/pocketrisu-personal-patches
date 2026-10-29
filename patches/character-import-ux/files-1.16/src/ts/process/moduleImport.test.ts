import { describe, expect, test, vi } from 'vitest'
import {
    createModuleImportOrchestrator,
    selectModuleImportFile,
    type ModuleImportDependencies,
    type ModuleImportSource,
} from './moduleImport'
import type { ImportJob } from '../characterImportState'
import type { RisuModule } from './modules'

function jobRecorder() {
    const events: string[] = []
    const job: ImportJob = {
        update(message) { events.push(`update:${message}`) },
        succeed(message) { events.push(`success:${message}`) },
        fail() { events.push('failed') },
        dismiss() { events.push('dismissed') },
    }
    return { job, events }
}

function dependencies(overrides: Partial<ModuleImportDependencies> = {}) {
    const modules: RisuModule[] = []
    const order: string[] = []
    const deps: ModuleImportDependencies = {
        async prepareRisu() {
            order.push('prepare')
            return { module: { name: 'RisuM', description: '', id: 'old' }, encodedAssets: [] }
        },
        async materializeRisu(prepared) {
            order.push('materialize')
            return prepared.module
        },
        async importCharacter() {
            order.push('character')
            return { status: 'imported', character: { name: 'CharX' } as any }
        },
        convertCharacter() {
            order.push('convert')
            return { name: 'CharX module', description: '', id: 'old' }
        },
        convertLorebook: () => [],
        async confirmLowLevel() {
            order.push('confirm')
            return true
        },
        getModules: () => modules,
        async persistModule(id) { order.push(`persist:${id}`) },
        freshId: () => 'fresh-id',
        formatProgress: (message, completed, total) => `${message} ${completed}/${total}`,
        successMessage: 'Imported module',
        ...overrides,
    }
    return { deps, modules, order }
}

function source(name: string, data = '{}'): ModuleImportSource {
    return { name, data: new TextEncoder().encode(data), origin: 'share' }
}

describe('central module import lifecycle', () => {
    test('RisuM authorizes before assets, commits once, persists, then succeeds', async () => {
        const setup = dependencies({
            async prepareRisu() {
                setup.order.push('prepare')
                return {
                    module: { name: 'Secure', description: '', id: 'old', lowLevelAccess: true },
                    encodedAssets: [],
                }
            },
        })
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)(source('secure.risum'), job)
        expect(result.status).toBe('imported')
        expect(setup.order).toEqual(['prepare', 'confirm', 'materialize', 'persist:fresh-id'])
        expect(setup.modules).toHaveLength(1)
        expect(setup.modules[0].id).toBe('fresh-id')
        expect(events.at(-1)).toBe('success:Imported module')
    })

    test('declined low-level access is silent cancellation before assets or commit', async () => {
        const materialize = vi.fn()
        const setup = dependencies({
            prepareRisu: async () => ({
                module: { name: 'Secure', description: '', id: 'old', lowLevelAccess: true },
                encodedAssets: [],
            }),
            confirmLowLevel: async () => false,
            materializeRisu: materialize,
        })
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)(source('secure.risum'), job)
        expect(result).toEqual({ status: 'cancelled' })
        expect(materialize).not.toHaveBeenCalled()
        expect(setup.modules).toHaveLength(0)
        expect(events).toContain('dismissed')
        expect(events.some(event => event.startsWith('success:'))).toBe(false)
    })

    test('post-commit persistence failure retains the module and never succeeds', async () => {
        const setup = dependencies({ persistModule: async () => { throw new Error('save not confirmed') } })
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)(
            source('module.json', JSON.stringify({ type: 'risuModule', name: 'JSON', description: '', id: 'old' })),
            job,
        )
        expect(result).toMatchObject({ status: 'failed', committed: true })
        expect(setup.modules).toHaveLength(1)
        expect(events).toContain('failed')
        expect(events.some(event => event.startsWith('success:'))).toBe(false)
    })

    test('CharX keeps the original File and child failure cannot become success', async () => {
        const file = new File(['archive'], 'module.charx')
        const seen: ModuleImportSource[] = []
        const setup = dependencies({
            async importCharacter(child) {
                seen.push(child)
                throw new Error('archive rejected')
            },
        })
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)({
            name: file.name,
            data: file,
            origin: 'drop',
        }, job)
        expect(seen[0].data).toBe(file)
        expect(result).toMatchObject({ status: 'failed', committed: false })
        expect(setup.modules).toHaveLength(0)
        expect(events.some(event => event.startsWith('success:'))).toBe(false)
    })

    test('compound .module.charx commits through character conversion', async () => {
        const file = new File(['archive'], 'example.module.charx')
        const setup = dependencies()
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)({
            name: file.name,
            data: file,
            origin: 'picker',
        }, job)
        expect(result.status).toBe('imported')
        expect(setup.order).toEqual(['character', 'convert', 'persist:fresh-id'])
        expect(setup.modules).toHaveLength(1)
        expect(events.filter(event => event.startsWith('success:'))).toHaveLength(1)
    })

    test.each([
        ['module JSON', 'module.json', { type: 'risuModule', name: 'Module', description: '', id: 'old' }],
        ['Risu lorebook', 'module.lorebook', { type: 'risu', name: 'Lore', data: [] }],
        ['external lorebook', 'module.json', { name: 'Lore', entries: {} }],
        ['regex', 'module.json', { type: 'regex', name: 'Regex', data: [] }],
    ])('%s commits exactly one fresh module', async (_label, name, value) => {
        const setup = dependencies()
        const { job, events } = jobRecorder()
        const result = await createModuleImportOrchestrator(setup.deps)(source(name, JSON.stringify(value)), job)
        expect(result.status).toBe('imported')
        expect(setup.modules).toHaveLength(1)
        expect(setup.modules[0].id).toBe('fresh-id')
        expect(events.filter(event => event.startsWith('success:'))).toHaveLength(1)
    })

    test('substring suffix and invalid JSON fail before commit or persistence', async () => {
        const persist = vi.fn()
        const setup = dependencies({ persistModule: persist })
        for (const invalid of [source('foo.notrisum'), source('broken.json', '{')]) {
            const { job, events } = jobRecorder()
            const result = await createModuleImportOrchestrator(setup.deps)(invalid, job)
            expect(result).toMatchObject({ status: 'failed', committed: false })
            expect(events.some(event => event.startsWith('success:'))).toBe(false)
        }
        expect(setup.modules).toHaveLength(0)
        expect(persist).not.toHaveBeenCalled()
    })

    test.each(['example.risum', 'example.module.charx'])(
        'native picker leaves proprietary %s selectable',
        async (name) => {
            const operation = selectModuleImportFile(document)
            const input = document.querySelector('input[type=file]')!
            const file = new File(['module'], name)
            expect(input).not.toBeNull()
            expect(input.hasAttribute('accept')).toBe(false)
            Object.defineProperty(input, 'files', { value: [file], configurable: true })
            input.dispatchEvent(new Event('change'))
            await expect(operation).resolves.toBe(file)
            expect(document.body.contains(input)).toBe(false)
        },
    )

    test('native picker cancel settles once and removes its temporary input', async () => {
        const operation = selectModuleImportFile(document)
        const input = document.querySelector('input[type=file]')!
        expect(input).not.toBeNull()
        input.dispatchEvent(new Event('cancel'))
        await expect(operation).resolves.toBeNull()
        expect(document.body.contains(input)).toBe(false)
    })
})
