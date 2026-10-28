// Pocket Minutes — local server. Binds to 127.0.0.1 only; serves the UI and drives the QVAC engine.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Job, runJob, disposeJob, newId } from './engine/pipeline.mjs';
import { answer } from './engine/ask.mjs';
import { translateMinutes } from './engine/translate.mjs';
import { LANGS, PROFILES } from './engine/models.mjs';
import { shutdown, sdkVersion } from './engine/qvac.mjs';
import { externalSockets, interfaces, probe } from './offline/monitor.mjs';
import { wavInfo, assertSpeechWav } from './util/wav.mjs';
import { toMarkdown } from './export.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const TMP = process.env.POCKET_TMP ?? path.join(os.tmpdir(), 'pocket-minutes');
fs.mkdirSync(TMP, { recursive: true });
const PORT = Number(process.env.PORT ?? 4747);
const PROFILE = process.env.POCKET_PROFILE ?? 'balanced';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const SAMPLES = { 'launch-sync': { title: 'Q4 launch readiness sync (synthetic)', file: 'samples/launch-sync.wav', note: 'Fictional meeting voiced by 3 local Kokoro TTS voices — synthetic audio, written for this project.' } };

const jobs = new Map();
let active = null;

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req, limit = 600e6) => new Promise((resolve, reject) => { const chunks = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });

async function startJob({ wavPath, name }) {
  if (active && active.status !== 'ready' && active.status !== 'error') throw Object.assign(new Error('another meeting is being processed'), { code: 409 });
  if (active) { const old = active; active = null; await disposeJob(old).catch(() => {}); }
  const job = new Job({ id: newId(), wavPath, name, profile: PROFILE });
  jobs.set(job.id, job); active = job;
  runJob(job).catch((e) => { job.status = 'error'; job.emitEvent('error', { message: friendly(e) }); console.error('job failed:', e); });
  return job;
}
function friendly(e) {
  const m = String(e?.message ?? e);
  if (/ENOTFOUND|EAI_AGAIN|network|registry|download|peer|timeout|DHT/i.test(m)) return `A model is missing from the local cache and the network is unavailable. Run \`npm run models\` once while online. (${m.slice(0, 160)})`;
  return m.slice(0, 400);
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/health') return json(res, 200, { mode: 'live', app: 'pocket-minutes', profile: PROFILE, profiles: Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, { label: v.label, llm: v.llm.name, asr: (v.asrFull ?? v.asrDraft).name }])), sdk: await sdkVersion(), node: process.version, langs: Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.label])), samples: SAMPLES, device: { os: `${os.type()} ${os.release()}`, cores: os.cpus().length, memGB: +(os.totalmem() / 1e9).toFixed(1) } });
  if (p === '/api/network') { const s = externalSockets(); return json(res, 200, { interfaces: interfaces(), sockets: s.sockets, monitor: s.supported ? 'linux' : 'unsupported', probe: url.searchParams.get('probe') ? await probe() : undefined, at: Date.now() }); }
  if (p === '/api/jobs' && req.method === 'POST') {
    try {
      let wavPath, name;
      if ((req.headers['content-type'] ?? '').includes('json')) {
        const body = JSON.parse((await readBody(req, 1e5)).toString() || '{}');
        const s = SAMPLES[body.sample]; if (!s) return json(res, 400, { error: 'unknown sample' });
        wavPath = path.join(ROOT, s.file); name = s.title;
      } else {
        const buf = await readBody(req); wavPath = path.join(TMP, `${newId()}.wav`); fs.writeFileSync(wavPath, buf);
        name = decodeURIComponent(String(req.headers['x-name'] ?? 'Recording'));
        assertSpeechWav(wavInfo(wavPath));
      }
      const job = await startJob({ wavPath, name });
      return json(res, 200, { id: job.id });
    } catch (e) { return json(res, e.code === 409 ? 409 : 400, { error: e.message }); }
  }
  const m = p.match(/^\/api\/jobs\/([a-f0-9]+)\/(events|ask|translate|receipt|export\.md)$/);
  if (m) {
    const job = jobs.get(m[1]); if (!job) return json(res, 404, { error: 'no such job' });
    if (m[2] === 'events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
      job.log.forEach(send);
      const on = (ev) => send(ev); job.on('event', on);
      req.on('close', () => job.off('event', on));
      return;
    }
    if (m[2] === 'receipt') { if (!job.receipt) return json(res, 409, { error: 'not ready' }); res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="offline-receipt-${job.id}.json"` }); return res.end(JSON.stringify(job.receipt, null, 2)); }
    if (m[2] === 'export.md') { if (!job.minutes) return json(res, 409, { error: 'not ready' }); res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="minutes-${job.id}.md"` }); return res.end(toMarkdown(job)); }
    if (job.status !== 'ready') return json(res, 409, { error: 'meeting is still processing' });
    const body = JSON.parse((await readBody(req, 1e5)).toString() || '{}');
    if (m[2] === 'ask') {
      if (!body.question || body.question.length > 500) return json(res, 400, { error: 'question required (≤500 chars)' });
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
      try { for await (const ev of answer({ llmModelId: job.llmId, embedModelId: job.embedId, workspace: job.ws, ws: job.windows, segments: job.segments, names: job.speakers, question: body.question })) res.write(JSON.stringify(ev) + '\n'); } catch (e) { res.write(JSON.stringify({ type: 'error', message: friendly(e) }) + '\n'); }
      return res.end();
    }
    if (m[2] === 'translate') {
      try { const t0 = Date.now(); const out = await translateMinutes(job.minutes, body.lang); return json(res, 200, { ...out, ms: Date.now() - t0 }); } catch (e) { return json(res, 400, { error: friendly(e) }); }
    }
  }
  // static
  let rel = p === '/' ? '/index.html' : p;
  if (rel.startsWith('/samples/')) rel = rel; const base = rel.startsWith('/samples/') ? ROOT : PUBLIC;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  if (rel.startsWith('/samples/') && !rel.endsWith('.wav')) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => route(req, res).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { error: String(e.message) }); else res.end(); }));
server.listen(PORT, '127.0.0.1', () => console.log(`Pocket Minutes → http://127.0.0.1:${PORT}  (profile: ${PROFILE})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await shutdown(); process.exit(0); });
