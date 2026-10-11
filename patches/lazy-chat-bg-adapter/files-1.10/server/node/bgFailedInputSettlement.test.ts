import { describe, it, expect } from 'vitest'
import pkg from './bgFailedInputSettlement.cjs'
import store from './bgOrchestrationOperationStore.cjs'
const { failedInputSettlement, validFailedInputSettlement, invalidateFailedInputSettlement } = pkg as any
const { writeOperationState, readOperationState } = store as any
const operationId = 'operation-one', charId = 'char', chatId = 'chat'
const input = { operationId, inputState: 'failed', transformState: 'completed',
  admission: { operationId, charId, chatId, userMessageId: 'message-one' },
  executionBaseRevision: 'a'.repeat(64), inputReceipt: { receiptId: 'b'.repeat(64) } }
const result = { operationId, charId, chatId, resultId: 'result-one', kind: 'terminal-error', outcome: 'error',
  final: true, anchorResultVersion: 1, hasGeneratedAnswer: false }
describe('failed input exact result acknowledgement authority', () => {
  it('invalidates previous failure authority before a replacement publication and fails closed on storage failure', () => {
    const state={operationId,charId,chatId,state:'delivered',updatedAt:100,failedInputSettlement:failedInputSettlement(result,input)}
    let stored:any
    invalidateFailedInputSettlement((_key:string,value:string)=>{stored=JSON.parse(value)},'state',state)
    expect(stored).toEqual({operationId,charId,chatId,state:'delivered',updatedAt:100})
    expect(state.failedInputSettlement).not.toBeNull()
    expect(()=>invalidateFailedInputSettlement(()=>{throw Error('disk failure')},'state',state)).toThrow('disk failure')
  })
  it('binds the deleted payload and attached input without provider data', () => {
    const receipt = failedInputSettlement(result, input)
    expect(validFailedInputSettlement(receipt, operationId, charId, chatId)).toBe(true)
    expect(receipt.resultId).toBe(result.resultId)
    expect(receipt.userMessageId).toBe(input.admission.userMessageId)
    expect(Object.keys(receipt).sort()).toEqual(['attachedRevision','charId','chatId','contractVersion',
      'inputReceiptId','operationId','resultId','userMessageId'])
  })
  it.each([{ hasGeneratedAnswer: true }, { kind: 'terminal-partial' }, { final: false },
    { anchorResultVersion: 0 }, { serverChatCommit: { status: 'failed' } }, { chatId: 'other' }])(
    'refuses ambiguous/generated/conflicted results %j', change => {
      expect(failedInputSettlement({ ...result, ...change }, input)).toBeNull()
    })
  it.each(['queued','attached','completed','cancelled'])('refuses non-failed input %s', state => {
    expect(failedInputSettlement(result, { ...input, inputState: state })).toBeNull()
  })
  it('retains only a matching delivered receipt across fresh metadata rewrites', () => {
    const values = new Map<string,string>(), get = (k:string) => values.get(k) ?? null, set = (k:string,v:string) => values.set(k,v)
    const receipt = failedInputSettlement(result, input)
    expect(writeOperationState(set,operationId,{charId,chatId,failedInputSettlement:receipt},'delivered').written).toBe(true)
    writeOperationState(set,operationId,{charId,chatId},'delivered',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toEqual(receipt)
    const replacement = { ...receipt, resultId: 'result-two' }
    writeOperationState(set,operationId,{charId,chatId,failedInputSettlement:replacement},'delivered',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toEqual(replacement)
    writeOperationState(set,operationId,{charId,chatId,resultId:'different-revision'},'delivered',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toBeUndefined()
    writeOperationState(set,operationId,{charId,chatId,failedInputSettlement:null},'delivered',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toBeUndefined()
    writeOperationState(set,operationId,{charId,chatId,failedInputSettlement:receipt},'running',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toBeUndefined()
    writeOperationState(set,operationId,{charId:'other',chatId,failedInputSettlement:receipt},'delivered',get)
    expect(readOperationState(get,operationId).failedInputSettlement).toBeUndefined()
  })
})
