import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';

const [targetArgument,originalArgument,fixtureArgument,outputArgument,scenario,route='raw']=process.argv.slice(2);
const [target,original,fixturePath,output]=[targetArgument,originalArgument,fixtureArgument,outputArgument].map(p=>path.resolve(p));
assert.ok(['script','insert','value-copy','cache-evict','root-failure','constructor-failure','duplicate-start','selected-provider','duplicate-provider','nonselected-provider'].includes(scenario));
assert.ok(['raw','prepared'].includes(route));
const require=createRequire(path.join(target,'package.json')),Database=require('better-sqlite3');
const runtime=fs.mkdtempSync('/tmp/marp-settings-context-');process.chdir(runtime);
const {decodeRisuSave,calculateHash}=require('./server/node/utils.cjs');
const data=JSON.parse(fs.readFileSync(fixturePath)),script=fs.readFileSync(original,'utf8');
assert.equal(createHash('sha256').update(script).digest('hex'),'b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132');
assert.equal(data.characters.length,1);assert.equal(data.characters[0].chaId,'synthetic-character');
assert.equal(data.characters[0].chats[0].id,'synthetic-chat');assert.equal(data.characters[0].chats[0].message.length,0);
// The shared seed includes an interactive-input recovery fixture. This probe
// selects ordinary input; interactive recovery remains a separate caller gate.
data.characters[0].triggerscript=[];
data.statics={...(data.statics??{}),messages:Number.isSafeInteger(data.statics?.messages)?data.statics.messages:0};
data.plugins=[{name:'risu_multiagent',version:'3.0',enabled:true,script,realArg:{}}];
data.pluginCustomStorage={risu_multiagent_lite_config_vault_v1:{config:{provider:'openai',baseUrl:'https://analysis.example.test/v1',apiKey:'synthetic-only',model:'fixture-A',
    agents:Object.fromEntries(['worldbuilding','plot','character'].map(name=>[name,{enabled:true,model:'fixture-'+name}]))}}};
const provider=scenario.endsWith('provider'),selected=['selected-provider','duplicate-provider'].includes(scenario);
if(provider){
    data.plugins.push({name:'synthetic-provider',version:'3.0',enabled:true,realArg:{},script:`await Risuai.addProvider('synthetic-provider',async()=>{
        await Risuai.nativeFetch('https://analysis.example.test/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-only'},
            body:JSON.stringify({model:'fixture-provider',messages:[{role:'user',content:'Synthetic provider'}]})});
        await Risuai.nativeFetch('https://analysis.example.test/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-only'},
            body:JSON.stringify({model:'fixture-provider',messages:[{role:'user',content:'Must be refused'}]})});
        return {success:true,content:'Unexpected provider success'};
    });`});
}
if(selected){data.aiModel=data.subModel='pluginmodel:::synthetic-provider';data.nodeOnlyModelModeLock='legacy';data.characters[0].chats[0].useModelPreset=false;
    data.plugins[0].realArg=Object.fromEntries(['worldbuilding','plot','character'].map(name=>[name+'_enabled','0']));
    for(const value of Object.values(data.pluginCustomStorage.risu_multiagent_lite_config_vault_v1.config.agents))value.enabled=false;}
if(scenario==='duplicate-start')data.plugins.push({...data.plugins[0],realArg:{}});
if(scenario==='duplicate-provider')data.plugins.push({...data.plugins[1],realArg:{}});
if(route==='prepared')data.characters[0].chats[0].message.push({role:'user',data:'Synthetic prepared input',chatId:'synthetic-prepared-user'});
fs.symlinkSync(path.join(target,'dist'),path.join(runtime,'dist'));
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'pocketrisu',version:'1.10.0'}));
const password=createHash('sha256').update('synthetic-context-password').digest('hex');
const seed=fork(path.join(target,'server/node/bgServerChatProcessClient.cjs'),[],{cwd:runtime,stdio:['ignore','ignore','pipe','ipc']});
seed.send({scope:'pocketrisu-h1-client',command:'seed',runtimeRoot:runtime,targetRoot:target,password,databaseBase64:Buffer.from(JSON.stringify(data)).toString('base64')});
assert.equal((await once(seed,'exit'))[0],0);
const disk=new Database(path.join(runtime,'save/risuai.db'));
const grants=[...new Set(data.plugins.flatMap(p=>['replacer','provider','db','mainDom'].map(name=>JSON.stringify([p.name,name]))))];
disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('cache/plugin-permissions/state.json',JSON.stringify({given:grants,denied:[],cache:grants.map(k=>[k+'_lastGrantTime',Date.now()])}));disk.close();
const events=[],server=fork(path.join(target,'server/node/server.cjs'),[],{cwd:runtime,
    execArgv:['--require',new URL('./probes/bg-marp-settings-preload.cjs',import.meta.url).pathname],
    env:{...process.env,PORT:'0',TUNNEL_DISABLED:'1',UPDATE_CHECK_DISABLED:'1',POCKETRISU_BG_PLUGIN_HOST_CANDIDATE:'1',MARP_SETTINGS_PROBE:'1',
        MARP_SETTINGS_GATE:['duplicate-start','duplicate-provider','constructor-failure'].includes(scenario)?'':'analysis',MARP_CONTEXT_SCENARIO:scenario},stdio:['ignore','pipe','pipe','ipc']});
server.on('message',row=>events.push(row));const log=fs.createWriteStream(path.join(runtime,'server.log'));server.stdout.pipe(log);server.stderr.pipe(log);
const wait=async task=>{const end=Date.now()+60000;while(Date.now()<end){const value=await task();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('context probe deadline');};
const operationId=randomUUID();
try{
    const origin='http://127.0.0.1:'+await wait(()=>events.find(e=>e.event==='ready')?.port);
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);
    const token=(await login.json()).token;
    const session=await fetch(origin+'/api/session',{method:'POST',headers:{'risu-auth':token,'x-session-id':'synthetic-context-session'}});assert.equal(session.status,200);
    const headers={'risu-auth':token,'x-client-build':JSON.parse(fs.readFileSync(path.join(target,'dist/build-stamp.json'))).stamp,
        'content-type':'application/json',cookie:session.headers.get('set-cookie').split(';')[0],'x-chat-id':'synthetic-chat'};
    const read=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers});assert.equal(read.status,200);
    const currentChat=await decodeRisuSave(new Uint8Array(await read.arrayBuffer())),baseChatRevision=read.headers.get('x-chat-revision');assert.match(baseChatRevision,/^[a-f0-9]{64}$/);
    const body={detached:true,selectedCharId:'synthetic-character',selectedChatId:'synthetic-chat',operationId,currentChat,baseChatRevision,
        resultKeyVersion:1,resultOrderVersion:1,startAckVersion:1,serverChatCommitVersion:1,
        ...(route==='raw'?{inputCommandVersion:1,inputCommand:{inputCommandId:'input-'+operationId,userMessageId:'user-'+operationId,
            rawText:'Synthetic raw input',settingsSnapshotRef:'synthetic-client-hint',submittedAt:Date.now()}}:{})};
    const start=await fetch(origin+'/api/bg-orchestrate',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(start.status,200);
    const ack=await start.json();assert.equal(ack.started,true);assert.equal(ack.operationId,operationId);
    if(!['duplicate-start','duplicate-provider','constructor-failure'].includes(scenario)){
        await wait(()=>events.some(e=>e.event==='analysis'));
        if(scenario==='cache-evict'){
            const key=Buffer.from('database/database.bin').toString('hex');
            const source=await fetch(origin+'/api/read',{headers:{...headers,'file-path':key}});assert.equal(source.status,200);
            const snapshot=await decodeRisuSave(new Uint8Array(await source.arrayBuffer()));
            assert.equal(Object.hasOwn(snapshot,'synthetic_missing_identity_probe'),false);
            // A valid-revision but invalid JSON patch enters the actual apply
            // failure branch, which evicts the stripped cache without a write.
            const write=await fetch(origin+'/api/patch',{method:'POST',headers:{...headers,'file-path':key},
                body:JSON.stringify({expectedHash:calculateHash(snapshot).toString(16),
                    patch:[{op:'replace',path:'/synthetic_missing_identity_probe',value:1}]})});
            assert.equal(write.status,500,await write.text());
        }else{server.send({event:'context-mutate',kind:scenario});await wait(()=>events.some(e=>e.event==='context-mutated'&&e.kind===scenario));}
        server.send({event:'release'});
    }
    const terminal=await wait(()=>{const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});try{
        const raw=db.prepare('SELECT value FROM kv WHERE key=?').get('bg-orch-state-op:'+operationId)?.value;
        if(!raw)return null;const row=JSON.parse(String(raw));
        if(scenario==='constructor-failure'&&route==='raw'){
            const input=db.prepare('SELECT value FROM kv WHERE key=?').get('internal/server-chat-input/v1/'+Buffer.from(operationId).toString('base64url'))?.value;
            if(input&&JSON.parse(String(input)).transformState==='unknown')return {...row,inputTransformState:'unknown'};
        }
        return ['failed','delivery-failed','chat-committed','result-ready','delivered','cancelled'].includes(row.state)?row:null;
    }finally{db.close();}});
    assert.notEqual(terminal.state,'cancelled');
    const response=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers});assert.equal(response.status,200);
    const chat=await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
    const failure=selected||scenario==='root-failure'||scenario==='constructor-failure';assert.equal(chat.message.filter(m=>m.role==='char').length,failure?0:1);
    const expectedUsers=scenario==='constructor-failure'&&route==='raw'?0:1;
    assert.equal(chat.message.filter(m=>m.role==='user').length,expectedUsers);
    const analyses=events.filter(e=>e.event==='analysis'),mains=events.filter(e=>e.event==='main');
    const expectedAnalysis=['duplicate-start','duplicate-provider','constructor-failure'].includes(scenario)?0:['script','root-failure','selected-provider'].includes(scenario)?1:3;
    assert.equal(analyses.length,expectedAnalysis);assert.equal(mains.length,failure?0:1);
    if(scenario==='selected-provider')assert.equal(analyses[0].body.model,'fixture-provider','the held call must belong to the selected provider');
    if(scenario==='duplicate-start')assert.equal(events.filter(e=>e.event==='session-create').length,0);
    if(scenario==='duplicate-provider')assert.deepEqual(events.filter(e=>e.event==='session-create').map(e=>e.sourceHash),
        [createHash('sha256').update(script).digest('hex')]);
    assert.equal(events.filter(e=>e.event==='identity-refresh-end').length,route==='raw'&&scenario!=='constructor-failure'?1:0);
    assert.equal(events.filter(e=>e.event==='observation-error'||e.event==='validation-error').length,0);
    const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let notices,journal,durableResult;
    try{notices=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(r=>JSON.parse(String(r.value)).event);
        journal=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-commit/v1/%').map(r=>JSON.parse(String(r.value)));
        const result=db.prepare('SELECT value FROM kv WHERE key=?').get('bg-orch-result-op:'+operationId)?.value;
        durableResult=result?JSON.parse(String(result)):null;
    }finally{db.close();}
    if(scenario==='value-copy'||scenario==='cache-evict')assert.deepEqual(notices,[]);
    else if(!['root-failure','constructor-failure'].includes(scenario))assert.equal(notices.length,1);
    if(scenario==='root-failure'||(scenario==='constructor-failure'&&route==='prepared')){
        assert.equal(durableResult?.error,'plugin_identity_unavailable');assert.equal(durableResult?.final,true);
        assert.equal(durableResult?.outcome,'error');assert.equal(terminal.state,'result-ready');
    }
    if(scenario==='constructor-failure'){
        assert.equal(events.filter(e=>e.event==='session-create').length,0);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});
        try{if(route==='raw'){const rows=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-input/v1/%').map(r=>JSON.parse(String(r.value)));
            assert.ok(rows.some(row=>row.operationId===operationId&&row.transformState==='unknown'&&row.admission?.rawText==='Synthetic raw input'));
            assert.equal(durableResult,null);assert.equal(terminal.inputTransformState,'unknown');}}finally{db.close();}
    }
    if(!failure){assert.ok(journal.some(row=>row.operationId===operationId));
        const injected=JSON.stringify(mains[0].body).includes('<!--MARP:v1:begin-->');assert.equal(injected,['insert','value-copy','cache-evict','nonselected-provider'].includes(scenario));
        const stored=events.find(e=>e.event==='notices-before-main');assert.ok(stored);assert.deepEqual(stored.events.map(e=>e.code),notices.map(e=>e.code));
    }
    if(scenario==='cache-evict')assert.ok(events.some(e=>e.event==='identity-peek-miss'),'actual patch failure must invalidate the cache');
    fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,operationId,terminal,durableResult,events,notices,
        analysis:analyses.length,main:mains.length,answers:failure?0:1,userMessages:expectedUsers,
        scope:'actual generated server/HTTP/canonical root writer/SQLite normal-chat and journal; synthetic providers; prepared route seeds processed input and omits raw input command, not interactive browser recovery'},null,2));
    console.log(JSON.stringify({scenario,route,analysis:analyses.length,main:mains.length,answers:failure?0:1,state:terminal.state,notices:notices.length}));
}catch(error){fs.writeFileSync(path.join(runtime,'failure.json'),JSON.stringify({events,operationId},null,2));console.error(runtime,error);process.exitCode=1;}
finally{if(server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}}
