'use strict';
// Synthetic transport only. All application owners and callers remain original.
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
if (process.env.G18_UI_PROBE !== '1' || !/g18-ui-(auto|device)-[A-Za-z0-9_-]+$/.test(process.cwd()))
  throw Error('Restricted to the isolated G1.8 UI runtime');
const emit = row => {
  fs.appendFileSync(path.join(process.cwd(), 'transport.jsonl'), JSON.stringify(row) + '\n', { mode: 0o600 });
  if (process.connected) process.send?.(row);
};
const listen = http.Server.prototype.listen;
// Cookies are host-scoped, not port-scoped. Keep a device test on another
// HTTPS port from replacing the production application's session cookie.
if (process.env.G18_UI_COOKIE_NAMESPACE === '1') {
  const cookieName=process.env.G18_UI_COOKIE_NAME||'g18-ui-session';
  if(!['g18-ui-session','g18-edit-session'].includes(cookieName))throw Error('Unexpected synthetic cookie namespace');
  const emitRequest = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event === 'request') {
      const [request, response] = args;
      const isolated = String(request.headers.cookie || '').split(';').map(value => value.trim())
        .find(value => value.startsWith(cookieName+'='));
      request.headers.cookie = isolated ? 'risu-session=' + isolated.slice((cookieName+'=').length) : '';
      const setHeader = response.setHeader;
      response.setHeader = function (name, value) {
        if (String(name).toLowerCase() === 'set-cookie') {
          const rename = cookie => String(cookie).replace(/^risu-session=/, cookieName+'=');
          value = Array.isArray(value) ? value.map(rename) : rename(value);
        }
        return setHeader.call(this, name, value);
      };
    }
    return emitRequest.call(this, event, ...args);
  };
}
http.Server.prototype.listen = function (...args) {
  if (typeof args[1] === 'string') args[1] = '127.0.0.1';
  else args.splice(1, 0, '127.0.0.1');
  this.once('listening', () => emit({ event: 'ready', port: this.address().port }));
  return listen.apply(this, args);
};
const held = new Set();
const heldEdits = new Set();
let released = process.env.G18_UI_DEVICE === '1' || process.env.G18_UI_FAST === '1';
process.on('message', message => {
  const command = message?.data || message;
  if (command?.event === 'release') { released = true; for (const release of held) release(); held.clear(); }
  if (command?.event === 'release-edit') { for (const release of heldEdits) release(); heldEdits.clear(); }
});
function waitForEdit(signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { heldEdits.delete(done); signal?.removeEventListener('abort', aborted); };
    const done = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(signal.reason || Error('Synthetic edit transport aborted')); };
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    heldEdits.add(done);
  });
}
function waitForResponse(signal, device) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); held.delete(done); signal?.removeEventListener('abort', aborted); };
    const done = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(signal.reason || Error('Synthetic transport aborted')); };
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    if (device) timer = setTimeout(done, 15000);
    else if (released) done();
    else held.add(done);
  });
}
globalThis.fetch = async (input, options = {}) => {
  options.signal?.throwIfAborted();
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (!url.startsWith('https://api.openai.com/v1/chat/completions')) {
    emit({ event: 'outbound-denied' }); throw Error('Synthetic runtime denies other outbound requests');
  }
  const body = JSON.parse(typeof options.body === 'string' ? options.body : Buffer.from(options.body).toString());
  if (body.model !== 'gpt-3.5-turbo' || !Array.isArray(body.messages)) throw Error('Unexpected synthetic model');
  const last = body.messages.filter(row => row.role === 'user').at(-1);
  const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content);
  const failed = text?.includes('G1.8 실패 확인');
  const healthy = text?.includes('G1.8 정상 확인');
  if (!failed && !healthy) throw Error('Unexpected synthetic input');
  emit({ event: 'main', failed, model: body.model });
  const edit = !failed && text?.includes('G1.8 정상 확인 D');
  if (edit) {
    const prompt = JSON.stringify(body.messages);
    emit({ event:'edit-held', beforeEdit:prompt.includes('G1.8 편집 전 문장'), afterEdit:prompt.includes('G1.8 편집 후 문장') });
    await waitForEdit(options.signal);
  }
  if (failed) {
    // The hold is a test control, not a production timeout or OS-state assertion.
    await waitForResponse(options.signal, process.env.G18_UI_DEVICE === '1');
    return Response.json({ error: { message: 'G1.8 synthetic failure' } }, { status: 500 });
  }
  return Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: {
    role: 'assistant', content: edit ? 'G1.8 수정 전 문맥 응답 확인 완료' : 'G1.8 정상 응답 확인 완료',
  } }], usage: { prompt_tokens: 2, completion_tokens: 3 } });
};
require('./bg-marp-pdf-transport.cjs').installPdfHttpTransport(globalThis.fetch, emit);
