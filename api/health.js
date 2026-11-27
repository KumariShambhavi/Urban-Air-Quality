// GET /api/health : quick self-check. Shows whether the key is set and whether Google accepts it.
// Never returns the key itself.
const MODELS = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'].filter(Boolean);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(200).json({ keyPresent: false, hint: 'Add GEMINI_API_KEY in Vercel > Settings > Environment Variables, then Redeploy.' });
  const results = [];
  for (const model of MODELS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 5 } })
      });
      results.push({ model, status: r.status, ok: r.ok });
    } catch (e) {
      results.push({ model, status: e.name === 'AbortError' ? 'timeout' : 'network', ok: false });
    } finally { clearTimeout(timer); }
  }
  const anyOk = results.some(r => r.ok);
  res.status(200).json({ keyPresent: true, working: anyOk, results,
    hint: anyOk ? 'AI is working.' : '400/403 = key invalid or restricted; 429 = free quota used; 404 = model not available to this key.' });
};
