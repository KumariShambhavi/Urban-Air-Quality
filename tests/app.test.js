// Loads the real page in jsdom with mocked network. Requires devDependency: jsdom
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

const hourly = () => { const time = [], us_aqi = [], pm2_5 = [], pm10 = []; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { time.push(`2026-12-${String(1 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`); const bad = h < 9 || h > 18; us_aqi.push(bad ? 230 : 130); pm2_5.push(bad ? 140 : 70); pm10.push(bad ? 200 : 100); } return { time, us_aqi, pm2_5, pm10 }; };
let chatMode = 'ok', chatCalls = 0, lastChat = null;
const J = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
function mockFetch(url, opts) {
  url = String(url);
  if (url.includes('air-quality-api')) { const n = url.match(/latitude=([^&]+)/)[1].split(',').length; return n > 1 ? J(Array.from({ length: n }, (_, i) => ({ current: { us_aqi: 90 + i * 15, pm2_5: 30 + i * 10, pm10: 60 + i * 10 } }))) : J({ current: { time: '2026-12-01T14:00', us_aqi: 178, pm2_5: 96, pm10: 150, nitrogen_dioxide: 40, ozone: 30 }, hourly: hourly() }); }
  if (url.includes('geocoding')) return J({ results: [{ name: 'Patna <b>x</b>', admin1: 'Bihar', country: 'India', feature_code: 'PPLA', latitude: 25.6, longitude: 85.1 }] });
  if (url.includes('/api/chat')) { chatCalls++; try { lastChat = JSON.parse(opts.body); } catch {} return chatMode === 'fail' ? Promise.resolve({ ok: false }) : J({ reply: '- **Stay in**\n- <img src=x onerror=alert(1)>' }); }
  return Promise.reject(new Error('unmocked ' + url));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let w, d; const $ = s => d.querySelector(s);

test.before(async () => {
  w = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/', pretendToBeVisual: true, beforeParse(win) { win.fetch = mockFetch; win.AbortSignal = AbortSignal; win.HTMLElement.prototype.scrollIntoView = () => {}; } }).window;
  d = w.document; await wait(300);
});
test.after(() => w.close());

test('loads a default city immediately so the page is never empty', () => assert.equal($('#aqi').textContent, '218'));
test('shows live city ranking on load', () => assert.ok($('#lb').children.length >= 10));
test('loads AQI, 24h chart and 7-day outlook for a city', async () => {
  $('#quick button').click(); await wait(400);
  assert.equal($('#aqi').textContent, '218');
  assert.equal($('#strip').children.length, 24);
  assert.equal($('#fc').children.length, 7);
  assert.equal(d.querySelectorAll('.group').length, 3);
});
test('plan adapts to the household profile', () => {
  assert.match($('#plan').textContent, /N95/);
  $('#kids').checked = true; $('#kids').onchange();
  assert.match($('#plan').textContent, /play/);
});
test('switch calculator is correct and tolerates junk', () => {
  assert.equal($('#co2w').textContent, '11.2 kg');
  $('#km').value = 'abc'; $('#km').dispatchEvent(new w.Event('input'));
  assert.equal($('#co2w').textContent, '0.0 kg');
});
test('city names from search are escaped (no XSS)', async () => {
  $('#q').value = 'patna'; $('#go').click(); await wait(200);
  assert.equal($('#results button b'), null);
});
test('AI replies are escaped and sent only once on double click', async () => {
  $('#msg').value = 'hi'; $('#send').click(); $('#msg').value = 'again'; $('#send').click(); await wait(200);
  assert.equal(chatCalls, 1);
  assert.equal([...d.querySelectorAll('.msg.bot')].pop().querySelector('img'), null);
});
test('falls back to built-in guidance when AI is down', async () => {
  chatMode = 'fail'; $('#msg').value = 'which mask?'; $('#send').click(); await wait(200);
  assert.match([...d.querySelectorAll('.msg.bot')].pop().textContent, /N95/);
});

test('assistant fetches live data for another city and offers to switch', async () => {
  chatMode = 'ok'; $('#msg').value = 'How is the air in Patna?'; $('#send').click(); await wait(400);
  assert.match(lastChat.context, /OTHER PLACE ASKED ABOUT: Patna/);
  const last = [...d.querySelectorAll('.msg.bot')].pop();
  assert.match(last.querySelector('button').textContent, /Patna/);
});
test('plain greetings are not treated as city names', async () => {
  $('#msg').value = 'hello'; $('#send').click(); await wait(300);
  assert.doesNotMatch(lastChat.context, /OTHER PLACE/);
});

test('chat renders **bold**, *italic* and numbered lists without stray asterisks', async () => {
  const el = d.createElement('div'); w.eval("window.__md = md");
  const out = w.__md('1. First\n* *Impact:* lower exposure by **40%**');
  assert.doesNotMatch(out, /\*/); assert.match(out, /<i>Impact:<\/i>/); assert.match(out, /<b>40%<\/b>/);
});

test('context never invents household members', async () => {
  $('#kids').checked = false; $('#kids').onchange();
  $('#msg').value = 'Any other tips'; $('#send').click(); await wait(400);
  assert.match(lastChat.context, /Higher-risk household members: NONE/);
  assert.match(lastChat.context, /Exercises outdoors: no/);
});

test('CPCB sub-index maths is exact at breakpoints (PM2.5)', () => {
  const f = v => w.cpcb(v, null).i;
  assert.deepEqual([0, 30, 31, 60, 61, 90, 91, 120, 121, 250, 251].map(f), [0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401]);
  assert.equal(f(82), 173);            // worked example: 99/29*21+101
  assert.equal(f(30.5), 51);           // gap between breakpoints rounds up to next band start
  assert.equal(f(900), 500);           // capped at 500
});
test('CPCB uses the worst of PM2.5 and PM10 and handles missing data', () => {
  assert.equal(w.cpcb(10, 400).dom, 'PM10');
  assert.equal(w.cpcb(96, 150).dom, 'PM2.5');
  assert.equal(w.cpcb(null, 150).i, 134);
  assert.equal(w.cpcb(null, null), null);
  assert.equal(w.cpcb(-5, undefined), null);
});
test('India scale is the default and shows CPCB value with US value alongside', () => {
  assert.equal($('#sIN').getAttribute('aria-pressed'), 'true');
  assert.equal($('#aqi').textContent, '218'); assert.equal($('#cat').textContent, 'Poor');
  assert.match($('#alt').textContent, /US AQI 178/); assert.match($('#alt').textContent, /PM2\.5/);
  assert.match($('#where').textContent, /India AQI/);
});
test('toggle switches hero, chart, outlook, ranking and plan banner to US scale', () => {
  const rowsIN = $('#lb').textContent;
  $('#sUS').click();
  assert.equal($('#aqi').textContent, '178'); assert.match($('#cat').textContent, /Unhealthy/);
  assert.match($('#alt').textContent, /India AQI 218/); assert.match($('#where').textContent, /US AQI/);
  assert.match($('#pbanner').textContent, /US AQI 178/);
  assert.match($('#strip').firstChild.getAttribute('title'), /US AQI/);
  assert.notEqual($('#lb').textContent, rowsIN);
  assert.equal(w.localStorage.getItem('scale'), '"US"');
  $('#sIN').click(); assert.equal($('#aqi').textContent, '218'); assert.match($('#pbanner').textContent, /India AQI 218/);
});
test('assistant context carries both scales and which one the user is viewing', async () => {
  $('#msg').value = 'Any more tips'; $('#send').click(); await wait(400);
  assert.match(lastChat.context, /US AQI now: 178/); assert.match(lastChat.context, /India CPCB AQI: 218 \(Poor\)/);
  assert.match(lastChat.context, /viewing the India \(CPCB\) scale/);
});
