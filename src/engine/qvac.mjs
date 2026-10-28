import fs from 'node:fs';
// Thin wrapper over @qvac/sdk: model residency, a serialised job queue, and timing/memory telemetry.
import * as q from '@qvac/sdk';
import { LANGS } from './models.mjs';

const loaded = new Map(); // key -> modelId

export const sdkVersion = async () => {
  try { return JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../node_modules/@qvac/sdk/package.json', import.meta.url), 'utf8')).version; } catch { return 'unknown'; }
};

/** Load (or reuse) a model. `onDownload(pct)` fires only if the SDK has to fetch it — i.e. it was not cached. */
export async function load(key, model, config = {}, { onDownload } = {}) {
  if (loaded.has(key)) return loaded.get(key);
  let downloading = false;
  const modelId = await q.loadModel({
    modelSrc: model.src,
    modelType: model.type,
    modelConfig: config,
    onProgress: (p) => { if (p.percentage < 100) { downloading = true; onDownload?.(p.percentage); } },
  });
  loaded.set(key, modelId);
  load.lastDownloaded = downloading || load.lastDownloaded;
  return modelId;
}
load.lastDownloaded = false;

export async function unload(key) {
  const id = loaded.get(key);
  if (!id) return;
  loaded.delete(key);
  await q.unloadModel({ modelId: id });
}
export const isLoaded = (key) => loaded.has(key);

export async function shutdown() {
  for (const k of [...loaded.keys()]) await unload(k).catch(() => {});
  await q.close().catch(() => {});
}

/** Resident memory of this process plus its child processes (the QVAC bare worker holds the models). */
export function rssMB() {
  let kb = 0;
  try {
    const mine = process.pid;
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      let st; try { st = fs.readFileSync(`/proc/${d}/status`, 'utf8'); } catch { continue; }
      const ppid = +(st.match(/^PPid:\s+(\d+)/m)?.[1] ?? 0);
      if (+d === mine || ppid === mine) kb += +(st.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0);
    }
  } catch { return Math.round(process.memoryUsage().rss / 1e6); }
  return Math.round(kb / 1024);
}

/** Structured JSON completion constrained by a JSON schema (llama.cpp GBNF under the hood). */
export async function jsonCompletion(modelId, { system, user, schema, name = 'out' }) {
  const run = q.completion({
    modelId,
    stream: true,
    history: [{ role: 'system', content: system }, { role: 'user', content: `${user}\n/no_think` }],
    responseFormat: { type: 'json_schema', json_schema: { name, schema } },
  });
  let text = '';
  for await (const t of run.tokenStream) text += t;
  try { return JSON.parse(text.replace(/^<think>[\s\S]*?<\/think>\s*/, '')); } catch (e) { throw new Error(`model returned invalid JSON: ${text.slice(0, 200)}`); }
}

/** Free-form streamed completion; yields text deltas. */
export async function* streamCompletion(modelId, history) {
  const run = q.completion({ modelId, stream: true, history });
  let inThink = false, buf = '';
  for await (const t of run.tokenStream) {
    buf += t;
    // Hide any <think>…</think> block the model may emit.
    while (true) {
      if (!inThink) {
        const i = buf.indexOf('<think>');
        if (i === -1) { const keep = buf.length > 7 ? buf.length - 7 : 0; if (keep) { yield buf.slice(0, keep); buf = buf.slice(keep); } break; }
        if (i > 0) yield buf.slice(0, i);
        buf = buf.slice(i + 7); inThink = true;
      } else {
        const j = buf.indexOf('</think>');
        if (j === -1) { buf = buf.slice(-8); break; }
        buf = buf.slice(j + 8).replace(/^\s+/, ''); inThink = false;
      }
    }
  }
  if (!inThink && buf) yield buf;
}

export { q, LANGS };
