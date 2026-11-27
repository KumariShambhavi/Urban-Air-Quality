// Loads the real page in jsdom with mocked network. Requires devDependency: jsdom
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

const hourly = () => { const time = [], us_aqi = []; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { time.push(`2026-12-${String(1 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`); us_aqi.push(h < 9 || h > 18 ? 230 : 130); } return { time, us_aqi }; };
let chatMode = 'ok', chatCalls = 0;
const J = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
function mockFetch(url) {
  url = String(url);
  if (url.includes('air-quality-api')) { const n = url.match(/latitude=([^&]+)/)[1].split(',').length; return n > 1 ? J(Array.from({ length: n }, (_, i) => ({ current: { us_aqi: 90 + i * 15 } }))) : J({ current: { time: '2026-12-01T14:00', us_aqi: 178, pm2_5: 96, pm10: 150, nitrogen_dioxide: 40, ozone: 30 }, hourly: hourly() }); }
  if (url.includes('geocoding')) return J({ results: [{ name: 'Patna <b>x</b>', admin1: 'Bihar', country: 'India', latitude: 25.6, longitude: 85.1 }] });
  if (url.includes('/api/chat')) { chatCalls++; return chatMode === 'fail' ? Promise.resolve({ ok: false }) : J({ reply: '- **Stay in**\n- <img src=x onerror=alert(1)>' }); }
  return Promise.reject(new Error('unmocked ' + url));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let w, d; const $ = s => d.querySelector(s);

test.before(async () => {
  w = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/', pretendToBeVisual: true, beforeParse(win) { win.fetch = mockFetch; win.AbortSignal = AbortSignal; win.HTMLElement.prototype.scrollIntoView = () => {}; } }).window;
  d = w.document; await wait(300);
});
test.after(() => w.close());

test('loads a default city immediately so the page is never empty', () => assert.equal($('#aqi').textContent, '178'));
test('shows live city ranking on load', () => assert.ok($('#lb').children.length >= 10));
test('loads AQI, 24h chart and 7-day outlook for a city', async () => {
  $('#quick button').click(); await wait(400);
  assert.equal($('#aqi').textContent, '178');
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
