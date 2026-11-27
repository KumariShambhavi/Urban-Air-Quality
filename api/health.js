// GET /api/health : self-check. Shows whether the key is set and which Gemini models respond. Never returns the key.
const { getModels } = require('./_models');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(200).json({ keyPresent: false, hint: 'Add GEMINI_API_KEY in Vercel > Settings > Environment Variables, then Redeploy.' });
  const { models, discovered, listStatus } = await getModels(key);
  const results = [];
  for (const model of models.slice(0, 4)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 16 } })
      });
      results.push({ model, status: r.status, ok: r.ok });
      if (r.ok) break;
    } catch (e) {
      results.push({ model, status: e.name === 'AbortError' ? 'timeout' : 'network', ok: false });
    } finally { clearTimeout(timer); }
  }
  const working = results.some(r => r.ok);
  res.status(200).json({ keyPresent: true, working, listStatus, modelsYourKeyCanUse: discovered.slice(0, 8), results,
    hint: working ? 'AI is working.' : '400/403 = key invalid or restricted; 429 = free quota used; 404 = model not available to this key; listStatus 400/403 = key rejected.' });
};
