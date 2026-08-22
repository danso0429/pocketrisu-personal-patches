import type { character } from '../storage/database.svelte'
import type { ImportJob } from '../characterImportState'
import type { RisuModule } from './modules'
import type { PreparedRisuModule } from './risumImport'

export type ModuleImportOrigin = 'picker' | 'drop' | 'share' | 'hash' | 'launch' | 'url'

export interface ModuleImportSource {
    name: string
    data: Uint8Array | File
    origin: ModuleImportOrigin
}

export type ModuleImportResult =
    | { status: 'imported'; module: RisuModule }
    | { status: 'cancelled' }
    | { status: 'failed'; error: unknown; committed: boolean }

export class ModuleImportError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'ModuleImportError'
    }
}

export interface ModuleImportDependencies {
    prepareRisu(data: Uint8Array): Promise<PreparedRisuModule>
    materializeRisu(
        prepared: PreparedRisuModule,
        onProgress: (completed: number, total: number) => void,
    ): Promise<RisuModule>
    importCharacter(
        source: ModuleImportSource,
        reporter: ImportJob,
    ): Promise<{ status: 'imported'; character: character } | { status: 'cancelled' }>
    convertCharacter(value: character): RisuModule
    convertLorebook(entries: unknown): unknown[]
    confirmLowLevel(): Promise<boolean>
    getModules(): RisuModule[]
    persistModule(moduleId: string): Promise<void>
    freshId(): string
    formatProgress(message: string, completed: number, total?: number): string
    successMessage: string
}

function exactExtension(name: string): string {
    const basename = name.trim().toLowerCase()
    const dot = basename.lastIndexOf('.')
    if (dot <= 0 || dot === basename.length - 1) return ''
    return basename.slice(dot + 1)
}

async function sourceBytes(source: ModuleImportSource): Promise<Uint8Array> {
    if (source.data instanceof Uint8Array) return source.data
    return new Uint8Array(await source.data.arrayBuffer())
}

function moduleFromJson(value: unknown, convertLorebook: (entries: unknown) => unknown[]): RisuModule {
    if (!value || typeof value !== 'object') throw new ModuleImportError('Module JSON must contain an object')
    const data = value as Record<string, any>
    if (data.type === 'risuModule') {
        return data as RisuModule
    }
    if (data.type === 'risu' && Array.isArray(data.data)) {
        return {
            name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Imported Lorebook',
            description: typeof data.description === 'string' ? data.description : 'Converted from risu lorebook',
            lorebook: data.data,
            id: '',
        }
    }
    if (data.entries && typeof data.entries === 'object') {
        return {
            name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Imported Lorebook',
            description: typeof data.description === 'string' ? data.description : 'Converted from external lorebook',
            lorebook: convertLorebook(data.entries) as any,
            id: '',
        }
    }
    if (data.type === 'regex' && Array.isArray(data.data)) {
        return {
            name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Imported Regex',
            description: typeof data.description === 'string' ? data.description : 'Converted from risu regex',
            regex: data.data,
            id: '',
        }
    }
    throw new ModuleImportError('Unsupported module JSON format')
}

function validateStagedModule(module: RisuModule): void {
    if (!module || typeof module !== 'object') throw new ModuleImportError('Module preparation returned no module')
    if (typeof module.name !== 'string' || module.name.trim().length === 0) {
        throw new ModuleImportError('Imported module has no display name')
    }
    if (module.description !== undefined && typeof module.description !== 'string') {
        throw new ModuleImportError('Imported module description is invalid')
    }
}

export function createModuleImportOrchestrator(deps: ModuleImportDependencies) {
    return async function importWithJob(
        source: ModuleImportSource,
        job: ImportJob,
    ): Promise<ModuleImportResult> {
        let committed = false
        try {
            const extension = exactExtension(source.name)
            if (!['json', 'lorebook', 'risum', 'charx'].includes(extension)) {
                throw new ModuleImportError('Unsupported module file type')
            }

            let module: RisuModule
            let lowLevelAlreadyConfirmed = false
            if (extension === 'risum') {
                job.update('Reading module archive...')
                const prepared = await deps.prepareRisu(await sourceBytes(source))
                if (prepared.module.lowLevelAccess) {
                    if (!await deps.confirmLowLevel()) {
                        job.dismiss()
                        return { status: 'cancelled' }
                    }
                    lowLevelAlreadyConfirmed = true
                }
                module = await deps.materializeRisu(prepared, (completed, total) => {
                    job.update(deps.formatProgress('Saving module assets...', completed, total))
                })
            } else if (extension === 'charx') {
                job.update('Reading character module archive...')
                const child = await deps.importCharacter(source, job)
                if (child.status === 'cancelled') {
                    job.dismiss()
                    return { status: 'cancelled' }
                }
                module = deps.convertCharacter(child.character)
                lowLevelAlreadyConfirmed = module.lowLevelAccess === true
            } else {
                job.update('Reading module data...')
                let parsed: unknown
                try {
                    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await sourceBytes(source)))
                } catch (error) {
                    throw new ModuleImportError('Module JSON could not be decoded', { cause: error })
                }
                module = moduleFromJson(parsed, deps.convertLorebook)
            }

            validateStagedModule(module)
            if (module.lowLevelAccess && !lowLevelAlreadyConfirmed) {
                if (!await deps.confirmLowLevel()) {
                    job.dismiss()
                    return { status: 'cancelled' }
                }
            }

            const imported: RisuModule = {
                ...module,
                description: module.description ?? '',
                id: deps.freshId(),
            }
            const modules = deps.getModules()
            if (!Array.isArray(modules)) throw new ModuleImportError('Current module database is unavailable')
            if (modules.some((candidate) => candidate?.id === imported.id)) {
                throw new ModuleImportError('Fresh module ID collides with an existing module')
            }
            modules.push(imported)
            committed = true

            job.update('Saving imported module...', 'Confirming the database update')
            await deps.persistModule(imported.id)
            job.succeed(deps.successMessage)
            return { status: 'imported', module: imported }
        } catch (error) {
            job.fail(error)
            return { status: 'failed', error, committed }
        }
    }
}

export function selectModuleImportFile(
    ownerDocument: Document = document,
): Promise<File | null> {
    return new Promise((resolve, reject) => {
        const input = ownerDocument.createElement('input')
        input.type = 'file'
        // Do not set accept: iOS Files maps proprietary extensions through
        // registered system types and disables .risum/.charx when none exists.
        // The central importer still validates the exact extension before read.
        let settled = false
        const finish = (value: File | null, error?: unknown) => {
            if (settled) return
            settled = true
            input.removeEventListener('change', onChange)
            input.removeEventListener('cancel', onCancel)
            input.remove()
            if (error) reject(error)
            else resolve(value)
        }
        const onChange = () => finish(input.files?.[0] ?? null)
        const onCancel = () => finish(null)
        input.addEventListener('change', onChange)
        input.addEventListener('cancel', onCancel)
        ownerDocument.body.appendChild(input)
        input.style.display = 'none'
        try {
            input.click()
        } catch (error) {
            finish(null, error)
        }
    })
}
