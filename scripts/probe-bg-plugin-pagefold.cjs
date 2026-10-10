'use strict';
// Original provider integration: private source and public default font are
// supplied as inputs. No production configuration or credential is read.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID, generateKeyPairSync, verify } = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const [targetArg, sourceArg, fontArg, outputArg, digest] = process.argv.slice(2);
const target = path.resolve(targetArg), requireTarget = createRequire(path.join(target, 'package.json'));
const Database = requireTarget('better-sqlite3');
const { createBgPluginHost } = requireTarget('./server/node/bgPluginHost.cjs');
const source = fs.readFileSync(path.resolve(sourceArg));
assert.equal(createHash('sha256').update(source).digest('hex'), digest);
const script = source.toString('utf8'); assert.ok(Buffer.from(script).equals(source));
const font = fs.readFileSync(path.resolve(fontArg));
const emojiFont=process.argv[7]?fs.readFileSync(path.resolve(process.argv[7])):null;
const runtime = fs.mkdtempSync('/tmp/bg-pagefold-original-');
const db = new Database(path.join(runtime, 'synthetic.db'));
db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value BLOB)');
const kvGet = key => db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null;
const kvSet = (key, value) => db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?)').run(key, value);
const kvDel = key => db.prepare('DELETE FROM kv WHERE key=?').run(key);
const kvList = prefix => db.prepare('SELECT key FROM kv WHERE substr(key,1,?)=?').all(prefix.length,prefix).map(row=>row.key);
const localKey = key => 'cache/plugin-storage/' + Buffer.from(key).toString('base64url') + '.json';
const fontKey = localKey('pagefold.font.noto-sans-cjk-kr.v1');
const emojiKey=localKey('pagefold.font.noto-emoji.v1');
const statsKey = localKey('pagefold.stats.v1');
const plugin = { name: 'synthetic-pagefold', version: '3.0', enabled: true, realArg: {}, script };
const root = { plugins: [plugin], characters: [], pluginCustomStorage: {} };
const grant = JSON.stringify([plugin.name, 'provider']);
kvSet('cache/plugin-permissions/state.json', JSON.stringify({given:[grant],denied:[],cache:[[grant+'_lastGrantTime',Date.now()]]}));
const network = [], reports = [], failures = []; let host, hostPeak = process.memoryUsage().rss;
const sample = setInterval(() => { hostPeak = Math.max(hostPeak, process.memoryUsage().rss); }, 20);
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const account={client_email:'synthetic-service@example.invalid',project_id:'synthetic-project',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
const config = provider => ({activeProvider:provider==='vertex-service-account'?'vertex':provider, packagingMode:'maximum',
    google:{apiKey:'synthetic-only',model:'fixture-google',baseUrl:'https://google.example.test/v1beta'},
    vertex:{authMode:provider==='vertex-service-account'?'service_account':'access_token',serviceAccount:JSON.stringify(account),accessToken:'synthetic-only',projectId:provider==='vertex-service-account'?'':'synthetic-project',location:'global',model:'fixture-vertex'},
    openrouter:{apiKey:'synthetic-only',model:'fixture-router',baseUrl:'https://router.example.test/api/v1'}});
async function main() {
    const pdfjs = await import(pathToFileURL(requireTarget.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const profiles=[...['google','vertex','vertex-service-account','openrouter'].map(provider=>({provider,packaging:'maximum',emoji:false})),
        {provider:'google',packaging:'balanced',emoji:false},...(emojiFont?[{provider:'google',packaging:'maximum',emoji:true}]:[])];
    for (const {provider,packaging,emoji} of profiles) for (const pass of ['download','cold-cache']) {
        // Each invocation owns a fresh OS guest. Only SQLite cache/stat records
        // survive, so a process-local font/PDF cache cannot satisfy this test.
        if(pass==='download') {kvDel(fontKey);kvDel(emojiKey);}
        kvSet(localKey('pagefold.config.v1'), JSON.stringify({...config(provider),packagingMode:packaging}));
        const before = network.length, notices = [], controller = new AbortController();
        const registry = Object.fromEntries(['replacerbeforeRequest','replacerafterRequest','editinput','editoutput','editprocess','editdisplay'].map(key=>[key,new Set()]));
        registry.providers = new Map();
        host = await createBgPluginHost({database:root,getDatabase:()=>root,getSelection:()=>({characterIndex:0,chatIndex:0}),hydrate:async value=>structuredClone(value),
            storageOwner:{peekRoot:()=>root,getRoot:async()=>root,writeRoot:async()=>{throw Error('unexpected root write');},kvGet,kvSet,kvDel,kvList,transaction:task=>db.transaction(task)()},
            operation:{operationId:randomUUID(),charId:'synthetic-character',chatId:'synthetic-chat'},signal:controller.signal,beforeEffect:()=>{},onCriticalFailure:error=>controller.abort(error),
            publishNotification:async event=>{notices.push(event);return {status:'stored'};},
            bindings:{registry,allowedDbKeys:[],bodyInterceptors:[],installProvider(name,callback){registry.providers.set(name,callback);return()=>registry.providers.delete(name);},
                async nativeFetch(url, options) {
                    assert.equal(options.signal.aborted,false);
                    if(url==='https://oauth2.googleapis.com/token'){
                        assert.equal(provider,'vertex-service-account');assert.equal(options.method,'POST');
                        assert.equal(new Headers(options.headers).get('content-type'),'application/x-www-form-urlencoded');
                        const form=new URLSearchParams(options.body);assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
                        const [header,claims,signature]=form.get('assertion').split('.');
                        assert.deepEqual(JSON.parse(Buffer.from(header,'base64url')),{alg:'RS256',typ:'JWT'});
                        const payload=JSON.parse(Buffer.from(claims,'base64url'));assert.equal(payload.iss,account.client_email);assert.equal(payload.exp-payload.iat,3600);
                        assert.equal(payload.aud,url);assert.equal(payload.scope,'https://www.googleapis.com/auth/cloud-platform');
                        assert.ok(verify('RSA-SHA256',Buffer.from(header+'.'+claims),publicKey,Buffer.from(signature,'base64url')));
                        network.push({kind:'oauth',signatureVerified:true});return Response.json({access_token:'synthetic-only',expires_in:3600});
                    }
                    if(['https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf','https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf'].includes(url)) {
                        const bytes=url.includes('/notoemoji/')?emojiFont:font;assert.ok(bytes);network.push({kind:url.includes('/notoemoji/')?'emoji-font':'font'}); let offset=0;
                        return new Response(new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}const next=Math.min(offset+65536,bytes.length);c.enqueue(new Uint8Array(bytes.subarray(offset,next)));offset=next;}},{highWaterMark:0}));
                    }
                    if(url==='https://router.example.test/api/v1/models') {network.push({kind:'pricing'});return Response.json({data:[{id:'fixture-router',pricing:{prompt:'0.000001'}}]});}
                    const expected = provider==='google'?'https://google.example.test/v1beta/models/fixture-google:generateContent':provider.startsWith('vertex')
                        ?'https://aiplatform.googleapis.com/v1/projects/synthetic-project/locations/global/publishers/google/models/fixture-vertex:generateContent'
                        :'https://router.example.test/api/v1/chat/completions';
                    assert.equal(url,expected); assert.equal(options.method,'POST');
                    assert.equal(new Headers(options.headers).get(provider==='google'?'x-goog-api-key':'authorization'),provider==='google'?'synthetic-only':'Bearer synthetic-only');
                    const body=JSON.parse(options.body);
                    const base64=provider==='openrouter'?body.messages[1].content.find(part=>part.type==='file').file.file_data.split(',')[1]:body.contents[0].parts[0].inlineData.data;
                    const bytes=Buffer.from(base64,'base64'), task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true});
                    try {
                        const document=await task.promise; let text='';
                        for(let index=1;index<=document.numPages;index++){const page=await document.getPage(index);text+=(await page.getTextContent()).items.map(item=>item.str??'').join(' ');}
                        assert.ok(text.includes('SYNTHETIC_PAGEFOLD_ORACLE'));assert.ok(text.includes('한글'));
                        if(emoji)assert.ok(text.includes('😀'));
                        network.push({kind:'model',provider,pdfBytes:bytes.length,pages:document.numPages,textOracle:true,cjkOracle:true,emojiOracle:emoji?true:null});
                    } finally {await task.destroy();}
                    return provider==='openrouter'?Response.json({choices:[{message:{content:'Synthetic PageFold answer'}}],usage:{prompt_tokens:25,completion_tokens:5,cost:0.001}})
                        :Response.json({candidates:[{content:{parts:[{text:'Synthetic PageFold answer'}]}}],usageMetadata:{promptTokenCount:25,candidatesTokenCount:5}});
                },risuFetch:async()=>{throw Error('unexpected risuFetch');},requestChatDataMain:async()=>{throw Error('unexpected native model');}}});
        assert.ok(host.hasProvider('PageFold'));
        const prompt=[{role:'system',content:'Synthetic setting.'},{role:'user',content:'SYNTHETIC_PAGEFOLD_ORACLE 한글 방문자가 천문대에 들어온다.'+(emoji?' 😀':'')},
            {role:'assistant',content:'Synthetic previous answer.'},{role:'user',content:'Synthetic next question.'}];
        const result=await registry.providers.get('PageFold')({mode:'v3',prompt_chat:prompt,max_tokens:128,temperature:0.2},new AbortController().signal);
        assert.deepEqual(result,{success:true,content:'Synthetic PageFold answer'});
        const stats=JSON.parse(kvGet(statsKey));assert.equal(stats.total.requests,reports.length+1);assert.equal(stats.total.successes,reports.length+1);
        const cached=JSON.parse(kvGet(fontKey));assert.ok(Buffer.from(cached,'base64').equals(font));
        if(emoji)assert.ok(Buffer.from(JSON.parse(kvGet(emojiKey)),'base64').equals(emojiFont));
        const calls=network.slice(before);assert.equal(calls.filter(row=>row.kind==='model').length,1);assert.equal(calls.filter(row=>row.kind==='font').length,pass==='download'?1:0);assert.deepEqual(notices,[]);
        assert.equal(calls.filter(row=>row.kind==='oauth').length,provider==='vertex-service-account'?1:0);
        assert.equal(calls.filter(row=>row.kind==='emoji-font').length,emoji&&pass==='download'?1:0);
        await host.close();host=null;assert.equal(registry.providers.size,0);
        reports.push({provider,packaging,emoji,pass,calls,cacheBytes:Buffer.byteLength(kvGet(fontKey)),statistics:stats.total.requests,notices:0});
    }
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
    fs.writeFileSync(path.resolve(outputArg),JSON.stringify({cases:reports.length,reports,fontBytes:font.length,hostPeakRss:hostPeak,quickCheck:'ok'},null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({cases:reports.length,modelCalls:network.filter(row=>row.kind==='model').length,fontFetches:network.filter(row=>row.kind==='font').length,hostPeakRss:hostPeak}));
}
main().catch(error=>{failures.push(error.code??error.name);console.error(error);process.exitCode=1;}).finally(async()=>{clearInterval(sample);await host?.close();db.close();});
