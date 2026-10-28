// Reproducible benchmark on the bundled sample. Writes eval/results.json + eval/results.md. No numbers are invented:
// every figure is measured on this machine by this script; "cloud" is described qualitatively, never benchmarked.
import fs from 'node:fs';
import os from 'node:os';
import { Job, runJob, newId } from '../src/engine/pipeline.mjs';
import { shutdown, peakMB, sdkVersion } from '../src/engine/qvac.mjs';
import { wer } from '../src/util/text.mjs';
import { scoreMinutes, keyFactRetention } from '../src/eval.mjs';
import { describe, PROFILES } from '../src/engine/models.mjs';

const sample = process.argv[2] ?? 'launch-sync';
const script = JSON.parse(fs.readFileSync(`samples/${sample}.script.json`, 'utf8'));
const reference = script.turns.map((t) => t[1]).join(' ');
const profiles = (process.env.PROFILES ?? 'balanced,lite').split(',');
const out = { generatedAt: new Date().toISOString(), sample, sdk: await sdkVersion(), device: { cpu: os.cpus()[0].model, cores: os.cpus().length, memGB: +(os.totalmem() / 1e9).toFixed(1), os: `${os.type()} ${os.release()}`, gpu: 'none (CPU only)' }, runs: [] };
for (const key of profiles) {
  const job = new Job({ id: newId(), wavPath: `samples/${sample}.wav`, name: sample, profile: key });
  let draft = null;
  job.on('event', (e) => { if (e.type === 'draft') draft = e.segments; });
  const t0 = Date.now();
  await runJob(job);
  const total = Date.now() - t0;
  const P = PROFILES[key];
  const tx = job.segments.map((s) => s.text).join(' ');
  const run = {
    profile: key, models: [P.asrDraft, P.asrFull, P.llm, P.embed].filter(Boolean).map(describe),
    audioSeconds: job.receipt.audio.seconds, totalMs: total, realtimeFactor: +(total / 1000 / job.receipt.audio.seconds).toFixed(2), stageMs: job.receipt.timingsMs,
    peakResidentMB: peakMB() ?? job.receipt.peakRssMB,
    asr: { draft: { model: P.asrDraft.name, ...(({ wer: w, ref, edits }) => ({ wer: +w.toFixed(4), refWords: ref, edits }))(wer(reference, draft.map((s) => s.text).join(' '))) }, ...(P.asrFull ? { final: { model: P.asrFull.name, ...(({ wer: w, ref, edits }) => ({ wer: +w.toFixed(4), refWords: ref, edits }))(wer(reference, tx)) } } : {}) },
    keyFacts: keyFactRetention(script.groundTruth.keyFacts, tx),
    speakersFound: new Set(job.segments.map((s) => s.speaker)).size, speakerNames: job.speakers,
    minutes: scoreMinutes(script.groundTruth, job.minutes),
    groundedDrops: job.minutes.grounding.droppedTotal,
  };
  out.runs.push(run); console.log(key, JSON.stringify({ rtf: run.realtimeFactor, peak: run.peakResidentMB, wer: run.asr, overall: run.minutes.overall }));
  // free everything before the next profile
  await shutdown();
}
fs.mkdirSync('eval', { recursive: true });
const primary = sample === 'launch-sync'; const suffix = primary ? '' : `-${sample}`;
fs.writeFileSync(`eval/results${suffix}.json`, JSON.stringify(out, null, 2));
if (primary) { fs.mkdirSync('public/replay', { recursive: true }); fs.writeFileSync('public/replay/bench.json', JSON.stringify(out)); }
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const md = [`# Benchmark — Pocket Minutes`, '', `Sample: \`${sample}\` (${out.runs[0].audioSeconds}s, 3 speakers, synthetic TTS audio with a written ground truth). Device: ${out.device.cpu}, ${out.device.cores} cores, ${out.device.memGB} GB RAM, ${out.device.gpu}. QVAC SDK ${out.sdk}. Generated ${out.generatedAt}.`, '',
  '| Profile | Models | Audio→result | Real-time factor | Peak memory | Word error rate | Speakers found | Minutes recall | Minutes precision |', '|---|---|---|---|---|---|---|---|---|',
  ...out.runs.map((r) => `| ${r.profile} | ${r.models.map((m) => m.name).join(', ')} | ${(r.totalMs / 1000).toFixed(0)} s | ${r.realtimeFactor}× | ${(r.peakResidentMB / 1024).toFixed(1)} GB | ${pct((r.asr.final ?? r.asr.draft).wer)} | ${r.speakersFound} | ${pct(r.minutes.overall.recall)} (${r.minutes.overall.hit}/${r.minutes.overall.gt}) | ${pct(r.minutes.overall.precision)} (${r.minutes.overall.precHit}/${r.minutes.overall.extracted}) |`), '',
  '## Detail', ...out.runs.flatMap((r) => [`### ${r.profile}`, `- Stage times (ms): ${JSON.stringify(r.stageMs)}`, `- Draft transcript WER: ${pct(r.asr.draft.wer)} (${r.asr.draft.model})${r.asr.final ? `; diarized transcript WER: ${pct(r.asr.final.wer)} (${r.asr.final.model})` : ''}`, `- Key facts kept in transcript: ${r.keyFacts.kept}/${r.keyFacts.total}${r.keyFacts.missing.length ? ` (missing: ${r.keyFacts.missing.join(', ')})` : ''}`, `- Decisions ${r.minutes.decisions.hit}/${r.minutes.decisions.gt}, actions ${r.minutes.actions.hit}/${r.minutes.actions.gt}, risks ${r.minutes.risks.hit}/${r.minutes.risks.gt}; ungrounded items dropped by the verifier: ${r.groundedDrops}`, '']),
  '## Method & caveats', '- WER: Levenshtein over normalised words (numbers/ordinals spoken↔digits) against the script the TTS voices read.', '- Recall/precision: each ground-truth item is matched to its best extracted item (a model may merge related statements, so many-to-one is allowed) by content-word coverage (≥50%; actions also need the right owner). Deterministic; no LLM judge. See `src/eval.mjs`.', '- One 2-minute synthetic meeting is a smoke-level benchmark, not a leaderboard claim. Real meetings are noisier.', '- Cloud tools are not benchmarked here. The honest trade-off is qualitative: they may be more accurate on hard audio, but the recording leaves the device; Pocket Minutes never sends it anywhere (see the Offline Receipt).', ''].join('\n');
fs.writeFileSync(`eval/results${suffix}.md`, md);
console.log(md);
process.exit(0);
