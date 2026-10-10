import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';

const [targetArgument,originalArgument,fixtureArgument,outputArgument,scenario,route='raw']=process.argv.slice(2);
const [target,original,fixturePath,output]=[targetArgument,originalArgument,fixtureArgument,outputArgument].map(p=>path.resolve(p));
const installedDirectory=process.argv[8]?path.resolve(process.argv[8]):null;
const installedExpectations=process.argv[9]?path.resolve(process.argv[9]):null;
const rawProviderCases=['happy-provider','input-provider','input-blocked-provider','missing-provider','off-provider','conflict-provider','failed-registration-provider','fallback-provider','missing-fallback-provider','retry-provider'];
const auxiliaryCases=['aux-default','aux-expanded','aux-lua-default','aux-lua-expanded'];
const installedCases=['installed-on','installed-off','installed-expired','installed-provider','installed-pagefold','installed-pagefold-cache','installed-pagefold-stat-conflict'];
const pagefoldCase=scenario.startsWith('installed-pagefold');
const pagefoldFont=pagefoldCase?path.resolve(process.argv[10]):null;
assert.ok(['script','insert','value-copy','cache-evict','root-failure','constructor-failure','duplicate-start','selected-provider','duplicate-provider','nonselected-provider',...rawProviderCases,...auxiliaryCases,...installedCases].includes(scenario));
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
const provider=scenario.endsWith('provider'),selected=['selected-provider','duplicate-provider',...rawProviderCases].includes(scenario);
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
if(rawProviderCases.includes(scenario))data.plugins[1].script=['missing-provider','missing-fallback-provider'].includes(scenario)?'':`
    let calls=0;
    await Risuai.addProvider('synthetic-provider',async arg=>{
        calls++;
        ${scenario==='input-blocked-provider'?`
        try { await Risuai.runLLMModel({messages:[{role:'user',content:'Blocked nested input'}],mode:'model',staticModel:'custom',allowPlugins:true}); } catch {}
        try { await Risuai.nativeFetch('https://analysis.example.test/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-only'},body:JSON.stringify({model:'must-not-dispatch',messages:arg.prompt_chat})}); } catch {}
        return {success:true,content:'Caught error cannot authorize partial input'};`:`
        const response=await Risuai.nativeFetch('https://analysis.example.test/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-only'},
            body:JSON.stringify({model:'fixture-provider',messages:arg.prompt_chat})});
        if(!response.ok)throw Error('synthetic transport failed');
        return {success:${scenario==='retry-provider'?'calls>1':'true'},content:'Synthetic provider answer'};`}
    });`;
if(['input-provider','input-blocked-provider'].includes(scenario))data.characters[0].triggerscript=[{
    comment:'Synthetic provider input caller',type:'input',conditions:[],lowLevelAccess:true,
    effect:[{type:'runLLM',value:'Synthetic input provider question',inputVar:'providerInput'}],
}];
if(scenario==='conflict-provider')data.plugins.push({...data.plugins[1],name:'synthetic-conflicting-plugin',
    script:data.plugins[1].script.replace('Synthetic provider answer','Synthetic conflicting provider answer')});
if(scenario==='failed-registration-provider')data.plugins.push({...data.plugins[1],name:'synthetic-failed-registration',
    script:data.plugins[1].script+'\nthrow Error("Synthetic load failure after registration");'});
if(scenario.endsWith('fallback-provider')){data.aiModel=data.subModel='gpt-4o';data.fallbackModels={...data.fallbackModels,model:['pluginmodel:::synthetic-provider']};}
if(scenario==='retry-provider')data.requestRetrys=1;
if(auxiliaryCases.includes(scenario)){
    data.plugins[0].realArg.main_model_only=scenario.endsWith('expanded')?'0':'1';
    data.characters[0].triggerscript=[{comment:'Synthetic actual auxiliary caller',type:'input',conditions:[],lowLevelAccess:true,
        effect:scenario.includes('lua')?[{type:'triggerlua',code:`onInput=async(function(id) local result=axLLM(id,{{role='user',content='Synthetic Lua auxiliary question'}},false,{streaming=false}); setChatVar(id,'aux_lua',result.result) end)`}]
            :['model','submodel'].map(model=>({type:'v2RunLLM',value:'Synthetic actual '+model+' question',valueType:'value',model,streaming:false,outputVar:'aux_'+model,indent:0})),
    }];
}
if(scenario==='duplicate-start')data.plugins.push({...data.plugins[0],realArg:{}});
if(scenario==='duplicate-provider')data.plugins.push({...data.plugins[1],realArg:{}});
let installedInventory,installedExpected;
if(installedCases.includes(scenario)){
    const directory=installedDirectory;
    installedExpected=JSON.parse(fs.readFileSync(installedExpectations));
    installedInventory=JSON.parse(fs.readFileSync(path.join(directory,'inventory.json')));
    assert.equal(installedInventory.length,6);
    assert.equal(installedExpected.sources.length,installedInventory.length);
    data.plugins=installedInventory.map((row,index)=>{
        assert.equal(row.index,index);assert.equal(path.basename(row.file),row.file);
        const bytes=fs.readFileSync(path.join(directory,row.file));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        assert.equal(row.sha256,installedExpected.sources[index]);
        const source=bytes.toString('utf8');assert.ok(Buffer.from(source,'utf8').equals(bytes));
        return {name:row.name,version:row.apiVersion,enabled:true,script:source,realArg:{}};
    });
    const installedOriginal=data.plugins.find(plugin=>plugin.name==='risu_multiagent');
    assert.ok(installedOriginal);assert.equal(installedOriginal.script,script);
    if(pagefoldCase){
        data.aiModel=data.subModel='pluginmodel:::PageFold';data.nodeOnlyModelModeLock='legacy';data.characters[0].chats[0].useModelPreset=false;
    }
    if(scenario==='installed-provider'){
        data.aiModel=data.subModel='pluginmodel:::synthetic-provider';data.nodeOnlyModelModeLock='legacy';data.characters[0].chats[0].useModelPreset=false;
        data.plugins.push({name:'synthetic-provider',version:'3.0',enabled:true,realArg:{},script:`
            await Risuai.addProvider('synthetic-provider',async arg=>{
                const response=await Risuai.nativeFetch('https://analysis.example.test/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-only'},
                    body:JSON.stringify({model:'fixture-provider',messages:arg.prompt_chat})});
                if(!response.ok)throw Error('synthetic provider transport');
                return {success:true,content:'Synthetic provider answer'};
            });`});
    }
}
if(route==='prepared')data.characters[0].chats[0].message.push({role:'user',data:'Synthetic prepared input',chatId:'synthetic-prepared-user'});
fs.symlinkSync(path.join(target,'dist'),path.join(runtime,'dist'));
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'pocketrisu',version:'1.10.0'}));
const password=createHash('sha256').update('synthetic-context-password').digest('hex');
const seed=fork(path.join(target,'server/node/bgServerChatProcessClient.cjs'),[],{cwd:runtime,stdio:['ignore','ignore','pipe','ipc']});
seed.send({scope:'pocketrisu-h1-client',command:'seed',runtimeRoot:runtime,targetRoot:target,password,databaseBase64:Buffer.from(JSON.stringify(data)).toString('base64')});
assert.equal((await once(seed,'exit'))[0],0);
const disk=new Database(path.join(runtime,'save/risuai.db'));
const grants=[...new Set(data.plugins.flatMap(p=>['replacer','provider','db','mainDom'].map(name=>JSON.stringify([p.name,name]))))];
disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('cache/plugin-permissions/state.json',JSON.stringify({given:grants,denied:[],cache:grants.map(k=>[k+'_lastGrantTime',Date.now()-(scenario==='installed-expired'?4*86400000:0)])}));
if(pagefoldCase){
    const localKey=key=>'cache/plugin-storage/'+Buffer.from(key).toString('base64url')+'.json';
    disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run(localKey('pagefold.config.v1'),JSON.stringify({activeProvider:'google',packagingMode:'maximum',google:{apiKey:'synthetic-only',model:'fixture-pagefold',baseUrl:'https://pagefold.example.test/v1beta'}}));
    if(scenario==='installed-pagefold-cache')disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run(localKey('pagefold.font.noto-sans-cjk-kr.v1'),JSON.stringify(fs.readFileSync(pagefoldFont).toString('base64')));
}
disk.close();
const events=[],server=fork(path.join(target,'server/node/server.cjs'),[],{cwd:runtime,
    execArgv:['--require',new URL('./probes/bg-marp-settings-preload.cjs',import.meta.url).pathname],
    env:{...process.env,PORT:'0',TUNNEL_DISABLED:'1',UPDATE_CHECK_DISABLED:'1',POCKETRISU_BG_PLUGIN_HOST_CANDIDATE:['off-provider','installed-off'].includes(scenario)?'0':'1',MARP_SETTINGS_PROBE:'1',
        MARP_INSTALLED_PROBE:installedCases.includes(scenario)?'1':'0',
        MARP_PAGEFOLD_FONT:pagefoldFont??'',MARP_PAGEFOLD_TARGET:pagefoldCase?target:'',
        MARP_PAGEFOLD_STATS_GATE:scenario==='installed-pagefold-stat-conflict'?'1':'0',
        MARP_SETTINGS_GATE:['duplicate-start','duplicate-provider','constructor-failure',...rawProviderCases,...auxiliaryCases,...installedCases].includes(scenario)?'':'analysis',
        MARP_AUX_CALLER_PROBE:auxiliaryCases.includes(scenario)?'1':'0',MARP_CONTEXT_SCENARIO:scenario},stdio:['ignore','pipe','pipe','ipc']});
server.on('message',row=>events.push(row));const log=fs.createWriteStream(path.join(runtime,'server.log'));server.stdout.pipe(log);server.stderr.pipe(log);
const wait=async task=>{const end=Date.now()+60000;while(Date.now()<end){if(server.exitCode!==null||server.signalCode!==null)throw Error('context server exited before assertion');const value=await task();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw Error('context probe deadline');};
const operationId=randomUUID();
async function run(){
try{
    const origin='http://127.0.0.1:'+await wait(()=>events.find(e=>e.event==='ready')?.port);
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);
    const token=(await login.json()).token;
    const session=await fetch(origin+'/api/session',{method:'POST',headers:{'risu-auth':token,'x-session-id':'synthetic-context-session'}});assert.equal(session.status,200);
    const headers={'risu-auth':token,'x-client-build':JSON.parse(fs.readFileSync(path.join(target,'dist/build-stamp.json'))).stamp,
        'content-type':'application/json',cookie:session.headers.get('set-cookie').split(';')[0],'x-chat-id':'synthetic-chat'};
    if(installedCases.includes(scenario)){
        const response=await fetch(origin+'/api/bg-orchestrate-capabilities',{headers});assert.equal(response.status,200);
        const capability=await response.json();assert.equal(capability.serverPluginHostVersion,scenario==='installed-off'?0:1);
        assert.equal(capability.serverChatCommitVersion,1);
        assert.equal(events.filter(e=>e.event==='host'||e.event==='session-create').length,0,'capability read must not initialize guest effects');
        events.push({event:'verified-capability',hostVersion:capability.serverPluginHostVersion,commitVersion:capability.serverChatCommitVersion});
    }
    const read=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers});assert.equal(read.status,200);
    const currentChat=await decodeRisuSave(new Uint8Array(await read.arrayBuffer())),baseChatRevision=read.headers.get('x-chat-revision');assert.match(baseChatRevision,/^[a-f0-9]{64}$/);
    const body={detached:true,selectedCharId:'synthetic-character',selectedChatId:'synthetic-chat',operationId,currentChat,baseChatRevision,
        resultKeyVersion:1,resultOrderVersion:1,startAckVersion:1,serverChatCommitVersion:1,
        ...(route==='raw'?{inputCommandVersion:1,inputCommand:{inputCommandId:'input-'+operationId,userMessageId:'user-'+operationId,
            rawText:'Synthetic raw input',settingsSnapshotRef:'synthetic-client-hint',submittedAt:Date.now()}}:{})};
    const start=await fetch(origin+'/api/bg-orchestrate',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(start.status,200);
    const ack=await start.json();assert.equal(ack.started,true);assert.equal(ack.operationId,operationId);
    if(scenario==='installed-pagefold-stat-conflict'){
        await wait(()=>events.some(e=>e.event==='pagefold-stats-held'));
        const key='cache/plugin-storage/'+Buffer.from('pagefold.stats.v1').toString('base64url')+'.json';
        const write=await fetch(origin+'/api/write',{method:'POST',headers:{...headers,'content-type':'application/octet-stream','file-path':Buffer.from(key).toString('hex')},
            body:Buffer.from(JSON.stringify({version:1,total:{requests:2,successes:2},daily:{},routes:{},recent:[]}))});
        assert.equal(write.status,200,await write.clone().text());server.send({event:'release'});
    }
    if(!['duplicate-start','duplicate-provider','constructor-failure',...rawProviderCases,...auxiliaryCases,...installedCases].includes(scenario)){
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
        if(route==='raw'&&['duplicate-provider','missing-provider','missing-fallback-provider','off-provider','input-blocked-provider','conflict-provider','failed-registration-provider'].includes(scenario)){
            const input=db.prepare('SELECT value FROM kv WHERE key=?').get('internal/server-chat-input/v1/'+Buffer.from(operationId).toString('base64url'))?.value;
            if(input){const record=JSON.parse(String(input));
                if(record.inputState==='blocked_edit'&&(record.transformState==='not_run'
                    || ['failed','delivery-failed','result-ready','delivered','cancelled'].includes(row.state)))return {...row,input:record};
            }
        }
        if(scenario==='constructor-failure'&&route==='raw'){
            const input=db.prepare('SELECT value FROM kv WHERE key=?').get('internal/server-chat-input/v1/'+Buffer.from(operationId).toString('base64url'))?.value;
            if(input&&JSON.parse(String(input)).transformState==='unknown')return {...row,inputTransformState:'unknown'};
        }
        return ['failed','delivery-failed','chat-committed','result-ready','delivered','cancelled'].includes(row.state)?row:null;
    }finally{db.close();}});
    assert.notEqual(terminal.state,'cancelled');
    const response=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers});assert.equal(response.status,200);
    const chat=await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
    if(scenario==='installed-pagefold-stat-conflict'){
        assert.equal(terminal.state,'chat-committed');assert.equal(chat.message.filter(m=>m.role==='user').length,1);assert.equal(chat.message.filter(m=>m.role==='char').length,1);
        assert.equal(chat.message.find(m=>m.role==='char').data,'Synthetic PageFold answer');
        assert.equal(events.filter(e=>e.event==='pagefold-model').length,1);assert.equal(events.filter(e=>e.event==='analysis').length,3);assert.equal(events.filter(e=>e.event==='main').length,0);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let notices,stats,input;
        try{
            const key='cache/plugin-storage/'+Buffer.from('pagefold.stats.v1').toString('base64url')+'.json';stats=JSON.parse(String(db.prepare('SELECT value FROM kv WHERE key=?').get(key).value));
            notices=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(row=>JSON.parse(String(row.value)).event);
            input=route==='raw'?JSON.parse(String(db.prepare('SELECT value FROM kv WHERE key=?').get('internal/server-chat-input/v1/'+Buffer.from(operationId).toString('base64url')).value)):null;
            assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
        }finally{db.close();}
        assert.equal(stats.total.requests,2);assert.ok(notices.some(n=>n.pluginName===installedExpected.providerName&&n.phase==='provider'&&n.code==='plugin_message'&&n.eventKey.endsWith(':local-conflict')&&n.effectsMayHaveOccurred===true));
        assert.equal(notices.filter(n=>n.pluginName===installedExpected.providerName&&n.code==='plugin_provider_failed').length,0);
        if(input)assert.equal(input.admission.rawText,'Synthetic raw input');
        await new Promise(resolve=>setTimeout(resolve,2300));assert.equal(events.filter(e=>e.event==='pagefold-model').length,1);
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,terminal,events,notices,input,statistics:stats.total.requests,model:1,answers:1,scope:'actual native KV HTTP writer competing with unchanged original provider statistics CAS; competing value/answer retained, mandatory warning/no replay'},null,2),{flag:'wx',mode:0o600});
        console.log(JSON.stringify({scenario,route,state:terminal.state,model:1,answers:1,retainedStatistics:2,replay:0}));return;
    }
    if(pagefoldCase){
        assert.equal(terminal.state,'chat-committed');
        assert.equal(chat.message.filter(m=>m.role==='user').length,1);assert.equal(chat.message.filter(m=>m.role==='char').length,1);
        assert.equal(chat.message.find(m=>m.role==='char').data,'Synthetic PageFold answer');
        assert.equal(events.filter(e=>e.event==='analysis').length,3);assert.equal(events.filter(e=>e.event==='main').length,0);
        const models=events.filter(e=>e.event==='pagefold-model');assert.equal(models.length,1);assert.equal(models[0].pdfOracle,true);
        assert.equal(events.filter(e=>e.event==='pagefold-font').length,scenario==='installed-pagefold-cache'?0:1);
        assert.equal(events.filter(e=>['observation-error','validation-error','denied'].includes(e.event)||e.event==='socket-denied'&&!e.control).length,0);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let stats,cache,notices,journal;
        try{
            const localKey=key=>'cache/plugin-storage/'+Buffer.from(key).toString('base64url')+'.json';
            stats=JSON.parse(String(db.prepare('SELECT value FROM kv WHERE key=?').get(localKey('pagefold.stats.v1')).value));
            cache=JSON.parse(String(db.prepare('SELECT value FROM kv WHERE key=?').get(localKey('pagefold.font.noto-sans-cjk-kr.v1')).value));
            notices=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(r=>JSON.parse(String(r.value)).event);
            journal=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-commit/v1/%').map(r=>JSON.parse(String(r.value)));
            assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
        }finally{db.close();}
        assert.equal(stats.total.requests,1);assert.equal(stats.total.successes,1);assert.ok(Buffer.from(cache,'base64').equals(fs.readFileSync(pagefoldFont)));
        assert.equal(journal.filter(row=>row.operationId===operationId).length,1);
        assert.ok(notices.some(n=>n.pluginName===installedExpected.managementName&&n.code==='plugin_hook_failed'&&n.phase==='load'));
        assert.ok(notices.every(n=>n.pluginName===installedExpected.managementName||n.pluginName===installedExpected.periodicName&&n.code==='plugin_late_call'));
        await new Promise(resolve=>setTimeout(resolve,2300));assert.equal(events.filter(e=>e.event==='pagefold-model').length,1);
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,operationId,terminal,events,notices,journal,statistics:stats.total.requests,fontCacheBytes:Buffer.byteLength(cache),answers:1},null,2),{mode:0o600,flag:'wx'});
        console.log(JSON.stringify({scenario,route,state:terminal.state,model:1,analysis:3,statistics:1,answers:1}));return;
    }
    if(installedCases.includes(scenario)){
        const analyses=events.filter(e=>e.event==='analysis'),mains=events.filter(e=>e.event==='main');
        const omitted=['installed-off','installed-expired'].includes(scenario),pluginProvider=scenario==='installed-provider';
        assert.equal(analyses.length,omitted?0:pluginProvider?4:3);assert.equal(mains.length,pluginProvider?0:1);
        assert.equal(chat.message.filter(m=>m.role==='user').length,1);assert.equal(chat.message.filter(m=>m.role==='char').length,1);
        const final=pluginProvider?analyses.find(e=>e.body.model==='fixture-provider'):mains[0];assert.ok(final);
        assert.equal(analyses.filter(e=>e.body.model==='fixture-provider').length,pluginProvider?1:0);
        assert.deepEqual(analyses.filter(e=>e.body.model!=='fixture-provider').map(e=>e.body.model).sort(),omitted?[]:[...installedExpected.analysisModels].sort());
        assert.equal(JSON.stringify(final.body).includes('<!--MARP:v1:begin-->'),!omitted);
        assert.equal(events.filter(e=>['observation-error','validation-error','denied'].includes(e.event)||e.event==='socket-denied'&&!e.control).length,0);
        assert.equal(events.filter(e=>e.event==='socket-denied'&&e.control).length,2);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let notices,journal,diagnostics;
        try{notices=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(r=>JSON.parse(String(r.value)).event);
            journal=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-commit/v1/%').map(r=>JSON.parse(String(r.value)));
            diagnostics=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-plugin-transport/v1/%').map(r=>JSON.parse(String(r.value)));
        }finally{db.close();}
        assert.equal(journal.filter(row=>row.operationId===operationId).length,1);
        const assertRecords=()=>{
        if(scenario==='installed-off'){
            assert.equal(events.filter(e=>e.event==='session-create').length,0);
            assert.equal(notices.length,6);assert.ok(notices.every(n=>n.api==='server_plugin_host_disabled'));
            assert.ok(notices.every(n=>n.code==='plugin_api_unsupported'&&n.phase==='load'&&n.effectsMayHaveOccurred===false));
            assert.deepEqual(notices.map(n=>n.pluginName).sort(),installedInventory.map(row=>row.name).sort());
            assert.deepEqual(notices.map(n=>[n.pluginName,n.pluginVersion]).sort(),installedInventory.map((row,index)=>[row.name,installedExpected.pluginVersions[index]]).sort());
            assert.equal(diagnostics.length,0);
        }else{
            assert.deepEqual(events.filter(e=>e.event==='session-create').map(e=>e.sourceHash),data.plugins.map(plugin=>createHash('sha256').update(plugin.script).digest('hex')));
            assert.ok(notices.some(n=>n.pluginName===installedExpected.managementName&&n.code==='plugin_hook_failed'&&n.phase==='load'
                &&n.effectsMayHaveOccurred===(route==='prepared')));
            if(scenario==='installed-expired'){
                // Prepared input conservatively records prior effects, so the
                // existing permission failure normalizes to a hook failure.
                for(const name of ['risu_multiagent',installedExpected.providerName])assert.ok(notices.some(n=>n.pluginName===name
                    &&n.code===(route==='prepared'?'plugin_hook_failed':'plugin_permission_missing')&&n.phase==='load'
                    &&n.effectsMayHaveOccurred===(route==='prepared')));
                const periodic=notices.filter(n=>n.pluginName===installedExpected.periodicName&&n.code==='plugin_late_call'&&n.phase==='load');
                assert.ok(periodic.length<=1);assert.ok(periodic.every(n=>n.effectsMayHaveOccurred===(route==='prepared')));
                assert.equal(notices.length-periodic.length,3);
            }
            else{
                assert.ok(diagnostics.length>0);
                assert.deepEqual(diagnostics.map(row=>({pluginName:row.pluginName,calls:row.calls,nativeFetch:row.nativeFetch,http2xx:row.http2xx,rejected:row.rejected,pending:row.pending}))
                    .sort((a,b)=>a.pluginName.localeCompare(b.pluginName)),
                    [{pluginName:'risu_multiagent',calls:3,nativeFetch:3,http2xx:3,rejected:0,pending:0},
                        ...(pluginProvider?[{pluginName:'synthetic-provider',calls:1,nativeFetch:1,http2xx:1,rejected:0,pending:0}]:[])]
                    .sort((a,b)=>a.pluginName.localeCompare(b.pluginName)));
                const mandatory=notices.filter(n=>!(n.pluginName===installedExpected.periodicName&&n.code==='plugin_late_call'&&n.phase==='load'));
                assert.deepEqual(mandatory.map(n=>({pluginName:n.pluginName,code:n.code,phase:n.phase,effectsMayHaveOccurred:n.effectsMayHaveOccurred})),
                    [{pluginName:installedExpected.managementName,code:'plugin_hook_failed',phase:'load',effectsMayHaveOccurred:route==='prepared'}]);
                assert.ok(notices.length-mandatory.length<=1);
            }
        }
        };
        assertRecords();
        await new Promise(resolve=>setTimeout(resolve,2300));
        assert.equal(events.filter(e=>e.event==='analysis').length,analyses.length);assert.equal(events.filter(e=>e.event==='main').length,mains.length);
        assert.equal(events.filter(e=>['observation-error','validation-error','denied'].includes(e.event)||e.event==='socket-denied'&&!e.control).length,0);
        const refreshed=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});
        try{notices=refreshed.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(r=>JSON.parse(String(r.value)).event);
            diagnostics=refreshed.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-plugin-transport/v1/%').map(r=>JSON.parse(String(r.value)));
        }finally{refreshed.close();}
        assertRecords();
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,operationId,terminal,events,notices,journal,diagnostics,
            analysis:analyses.length,main:mains.length,answers:1,scope:'current generated raw/prepared HTTP and normal-chat/journal with original installed combination; synthetic settings and providers; prepared seed is not browser input recovery'},null,2),{mode:0o600,flag:'wx'});
        console.log(JSON.stringify({scenario,route,analysis:analyses.length,main:mains.length,answers:1,state:terminal.state,notices:notices.length}));return;
    }
    if(auxiliaryCases.includes(scenario)){
        const lua=scenario.includes('lua'),expanded=scenario.endsWith('expanded');
        const roles=events.filter(e=>e.event==='actual-request-role').map(e=>e.role);
        assert.deepEqual(roles,lua?['otherAx','model']:['model','submodel','model']);
        const analyses=events.filter(e=>e.event==='analysis'),mains=events.filter(e=>e.event==='main');
        assert.equal(analyses.length,lua?(expanded?6:3):(expanded?9:6));assert.equal(mains.length,lua?2:3);
        const injected=mains.map(e=>JSON.stringify(e.body).includes('<!--MARP:v1:begin-->'));
        assert.deepEqual(injected,lua?[expanded,true]:[true,expanded,true]);
        assert.equal(chat.message.filter(m=>m.role==='char').length,1);assert.equal(chat.message.filter(m=>m.role==='user').length,1);
        for(const key of lua?['aux_lua']:['aux_model','aux_submodel'])assert.equal(chat.scriptstate['$'+key],'Synthetic settings answer');
        assert.equal(events.filter(e=>['host-notice','observation-error','validation-error','denied'].includes(e.event)).length,0);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let journal;
        try{journal=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-commit/v1/%').map(r=>JSON.parse(String(r.value)));}finally{db.close();}
        assert.ok(journal.some(row=>row.operationId===operationId));
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,operationId,terminal,events,roles,injected,
            analysis:analyses.length,nativeRequests:mains.length,answers:1,scope:'actual generated raw HTTP/input v2RunLLM or Lua axLLM/main dispatcher through unchanged original MARP; synthetic provider; not all auxiliary entry points'},null,2));
        console.log(JSON.stringify({scenario,roles,analysis:analyses.length,nativeRequests:mains.length,answers:1,state:terminal.state}));return;
    }
    if(route==='raw'&&(rawProviderCases.includes(scenario)||scenario==='duplicate-provider')){
        const blocked=['duplicate-provider','missing-provider','missing-fallback-provider','off-provider','input-blocked-provider','conflict-provider','failed-registration-provider'].includes(scenario);
        const analyses=events.filter(e=>e.event==='analysis'),mains=events.filter(e=>e.event==='main');
        assert.equal(analyses.length,blocked?0:['input-provider','retry-provider'].includes(scenario)?2:1);assert.equal(mains.length,0);
        for(const row of analyses)assert.equal(row.body.model,'fixture-provider');
        assert.equal(chat.message.filter(m=>m.role==='user').length,blocked?0:1);
        assert.equal(chat.message.filter(m=>m.role==='char').length,blocked?0:1);
        assert.equal(events.filter(e=>['observation-error','validation-error','denied'].includes(e.event)).length,0);
        const db=new Database(path.join(runtime,'save/risuai.db'),{readonly:true});let notices,journal;
        try{notices=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/bg-notifications/v1/%').map(r=>JSON.parse(String(r.value)).event);
            journal=db.prepare('SELECT value FROM kv WHERE key LIKE ?').all('internal/server-chat-commit/v1/%').map(r=>JSON.parse(String(r.value)));}finally{db.close();}
        if(blocked){assert.equal(terminal.input.inputState,'blocked_edit');assert.equal(terminal.input.admission.rawText,'Synthetic raw input');
            assert.equal(terminal.input.transformState,scenario==='off-provider'?'not_run':'completed');
            assert.equal(journal.length,0);
            if(scenario!=='off-provider')assert.equal(terminal.input.terminal.api,scenario==='input-blocked-provider'?'browser_model_provider':'plugin_provider_unavailable');
        }else{assert.ok(journal.some(row=>row.operationId===operationId));
            assert.equal(chat.message.find(m=>m.role==='char').data,'Synthetic provider answer');
            if(scenario==='input-provider')assert.equal(chat.scriptstate.$providerInput,'Synthetic provider answer');
        }
        if(scenario==='off-provider')assert.equal(events.filter(e=>e.event==='host'||e.event==='session-create').length,0);
        if(scenario==='conflict-provider')assert.ok(notices.some(n=>n.pluginName==='synthetic-conflicting-plugin'&&n.phase==='load'&&n.code==='plugin_hook_failed'));
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,scenario+'-'+route+'.json'),JSON.stringify({scenario,route,runtime,operationId,terminal,events,notices,journal,
            analysis:analyses.length,main:0,answers:blocked?0:1,userMessages:blocked?0:1,
            scope:'actual raw HTTP, registered provider and input-trigger dispatcher; synthetic providers; original MARP all agents OFF'},null,2));
        console.log(JSON.stringify({scenario,route,analysis:analyses.length,main:0,answers:blocked?0:1,state:terminal.state,notices:notices.length}));return;
    }
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
}catch(error){fs.writeFileSync(path.join(runtime,'failure.json'),JSON.stringify({events,operationId},null,2),{mode:0o600});console.error(runtime,error);process.exitCode=1;}
finally{if(server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}}
}
await run();
