import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';

const [target, original, seedPath, playwrightRoot, chromiumPath, output, family = 'openai', observation = 'plain', suite = 'pdf'] = process.argv.slice(2);
assert.ok(['openai', 'anthropic', 'gemini', 'vertex'].includes(family));
assert.ok(['plain', 'observed'].includes(observation));
assert.ok(['pdf', 'roles'].includes(suite));
if (suite === 'roles') { assert.equal(family, 'openai'); assert.equal(observation, 'plain'); }
const source = fs.readFileSync(original, 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'), 'b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132');
const require = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium } = require('playwright');
const targetRequire = createRequire(path.join(target, 'package.json'));
const Database = targetRequire('better-sqlite3');
const pdf = await import(pathToFileURL(targetRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
const key = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const runtime = fs.mkdtempSync('/tmp/marp-pdf-'); process.chdir(runtime);
const { decodeRisuSave } = targetRequire('./server/node/utils.cjs');
fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
const baseUrl = family === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : family === 'vertex' ? 'https://synthetic-aiplatform.invalid/v1/projects/synthetic/locations/global/endpoints/openapi'
        : 'https://analysis.example.test/v1';
const agents = ['worldbuilding', 'plot', 'character'];
const data = JSON.parse(fs.readFileSync(seedPath));
assert.equal(data.characters.length, 1); assert.equal(data.characters[0].chaId, 'synthetic-character');
assert.equal(data.characters[0].chats[0].message.length, 0);
data.plugins = [{ name: 'risu_multiagent', version: '3.0', enabled: true, realArg: {}, script: source }];
data.pluginCustomStorage = { risu_multiagent_lite_config_vault_v1: { config: {
    provider: family, baseUrl, apiKey: family === 'vertex' ? JSON.stringify({ client_email: 'synthetic-account@example.invalid', private_key: key.privateKey }) : 'synthetic-only',
    model: 'fixture-default', marpConfig: { request_timeout: 60, analysis_timeout: 120 },
    agents: Object.fromEntries(agents.map(name => [name, { enabled: true, model: 'fixture-' + name,
        systemPrompt: 'Synthetic ' + name + ' agent.', userPromptTemplate: '{{user_input}}' }])) } } };
const password = createHash('sha256').update('synthetic-pdf-password').digest('hex');
const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [], { cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target,
    password, databaseBase64: Buffer.from(JSON.stringify(data)).toString('base64') });
assert.equal((await once(seed, 'exit'))[0], 0);
const grantKeys = ['replacer', 'db', 'mainDom'].map(p => JSON.stringify(['risu_multiagent', p]));
const disk = new Database(path.join(runtime, 'save/risuai.db'));
disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('cache/plugin-permissions/state.json', Buffer.from(JSON.stringify({
    given: grantKeys, denied: [], cache: grantKeys.map(k => [k + '_lastGrantTime', Date.now()]) })));
disk.close();
const transportFile = path.join(runtime, 'transport.json'); fs.writeFileSync(transportFile, JSON.stringify({ family, publicKey: key.publicKey }));
const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
    execArgv: ['--require', new URL('./probes/bg-marp-pdf-transport.cjs', import.meta.url).pathname],
    env: { ...process.env, PORT: '0', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1', POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '0',
        MARP_PDF_PROBE: '1', MARP_PDF_TRANSPORT_FILE: transportFile }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
const events = [], errors = [], workers = [], results = []; server.on('message', e => events.push(e));
const log = fs.createWriteStream(path.join(runtime, 'server.log')); server.stdout.pipe(log); server.stderr.pipe(log);
async function wait(task) { const end = Date.now() + 60000; while (Date.now() < end) {
    const value = await task(); if (value) return value; await new Promise(r => setTimeout(r, 50)); } throw Error('PDF probe deadline'); }
async function savedSettings() {
    const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
    let bytes;
    try { bytes = db.transaction(() => {
        const rows = db.prepare('SELECT m.seq,c.data FROM manifest_chunks m JOIN chunks c ON c.hash=m.hash WHERE m.manifest_key=? ORDER BY m.seq').all('database/database.bin');
        return rows.length ? Buffer.concat(rows.map(r => r.data)) : db.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value;
    })(); } finally { db.close(); }
    const root = await decodeRisuSave(bytes), raw = root.pluginCustomStorage.risu_multiagent_lite_config_vault_v1;
    return { vault: typeof raw === 'string' ? JSON.parse(raw) : raw, arguments: root.plugins[0].realArg };
}
function pdfData(body) {
    return body.contents?.[0]?.parts?.find(p => p.inlineData)?.inlineData?.data
        ?? body.messages?.flatMap(m => Array.isArray(m.content) ? m.content : [])
            .map(p => p.file?.file_data?.replace(/^data:application\/pdf;base64,/, '') ?? p.source?.data).find(Boolean);
}
// Independent decoder of the emitted CMap/CID text, not a PDF generator.
function exactTranscript(bytes) {
    const raw = bytes.toString('ascii');
    assert.equal(raw.slice(0, 5), '%PDF-'); assert.match(raw, /startxref\s+\d+\s+%%EOF\s*$/);
    const cmap = raw.match(/begincmap([\s\S]*?)endcmap/)[1], glyphs = new Map();
    for (const [, code, units] of cmap.matchAll(/<([0-9A-F]{4})> <((?:[0-9A-F]{4})+)>/g)) {
        glyphs.set(code, String.fromCharCode(...units.match(/.{4}/g).map(x => parseInt(x, 16))));
    }
    return [...raw.matchAll(/<([0-9A-F]*)> Tj T\*/g)].map(([, line]) => (line.match(/.{4}/g) ?? []).map(code => {
        assert.ok(glyphs.has(code)); return glyphs.get(code);
    }).join('')).join('\n');
}
async function validatePdf(encoded, expected) {
    const bytes = Buffer.from(encoded, 'base64');
    assert.equal(exactTranscript(bytes), expected.replaceAll('\r\n', '\n'));
    const task = pdf.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true });
    try {
        const doc = await task.promise; let text = '';
        for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str ?? '').join(' ');
        assert.ok(text.includes('M2_INPUT'), 'independent PDF parser must recover the synthetic marker');
        return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pages: doc.numPages };
    } finally { await task.destroy(); }
}
const corpora = {
    unicode: 'M2_INPUT 한국어 😀\r\n한 줄\n혼자 CR\r끝 ' .repeat(80) + '\n' + String.fromCharCode(0xD800) + 'LONE' + String.fromCharCode(0xDC00),
    short: 'M2_INPUT short', edge840: 'M2_INPUT' + 'x'.repeat(821), edge841: 'M2_INPUT' + 'x'.repeat(822),
    array: [{ type: 'text', text: ('M2_INPUT array 한글 😀\n').repeat(80) }, { type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }],
    document: [{ type: 'text', text: ('M2_INPUT document\n').repeat(100) }, { type: 'file', file: { filename: 'synthetic.pdf', file_data: 'data:application/pdf;base64,eA==' } }],
};
let browser, page, frame;
try {
    const origin = 'http://127.0.0.1:' + await wait(() => events.find(e => e.event === 'ready')?.port);
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
    const context = await browser.newContext();
    await context.routeWebSocket('**/*', route => route.url().startsWith(origin.replace('http:', 'ws:') + '/')
        ? route.connectToServer() : route.close());
    await context.route('**/*', route => {
        if (route.request().url().startsWith(origin + '/')) return route.continue();
        if (route.request().url().includes('/wasmoon@1.16.0/') && route.request().url().endsWith('/glue.wasm')) return route.fulfill({
            body: fs.readFileSync(path.join(target, 'node_modules/wasmoon/dist/glue.wasm')), contentType: 'application/wasm' });
        return route.abort();
    });
    await context.addInitScript(({ observed }) => {
        window.__m2 = { registration: null, result: null, policy: [], observer: [] };
        window.addEventListener('message', event => {
            const e = event.data;
            if (e?.type === 'CALL_ROOT' && e.method === 'addRisuReplacer' && e.args?.[0] === 'beforeRequest') {
                window.__m2.registration = { source: event.source, id: e.args[1].id };
            }
            if (e?.type === 'CALLBACK_RETURN' && e.reqId === 'synthetic-m2') window.__m2.result = e;
        });
        window.addEventListener('securitypolicyviolation', e => window.__m2.policy.push({ directive: e.effectiveDirective,
            blob: e.blockedURI.startsWith('blob:'), disposition: e.disposition }));
        if (!observed) return;
        const rows = window.__m2.observer;
        const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
        URL.createObjectURL = function(...args) { const value = create.apply(this, args); rows.push({ type: 'create', value }); return value; };
        URL.revokeObjectURL = function(...args) { rows.push({ type: 'revoke', value: args[0] }); return revoke.apply(this, args); };
        const terminate = Worker.prototype.terminate;
        Worker.prototype.terminate = function(...args) { rows.push({ type: 'terminate' }); return terminate.apply(this, args); };
        window.Worker = new Proxy(Worker, { construct(target, args, newTarget) {
            rows.push({ type: 'attempt' });
            try { const worker = Reflect.construct(target, args, newTarget); rows.push({ type: 'created' });
                worker.addEventListener('error', () => rows.push({ type: 'error' }));
                worker.addEventListener('message', () => rows.push({ type: 'message' }));
                return worker; }
            catch (error) { rows.push({ type: 'throw', name: error.name }); throw error; }
        } });
    }, { observed: observation === 'observed' });
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('worker', worker => { const row = { created: true, closed: false }; workers.push(row); worker.on('close', () => { row.closed = true; }); });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForTimeout(1500);
    if (await page.getByText('Input your password.', { exact: false }).count()) {
        await page.locator('input').fill('synthetic-pdf-password'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    }
    await wait(() => page.evaluate(() => !!window.__m2.registration));
    await page.locator('[data-char-id="synthetic-character"]').first().click();
    await page.locator('button').first().click(); await page.locator('.hamburger-menu button').first().click();
    await page.getByText('System', { exact: true }).first().click(); await page.getByText('Request Logs', { exact: true }).first().click();
    await page.getByText('MARP Lite', { exact: true }).first().click();
    frame = await wait(async () => { for (const f of page.frames()) if (await f.locator('[name="default_pdf_mode"]').count()) return f; });
    if (suite === 'roles') {
        // Exercise the byte-original role predicates in both actual hosts.
        // Expectations are explicit, not computed by copying that predicate.
        const cases = [
            {tag:'main',role:'model',calls:3}, {tag:'main-case',role:'MODEL',calls:3},
            {tag:'omitted',omitRole:true,calls:3}, {tag:'empty',role:'',calls:3},
            {tag:'sub-default',role:'submodel',calls:0}, {tag:'aux-default',role:'aux',calls:0},
            {tag:'sub-enabled',role:'submodel',main:false,calls:3}, {tag:'aux-enabled',role:'aux',main:false,calls:3},
            {tag:'memory-default',role:'memory',main:false,calls:0},
            {tag:'hypa-default',role:'hypamemory',main:false,calls:0},
            {tag:'memory-enabled',role:'memory',main:false,memory:false,calls:3},
            {tag:'translate-default',role:'translate',main:false,calls:0},
            {tag:'translate-enabled',role:'translate',main:false,translate:false,calls:3},
            {tag:'translation-main-veto',role:'translation',translate:false,calls:0},
            {tag:'lb-default',role:'model',content:'<lb-process>Synthetic input</lb-process>',calls:0},
            {tag:'lb-enabled',role:'model',lb:false,content:'<lb-process>Synthetic input</lb-process>',calls:3},
            {tag:'bypass-old-injection',role:'submodel',prior:true,calls:0},
            {tag:'main-old-injection',role:'model',prior:true,calls:3},
        ];
        for (const row of cases) {
            for (const [key, value] of Object.entries({main_model_only:row.main??true,
                bypass_hypamemory:row.memory??true,bypass_translate:row.translate??true,bypass_lb_process:row.lb??true})) {
                await frame.locator(`[name="${key}"]`).setChecked(value);
            }
            await frame.locator('[name="default_pdf_mode"]').selectOption('off');
            await frame.getByRole('button',{name:'설정 저장',exact:true}).click();
            await frame.getByText('설정을 저장했습니다.',{exact:true}).waitFor();
            const settings = await wait(async()=>{const s=await savedSettings();return s.arguments.main_model_only===String(Number(row.main??true))
                && s.arguments.bypass_hypamemory===String(Number(row.memory??true))
                && s.arguments.bypass_translate===String(Number(row.translate??true))
                && s.arguments.bypass_lb_process===String(Number(row.lb??true)) ? s:null;});
            const input=[{role:'system',content:'Synthetic setting.'},
                {role:'user',content:row.content??'Synthetic role input'}];
            if(row.prior) input.unshift({role:'system',content:'<!--MARP:v1:begin-->\nOld synthetic note\n<!--MARP:v1:end-->'});
            const before=events.length;
            await page.evaluate(({input,row})=>{
                window.__m2.result=null;const ref=window.__m2.registration;
                ref.source.postMessage({type:'INVOKE_CALLBACK',id:ref.id,reqId:'synthetic-m2',
                    args:row.omitRole?[input]:[input,row.role]},'*');
            },{input,row});
            const reply=await wait(()=>page.evaluate(()=>window.__m2.result));assert.equal(reply.error,undefined);
            const nativeEvents=events.slice(before),native=nativeEvents.filter(e=>e.event==='analysis');
            assert.equal(nativeEvents.filter(e=>e.event==='validation-error').length,0);
            assert.equal(native.length,row.calls,row.tag);
            const casePath=path.join(runtime,row.tag+'.case.json'),hostPath=path.join(runtime,row.tag+'.host.json');
            fs.writeFileSync(casePath,JSON.stringify({family,publicKey:key.publicKey,input,...settings,
                role:row.role,omitRole:row.omitRole??false}));
            const run=spawnSync(process.execPath,[new URL('./probes/bg-marp-pdf-host.cjs',import.meta.url).pathname,
                target,original,casePath,hostPath],{cwd:runtime,encoding:'utf8',timeout:120000});
            assert.equal(run.status,0,run.stderr+run.stdout);
            const host=JSON.parse(fs.readFileSync(hostPath)),remote=host.events.filter(e=>e.event==='analysis');
            assert.equal(remote.length,row.calls);assert.deepEqual(host.notices,[]);assert.deepEqual(host.result,reply.result);
            assert.equal(host.events.filter(e=>e.event==='validation-error').length,0);
            for(const n of native){const s=remote.find(r=>r.agent===n.agent);assert.ok(s);
                assert.equal(s.url,n.url);assert.deepEqual(s.body,n.body);
                const routeHeaders=new Set(['x-forwarded-for','host','content-length']);
                assert.deepEqual(s.headers.filter(([k])=>!routeHeaders.has(k)),n.headers.filter(([k])=>!routeHeaders.has(k)));
            }
            const resultText=JSON.stringify(reply.result);
            // Original role bypass returns before ce() strips old injection.
            // Qualify that ordering instead of inventing bypass cleanup.
            assert.equal(resultText.match(/<!--MARP:v1:begin-->/g)?.length??0,row.calls||row.prior?1:0);
            assert.equal(resultText.includes('Old synthetic note'),Boolean(row.prior&&!row.calls));
            if(!row.calls)assert.deepEqual(reply.result,input);
            results.push({tag:row.tag,role:row.role,omitRole:row.omitRole??false,analysis:row.calls,
                native,remote,outputHash:createHash('sha256').update(resultText).digest('hex')});
            console.log(JSON.stringify({suite,tag:row.tag,analysis:row.calls}));
        }
        assert.deepEqual(errors,[]);assert.equal(context.serviceWorkers().length,0);assert.equal(page.workers().length,0);
        fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'roles.json'),JSON.stringify({suite,runtime,results,
            scope:'actual v3 registered hook and isolated server hook/role predicates/final synthetic analysis requests; no Send/main/device/activation claim'},null,2));
    } else {
    const off = new Map();
    for (const mode of ['off', 'quality', 'standard', 'max']) {
        await frame.locator('[name="default_pdf_mode"]').selectOption(mode);
        await frame.getByRole('button', { name: '설정 저장', exact: true }).click();
        await frame.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
        const settings = await wait(async () => { const s = await savedSettings(); return s.vault.config.pdfMode === mode ? s : null; });
        for (const [corpus, content] of Object.entries(corpora)) {
            const input = [{ role: 'system', content: 'Synthetic setting.' }, { role: 'user', content }];
            const before = events.length;
            await page.evaluate(input => {
                window.__m2.result = null; const ref = window.__m2.registration;
                ref.source.postMessage({ type: 'INVOKE_CALLBACK', id: ref.id, reqId: 'synthetic-m2', args: [input, 'model'] }, '*');
            }, input);
            const reply = await wait(() => page.evaluate(() => window.__m2.result)); assert.equal(reply.error, undefined);
            const nativeEvents = events.slice(before), native = nativeEvents.filter(e => e.event === 'analysis');
            assert.equal(nativeEvents.filter(e => e.event === 'validation-error').length, 0); assert.equal(native.length, 3);
            assert.equal(JSON.stringify(reply.result).match(/<!--MARP:v1:begin-->/g)?.length, 1);
            const tag = mode + '-' + corpus, casePath = path.join(runtime, tag + '.case.json'), hostPath = path.join(runtime, tag + '.host.json');
            fs.writeFileSync(casePath, JSON.stringify({ family, publicKey: key.publicKey, input, ...settings }));
            const run = spawnSync(process.execPath, [new URL('./probes/bg-marp-pdf-host.cjs', import.meta.url).pathname,
                target, original, casePath, hostPath], { cwd: runtime, encoding: 'utf8', timeout: 120000 });
            assert.equal(run.status, 0, run.stderr + run.stdout);
            const host = JSON.parse(fs.readFileSync(hostPath)), remote = host.events.filter(e => e.event === 'analysis');
            assert.equal(remote.length, 3); assert.deepEqual(host.notices, []); assert.deepEqual(host.result, reply.result);
            const decoded = [];
            for (const n of native) {
                const s = remote.find(r => r.agent === n.agent); assert.ok(s);
                assert.equal(s.url, n.url); assert.deepEqual(s.body, n.body);
                // Actual browser /proxy2 adds its loopback request IP. The
                // server hook uses direct transport here. Compare configured
                // headers exactly and retain this one measured route fact.
                const forwarded = n.headers.find(([k]) => k === 'x-forwarded-for');
                if (forwarded) assert.equal(forwarded[1], '::ffff:127.0.0.1');
                const hostHeader = n.headers.find(([k]) => k === 'host');
                if (hostHeader) assert.equal(hostHeader[1], new URL(n.url).host);
                const lengthHeader = n.headers.find(([k]) => k === 'content-length');
                if (lengthHeader) assert.equal(Number(lengthHeader[1]), Buffer.byteLength(JSON.stringify(n.body)));
                assert.equal(s.headers.find(([k]) => k === 'x-forwarded-for'), undefined);
                assert.deepEqual(s.headers, n.headers.filter(([k]) => !['x-forwarded-for', 'host', 'content-length'].includes(k)));
                const encoded = pdfData(n.body);
                if (mode === 'off') {
                    assert.equal(encoded, undefined);
                    const system = n.body.system ?? n.body.messages.find(m => m.role === 'system').content;
                    const user = n.body.messages.find(m => m.role === 'user').content;
                    off.set(corpus + ':' + n.agent, { system, user });
                } else {
                    const baseline = off.get(corpus + ':' + n.agent); assert.ok(baseline);
                    const full = mode === 'max' ? '[1 system]\n' + baseline.system + '\n\n[2 user]\n' + baseline.user + '\n\n'
                        : '[2 user]\n' + baseline.user + '\n\n';
                    let expected = full;
                    if (mode === 'quality') { let cut = Math.floor(full.length * 0.8);
                        if (cut > 0 && /[\uD800-\uDBFF]/.test(full[cut - 1])) cut--; expected = full.slice(0, cut); }
                    if (expected.length <= 840) assert.equal(encoded, undefined, 'short-input must retain text');
                    else { assert.ok(encoded, 'PDF-enabled transcript must reach transport as PDF'); decoded.push({ agent: n.agent, ...await validatePdf(encoded, expected) }); }
                }
            }
            results.push({ tag, native, remote, decoded, outputHash: createHash('sha256').update(JSON.stringify(reply.result)).digest('hex') });
            console.log(JSON.stringify({ family, observation, tag, analysis: native.length, pdf: decoded.length }));
        }
    }
    const policy = await frame.evaluate(() => window.__m2.policy), observer = await frame.evaluate(() => window.__m2.observer);
    assert.deepEqual(errors, []); assert.equal(context.serviceWorkers().length, 0); assert.equal(page.workers().length, 0);
    if (observation === 'observed') {
        assert.ok(observer.some(e => e.type === 'attempt'));
        assert.deepEqual(observer.filter(e => e.type === 'create').map(e => e.value).sort(), observer.filter(e => e.type === 'revoke').map(e => e.value).sort());
        assert.equal(observer.filter(e => e.type === 'message').length, 0);
        assert.equal(observer.filter(e => e.type === 'created').length, observer.filter(e => e.type === 'terminate').length);
        assert.equal(observer.filter(e => e.type === 'created').length, observer.filter(e => e.type === 'error').length);
        const prior = JSON.parse(fs.readFileSync(path.join(output, family + '-plain.json')));
        const stable = rows => rows.map(r => ({ tag: r.tag, decoded: [...r.decoded].sort((a, b) => a.agent.localeCompare(b.agent)),
            outputHash: r.outputHash, native: r.native.map(({ at, ...row }) => row).sort((a, b) => a.agent.localeCompare(b.agent)) }));
        assert.deepEqual(stable(results), stable(prior.results), 'observer must preserve final bytes, semantic requests and injection');
    }
    assert.ok(policy.some(e => e.directive === 'worker-src' && e.disposition === 'enforce'));
    let workerReference;
    if (family === 'openai' && observation === 'observed') {
        // Positive observer control: separate unsandboxed loopback realm with
        // minimal API fixture, byte-original MARP and no external network.
        // This is NOT the product v3 host or Send/main/store qualification.
        const blank = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Synthetic Worker reference</title>'); });
        blank.listen(0, '127.0.0.1'); await once(blank, 'listening');
        const referenceOrigin = 'http://127.0.0.1:' + blank.address().port;
        const referenceContext = await browser.newContext();
        try {
            await referenceContext.routeWebSocket('**/*', route => route.close());
            await referenceContext.route('**/*', route => route.request().url() === referenceOrigin + '/' ? route.continue() : route.abort());
            const reference = await referenceContext.newPage(), referenceWorkers = [];
            reference.on('worker', worker => { const row = { closed: false }; referenceWorkers.push(row); worker.on('close', () => { row.closed = true; }); });
            await reference.goto(referenceOrigin);
            const settings = await savedSettings();
            await reference.evaluate(settings => {
                window.__reference = { hook: null, rows: [], workers: [] };
                const WorkerOriginal = Worker;
                window.Worker = new Proxy(WorkerOriginal, { construct(target, args, newTarget) {
                    const worker = Reflect.construct(target, args, newTarget), row = { messages: 0, terminated: false };
                    window.__reference.workers.push(row);
                    worker.addEventListener('message', () => { row.messages++; });
                    const terminate = worker.terminate.bind(worker);
                    worker.terminate = (...args) => { row.terminated = true; return terminate(...args); };
                    return worker;
                } });
                window.Risuai = { apiVersion: '3.0',
                    pluginStorage: { getItem: async () => settings.vault }, getArgument: async key => settings.arguments[key],
                    onUnload: async fn => { window.__reference.dispose = fn; },
                    addRisuReplacer: async (role, fn) => { window.__reference.hook = fn; },
                    registerSetting: async () => {}, registerButton: async () => {},
                    nativeFetch: async (url, options) => {
                        const body = JSON.parse(options.body); window.__reference.rows.push({ url, body });
                        return Response.json({ choices: [{ message: { content: 'Synthetic ' + body.model.replace('fixture-', '') + ' note.' } }] });
                    } };
            }, settings);
            await reference.addScriptTag({ content: source });
            await wait(() => reference.evaluate(() => !!window.__reference.hook));
            const input = [{ role: 'system', content: 'Synthetic setting.' }, { role: 'user', content: corpora.unicode }];
            const value = await reference.evaluate(async input => {
                const result = await window.__reference.hook(input, 'model');
                await window.__reference.dispose(); return { rows: window.__reference.rows, workers: window.__reference.workers, result };
            }, input);
            assert.equal(value.rows.length, 3); assert.equal(value.workers.length, 3);
            assert.ok(value.workers.every(row => row.messages === 1 && row.terminated));
            await wait(() => reference.workers().length === 0 && referenceWorkers.every(row => row.closed));
            const actual = results.find(row => row.tag === 'max-unicode');
            for (const row of value.rows) assert.deepEqual(row.body, actual.native.find(n => n.agent === row.body.model.replace('fixture-', '')).body);
            assert.equal(createHash('sha256').update(JSON.stringify(value.result)).digest('hex'), actual.outputHash);
            workerReference = { distinctRealm: true, minimalApiFixture: true, workerMessages: value.workers.map(r => r.messages),
                workersClosed: referenceWorkers.every(row => row.closed), samePdfRequestsAndInjection: true };
        } finally { await referenceContext.close(); await new Promise(resolve => blank.close(resolve)); }
    }
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, family + '-' + observation + '.json'), JSON.stringify({ family, observation, runtime, results,
        policy, observer, workers, workerReference, errors, oauth: events.filter(e => e.event === 'oauth').length,
        scope: 'actual v3 registered hook and isolated server hook/final analysis transport/PDF; no Send/main/store/device/activation claim' }, null, 2));
    }
} catch (error) {
    fs.writeFileSync(path.join(runtime, 'failure.json'), JSON.stringify({ events, results, errors }, null, 2));
    console.error(runtime, error); process.exitCode = 1;
} finally {
    await browser?.close(); if (server.exitCode === null && server.signalCode === null) { const done = once(server, 'exit'); server.kill('SIGTERM'); await done; }
}
