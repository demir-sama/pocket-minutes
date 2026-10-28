// Ask the meeting: QVAC embeddings + QVAC's built-in vector store retrieve transcript windows, a local LLM answers
// from those excerpts only and must cite transcript line numbers, which are then verified against what was retrieved.
import { q, streamCompletion } from './qvac.mjs';
import { mmss } from '../util/text.mjs';

export const WINDOW = 3, STRIDE = 2;

export function windows(segments) {
  const out = [];
  for (let i = 0; i < segments.length; i += STRIDE) {
    const segs = segments.slice(i, i + WINDOW);
    out.push({ id: `w${i}`, start: i, end: i + segs.length - 1, content: segs.map((s, k) => `[${i + k}] ${s.speaker}: ${s.text}`).join(' ') });
    if (i + WINDOW >= segments.length) break;
  }
  return out;
}

export async function indexTranscript({ embedModelId, workspace, segments }) {
  const ws = windows(segments);
  const { embedding } = await q.embed({ modelId: embedModelId, text: ws.map((w) => w.content) });
  await q.ragSaveEmbeddings({ workspace, documents: ws.map((w, i) => ({ id: w.id, content: w.content, embedding: embedding[i], embeddingModelId: embedModelId })) });
  return ws;
}

export async function retrieve({ embedModelId, workspace, query, ws, topK = 4 }) {
  const hits = await q.ragSearch({ workspace, modelId: embedModelId, query, topK });
  const byId = new Map(ws.map((w) => [w.id, w]));
  return hits.map((h) => ({ ...byId.get(h.id), score: h.score })).filter((h) => h.id);
}

export const parseCitations = (text) => [...new Set([...text.matchAll(/\[#?(\d+)\]/g)].map((m) => Number(m[1])))];

/** Streams events: {type:'sources'}, {type:'delta'}, {type:'done', cited, unverified}. */
export async function* answer({ llmModelId, embedModelId, workspace, ws, segments, names = {}, question }) {
  const hits = await retrieve({ embedModelId, workspace, query: question, ws });
  const allowed = new Set(hits.flatMap((h) => Array.from({ length: h.end - h.start + 1 }, (_, k) => h.start + k)));
  const sources = [...allowed].sort((a, b) => a - b).map((i) => ({ seg: i, at: segments[i].startMs, speaker: names[segments[i].speaker] ?? segments[i].speaker, text: segments[i].text }));
  yield { type: 'sources', sources, scores: hits.map((h) => ({ start: h.start, end: h.end, score: h.score })) };
  const excerpts = sources.map((s) => `[${s.seg}] (${mmss(s.at)}) ${s.speaker}: ${s.text}`).join('\n');
  const history = [
    { role: 'system', content: 'You answer questions about a meeting using ONLY the transcript excerpts provided. Be concise (1-3 sentences). After each claim cite the supporting line numbers like [12]. If the excerpts do not contain the answer, say "That was not discussed in this meeting." and cite nothing.' },
    { role: 'user', content: `Excerpts:\n${excerpts}\n\nQuestion: ${question}\n/no_think` },
  ];
  let full = '';
  for await (const d of streamCompletion(llmModelId, history)) { full += d; yield { type: 'delta', text: d }; }
  const cited = parseCitations(full);
  yield { type: 'done', text: full.trim(), cited: cited.filter((c) => allowed.has(c)), unverified: cited.filter((c) => !allowed.has(c)) };
}
