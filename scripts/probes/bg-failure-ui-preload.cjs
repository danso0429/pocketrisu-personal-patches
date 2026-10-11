'use strict';
// Synthetic transport only. All application owners and callers remain original.
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
if (process.env.G18_UI_PROBE !== '1' || !/g18-ui-(auto|device)-[A-Za-z0-9_-]+$/.test(process.cwd()))
  throw Error('Restricted to the isolated G1.8 UI runtime');
const emit = row => {
  fs.appendFileSync(path.join(process.cwd(), 'transport.jsonl'), JSON.stringify(row) + '\n', { mode: 0o600 });
  process.send?.(row);
};
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  if (typeof args[1] === 'string') args[1] = '127.0.0.1';
  else args.splice(1, 0, '127.0.0.1');
  this.once('listening', () => emit({ event: 'ready', port: this.address().port }));
  return listen.apply(this, args);
};
const held = new Set();
let released = process.env.G18_UI_DEVICE === '1';
process.on('message', message => {
  if (message?.event === 'release') { released = true; for (const release of held) release(); held.clear(); }
});
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
  if (failed) {
    // The hold is a test control, not a production timeout or OS-state assertion.
    await waitForResponse(options.signal, process.env.G18_UI_DEVICE === '1');
    return Response.json({ error: { message: 'G1.8 synthetic failure' } }, { status: 500 });
  }
  return Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: {
    role: 'assistant', content: 'G1.8 정상 응답 확인 완료',
  } }], usage: { prompt_tokens: 2, completion_tokens: 3 } });
};
require('./bg-marp-pdf-transport.cjs').installPdfHttpTransport(globalThis.fetch, emit);
