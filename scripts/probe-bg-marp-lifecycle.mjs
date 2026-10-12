// Actual UI/owners with an unchanged original script and synthetic upstreams.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createMarpHarness, requests, prior, fullAnswer } from './probes/g110-marp-harness.mjs';

const [targetArg, dependenciesArg, fixtureArg, originalArg, outputArg] = process.argv.slice(2);
const scenario = process.argv.find(value => value.startsWith('--case='))?.slice('--case='.length) || 'queue-edit';
assert.ok(['queue-edit', 'stop-analysis', 'stop-main', 'stop-main-nonstream', 'stop-analysis-queued', 'restart-analysis', 'restart-main', 'module-binding', 'pagefold-cas', 'pagefold-settlement'].includes(scenario), 'Only implemented lifecycle cases may run');
const args = [targetArg, dependenciesArg, fixtureArg, originalArg, outputArg].map(value => path.resolve(value));
const [target, dependencies, fixture, original, output] = args;
const option = key => process.argv.find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
const c = await createMarpHarness({ target, dependencies, fixture, original, output, scenario,
    pagefoldSource: option('pagefold-source'), fontSource: option('font-source') });
const editNotice = '응답은 저장했지만, 조립 이후 수정한 내용은 이번 생성에 반영되지 않았어요. 자동 재생성하지 않았어요.';
const immediateNotice = '생성 준비가 시작된 뒤 대화가 수정됐어요. 저장된 답변에는 그 수정이 반영되지 않았으며, 수정 내용은 유지했어요.';

function validateOperation(requestKey, main) {
    const analyses = c.events.filter(row => row.event === 'analysis' && row.requestKey === requestKey && row.epoch === main.epoch);
    assert.deepEqual(analyses.map(row => row.model).sort(), [...c.expectedModels].sort());
    const prompt = JSON.stringify(main.messages);
    assert.equal(prompt.match(/<!--MARP:v1:begin-->/g)?.length, 1);
    const notes = [...prompt.matchAll(/Synthetic\s+note\s+([a-zA-Z0-9_-]+)\s+\[epoch:([0-9]+)\s+request:(G110_REQUEST_[A-Z0-9_]+)\s+analysis:([0-9]+)\]/g)]
        .map(match => ({ model: match[1], epoch: Number(match[2]), requestKey: match[3], id: Number(match[4]) })).sort((a, b) => a.id - b.id);
    assert.deepEqual(notes, analyses.map(row => ({ model: row.model, epoch: row.epoch, requestKey: row.requestKey, id: row.id })).sort((a, b) => a.id - b.id));
    return analyses;
}

async function queueEdit() {
    const first = await c.send(requests[0]);
    await c.wait(() => c.events.some(row => row.event === 'analysis-held' && row.requestKey === requests[0]), 'first analysis outstanding');
    assert.equal(c.events.filter(row => row.event === 'main').length, 0);
    const row = c.page.locator('[data-chat-id="' + prior.id + '"]');
    await row.scrollIntoViewIfNeeded();
    await row.locator('.button-icon-edit').click();
    await row.locator('textarea').fill(prior.after);
    await row.locator('.button-icon-edit').click();
    await c.wait(async () => (await c.readChat()).chat.message.find(message => message.chatId === prior.id)?.data === prior.after,
        'actual UI edit durable before release');
    await c.wait(async () => await c.page.locator('textarea').inputValue() === '', 'first draft clear');
    const second = await c.send(requests[1]);
    const pending = c.rows('internal/server-chat-input/v1/');
    assert.equal(pending.length, 2);
    assert.equal(pending.find(record => record.operationId === second).inputReceipt, null, 'queued input cannot attach before predecessor');
    assert.equal((await c.readChat()).chat.message.some(message => message.data === requests[1]), false);
    c.server.send({ event: 'release-analysis' });
    await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[0]), 'N main');
    const main1 = c.events.find(event => event.event === 'main' && event.requestKey === requests[0]);
    assert.ok(main1.beforeEdit && !main1.afterEdit);
    const firstAnalyses = validateOperation(requests[0], main1);
    assert.ok(firstAnalyses.every(event => event.beforeEdit && !event.afterEdit), 'N analysis snapshot is pre-edit');
    c.server.send({ event: 'release', call: main1.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(message => message.data === fullAnswer(main1.call)), 'N canonical committed answer');
    const firstCanonical = await c.readChat();
    assert.equal(firstCanonical.chat.message.find(message => message.chatId === prior.id).data, prior.after);
    await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[1]), 'N+1 main');
    const main2 = c.events.find(event => event.event === 'main' && event.requestKey === requests[1]);
    const secondAnalyses = validateOperation(requests[1], main2);
    assert.ok(main2.afterEdit && !main2.beforeEdit && main2.priorAnswerComplete);
    assert.ok(secondAnalyses.every(event => event.afterEdit && !event.beforeEdit && event.priorAnswerComplete), 'N+1 sees edit and completed N answer');
    const committed = c.events.find(event => event.event === 'commit-notified' && event.operationId === first);
    assert.ok(committed && secondAnalyses.every(event => event.receivedAt > committed.receivedAt), 'N+1 begins after canonical commit notification');
    c.server.send({ event: 'release', call: main2.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(message => message.data === fullAnswer(main2.call)), 'N+1 canonical answer');
    await c.page.getByText(editNotice, { exact: true }).waitFor();
    const notices = c.rows('internal/bg-notifications/v3/').filter(record => record.event.code === 'chat_edit_unreflected');
    assert.equal(notices.length, 1); assert.equal(notices[0].event.operationId, first);
    await c.wait(() => c.rows('internal/bg-notifications/v3/').filter(record => record.event.code === 'chat_edit_unreflected')
        .every(record => record.deliveredAt !== null), 'edit notice ACK');
    const observed = await c.page.evaluate(() => window.__g110Toasts);
    assert.equal(observed.filter(text => text === editNotice).length, 1);
    assert.equal(observed.filter(text => text === immediateNotice).length, 1);
    const beforeReturn = await c.readChat();
    const counts = { analysis: c.events.filter(event => event.event === 'analysis').length, main: c.events.filter(event => event.event === 'main').length };
    const state = await c.browserContext.storageState();
    const closure = await c.killBrowser();
    await c.open(state);
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'returned input markers settled');
    await c.page.waitForTimeout(1500);
    const returned = await c.readChat();
    assert.deepEqual(returned.chat, beforeReturn.chat); assert.equal(returned.revision, beforeReturn.revision);
    assert.equal(c.events.filter(event => event.event === 'analysis').length, counts.analysis);
    assert.equal(c.events.filter(event => event.event === 'main').length, counts.main);
    assert.equal((await c.page.evaluate(() => window.__g110Toasts)).filter(text => text === editNotice || text === immediateNotice).length, 0);
    await c.send(requests[2]);
    await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[2]), 'healthy successor');
    const main3 = c.events.find(event => event.event === 'main' && event.requestKey === requests[2]);
    validateOperation(requests[2], main3);
    c.server.send({ event: 'release', call: main3.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(message => message.data === fullAnswer(main3.call)), 'healthy successor stored');
    const final = await c.readChat();
    assert.deepEqual(final.chat.message.slice(0, beforeReturn.chat.message.length), beforeReturn.chat.message);
    await c.wait(async () => (await c.readRoot()).statics.messages === c.initialStatistics + 3, 'three durable answer statistics');
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'healthy successor delivery settled');
    assert.equal((await c.readRoot()).statics.messages, c.initialStatistics + 3);
    const commits = c.rows('internal/server-chat-commit/v1/');
    assert.equal(commits.length, 3);
    assert.ok(commits.every(record => record.canonicalWrite.effects.stats.status === 'committed'));
    assert.deepEqual(c.events.filter(event => event.event === 'host').map(event => event.operationId), c.admissions.map(admission => admission.operationId));
    assert.deepEqual(c.accepted, c.admissions.map(admission => admission.operationId));
    assert.equal(c.events.filter(event => event.event === 'session-create').length, 3);
    assert.ok(c.events.filter(event => event.event === 'session-create').every(event => event.sourceHash === c.originalHash));
    return { first, second, closure, firstCanonical, beforeReturn, returned, final, observed, statistics: c.initialStatistics + 3,
        modelsPerOperation: c.expectedModels, noRedisplay: true, prefixPreserved: true };
}

async function stopAndReturn() {
    const analysisStop = scenario.startsWith('stop-analysis');
    const queued = scenario.endsWith('-queued');
    const operationId = await c.send(requests[0]);
    if (analysisStop) {
        await c.wait(() => c.events.some(event => event.event === 'analysis-held' && event.requestKey === requests[0]), 'analysis outstanding before Stop');
        assert.equal(c.events.filter(event => event.event === 'main').length, 0);
    } else {
        if (scenario === 'stop-main-nonstream') {
            await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[0]), 'nonstream main outstanding before Stop');
            const preview = await c.preview();
            assert.equal(preview.streaming, false); assert.equal(preview.answerReady, false);
            assert.equal(c.events.find(event => event.event === 'main').streaming, false);
        } else await c.wait(async () => (await c.preview()).text?.includes('G1.9 partial 1'), 'main outstanding before Stop');
    }
    let queuedOperationId = null;
    if (queued) queuedOperationId = await c.send(requests[1]);
    let deleteResponseHeld = false;
    if (queued) await c.page.route('**/api/bg-orchestrate/*', async route => {
        if (route.request().method() !== 'DELETE') return route.continue();
        const response = await route.fetch();
        deleteResponseHeld = true;
        await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[1]), 'B starts before A DELETE reply');
        await route.fulfill({ response });
    });
    const stop = c.page.getByRole('button', { name: '생성 중지', exact: true });
    await stop.waitFor({ state: 'visible' });
    // click re-resolves the unique visible control after any admission render.
    // A separate count immediately after waitFor can sample a transient remount.
    await stop.click();
    await c.wait(() => c.events.some(event => event.event === (analysisStop ? 'analysis-aborted' : 'aborted')), 'Stop reaches current controller');
    if (analysisStop) assert.equal(c.events.filter(event => event.event === 'main' && event.requestKey === requests[0]).length, 0, 'Aborted analysis cannot fall through to main');
    if (queued) {
        await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[1]), 'queued successor survives earlier Stop');
        const main = c.events.find(event => event.event === 'main' && event.requestKey === requests[1]);
        validateOperation(requests[1], main);
        assert.equal(JSON.stringify(main.messages).includes('request:' + requests[0] + ' analysis:'), false);
        assert.equal(c.cancellations.length, 1);
        assert.ok(deleteResponseHeld, 'actual DELETE response held until successor main');
        await c.wait(async () => await stop.isVisible() && await stop.isEnabled()
            && await stop.innerText() === '생성 중지', 'successor Stop survives old reply');
        c.server.send({ event: 'release', call: main.call });
        await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === fullAnswer(main.call)), 'queued successor canonical');
    }
    await c.wait(async () => !(await c.preview()).active, 'cancelled preview inactive');
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'cancelled input marker settles');
    const before = await c.readChat();
    assert.equal(before.chat.message.filter(row => row.role === 'char').length, queued ? 1 : 0, 'Only the queued successor may save an answer');
    assert.equal(before.chat.message.filter(row => row.role === 'user' && row.data === requests[0]).length, 1);
    assert.equal(c.cancellations.length, 1); assert.ok(c.cancellations[0].endsWith('/' + operationId));
    await c.wait(async () => await stop.count() === 0, 'confirmed cancelled/finished control disappears');
    assert.equal((await c.page.evaluate(() => window.__g110Toasts)).some(text => text.includes('생성 중지 요청을 확인하지 못했어요')), false);
    const counts = { analysis: c.events.filter(event => event.event === 'analysis').length, main: c.events.filter(event => event.event === 'main').length };
    const state = await c.browserContext.storageState(); const closure = await c.killBrowser(); await c.open(state);
    await c.page.waitForTimeout(1000);
    const returned = await c.readChat(); assert.deepEqual(returned.chat, before.chat); assert.equal(returned.revision, before.revision);
    assert.equal(c.events.filter(event => event.event === 'analysis').length, counts.analysis);
    assert.equal(c.events.filter(event => event.event === 'main').length, counts.main);
    await c.send(requests[2]);
    await c.wait(() => c.events.some(event => event.event === 'main' && event.requestKey === requests[2]), 'healthy request after cancelled cold return');
    const main = c.events.find(event => event.event === 'main' && event.requestKey === requests[2]); validateOperation(requests[2], main);
    c.server.send({ event: 'release', call: main.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === fullAnswer(main.call)), 'healthy successor canonical');
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'healthy successor marker settles');
    const final = await c.readChat(); assert.deepEqual(final.chat.message.slice(0, before.chat.message.length), before.chat.message);
    assert.equal(final.chat.message.filter(row => row.role === 'char').length, queued ? 2 : 1);
    if (analysisStop) assert.equal(c.events.filter(event => event.event === 'main' && event.requestKey === requests[0]).length, 0,
        'cancelled analysis never falls through to main, including after return and successor');
    return { operationId, queuedOperationId, before, returned, final, closure, countsBeforeReturn: counts, healthySuccessor: true };
}

async function restartAndReturn() {
    const operationId = await c.send(requests[0]);
    if (scenario === 'restart-analysis') {
        await c.wait(() => c.events.some(event => event.event === 'analysis-held' && event.requestKey === requests[0]), 'analysis before owned server crash');
        assert.equal(c.events.filter(event => event.event === 'main').length, 0);
    } else await c.wait(async () => (await c.preview()).text?.includes('G1.9 partial 1'), 'main before owned server crash');
    const before = await c.readChat();
    assert.equal(before.chat.message.filter(row => row.role === 'user' && row.data === requests[0]).length, 1);
    assert.equal(before.chat.message.filter(row => row.role === 'char').length, 0);
    const browserState = await c.browserContext.storageState();
    const browserClosure = await c.killBrowser(); const serverClosure = await c.crashServer();
    await c.startServer(); await c.authenticate();
    const interrupted = () => c.rows('internal/bg-notifications/v3/').filter(row => row.event.operationId === operationId
        && row.event.code === 'operation_interrupted');
    await c.wait(() => interrupted().length === 1, 'restart interruption durable before browser');
    assert.equal(interrupted()[0].event.reason, 'before_result');
    assert.equal(c.events.filter(event => event.epoch === 2 && ['analysis', 'main', 'host', 'session-create'].includes(event.event)).length, 0,
        'volatile context loss cannot replay provider or original host on restart');
    const recovered = await c.readChat(); assert.deepEqual(recovered.chat.message, before.chat.message);
    await c.open(browserState);
    const notice = '서버 요청의 실행 문맥이 사라졌어요. 저장된 원문이나 결과가 있다면 확인해 주세요. 자동 재실행하지 않았어요.';
    await c.page.getByText(notice, { exact: true }).waitFor();
    await c.wait(() => interrupted().every(row => row.deliveredAt !== null), 'interruption notice ACK');
    await c.page.getByText('생성 상태 미확인: 재전송 전 채팅을 확인해야 함', { exact: true }).waitFor();
    assert.ok(await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))),
        'noncommitted unknown keeps proof/fence rather than being automatically settled');
    const returned = await c.readChat(); assert.deepEqual(returned.chat.message, before.chat.message);
    assert.equal((await c.preview()).active, false);
    assert.equal(c.events.filter(event => event.epoch === 2 && ['analysis', 'main'].includes(event.event)).length, 0);
    assert.equal((await c.page.evaluate(() => window.__g110Toasts)).filter(text => text === notice).length, 1);
    const admissionsBefore = c.admissions.length;
    await c.page.locator('textarea').fill(requests[2]);
    await c.page.getByRole('button', { name: 'Send', exact: true }).click();
    await c.page.waitForTimeout(1000);
    assert.equal(c.admissions.length, admissionsBefore, 'unknown fence prevents a new same-chat admission');
    assert.equal(await c.page.locator('textarea').inputValue(), requests[2], 'blocked draft preserved');
    const state = await c.browserContext.storageState(); await c.killBrowser(); await c.open(state);
    await c.page.waitForTimeout(1000);
    assert.equal((await c.page.evaluate(() => window.__g110Toasts)).filter(text => text === notice).length, 0);
    await c.page.getByText('생성 상태 미확인: 재전송 전 채팅을 확인해야 함', { exact: true }).waitFor();
    assert.ok(await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))));
    const final = await c.readChat(); assert.deepEqual(final.chat.message, before.chat.message);
    assert.equal(final.chat.message.filter(row => row.role === 'char').length, 0);
    assert.equal(c.rows('internal/server-chat-commit/v1/').length, 0);
    assert.equal(c.events.filter(event => event.epoch === 2 && ['analysis', 'main', 'host', 'session-create'].includes(event.event)).length, 0);
    return { operationId, before, recovered, returned, final, browserClosure, serverClosure, interruption: interrupted(),
        unknownFenceRetained: true, healthySuccessor: false, noRedisplay: true };
}

async function moduleAndReturn() {
    const validateSequence = (index, requestKey, main) => {
        const host = c.events.filter(event => event.event === 'host')[index];
        const helper = c.events.filter(event => event.event === 'module')[index];
        const analyses = validateOperation(requestKey, main);
        assert.equal(host.operationId, c.admissions[index].operationId);
        assert.ok(host.receivedAt < helper.receivedAt && analyses.every(event => helper.receivedAt < event.receivedAt
            && event.receivedAt < main.receivedAt), 'same parent clock: host then module then all analysis then main');
    };
    await c.send(requests[0]);
    await c.wait(() => c.events.some(event => event.event === 'main'), 'main after module input helper');
    const main = c.events.find(event => event.event === 'main'); validateSequence(0, requests[0], main);
    assert.ok(JSON.stringify(main.messages).includes('G110_MODULE_RESULT'), 'module effect reaches native main prompt');
    assert.equal(c.events.filter(event => event.event === 'module').length, 1);
    const state = await c.browserContext.storageState(); const closure = await c.killBrowser();
    c.server.send({ event: 'release', call: main.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === fullAnswer(main.call)), 'module/preset answer committed without browser');
    const beforeReturn = await c.readChat(); assert.equal(beforeReturn.chat.scriptstate.$moduleResult, 'G110_MODULE_RESULT'); await c.open(state);
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'module input delivery settled');
    const returned = await c.readChat(); assert.deepEqual(returned.chat, beforeReturn.chat); assert.equal(returned.revision, beforeReturn.revision);
    assert.equal(c.events.filter(event => event.event === 'module').length, 1);
    assert.equal(c.events.filter(event => event.event === 'main').length, 1);
    assert.equal(c.events.filter(event => event.event === 'analysis').length, 3);
    await c.send(requests[2]); await c.wait(() => c.events.filter(event => event.event === 'main').length === 2, 'healthy module successor');
    const next = c.events.filter(event => event.event === 'main')[1]; validateSequence(1, requests[2], next);
    assert.ok(JSON.stringify(next.messages).includes('G110_MODULE_RESULT'));
    c.server.send({ event: 'release', call: next.call });
    await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === fullAnswer(next.call)), 'module successor stored');
    const final = await c.readChat(); assert.deepEqual(final.chat.message.slice(0, beforeReturn.chat.message.length), beforeReturn.chat.message);
    assert.equal(final.chat.scriptstate.$moduleResult, 'G110_MODULE_RESULT');
    assert.equal(c.events.filter(event => event.event === 'module').length, 2);
    assert.equal(c.events.filter(event => event.event === 'analysis').length, 6);
    assert.equal(c.rows('internal/server-chat-commit/v1/').length, 2);
    return { closure, beforeReturn, returned, final, moduleCalls: 2, healthySuccessor: true };
}

async function pagefoldWarningsAndReturn() {
    const operationId = await c.send(requests[0]);
    const state = await c.browserContext.storageState(); const closure = await c.killBrowser();
    await c.wait(() => c.events.some(event => event.event === 'pagefold-statistics-held'), 'original fire-and-forget statistics read outstanding');
    const key = 'cache/plugin-storage/' + Buffer.from('pagefold.stats.v1').toString('base64url') + '.json';
    const write = await fetch(c.origin + '/api/write', { method: 'POST', headers: { ...c.authHeaders,
        'content-type': 'application/octet-stream', 'file-path': Buffer.from(key).toString('hex') },
        body: Buffer.from(JSON.stringify({ version: 1, total: { requests: 2, successes: 2 }, daily: {}, routes: {}, recent: [] })) });
    assert.equal(write.status, 200, await write.clone().text());
    const suffix = scenario === 'pagefold-cas' ? ':local-conflict' : ':settlement-budget';
    if (scenario === 'pagefold-settlement') await c.wait(() => c.events.some(event => event.event === 'host-notice' && event.phase === 'provider'
        && event.eventKey.endsWith(suffix)), 'mandatory original-provider settlement warning');
    c.server.send({ event: 'release-pagefold-statistics' });
    const notices = () => c.rows('internal/bg-notifications/v1/').filter(row => row.event.operationId === operationId);
    await c.wait(() => notices().some(row => row.event.eventKey.endsWith(suffix)), 'mandatory original statistics warning');
    await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === 'G110_PAGEFOLD_ANSWER_1'), 'original provider answer canonical before browser return');
    const validatePdf = (requestKey, main) => {
        assert.equal(main.requestKey, requestKey);
        assert.equal(main.messages[0].content.match(/<!--MARP:v1:end-->/g)?.length, 1, 'PDF has the complete analysis marker');
        const withoutNotes = main.messages[0].content.replace(/<!--MARP:v1:begin-->[\s\S]*?<!--MARP:v1:end-->/g, '');
        assert.equal(withoutNotes.match(/Synthetic\s+note/g), null, 'analysis notes actually removed before user-input check');
        assert.ok(withoutNotes.includes(requestKey), 'current input retained outside MARP notes');
        validateOperation(requestKey, main);
    };
    const first = c.events.find(event => event.event === 'pagefold-main'); validatePdf(requests[0], first);
    assert.equal(c.rows(key)[0].total.requests, 2, 'competing statistics retained');
    const beforeReturn = await c.readChat(); await c.open(state);
    const expectedWarnings = notices().filter(row => row.event.eventKey.endsWith(suffix));
    assert.equal(expectedWarnings.length, 1);
    const warningTexts = [];
    for (const row of expectedWarnings) {
        const event = row.event;
        const text = `${event.pluginName} (${event.pluginVersion}): ` + (event.code === 'plugin_message' ? event.message
            : '플러그인의 추가 처리 대기 한도에 도달했어요. 일부 처리가 끝나지 않았을 수 있으니 응답과 저장 상태를 확인해 주세요.');
        warningTexts.push(text);
        await c.wait(async () => (await c.page.evaluate(() => window.__g110Toasts)).includes(text), 'actual visible original-provider warning');
    }
    await c.wait(() => expectedWarnings.every(row => {
        const current = notices().find(current => current.id === row.id);
        return current && Number.isSafeInteger(current.deliveredAt) && current.deliveredAt > 0;
    }), 'provider warnings ACK');
    await c.wait(async () => !await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v3:'))), 'PageFold input marker settled');
    const returned = await c.readChat(); assert.deepEqual(returned.chat, beforeReturn.chat); assert.equal(returned.revision, beforeReturn.revision);
    assert.equal(c.events.filter(event => event.event === 'pagefold-main').length, 1);
    const returnState = await c.browserContext.storageState(); await c.killBrowser(); await c.open(returnState); await c.page.waitForTimeout(1000);
    assert.equal((await c.page.evaluate(() => window.__g110Toasts)).some(text => warningTexts.includes(text)), false);
    await c.send(requests[2]);
    await c.wait(async () => (await c.readChat()).chat.message.some(row => row.data === 'G110_PAGEFOLD_ANSWER_2'), 'healthy PageFold successor');
    const next = c.events.filter(event => event.event === 'pagefold-main')[1]; validatePdf(requests[2], next);
    const final = await c.readChat(); assert.deepEqual(final.chat.message.slice(0, beforeReturn.chat.message.length), beforeReturn.chat.message);
    assert.equal(c.rows(key)[0].total.requests, 3, 'only healthy successor increments retained statistics');
    assert.equal(c.events.filter(event => event.event === 'main').length, 0);
    assert.equal(c.events.filter(event => event.event === 'pagefold-main').length, 2);
    assert.equal(c.events.filter(event => event.event === 'analysis').length, 6);
    assert.equal(c.rows('internal/server-chat-commit/v1/').length, 2);
    assert.deepEqual(c.events.filter(event => event.event === 'session-create').map(event => event.sourceHash).sort(),
        [c.originalHash, c.originalHash, c.pagefoldHash, c.pagefoldHash].sort());
    return { operationId, closure, beforeReturn, returned, final, expectedWarnings, statistics: 3, healthySuccessor: true };
}

try {
    const result = await (scenario === 'queue-edit' ? queueEdit() : scenario === 'module-binding' ? moduleAndReturn()
        : scenario.startsWith('pagefold-') ? pagefoldWarningsAndReturn()
        : scenario.startsWith('restart-') ? restartAndReturn() : stopAndReturn());
    await Promise.all(c.saveObservers);
    assert.deepEqual(c.pageErrors, []); assert.equal(c.cancellations.length, ['queue-edit', 'module-binding'].includes(scenario) || scenario.startsWith('restart-') || scenario.startsWith('pagefold-') ? 0 : 1); assert.equal(c.browserHTTPAnalysis, 0);
    assert.equal(c.browserHTTPModuleOrPagefold, 0, 'module and original provider requests must be server-owned');
    for (const row of c.saves.filter(row => row.status >= 400)) {
        assert.equal(row.status, 409, 'only the existing root CAS retry is permitted');
        assert.equal(row.pathname, '/api/patch');
        const body = JSON.parse(row.body);
        assert.equal(body.error, 'Hash mismatch - data out of sync');
        assert.ok(typeof body.currentEtag === 'string' && body.currentEtag.length > 0);
    }
    assert.equal(c.consoleErrors.some(text => /save file is corrupted|Server rejected an invalid database update|server statistic count is invalid/.test(text)), false);
    assert.equal(c.events.filter(row => row.event === 'validation-error').length, 0);
    const hostNotices = c.events.filter(row => row.event === 'host-notice');
    if (scenario.startsWith('pagefold-')) {
        assert.equal(hostNotices.length, 1);
        const suffix = scenario === 'pagefold-cas' ? ':local-conflict' : ':settlement-budget';
        assert.ok(hostNotices.every(row => row.phase === 'provider'
            && row.eventKey.endsWith(suffix)));
    } else assert.equal(hostNotices.length, 0);
    if (scenario === 'queue-edit') assert.equal(c.events.filter(row => ['analysis-aborted', 'aborted'].includes(row.event)).length, 0);
    fs.writeFileSync(output, JSON.stringify({ passed: true, scenario, runtime: c.runtime, result, events: c.events, admissions: c.admissions,
        accepted: c.accepted, saves: c.saves, pageErrors: c.pageErrors, consoleErrors: c.consoleErrors }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ passed: true, scenario, analysis: c.events.filter(row => row.event === 'analysis').length,
        main: c.events.filter(row => row.event === 'main').length,
        pagefoldMain: c.events.filter(row => row.event === 'pagefold-main').length,
        healthySuccessor: result.healthySuccessor ?? true,
        ...(scenario.startsWith('restart-') ? { unknownFenceRetained: result.unknownFenceRetained } : {}) }));
} catch (error) {
    await Promise.all(c.saveObservers);
    fs.writeFileSync(output + '.failed.json', JSON.stringify({ passed: false, scenario, runtime: c.runtime, error: String(error),
        events: c.events, admissions: c.admissions, accepted: c.accepted, pageErrors: c.pageErrors, saves: c.saves,
        body: c.page && !c.page.isClosed() ? await c.page.locator('body').innerText().catch(() => '') : '',
        final: await c.readChat().catch(() => null) }, null, 2), { flag: 'wx', mode: 0o600 });
    throw error;
} finally { await c.close(); }
