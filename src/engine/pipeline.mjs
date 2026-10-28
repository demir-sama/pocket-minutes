// One meeting job: audio → draft transcript → diarized transcript → grounded minutes → searchable index → offline receipt.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { load, unload, jsonCompletion, rssMB, sdkVersion } from './qvac.mjs';
import { PROFILES, describe } from './models.mjs';
import { whisperDraft, diarized } from './transcribe.mjs';
import { buildMinutes } from './minutes.mjs';
import { indexTranscript } from './ask.mjs';
import { observe, chain, sha256 } from '../offline/monitor.mjs';
import { wavInfo } from '../util/wav.mjs';

export class Job extends EventEmitter {
  constructor({ id, wavPath, name, profile = 'balanced' }) {
    super();
    Object.assign(this, { id, wavPath, name, profileKey: profile, profile: PROFILES[profile], log: [], segments: [], minutes: null, ws: null, speakers: {}, receipt: null, status: 'queued' });
  }
  emitEvent(type, data = {}) {
    const ev = { t: Date.now(), type, ...data };
    this.log.push(ev);
    this.emit('event', ev);
  }
}

export async function runJob(job, { llmConfig = { ctx_size: 8192, temp: 0 } } = {}) {
  const P = job.profile;
  const timings = {};
  const downloads = [];
  let peak = rssMB();
  const peakIv = setInterval(() => { peak = Math.max(peak, rssMB()); }, 500);
  const hooks = { onDownload: (p) => { downloads.push(p); } };
  const stage = async (id, label, fn) => {
    job.emitEvent('stage', { id, label, state: 'start' });
    const t0 = Date.now();
    const r = await fn();
    timings[id] = Date.now() - t0;
    job.emitEvent('stage', { id, label, state: 'done', ms: timings[id] });
    return r;
  };
  job.status = 'running';
  const audio = wavInfo(job.wavPath);
  job.emitEvent('audio', { name: job.name, seconds: audio.seconds, bytes: audio.bytes, sha256: sha256(fs.readFileSync(job.wavPath)).slice(0, 64) });
  const { report } = await observe(async () => {
    await stage('draft', 'Fast transcript · Whisper', async () => {
      const segs = await whisperDraft(P.asrDraft, job.wavPath, hooks);
      job.segments = segs;
      job.emitEvent('draft', { segments: segs });
    });
    if (P.asrFull) {
      await stage('diarize', 'Speakers + timestamps · MOSS-Transcribe-Diarize', async () => {
        const segs = await diarized(P.asrFull, job.wavPath, hooks);
        job.segments = segs;
      });
    }
    job.emitEvent('transcript', { segments: job.segments, diarized: !!P.asrFull });
    const llmId = await load('llm', P.llm, llmConfig, hooks);
    job.llmId = llmId;
    await stage('minutes', `Grounded minutes · ${P.llm.name}`, async () => {
      const m = await buildMinutes({
        segments: job.segments,
        ask: (name, system, user, schema) => jsonCompletion(llmId, { system, user, schema, name }),
        onStep: (s) => job.emitEvent('minutes_step', s),
      });
      job.minutes = m; job.speakers = m.speakers;
      job.emitEvent('minutes', { minutes: m });
    });
    await stage('index', `Search index · ${P.embed.name}`, async () => {
      job.embedId = await load('embed', P.embed, {}, hooks);
      job.ws = `meeting-${job.id}`;
      job.windows = await indexTranscript({ embedModelId: job.embedId, workspace: job.ws, segments: job.segments });
      job.emitEvent('indexed', { windows: job.windows.length });
    });
  });
  clearInterval(peakIv);
  job.network = report;
  const models = [P.asrDraft, P.asrFull, P.llm, P.embed].filter(Boolean).map(describe);
  const events = chain([
    { k: 'audio', sha256: sha256(fs.readFileSync(job.wavPath)), seconds: audio.seconds },
    ...Object.entries(timings).map(([stageId, ms]) => ({ k: 'stage', stage: stageId, ms })),
    { k: 'transcript', segments: job.segments.length, sha256: sha256(JSON.stringify(job.segments)) },
    { k: 'minutes', sha256: sha256(JSON.stringify(job.minutes)), dropped: job.minutes.grounding.droppedTotal },
    { k: 'network', verdict: report.verdict, externalSockets: report.externalSocketsSeen.length, samples: report.socketSamples },
  ]);
  job.receipt = {
    schema: 'pocket-minutes/offline-receipt@1',
    createdAt: new Date().toISOString(),
    verdict: report.verdict,
    note: 'Evidence recorded on this machine while the AI ran. It is not a cryptographic proof of isolation; for the strongest check run `npm run airgapped` (network namespace with no interfaces).',
    device: { os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemGB: +(os.totalmem() / 1e9).toFixed(1), node: process.version },
    qvac: { sdk: '@qvac/sdk', version: await sdkVersion(), profile: job.profileKey },
    models,
    modelsDownloadedDuringJob: downloads.length > 0,
    timingsMs: timings,
    peakRssMB: peak,
    audio: { seconds: audio.seconds, sha256: events[0].sha256 },
    network: report,
    chain: events,
  };
  job.emitEvent('receipt', { receipt: job.receipt });
  job.status = 'ready';
  job.emitEvent('done');
}

export async function disposeJob(job) {
  try { const q = await import('@qvac/sdk'); if (job.ws) await q.ragCloseWorkspace({ workspace: job.ws, deleteOnClose: true }).catch(() => {}); } catch {}
  await unload('embed').catch(() => {});
  await unload('llm').catch(() => {});
}
export const newId = () => crypto.randomBytes(4).toString('hex');
