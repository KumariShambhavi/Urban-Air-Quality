// Finds which Gemini models THIS API key can use, so we never depend on a hard-coded (and possibly retired) name.
// Files starting with "_" are helpers, not public routes, on Vercel.
const FALLBACK = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const BAD = /(live|tts|image|audio|native|embed|robotics|computer|research|agent|antigravity|learnlm|aqa|veo|imagen|lyria|gemma|exp)/;
let cache = { at: 0, list: null };
let lastGood = null;

const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
const score = n => ver(n) * 10 + (/lite/.test(n) ? 0 : 3) - (/preview/.test(n) ? 15 : 0);
const rank = names => names.filter(n => /flash|lite|hydrogen/.test(n) && !BAD.test(n)).sort((a, b) => score(b) - score(a));

async function listModels(key) {
  if (cache.list && Date.now() - cache.at < 600000) return cache.list;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: ctrl.signal });
    if (!r.ok) return { names: [], status: r.status };
    const d = await r.json();
    const names = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
    cache = { at: Date.now(), list: { names, status: 200 } };
    return cache.list;
  } catch { return { names: [], status: 'network' }; }
  finally { clearTimeout(timer); }
}

// Order: GEMINI_MODEL override, last model that worked, best discovered models, static fallbacks.
async function getModels(key) {
  const { names, status } = await listModels(key);
  const discovered = rank(names);
  const all = [process.env.GEMINI_MODEL, lastGood, ...discovered.slice(0, 4), ...FALLBACK].filter(Boolean);
  return { models: [...new Set(all)].slice(0, 6), discovered, listStatus: status };
}

module.exports = { getModels, markGood: m => { lastGood = m; }, _reset: () => { cache = { at: 0, list: null }; lastGood = null; }, rank };
