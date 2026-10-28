// Speech-to-text with QVAC: a fast Whisper pass (instant draft) and an optional MOSS-Transcribe-Diarize pass (speakers).
import { q, load, unload } from './qvac.mjs';

const norm = (segs, speaker) => segs.map((s, i) => ({ id: i, startMs: Math.round(s.startMs), endMs: Math.round(s.endMs), speaker: speaker ?? s.speaker ?? 'S01', text: s.text.trim() })).filter((s) => s.text);

export async function whisperDraft(model, wavPath, hooks) {
  const id = await load('asr-draft', model, {}, hooks);
  try { return norm(await q.transcribe({ modelId: id, audioChunk: wavPath, metadata: true }), 'S01'); } finally { await unload('asr-draft'); }
}

export async function diarized(model, wavPath, hooks, { hotwords = [] } = {}) {
  const id = await load('asr-full', model, { maxThreads: 6, useGPU: false }, hooks);
  try { return norm(await q.transcribe({ modelId: id, audioChunk: wavPath, metadata: true, hotwords, maxNewTokens: 0 })); } finally { await unload('asr-full'); }
}
