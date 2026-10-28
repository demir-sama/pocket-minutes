// Record a REAL local run (server must be running: `npm start`) into public/replay/session.json.
// The hosted demo replays this file. Nothing in it is synthesized: events, timings, answers and translations all come from the engine.
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4747';
const sample = process.argv[2] ?? 'launch-sync';
const QUESTIONS = (process.env.QUESTIONS ? JSON.parse(process.env.QUESTIONS) : [
  'Who is drafting the customer email and what is the deadline?',
  'Why was the launch not moved to Friday?',
  'What is the new price and how are existing subscribers treated?',
  'Did anyone mention the budget for advertising?',
]);
const LANGS = (process.env.LANGS ?? 'es,fr,de,ja').split(',');
const j = async (u, o) => { const r = await fetch(BASE + u, o); if (!r.ok) throw new Error(`${u}: ${r.status} ${await r.text()}`); return r; };
const health = await (await j('/api/health')).json();
const { id } = await (await j('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sample }) })).json();
const events = []; let t0 = null;
const res = await j(`/api/jobs/${id}/events`);
const dec = new TextDecoder(); let buf = '';
outer: for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  let i; while ((i = buf.indexOf('\n\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 2);
    if (!line.startsWith('data:')) continue;
    const ev = JSON.parse(line.slice(5)); t0 ??= ev.t; events.push({ ...ev, t: ev.t - t0 });
    if (ev.type === 'error') throw new Error(ev.message);
    if (ev.type === 'done') break outer;
  }
}
const asks = [];
for (const question of QUESTIONS) {
  const out = []; const ta = Date.now();
  const r = await j(`/api/jobs/${id}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  let b = ''; for await (const c of r.body) { b += dec.decode(c, { stream: true }); let k; while ((k = b.indexOf('\n')) >= 0) { const l = b.slice(0, k); b = b.slice(k + 1); if (l) out.push({ ...JSON.parse(l), t: Date.now() - ta }); } }
  asks.push({ question, events: out });
  console.log('ask', question, '→', out.at(-1)?.text?.slice(0, 80));
}
const translations = {};
for (const lang of LANGS) { translations[lang] = await (await j(`/api/jobs/${id}/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) })).json(); console.log('translated', lang, translations[lang].ms, 'ms'); }
const net = await (await j('/api/network?probe=1')).json();
const groundTruth = JSON.parse(fs.readFileSync(`samples/${sample}.script.json`, 'utf8')).groundTruth;
fs.mkdirSync('public/replay', { recursive: true });
fs.writeFileSync('public/replay/session.json', JSON.stringify({ schema: 'pocket-minutes/replay@1', recordedAt: new Date().toISOString(), health, sample, events, asks, translations, network: net, groundTruth }));
console.log('wrote public/replay/session.json', events.length, 'events', (fs.statSync('public/replay/session.json').size / 1024).toFixed(0) + ' KB');
