'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { generateKeyPairSync, verify } = require('node:crypto');
const [target, sourcePath] = process.argv.slice(2, 4).map(value => path.resolve(value));
const targetRequire = createRequire(path.join(target, 'package.json'));
const { createBgPluginHost } = targetRequire('./server/node/bgPluginHost.cjs');
const script = fs.readFileSync(sourcePath, 'utf8');
const agents = ['worldbuilding', 'plot', 'character'];
const marker = 'SYNTHETIC_PDF_ORACLE';
const input = [{ role: 'system', content: 'Synthetic setting.' },
    { role: 'user', content: (marker + ' A fictional visitor crosses an observatory. ').repeat(40) }];
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const serviceAccount = { client_email: 'synthetic-account@example.invalid', private_key: keyPair.privateKey };
const responseFor = (family, text) => family === 'anthropic' ? { content: [{ type: 'text', text }] }
    : family === 'gemini' || family === 'vertex' ? { candidates: [{ content: { parts: [{ text }] } }] }
        : { choices: [{ message: { content: text } }] };

async function main() {
    // Import the independent PDF parser before the server bundle's browser shims.
    const pdfPath = targetRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await import(pathToFileURL(pdfPath).href);
    process.chdir(fs.mkdtempSync('/tmp/marp-protocol-'));
    await import(pathToFileURL(path.join(target, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href);
    await import(pathToFileURL(path.join(target, 'server/node/bgOrchBundle.mjs')).href);
    const bg = globalThis.__bgOrch;
    const results = [];
    async function validatePdf(value) {
        const bytes = Buffer.from(value, 'base64');
        assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
        assert.match(bytes.toString('latin1'), /startxref\s+\d+\s+%%EOF\s*$/);
        const task = pdf.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true });
        try {
            const document = await task.promise;
            let text = '';
            for (let page = 1; page <= document.numPages; page++) {
                const content = await (await document.getPage(page)).getTextContent();
                text += content.items.map(item => item.str ?? '').join(' ');
            }
            assert.ok(text.includes(marker), 'parsed PDF must contain the synthetic input; excerpt=' + JSON.stringify(text.slice(0, 160)));
            return bytes.length;
        } finally { await task.destroy(); }
    }
    async function run({ family = 'openai', mode = 'off', proxy = false, failure = null, strict = false, extra = null }) {
        const provider = family === 'opencode' ? 'OpenCode' : family;
        const baseUrl = family === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
            : family === 'vertex' ? 'https://synthetic-aiplatform.invalid/v1/projects/synthetic/locations/global/endpoints/openapi'
                : 'https://synthetic.invalid/v1';
        const plugin = { name: 'risu_multiagent', version: '3.0', enabled: true, script, realArg: {} };
        const root = { plugins: [plugin], characters: [], pluginCustomStorage: {
            risu_multiagent_lite_config_vault_v1: { config: { provider, baseUrl,
                apiKey: family === 'vertex' ? JSON.stringify(serviceAccount) : 'synthetic-only', model: 'fixture-default',
                pdfMode: mode, strictMode: strict, extraBodyJson: extra,
                marpConfig: { request_timeout: 10, analysis_timeout: 30 },
                agents: Object.fromEntries(agents.map(name => [name, { enabled: true, model: 'fixture-' + name }])) } },
        } };
        bg.dbmod.getDatabase().usePlainFetch = !proxy;
        const permission = JSON.stringify([plugin.name, 'replacer']);
        const kv = new Map([['cache/plugin-permissions/state.json', JSON.stringify({ given: [permission], denied: [],
            cache: [[permission + '_lastGrantTime', Date.now()]] })]]);
        const notices = [], diagnostics = [], rows = [], faults = [];
        let oauth = 0, proxyCalls = 0, auxiliaryLogs = 0, attempt = 0;
        const directRequests = [];
        const checked = async task => { try { return await task(); } catch (error) {
            if (error.syntheticTransport === true) throw error;
            faults.push({ code: error.code ?? error.name, message: error.message }); throw error;
        } };
        globalThis.fetch = (raw, options = {}) => {
            if (proxy && /^https?:\/\//.test(String(raw))) {
                directRequests.push({ url: String(raw), bytes: Buffer.from(options.body), headers: new Headers(options.headers) });
                return Promise.reject(Error('synthetic direct route failure'));
            }
            return checked(async () => {
            let url = String(raw), headers = new Headers(options.headers);
            const wasProxy = url === '/proxy2';
            if (url === '/api/token/refresh' || url === '/api/test_auth') return Response.json({ status: 'success', token: 'synthetic' });
            // The bundle's console collector flushes asynchronously. It is a
            // distinct control request, not a plugin analysis/model attempt.
            if (url === '/api/logs' || url === '/api/request-logs') {
                assert.ok(Array.isArray(JSON.parse(options.body))); auxiliaryLogs++;
                return Response.json({ ok: true });
            }
            if (url === '/proxy2') {
                proxyCalls++; url = decodeURIComponent(headers.get('risu-url'));
                const forwarded = new Headers(JSON.parse(decodeURIComponent(headers.get('risu-header'))));
                const originalIndex = directRequests.findIndex(row => row.url === url && row.bytes.equals(Buffer.from(options.body)));
                assert.ok(originalIndex >= 0, 'proxy must preserve the exact original binary request');
                const [original] = directRequests.splice(originalIndex, 1);
                assert.deepEqual([...forwarded], [...original.headers]);
                assert.equal(headers.get('content-type'), forwarded.get('content-type'));
                headers = forwarded;
            }
            const bodyText = typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body);
            if (url === 'https://oauth2.googleapis.com/token') {
                oauth++;
                assert.equal(headers.get('content-type'), 'application/x-www-form-urlencoded');
                const form = new URLSearchParams(bodyText), jwt = form.get('assertion').split('.');
                assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
                assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).alg, 'RS256');
                assert.ok(verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), keyPair.publicKey, Buffer.from(jwt[2], 'base64url')));
                const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
                assert.equal(claims.iss, serviceAccount.client_email); assert.equal(claims.aud, url);
                assert.equal(claims.scope, 'https://www.googleapis.com/auth/cloud-platform');
                assert.equal(claims.exp - claims.iat, 3600);
                return Response.json({ access_token: 'synthetic-oauth', expires_in: 3600 });
            }
            const body = JSON.parse(bodyText);
            const nativePdf = (family === 'gemini' || family === 'vertex') && mode !== 'off';
            const model = nativePdf ? decodeURIComponent(url.match(/\/models\/([^/:]+):generateContent$/)?.[1] ?? '') : body.model;
            const agent = agents.find(name => model === 'fixture-' + name);
            assert.ok(agent, 'final request must select a configured analysis agent: ' + JSON.stringify({ family, mode,
                target: url.startsWith('/api/') ? url.split('?')[0] : new URL(url).hostname,
                model: typeof model === 'string' && model.startsWith('fixture-') ? model : '<not synthetic>', keys: Object.keys(body) }));
            assert.equal(headers.get('content-type'), 'application/json');
            assert.equal(options.method, 'POST');
            const expectedUrl = nativePdf ? family === 'gemini'
                ? 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent'
                : baseUrl.replace('/endpoints/openapi', '/publishers/google/models/' + model + ':generateContent')
                : baseUrl + (family === 'anthropic' ? '/messages' : '/chat/completions');
            assert.equal(url, expectedUrl);
            if (family === 'anthropic') {
                assert.equal(headers.get('x-api-key'), 'synthetic-only');
                assert.equal(headers.get('anthropic-version'), '2023-06-01');
                assert.equal(typeof body.system, 'string');
                assert.ok(body.messages.every(message => message.role !== 'system'));
                assert.ok(body.max_tokens > 0);
            } else if (family === 'gemini' && nativePdf) {
                assert.equal(headers.get('x-goog-api-key'), 'synthetic-only');
                assert.equal(headers.get('authorization'), null);
            }
            else assert.equal(headers.get('authorization'), 'Bearer ' + (family === 'vertex' ? 'synthetic-oauth' : 'synthetic-only'));
            const encoded = body.contents?.[0]?.parts?.find(part => part.inlineData)?.inlineData?.data
                ?? body.messages?.flatMap(message => Array.isArray(message.content) ? message.content : [])
                    .map(part => part.file?.file_data?.replace(/^data:application\/pdf;base64,/, '') ?? part.source?.data).find(Boolean);
            const row = { attempt, agent, pdf: Boolean(encoded), format: nativePdf ? 'google' : family === 'anthropic' ? 'anthropic' : 'openai' };
            if (encoded) {
                if (nativePdf) {
                    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'application/pdf');
                    assert.equal(typeof body.generationConfig, 'object');
                } else {
                    const part = body.messages.at(-1).content[0];
                    assert.equal(part.type, family === 'anthropic' ? 'document' : 'file');
                    if (family === 'anthropic') assert.equal(part.source.media_type, 'application/pdf');
                }
                row.pdfBytes = await validatePdf(encoded);
            } else assert.ok(bodyText.includes(marker), 'text transport must preserve the synthetic input');
            rows.push(row);
            const affected = attempt === 0 && (failure?.partial ? agent === 'plot' : Boolean(failure));
            if (affected && failure?.unsupported && encoded) return Response.json({ error: { message: 'PDF document unsupported' } }, { status: failure.status });
            if (affected && !failure?.unsupported) {
                if (failure?.kind === 'network') {
                    if (!wasProxy) directRequests.push({ url, bytes: Buffer.from(options.body), headers });
                    throw Object.assign(Error('synthetic transport refused'), { syntheticTransport: true });
                }
                if (failure?.kind === 'body-error') return new Response(new ReadableStream({ start(controller) {
                    controller.enqueue(new TextEncoder().encode('{"choices":['));
                    queueMicrotask(() => controller.error(Error('synthetic response body interrupted')));
                } }), { headers: { 'content-type': 'application/json', 'content-length': '1000' } });
                if (failure?.kind === 'invalid-json') return new Response('not JSON', { headers: { 'content-type': 'application/json' } });
                if (failure?.kind === 'schema') return Response.json({ unrelated: true });
                if (failure?.kind === 'empty') return Response.json(responseFor(family, ''));
                return Response.json({ error: { message: 'synthetic provider failure' } }, { status: failure.status });
            }
            return Response.json(responseFor(family, 'Synthetic ' + agent + ' note.'));
            });
        };
        const controller = new AbortController();
        const host = await createBgPluginHost({ database: root, getDatabase: () => root, getSelection: () => ({ characterIndex: 0, chatIndex: 0 }),
            hydrate: async value => value, bindings: bg.bgPluginBindings, signal: controller.signal,
            storageOwner: { peekRoot: () => root, getRoot: async () => root, writeRoot: async () => { throw Error('unexpected write'); },
                kvGet: key => kv.get(key), kvSet: (key, value) => kv.set(key, value), kvDel: key => kv.delete(key),
                kvList: prefix => [...kv.keys()].filter(key => key.startsWith(prefix)), transaction: task => task() },
            beforeEffect: () => {}, publishNotification: event => { notices.push(event.code); return { status: 'stored' }; },
            publishDiagnostic: value => diagnostics.push(value), operation: { operationId: 'synthetic-protocol', charId: 'synthetic-character', chatId: 'synthetic-chat' } });
        try {
            assert.equal(bg.bgPluginBindings.registry.replacerbeforeRequest.size, 1);
            const hook = [...bg.bgPluginBindings.registry.replacerbeforeRequest][0];
            for (attempt = 0; attempt < 2; attempt++) {
                const previous = rows.length;
                const messages = await hook(structuredClone(input), 'model');
                assert.deepEqual(faults, [], 'fake endpoint validation failures must not be swallowed into a passing error case');
                const current = rows.slice(previous), text = JSON.stringify(messages);
                const positiveFallback = attempt === 0 && failure?.unsupported;
                const errors = attempt === 0 && failure && !failure.unsupported;
                const expectedAgents = errors ? strict || !failure.partial ? [] : ['worldbuilding', 'character'] : agents;
                assert.equal(current.length, 3 + (positiveFallback ? failure.partial ? 1 : 3 : 0)
                    + (errors && failure.kind === 'network' ? 3 : 0));
                assert.equal((text.match(/<!--MARP:v1:begin-->/g) ?? []).length, expectedAgents.length ? 1 : 0);
                for (const name of agents) assert.equal(text.includes('Synthetic ' + name + ' note.'), expectedAgents.includes(name));
                if (mode === 'off' || extra) assert.ok(current.every(row => !row.pdf));
                else if (positiveFallback) {
                    assert.equal(current.filter(row => row.pdf).length, 3);
                    assert.equal(current.filter(row => !row.pdf).length, failure.partial ? 1 : 3);
                } else assert.ok(current.every(row => row.pdf), 'PDF mode must actually deliver parseable PDF, not silently downgrade');
                assert.deepEqual(notices, []);
            }
            // All fixture agents share one account and a token valid for3600s.
            // Guard this fixture's reuse without claiming all providers share it.
            assert.equal(oauth, family === 'vertex' ? 1 : 0);
            if (proxy) assert.equal(proxyCalls, rows.length + oauth);
            else assert.equal(proxyCalls, failure?.kind === 'network' ? 3 : 0);
            assert.equal(directRequests.length, 0);
            return { family, mode, proxy, failure, strict, extraContent: Boolean(extra), rows, oauth, proxyCalls, auxiliaryLogs, notices, diagnostics };
        } finally { await host.close(); assert.equal(bg.bgPluginBindings.registry.replacerbeforeRequest.size, 0); }
    }
    const cases = ['openai', 'anthropic', 'gemini', 'vertex'].flatMap(family => ['off', 'quality', 'standard', 'max'].map(mode => ({ family, mode })));
    cases.push({ family: 'opencode', mode: 'max' });
    for (const family of ['openai', 'anthropic', 'gemini', 'vertex']) cases.push({ family, mode: 'max', proxy: true });
    for (const status of [400, 415, 422]) cases.push({ mode: 'quality', failure: { unsupported: true, partial: true, status } });
    for (const status of [401, 429, 500]) cases.push({ mode: 'quality', failure: { status } });
    for (const kind of ['invalid-json', 'schema', 'empty', 'body-error']) cases.push({ failure: { kind } });
    cases.push({ mode: 'quality', failure: { kind: 'network' } });
    cases.push({ failure: { partial: true, status: 400 } }, { strict: true, failure: { partial: true, status: 400 } },
        { mode: 'max', extra: JSON.stringify({ messages: [{ role: 'user', content: 'must not replace input' }] }) });
    const selected = process.argv[4] === undefined ? cases : [cases[Number(process.argv[4])]];
    assert.ok(selected.every(Boolean), 'unknown case index');
    for (const value of selected) {
        const result = await run(value); results.push(result);
        console.log(JSON.stringify({ ...result, diagnostics: result.diagnostics.map(row => ({ calls: row.calls, http2xx: row.http2xx, http4xx: row.http4xx })) }));
    }
    console.log(JSON.stringify({ passed: true, cases: results.length,
        scope: 'original script/OS-isolated host/current nativeFetch/fake final transport/PDF.js parser; no Send, browser parity, real provider or activation claim' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
