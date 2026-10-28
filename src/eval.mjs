// Scoring helpers for the benchmark. Deterministic, no LLM-as-judge.
import { normalize } from './util/text.mjs';

const STOP = new Set('the a an of to and or for in on at by with is are be will we i it that this from as so then up do not'.split(' '));
const toks = (s) => new Set(normalize(s).filter((w) => !STOP.has(w) && w.length > 1));
const coverage = (gt, ex) => { const g = toks(gt), e = toks(ex); if (!g.size) return 0; let n = 0; for (const w of g) if (e.has(w)) n++; return n / g.size; };

/** Greedy one-to-one matching of ground-truth items to extracted items by content-word coverage of the ground-truth item. */
export function matchItems(gtItems, exItems, { threshold = 0.5, text = (x) => x, gate = () => true } = {}) {
  const used = new Set(); let hit = 0; const detail = [];
  for (const g of gtItems) {
    let best = -1, bs = 0;
    exItems.forEach((e, i) => { if (used.has(i) || !gate(g, e)) return; const s = coverage(text(g), text(e)); if (s > bs) { bs = s; best = i; } });
    const ok = best >= 0 && bs >= threshold; if (ok) { used.add(best); hit++; }
    detail.push({ gt: text(g), matched: ok ? text(exItems[best]) : null, score: +bs.toFixed(2) });
  }
  return { recall: gtItems.length ? hit / gtItems.length : 0, precision: exItems.length ? hit / exItems.length : 0, hit, gt: gtItems.length, extracted: exItems.length, detail };
}

export function scoreMinutes(gt, m) {
  const dec = matchItems(gt.decisions, m.decisions, { text: (x) => (typeof x === 'string' ? x : x.text) });
  const act = matchItems(gt.actionItems, m.actions, { threshold: 0.4, text: (x) => x.task, gate: (g, e) => (e.owner ?? '').toLowerCase() === g.owner.toLowerCase() });
  const rsk = matchItems(gt.risks, m.risks, { threshold: 0.45, text: (x) => (typeof x === 'string' ? x : x.text) });
  const all = [dec, act, rsk];
  const hit = all.reduce((a, b) => a + b.hit, 0), g = all.reduce((a, b) => a + b.gt, 0), ex = all.reduce((a, b) => a + b.extracted, 0);
  return { decisions: dec, actions: act, risks: rsk, overall: { recall: hit / g, precision: hit / ex, hit, gt: g, extracted: ex } };
}

/** Share of key facts (numbers, dates) that survive in a transcript. */
export function keyFactRetention(facts, transcript) {
  const t = ' ' + normalize(transcript).join(' ') + ' ';
  const kept = facts.filter((f) => t.includes(' ' + normalize(f).join(' ') + ' '));
  return { kept: kept.length, total: facts.length, missing: facts.filter((f) => !kept.includes(f)) };
}
