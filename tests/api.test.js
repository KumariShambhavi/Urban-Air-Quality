// Run: npm test   (uses Node's built-in test runner, no extra deps for this file)
const test = require('node:test');
const { beforeEach } = test;
const models = require('../api/_models.js');
const assert = require('node:assert');
const handler = require('../api/chat.js');

function call(body, { key = 'K', ip = '1.1.1.1', method = 'POST' } = {}) {
  return new Promise(resolve => {
    if (key) process.env.GEMINI_API_KEY = key; else delete process.env.GEMINI_API_KEY;
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve([this.code, o]); } };
    handler({ method, body, headers: { 'x-forwarded-for': ip } }, res);
  });
}
const gemini = text => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
beforeEach(() => models._reset());
const MSG = [{ role: 'user', text: 'hi' }];

test('returns the model reply', async () => {
  global.fetch = async () => gemini('hello');
  const [code, out] = await call({ messages: MSG, context: 'AQI 150' });
  assert.equal(code, 200); assert.equal(out.reply, 'hello');
});
test('rejects non-POST and missing key', async () => {
  assert.equal((await call({}, { method: 'GET' }))[0], 405);
  assert.equal((await call({ messages: MSG }, { key: null }))[0], 503);
});
test('rejects empty input and trims leading model turns', async () => {
  assert.equal((await call({ messages: [] }))[0], 400);
  let sent; global.fetch = async (u, o) => { sent = JSON.parse(o.body); return gemini('ok'); };
  await call({ messages: [{ role: 'model', text: 'x' }, { role: 'user', text: 'y' }] });
  assert.equal(sent.contents[0].role, 'user');
});
test('falls back to the next model on failure', async () => {
  let n = 0; global.fetch = async u => { n++; return u.includes('3.6-flash:') ? { ok: false, status: 404 } : gemini('fallback'); };
  const [code, out] = await call({ messages: MSG });
  assert.equal(code, 200); assert.equal(out.reply, 'fallback'); assert.ok(n >= 3);
});
test('returns 502 when every model fails or is blocked', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
  const bad = await call({ messages: MSG });
  assert.equal(bad[0], 502); assert.ok(Array.isArray(bad[1].detail));
  global.fetch = async () => { throw new Error('net'); };
  assert.equal((await call({ messages: MSG }))[0], 502);
});
test('rate-limits a single visitor', async () => {
  global.fetch = async () => gemini('x'); let last;
  for (let i = 0; i < 17; i++) last = await call({ messages: MSG }, { ip: '9.9.9.9' });
  assert.equal(last[0], 429);
});
test('caps oversized input', async () => {
  let sent; global.fetch = async (u, o) => { sent = JSON.parse(o.body); return gemini('x'); };
  await call({ messages: Array(30).fill({ role: 'user', text: 'a'.repeat(9000) }), context: 'c'.repeat(9000) }, { ip: '7.7.7.7' });
  assert.ok(sent.contents.length <= 8); assert.ok(sent.contents[0].parts[0].text.length <= 1500);
});

test('picks the best model the key can actually use (no hard-coded names)', async () => {
  const used = [];
  global.fetch = async u => {
    if (u.includes('/models?')) return { ok: true, json: async () => ({ models: [
      { name: 'models/gemini-3.9-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.9-flash-live', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.9-embedding', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] } ] }) };
    used.push(u); return gemini('ok');
  };
  const [code] = await call({ messages: MSG });
  assert.equal(code, 200); assert.match(used[0], /gemini-3\.9-flash:generateContent/);
  assert.deepEqual(models.rank(['gemini-3.9-flash-live', 'gemini-2.5-flash', 'gemini-3.9-flash']), ['gemini-3.9-flash', 'gemini-2.5-flash']);
});

test('retries without thinking settings if Google rejects them with 400', async () => {
  const seen = [];
  global.fetch = async (u, o) => {
    if (u.includes('/models?')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    const cfg = JSON.parse(o.body).generationConfig; seen.push(!!cfg.thinkingConfig);
    return cfg.thinkingConfig ? { ok: false, status: 400 } : gemini('worked');
  };
  const [code, out] = await call({ messages: MSG });
  assert.equal(code, 200); assert.equal(out.reply, 'worked'); assert.deepEqual(seen, [true, false]);
});
