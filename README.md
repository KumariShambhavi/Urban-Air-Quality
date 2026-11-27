# Clear Air Daily: Urban Air Quality Assistant

Live AQI for any city, a personalised low-exposure routine, indoor air hacks, a CO2 "switch" calculator,
and an AI chat assistant (Google Gemini, free tier). If the AI is busy or offline, the app falls back to
built-in rules, so the demo never breaks.

- Air data: Open-Meteo Air Quality API (free, no key)
- AI: Gemini via a serverless function (`api/chat.js`), key hidden on the server
- No database, no build step

## 1. Get a free Gemini key (2 minutes)
1. Open https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key** and copy it. Do not share it or commit it to GitHub.

## 2. Push to GitHub
```
git init
git add .
git commit -m "Clear Air Daily"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/clear-air-daily.git
git push -u origin main
```
(Create the empty repo on github.com first.)

## 3. Deploy on Vercel (free)
1. Go to https://vercel.com, sign up with GitHub.
2. **Add New > Project**, import `clear-air-daily`.
3. Leave Framework as **Other**. Open **Environment Variables**, add `GEMINI_API_KEY` = your key.
4. Click **Deploy**. You get a link like `https://clear-air-daily.vercel.app`.

Changed the key later? Vercel > Project > Settings > Environment Variables, then **Redeploy**.

## Run locally (optional)
```
npm i -g vercel
cp .env.example .env     # put your key inside
vercel dev
```
Open http://localhost:3000. (Opening index.html directly works for air data, but the AI needs `vercel dev`.)

## Hackathon checklist
- Test the live link on your phone before the demo.
- Ask 2 or 3 chat questions beforehand to confirm "Basic guidance mode" is NOT showing (that means the key works).
- Free-tier limits are per key; the app limits each visitor to 15 questions/minute. Don't let judges' traffic share a key with other projects.
- Have backup: the offline fallback still answers common questions if Gemini is down.

## Honest notes (say these in the pitch)
- Cigarette equivalence (22 ug/m3 PM2.5 = 1 cigarette/day) is a rule of thumb from Berkeley Earth.
- CO2 factors are approximate averages: car 170, scooter 70, bus 45, metro 30 g per passenger-km.
- Modelled AQI (CAMS) can differ from your nearest ground station; it is guidance, not medical advice.

## Troubleshooting
First, open `YOUR-LINK/api/health` in a browser. It shows whether the key is set and whether Google accepts it.

| Symptom | Fix |
|---|---|
| Chat shows "Basic guidance mode" | Key missing/wrong, or free quota used. Check Vercel > Settings > Environment Variables, then Redeploy. Check Vercel > Logs for `Gemini ... 4xx`. |
| `GEMINI_API_KEY` added but no effect | Env vars apply only to NEW deployments. Click Redeploy. |
| "Could not load live air data" | Open-Meteo is briefly down or blocked on that network. Retry; the page keeps the last good data. |
| Page unstyled / fonts missing | Fine, system fonts are the fallback. |
| 404 on the live link | In Vercel project settings, Output Directory must be `public` (vercel.json sets this). |
| Location button does nothing | Browsers allow it only on https (Vercel gives https) and after you click Allow. |
Never commit `.env` or paste the key in chat/screenshots. If leaked, delete it in AI Studio and make a new one.

## Tests
```
npm install
npm test
```
14 automated tests cover the serverless function (validation, model fallback, rate limiting, input caps) and the UI (live data, plan logic, calculator, XSS escaping, offline fallback).

## Architecture
`public/index.html` (UI + logic) -> Open-Meteo (live air + geocoding, no key) and `api/chat.js` (Vercel function) -> Gemini. The key never reaches the browser.
