import { describe, it, expect, vi } from 'vitest'
import { settleFailedInput } from './bgFailedInputSettlement'
import { orchestrationChatRevision } from './bgOrchestrationMerge'
function harness() {
  const chat = { id:'chat',message:[{chatId:'message-one',role:'user',data:'raw'}] }
  const base = { id:'chat',message:[] }
  const marker = {operationId:'operation-one',charId:'char',chatId:'chat',state:'accepted' as const,
    localRevision:orchestrationChatRevision(base),baseRevision:'a'.repeat(64),createdAt:Date.now()}
  const proof = {contractVersion:'bg_failed_input_proof.v1',operationId:marker.operationId,charId:'char',chatId:'chat',
    inputReceiptId:'b'.repeat(64),userMessageId:'message-one',attachedRevision:'c'.repeat(64),currentRevision:'d'.repeat(64),allowEditedInput:true}
  const receipt = {...proof,contractVersion:'bg_failed_input_ack.v1',resultId:'result-one'}
  let local:any=structuredClone(chat), acknowledgement:any=null
  const data:any={operationId:marker.operationId,found:true,final:true,kind:'terminal-error',outcome:'error',
    anchorResultVersion:1,hasGeneratedAnswer:false,resultId:'result-one',operationState:'result-ready'}
  const options = {marker,data,readProof:vi.fn(async()=>({proof,acknowledgement})),
    readCanonical:vi.fn(async()=>({chat,revision:proof.currentRevision})),readLocal:()=>local,
    savedBaseView:():string|null=>marker.localRevision,isCurrent:()=>true,
    adopt:vi.fn(async()=>{local=structuredClone(chat);return true}),
    acknowledge:vi.fn(async()=> 'acked' as 'acked'|'unconfirmed'|'superseded'),clear:vi.fn()}
  return {options,proof,receipt,data,chat,base,setLocal:(v:any)=>{local=v},ack:(v:any)=>{acknowledgement=v}}
}
describe('failed raw input settlement and next-send fence',()=>{
  it('releases only after exact acknowledgement, preserving local latest edits',async()=>{
    const h=harness();h.setLocal({...h.chat,message:[{...h.chat.message[0],data:'user edit'}]})
    expect(await settleFailedInput(h.options)).toBe('acked');expect(h.options.clear).toHaveBeenCalledOnce()
    expect(h.options.adopt).not.toHaveBeenCalled();expect(h.options.acknowledge).toHaveBeenCalledWith('result-one')
  })
  it('adopts only an untouched, remembered admission base before a fast failure',async()=>{
    const h=harness();h.setLocal(h.base)
    expect(await settleFailedInput(h.options)).toBe('acked');expect(h.options.adopt).toHaveBeenCalledOnce()
    const unsafe=harness();unsafe.setLocal(unsafe.base);unsafe.options.savedBaseView=()=>null
    expect(await settleFailedInput(unsafe.options)).toBe('unconfirmed');expect(unsafe.options.adopt).not.toHaveBeenCalled()
    expect(unsafe.options.acknowledge).not.toHaveBeenCalled();expect(unsafe.options.clear).not.toHaveBeenCalled()
  })
  it.each([{hasGeneratedAnswer:true},{kind:'terminal-partial'},{final:false},{operationState:'interrupted-after-main'},
    {serverChatCommit:{status:'failed'}},{operationId:'other-operation'}])('retains unsafe outcomes %j',async change=>{
      const h=harness();Object.assign(h.data,change);h.ack(h.receipt)
      expect(await settleFailedInput(h.options)).toBe('unconfirmed');expect(h.options.clear).not.toHaveBeenCalled()
  })
  it('retains superseded/claimed/unconfirmed ACK and exact receipt mismatch',async()=>{
    for (const result of ['superseded','unconfirmed'] as const) {
      const h=harness();h.options.acknowledge.mockResolvedValue(result);h.ack({...h.receipt,resultId:'result-other'})
      expect(await settleFailedInput(h.options)).toBe(result);expect(h.options.clear).not.toHaveBeenCalled()
    }
  })
  it('recovers a lost ACK only from matching durable authority',async()=>{
    const h=harness();h.options.acknowledge.mockImplementation(async()=>{h.ack(h.receipt);return 'unconfirmed'})
    expect(await settleFailedInput(h.options)).toBe('acked');expect(h.options.clear).toHaveBeenCalledOnce()
    const fresh=harness();fresh.data.found=false;fresh.data.operationState='delivered';delete fresh.data.resultId;fresh.data.final=false
    expect(await settleFailedInput(fresh.options)).toBe('unconfirmed');expect(fresh.options.clear).not.toHaveBeenCalled()
    fresh.ack(fresh.receipt);expect(await settleFailedInput(fresh.options)).toBe('acked')
    expect(fresh.options.acknowledge).not.toHaveBeenCalled()
    const wrong=harness();wrong.data.found=false;wrong.data.operationState='delivered';wrong.data.final=false
    wrong.ack({...wrong.receipt,resultId:'result-other'})
    expect(await settleFailedInput(wrong.options)).toBe('unconfirmed');expect(wrong.options.clear).not.toHaveBeenCalled()
  })
  it('keeps strict-message changes and missing canonical input unacknowledged',async()=>{
    const h=harness();h.proof.allowEditedInput=false;h.setLocal({...h.chat,message:[{...h.chat.message[0],data:'edited'}]})
    expect(await settleFailedInput(h.options)).toBe('unconfirmed');expect(h.options.clear).not.toHaveBeenCalled()
    const absent=harness();absent.chat.message=[]
    expect(await settleFailedInput(absent.options)).toBe('unconfirmed');expect(absent.options.acknowledge).not.toHaveBeenCalled()
  })
  it('clears an already acknowledged deleted input without adoption or repeated ACK',async()=>{
    const h=harness();Object.assign(h.proof,{inputPresent:false});h.chat.message=[];h.setLocal(h.base);h.ack(h.receipt)
    const options={...h.options,hasUnconfirmedWrite:()=>false}
    expect(await settleFailedInput(options)).toBe('acked')
    expect(options.adopt).not.toHaveBeenCalled();expect(options.acknowledge).not.toHaveBeenCalled()
    expect(options.clear).toHaveBeenCalledOnce();expect(options.readProof).toHaveBeenCalledTimes(2)
  })
  it.each(['no-ack','unconfirmed-write','unknown-write','wrong-role-id','superseded-proof','stale-view'])
    ('keeps deleted-input metadata for unsafe %s',async condition=>{
      const h=harness();Object.assign(h.proof,{inputPresent:false});h.chat.message=[];h.setLocal(h.base);h.ack(h.receipt)
      const options={...h.options,hasUnconfirmedWrite:()=>false}
      if(condition==='no-ack')h.ack(null)
      if(condition==='unconfirmed-write')options.hasUnconfirmedWrite=()=>true
      if(condition==='unknown-write')delete (options as any).hasUnconfirmedWrite
      if(condition==='wrong-role-id')h.setLocal({id:'chat',message:[{chatId:'message-one',role:'char',data:'different'}]})
      if(condition==='superseded-proof')options.readProof.mockImplementationOnce(async()=>({proof:h.proof,acknowledgement:h.receipt}))
        .mockImplementationOnce(async()=>({proof:h.proof,acknowledgement:{...h.receipt,resultId:'result-newer'}}))
      if(condition==='stale-view')options.isCurrent=()=>false
      expect(await settleFailedInput(options)).toBe('unconfirmed')
      expect(options.clear).not.toHaveBeenCalled();expect(options.adopt).not.toHaveBeenCalled();expect(options.acknowledge).not.toHaveBeenCalled()
    })
  it('recovers a marker-removal storage failure from durable ACK without repeating ACK',async()=>{
    const h=harness();h.options.acknowledge.mockImplementation(async()=>{h.ack(h.receipt);return 'acked'})
    h.options.clear.mockImplementationOnce(()=>{throw Error('storage unavailable')})
    await expect(settleFailedInput(h.options)).rejects.toThrow('storage unavailable')
    h.data.found=false;h.data.operationState='delivered';h.data.final=false
    expect(await settleFailedInput(h.options)).toBe('acked')
    expect(h.options.acknowledge).toHaveBeenCalledOnce();expect(h.options.clear).toHaveBeenCalledTimes(2)
  })
})
