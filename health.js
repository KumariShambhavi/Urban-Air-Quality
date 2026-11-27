// GET /api/health : self-check. Shows whether the key is set, which models it can use, and how fast the top one answers.
// Never returns the key.
const { getModels } = require('./_models');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(200).json({ keyPresent: false, hint: 'Add GEMINI_API_KEY in Vercel > Settings > Environment Variables, then Redeploy.' });
  const { models, discovered, listStatus } = await getModels(key);
  const model = models[0];
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let result;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 16 } })
    });
    result = { model, status: r.status, ok: r.ok };
  } catch (e) {
    result = { model, status: e.name === 'AbortError' ? 'timeout' : 'network', ok: false };
  } finally { clearTimeout(timer); }
  res.status(200).json({ keyPresent: true, working: result.ok, listStatus, modelsYourKeyCanUse: discovered.slice(0, 8), tested: result, ms: Date.now() - started,
    hint: result.ok ? 'AI is working.' : '400/403 = key invalid or restricted; 429 = free quota used; 404 = model not available to this key; timeout = Google too slow.' });
};
