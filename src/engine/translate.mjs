// Offline translation of the minutes with Bergamot NMT (QVAC `translate`). One ~30 MB model per language pair.
import { q, load, unload } from './qvac.mjs';
import { LANGS } from './models.mjs';

export async function translateMinutes(minutes, lang, hooks = {}) {
  const L = LANGS[lang];
  if (!L) throw new Error(`unsupported language: ${lang}`);
  const key = `nmt-${lang}`;
  const modelId = await load(key, { src: L.src, type: 'nmt' }, { engine: 'Bergamot', from: 'en', to: lang, beamsize: 1, normalize: 1, temperature: 0.2, norepeatngramsize: 3, lengthpenalty: 1.2 }, hooks);
  try {
    const items = [
      ['title', minutes.title], ['summary', minutes.summary],
      ...minutes.decisions.map((d, i) => [`d${i}`, d.text]),
      ...minutes.actions.map((a, i) => [`a${i}`, a.task]),
      ...minutes.actions.map((a, i) => [`u${i}`, a.due || '']),
      ...minutes.risks.map((r, i) => [`r${i}`, r.text]),
    ];
    const texts = items.map(([, t]) => t || ' ');
    const res = q.translate({ modelId, text: texts, modelType: 'nmtcpp-translation', stream: false });
    const out = await res.translations;
    const m = Object.fromEntries(items.map(([k], i) => [k, out[i]?.trim()]));
    return {
      lang, label: L.label, title: m.title, summary: m.summary,
      decisions: minutes.decisions.map((d, i) => ({ ...d, text: m[`d${i}`] })),
      actions: minutes.actions.map((a, i) => ({ ...a, task: m[`a${i}`], due: a.due ? m[`u${i}`] : '' })),
      risks: minutes.risks.map((r, i) => ({ ...r, text: m[`r${i}`] })),
    };
  } finally { await unload(key); }
}
