// Records the REAL local app (no mocks) with Playwright, inside the no-network sandbox started by scripts/record-video.sh,
// then mixes Kokoro narration into docs/demo.mp4. Long real waits (model inference) are sped up and labelled on screen
// with the speed factor and the real elapsed time, so the video never pretends the AI is faster than it is.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const URL = process.env.APP_URL ?? 'http://127.0.0.1:4747';
const AUDIO = process.env.AUDIO_DIR ?? '/tmp/pm-tts';
const WORK = process.env.WORK_DIR ?? '/tmp/pm-video';
const OUT = process.env.OUT ?? resolve(import.meta.dirname, '..', 'docs', 'demo.mp4');
const ZOOM = 1.25, W = 1920, H = 1080;
const dur = JSON.parse(readFileSync(`${AUDIO}/durations.json`, 'utf8'));
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
rmSync(WORK, { recursive: true, force: true }); mkdirSync(`${WORK}/shots`, { recursive: true });

// --- real evidence for the "proof" card, produced inside the same network namespace as the app and the browser
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim(); } catch (e) { return ((e.stdout ?? '') + (e.stderr ?? '')).trim() || `exit ${e.status}`; } };
const proof = [
  ['ip -br addr', sh('ip -br addr')],
  ['getent hosts example.com', sh('getent hosts example.com') || 'exit 2 — name resolution fails'],
  ['curl -m 3 https://example.com', sh('curl -sS -m 3 https://example.com 2>&1 | head -1')],
  ['ls ~/.qvac/  # models were cached before', sh('ls ~/.qvac 2>&1 | head -3')],
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cardCss = `position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(900px 600px at 20% 10%,#2a2470 0%,transparent 60%),radial-gradient(800px 600px at 90% 90%,#0b4a63 0%,transparent 60%),#07080d;color:#f2f4ff;font-family:Inter,system-ui,sans-serif;text-align:center;padding:60px;zoom:${1 / ZOOM}`;
const grad = 'background:linear-gradient(90deg,#8b7cff,#38e1ff,#5cffb0);-webkit-background-clip:text;color:transparent';
const titleCard = `<div id="card" style="${cardCss}"><div style="font-size:30px;letter-spacing:.2em;text-transform:uppercase;opacity:.7">AI Yako · Cloud → Pocket · Tether QVAC</div><div style="font-size:132px;font-weight:800;letter-spacing:-3px;margin-top:18px;${grad}">Pocket Minutes</div><div style="font-size:44px;margin-top:14px;opacity:.95">Meeting minutes that never leave your device.</div><div style="margin-top:50px;font-size:25px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);padding:14px 28px;border-radius:14px">This video is the real local app, recorded inside a sandbox with <b>no network</b>. The sample meeting is <b>synthetic</b>.</div></div>`;
const proofCard = `<div id="card" style="${cardCss}"><div style="font-size:40px;font-weight:700;margin-bottom:30px">The sandbox this video was recorded in</div><div style="text-align:left;font:26px/1.5 'DejaVu Sans Mono',monospace;background:#0b0d16;border:1px solid #2a2f4a;border-radius:16px;padding:34px 44px;min-width:1300px;box-shadow:0 20px 80px #000">${proof.map(([c, o]) => `<div style="color:#5cffb0">$ ${esc(c)}</div><div style="color:#c9cff0;white-space:pre-wrap;margin-bottom:14px">${esc(o)}</div>`).join('')}</div><div style="margin-top:30px;font-size:24px;opacity:.8">Run <code>npm run airgapped</code> to get the same sandbox on your own machine.</div></div>`;
const box = (t, b, c) => `<div style="background:rgba(255,255,255,.07);border:1px solid ${c};padding:26px 34px;border-radius:16px;max-width:760px;text-align:left;font-size:25px;line-height:1.45"><b style="font-size:30px">${t}</b><br>${b}</div>`;
const endCard = `<div id="card" style="${cardCss}"><div style="font-size:84px;font-weight:800;${grad}">Pocket Minutes</div><div style="display:flex;gap:40px;margin-top:50px">${box('REAL', 'Tether QVAC pipeline: Whisper · MOSS diarization · Qwen3-4B · EmbeddingGemma · Bergamot<br>The recorded run, the Offline Receipt, the benchmark, 21 tests', '#5cffb0')}${box('SYNTHETIC / MOCKED', 'The three voices (Kokoro TTS) and the fictional meeting<br>The hosted page is a <b>replay</b> of a real local run — QVAC cannot run in a web page', '#ffb86b')}</div><div style="margin-top:50px;font-size:32px;font-weight:700">github.com/demir-sama/pocket-minutes · MIT</div><div style="margin-top:10px;font-size:24px;opacity:.8">pocket-minutes-sama-5806.vercel.app</div></div>`;

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: WORK, size: { width: W, height: H } } });
const page = await ctx.newPage();
const t0 = Date.now(); const now = () => (Date.now() - t0) / 1000;
page.setDefaultTimeout(240000);
page.on('requestfailed', (r) => { if (!/127\.0\.0\.1/.test(r.url())) console.log('NON-LOCAL REQUEST FAILED (should not happen):', r.url()); });
await page.addInitScript(({ card, zoom }) => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(zoom); document.body.insertAdjacentHTML('beforeend', card); }); }, { card: titleCard, zoom: ZOOM });
await page.goto(URL);

const scenes = []; let cur = null;
const scene = async (id, fn) => {
  cur = { id, start: now() }; console.log('scene', id, cur.start.toFixed(1));
  await fn();
  cur.real = now() - cur.start;
  const pad = cur.start + dur[id] + 0.7 - now();
  if (pad > 0) await page.waitForTimeout(pad * 1000);
  cur.end = now(); scenes.push(cur);
  await page.screenshot({ path: `${WORK}/shots/${id}.png` }).catch(() => {});
};
const until = async (s) => { const w = cur.start + s - now(); if (w > 0) await page.waitForTimeout(w * 1000); };
const ring = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); e.style.outline = '4px solid #5cffb0'; e.style.outlineOffset = '4px'; e.style.borderRadius = '12px'; } }, sel);
const unring = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.style.outline = ''; }, sel).catch(() => {});
const click = async (sel, opts = {}) => { const b = page.locator(sel).first(); await b.waitFor(); await ring(sel); await page.waitForTimeout(opts.pre ?? 600); await b.click(); await unring(sel); await page.waitForTimeout(opts.post ?? 700); };
const tab = (name) => click(`#tabs button[data-tab="${name}"]`, { pre: 400, post: 500 });
const hideCard = () => page.evaluate(() => document.getElementById('card')?.remove());
const showCard = (h) => page.evaluate((x) => document.body.insertAdjacentHTML('beforeend', x), h);
const scrollTo = (y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y);
const doneAsking = (n) => page.waitForFunction((k) => document.querySelectorAll('#qa-list .qa').length >= k && !document.querySelector('#qa-list .a.stream'), n, { timeout: 240000 });

await page.waitForSelector('#btn-sample');
await scene('title', async () => { await until(dur.title - 0.3); await hideCard(); });
await scene('proof', async () => { await showCard(proofCard); await until(dur.proof - 0.3); await hideCard(); });
await scene('start', async () => { await until(Math.max(2, dur.start - 2.2)); await click('#btn-sample', { post: 200 }); });
await scene('process', async () => {
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent?.startsWith('Done'), null, { timeout: 900000, polling: 150 });
});
await scene('minutes', async () => {
  await scrollTo(0); await until(2);
  await ring('.ground'); await until(6); await unring('.ground');
  await scrollTo(380); await until(9); await click('#pane-minutes .item .cite', { pre: 800, post: 300 }); await until(dur.minutes - 1);
});
await scene('ask', async () => {
  await tab('ask'); await click('.sugg button', { pre: 500, post: 300 }); await doneAsking(1); await page.waitForTimeout(1200);
  const q = page.locator('#q'); await q.click(); await q.pressSequentially('What was decided about the advertising budget?', { delay: 35 }); await page.waitForTimeout(300); await q.press('Enter'); await doneAsking(2); await page.waitForTimeout(1500);
});
await scene('translate', async () => {
  await tab('minutes'); await scrollTo(0); await page.waitForTimeout(400);
  await click('button.lang[data-lang="es"]', { pre: 300, post: 1500 }); await click('button.lang[data-lang="ja"]', { pre: 300, post: 1500 });
});
await scene('receipt', async () => {
  await tab('receipt'); await scrollTo(0); await until(5); await scrollTo(500); await until(11);
  await click('#pane-receipt .row-actions button:nth-child(1)', { pre: 500, post: 1500 }); await until(15);
  await click('#pane-receipt .row-actions button:nth-child(2)', { pre: 500, post: 1500 });
});
await scene('bench', async () => { await tab('bench'); await scrollTo(0); await until(7); await scrollTo(600); await until(14); await scrollTo(1200); });
await scene('end', async () => { await scrollTo(0); await showCard(endCard); });
await page.waitForTimeout(1500);
const total = now();
await ctx.close(); await browser.close();
const webm = readdirSync(WORK).find((f) => f.endsWith('.webm'));
writeFileSync(`${WORK}/timeline.json`, JSON.stringify({ total, scenes, proof, webm }, null, 1));
console.log('recorded', webm, total.toFixed(1), 's');
execFileSync('node', [resolve(import.meta.dirname, 'compose-video.mjs')], { stdio: 'inherit' });

