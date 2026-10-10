'use strict'

const fs = require('node:fs')
const path = require('node:path')

module.exports = priorUnits => {
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const prefix = 'lazy-chat-bg-adapter:native-input'
    const units = []
    const add = (name, file, anchor, content, type = 'replace', where) => {
        units.push({ id: `${prefix}:${name}:1.10`, file, type, anchor, content,
            ...(where ? { where } : {}), targetVersions,
            after: [...priorUnits, ...units].filter(unit => unit.file === file).map(unit => unit.id) })
    }
    const helper = 'src/ts/bgServerInputExecution.ts'
    units.push({ id: `${prefix}:execution-helper:1.10`, file: helper, type: 'owned',
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', helper), 'utf8'), targetVersions })
    const credentials = 'src/ts/process/request/modelCredentialResolution.ts'
    units.push({ id: `${prefix}:credential-helper:1.10`, file: credentials, type: 'owned',
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', credentials), 'utf8'), targetVersions })
    add('endpoint-export', 'src/ts/preset/adapter/buildRequest.ts',
        'function resolveEndpointUrl(', 'export function resolveEndpointUrl(')
    add('credential-import', 'src/ts/process/request/modelPresetBinding.ts',
        'export function buildModelPresetCredential(',
        "import { resolveModelPresetCredential } from './modelCredentialResolution'\n\n", 'insert', 'before')
    add('credential-explicit-db', 'src/ts/process/request/modelPresetBinding.ts',
        `    const db = getDatabase()
    if (preset.apiKeyRef) {
        const entry = db.apiKeyPool?.[preset.apiKeyRef]
        if (entry?.key) return { apiKey: entry.key }
    }
    if (typeof preset.inlineCredential === 'string' && preset.inlineCredential.length > 0) {
        return { apiKey: preset.inlineCredential }
    }
    if (preset.inlineCredential && typeof preset.inlineCredential === 'object') {
        return preset.inlineCredential as AdapterCredential
    }
    for (const field of preset.profileSnapshot.schema) {
        if (field.mapsTo?.target !== 'auth') continue
        const value = preset.userValues?.[field.key]
        if (typeof value === 'string' && value.length > 0) {
            return { apiKey: value }
        }
    }
    return undefined`,
        '    return resolveModelPresetCredential(getDatabase(), preset)')
    add('alert-import', 'src/ts/alert.ts', 'export async function waitAlert(){',
        "import { rejectUnsupportedServerInput } from './bgServerInputExecution'\n\n", 'insert', 'before')
    add('interactive-alert', 'src/ts/alert.ts', 'export async function waitAlert(){',
        `export async function waitAlert(){
    try { rejectUnsupportedServerInput('interactive_ui') }
    catch (error) {
        // There is no browser answering this store while server input runs.
        // Do not leak the unanswerable prompt into the next serialized run.
        alertStoreImported.set({ type: 'none', msg: '' })
        throw error
    }`)
    add('input-notification-boundary', 'src/ts/alert.ts', 'export function alertNormal(msg:string){',
        "\n    rejectUnsupportedServerInput('notification_ui')\n", 'insert', 'after')
    add('request-import', 'src/ts/process/request/request.ts',
        "import { resolveModelRequestSelection } from './modelRequestSelection'",
        "import { resolveModelRequestSelection, modelRequestFallbacks, isModelRequestAttempt } from './modelRequestSelection'\nimport { assertServerInputCanContinue, rejectUnsupportedServerInput } from '../../bgServerInputExecution'\nimport { supportsNativeInputPresetAdapter } from '../../bgServerInputProviderPolicy'")
    add('fallback-list', 'src/ts/process/request/request.ts',
        '    const fallBackModels:string[] = safeStructuredClone(db?.fallbackModels?.[model] ?? [])',
        '    const fallBackModels = modelRequestFallbacks(db, model)')
    add('fallback-sentinel', 'src/ts/process/request/request.ts', "    fallBackModels.push('')\n", '')
    add('fallback-attempt', 'src/ts/process/request/request.ts',
        '        if(fallbackIndex !== 0 && !fallBackModels[fallbackIndex]){',
        '        if(!isModelRequestAttempt(fallbackIndex, fallBackModels[fallbackIndex])){')
    add('dynamic-provider', 'src/ts/process/request/request.ts',
        '    const selection = resolveModelRequestSelection(db, arg.staticModel ? undefined : getCurrentChat(), model, arg)',
        `
    assertServerInputCanContinue()
    if (selection.kind === 'modelPreset' && !supportsNativeInputPresetAdapter(selection.preset.profileSnapshot?.adapterKind)) {
        rejectUnsupportedServerInput('preset_adapter')
    }
    if (selection.kind === 'classic' && (selection.modelId === 'custom'
        || (selection.modelId?.startsWith('pluginmodel:::')
            && !pluginV2.providers.has(selection.modelId.slice('pluginmodel:::'.length)))
        || selection.modelId?.startsWith('hf:::'))) {
        rejectUnsupportedServerInput('browser_model_provider')
    }
`, 'insert', 'after')
    add('request-entry', 'src/ts/process/request/request.ts',
        'export async function requestChatData(arg:requestDataArgument, model:ModelModeExtended, abortSignal:AbortSignal=null):Promise<requestDataResponse> {',
        '\n    assertServerInputCanContinue()\n', 'insert', 'after')
    add('request-classic', 'src/ts/process/request/request.ts',
        '    const format = targ.modelInfo.format\n',
        `    const format = targ.modelInfo.format
    assertServerInputCanContinue()
    if (format === LLMFormat.WebLLM || (format === LLMFormat.Plugin
        && (!targ.aiModel?.startsWith('pluginmodel:::')
            || !pluginV2.providers.has(targ.aiModel.slice('pluginmodel:::'.length))))) {
        rejectUnsupportedServerInput('browser_model_provider')
    }
`)
    add('fetch-latch', 'server/node/bgOrchestrator.cjs',
        '  globalThis.fetch = function (u, ...a) {',
        '\n    const inputScope = globalThis.__bgGetServerInputExecution?.()\n    if (inputScope?.failure && inputScope.signal && orchestrationAbortContext.getSignal() === inputScope.signal) return Promise.reject(inputScope.failure)\n', 'insert', 'after')
    add('unsupported-terminal', 'server/node/bgOrchestrator.cjs',
        "              const assemblyConflict = e && e.code === 'BG_ASSEMBLY_CONFLICT'",
        `              const unsupportedInput = e && e.code === 'BG_INPUT_HOST_UNSUPPORTED'
              if (inputCommandVersion === 1 && unsupportedInput) {
                try {
                  if (!serverChatInputOwner.stopUnsupportedInputSynchronously(operationId, e.api)) {
                    throw new Error('unsupported input stop could not be recorded')
                  }
                } catch {
                  // Preserve the command as unknown if the durable stop failed.
                  // Retrying admission must not replay its running transform.
                  try { serverChatInputOwner.markRunFailureSynchronously(operationId, false) } catch {}
                  terminalState = 'retryable-no-provider'
                  return
                }
              }
              const assemblyConflict = e && e.code === 'BG_ASSEMBLY_CONFLICT'`)
    add('unsupported-no-replay', 'server/node/bgOrchestrator.cjs',
        '                if (!serverInputProviderStarted && !assemblyConflict) {',
        '                if (!serverInputProviderStarted && !assemblyConflict && !unsupportedInput) {')
    add('script-import', 'src/ts/process/scriptings.ts', "import { asBuffer } from 'src/ts/util';",
        "import { rejectUnsupportedServerInput } from '../bgServerInputExecution'\n", 'insert', 'before')
    add('script-image', 'src/ts/process/scriptings.ts',
        "                const gen = await generateAIImage(value, char as character, negValue, 'inlay')",
        "                rejectUnsupportedServerInput('image_generation')\n", 'insert', 'before')
    const imageDeclaration = 'export async function generateAIImage(genPrompt:string, currentChar:character, neg:string, returnSdData:string):Promise<string|false>{'
    add('image-import', 'src/ts/process/stableDiff.ts', imageDeclaration,
        "import { rejectUnsupportedServerInput } from '../bgServerInputExecution'\n\n", 'insert', 'before')
    add('image-input-boundary', 'src/ts/process/stableDiff.ts', imageDeclaration,
        "\n    rejectUnsupportedServerInput('image_generation')\n", 'insert', 'after')
    for (const [name, argument] of [['character', 'character.image'], ['persona', 'icon']]) {
        add(`${name}-image-boundary`, 'src/ts/process/scriptings.ts',
            `                    const img = await readImage(${argument})`,
            "                    rejectUnsupportedServerInput('image_access')\n", 'insert', 'before')
    }
    return units
}
