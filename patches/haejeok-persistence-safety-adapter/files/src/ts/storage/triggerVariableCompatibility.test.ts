import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { get, writable } from 'svelte/store'
import { trackDerivedChat } from './chatSaveRebase'

const env = vi.hoisted(() => ({ DBState: { db: null as any }, selectedCharID: null as any, CurrentTriggerIdStore: null as any }))
vi.mock('../stores.svelte', () => env)
vi.mock('../util', () => ({ parseKeyValue: () => [] }))
env.selectedCharID = writable(0)
env.CurrentTriggerIdStore = writable(null)
const { getChatVar, setChatVar } = await import('../parser/chatVar.svelte')
const { registerCBS, defaultCBSRegisterArg } = await import('../cbs')

const source = readFileSync('src/ts/process/triggers.ts', 'utf8')
const entireFunction = source.slice(source.indexOf('export async function runTrigger(')).replace('export async function', 'async function')
const compiled = ts.transpileModule(entireFunction, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }, reportDiagnostics: true })
expect(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error)).toEqual([])

it.each(['effect', 'lua callback'])('preserves read-your-writes in the full trigger variable path: %s', async route => {
    const live = { id: 'chat', message: [{ chatId: 'q', role: 'user', data: 'question' }], scriptstate: { $counter: '0' } }
    const effect = route === 'effect'
        ? [{ type: 'setvar', var: 'counter', value: '1', operator: '+=' }, { type: 'setvar', var: 'observed', value: '{{getvar::counter}}', operator: '=' }]
        : [{ type: 'triggerlua', code: 'fixture callback' }]
    const char = { chaId: 'char', chatPage: 0, chats: [live], defaultVariables: '', triggerscript: [{ type: 'input', conditions: [], effect }] }
    env.DBState.db = { characters: [char], templateDefaultVariables: '' }
    let readCBS: any
    registerCBS({ ...defaultCBSRegisterArg, getDatabase: () => env.DBState.db, getChatVar, setChatVar,
        registerFunction: spec => { if (spec.name === 'getvar') readCBS = spec.callback } })
    const scope = {
        safeStructuredClone: structuredClone, getCurrentChat: () => live, getCurrentCharacter: () => char,
        getDatabase: () => env.DBState.db, getModuleTriggers: () => [], parseKeyValue: () => [],
        get, selectedCharID: env.selectedCharID, CurrentTriggerIdStore: env.CurrentTriggerIdStore,
        trackDerivedChat,
        ReloadGUIPointer: writable(0), tokenize: async () => 0, alertError: vi.fn(),
        risuChatParser: (text: string) => text.replace(/\{\{getvar::([^}]+)}}/g, (_all, key) => readCBS('', {}, [key], {})),
        runScripted: async (_code: string, options: any) => {
            options.setVar('counter', String(Number(options.getVar('counter')) + 1))
            options.setVar('observed', readCBS('', {}, ['counter'], {}))
            return { chat: options.chat, stopSending: false }
        },
    }
    const runTrigger = new Function(...Object.keys(scope), compiled.outputText + '\nreturn runTrigger')(...Object.values(scope))
    const result = await runTrigger(char, 'input', { chat: live })
    expect(result.chat.scriptstate.$observed).toBe('1')
    // Preserve the existing scripting contract; rollback of already-executed
    // trigger effects is not part of client message-save rebasing.
    expect(result.chat.scriptstate.$counter).toBe('1')
})
