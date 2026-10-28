// Small, dependency-free text helpers shared by the engine, the benchmark and the tests.

export const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30 };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };

/** Normalise for comparison: lowercase, spoken numbers -> digits, drop punctuation. Used for WER and quote matching. */
export function normalize(text) {
  let t = String(text).toLowerCase().replace(/\$/g, ' dollars ').replace(/%/g, ' percent ');
  t = t.replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  t = t.replace(/[^a-z0-9\s']/g, ' ').replace(/\b(\w+)'s\b/g, '$1s').replace(/'/g, '');
  const words = t.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'twenty' && NUM_WORDS[words[i + 1]] >= 1 && NUM_WORDS[words[i + 1]] <= 9) { out.push(String(20 + NUM_WORDS[words[++i]])); continue; }
    if (w in NUM_WORDS) out.push(String(NUM_WORDS[w]));
    else if (w in ORD) out.push(String(ORD[w]));
    else out.push(w);
  }
  // normalise a couple of orthographic variants that differ between ASR engines
  return out.map((w) => (w === 'nonnegotiable' ? 'non' : w === 'okay' ? 'ok' : w));
}

/** Word error rate (Levenshtein over normalised words). Returns {wer, ref, hyp, edits}. */
export function wer(reference, hypothesis) {
  const r = normalize(reference), h = normalize(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { wer: r.length ? d[r.length][h.length] / r.length : 0, ref: r.length, hyp: h.length, edits: d[r.length][h.length] };
}

/**
 * Locate a quoted sentence inside diarized segments. Returns {index, score} of the best segment,
 * or null when the quote cannot be grounded (score < minScore). Matching is on normalised word
 * overlap, so small ASR/LLM punctuation differences do not break grounding.
 */
export function locateQuote(quote, segments, minScore = 0.6) {
  const q = normalize(quote);
  if (q.length < 2) return null;
  const qset = new Set(q);
  let best = null;
  for (let i = 0; i < segments.length; i++) {
    const s = normalize(segments[i].text);
    if (!s.length) continue;
    const sset = new Set(s);
    let hit = 0;
    for (const w of qset) if (sset.has(w)) hit++;
    // Containment of the quote in the segment, lightly penalising very long segments.
    const score = hit / qset.size - Math.max(0, s.length - q.length - 12) * 0.002;
    if (!best || score > best.score) best = { index: i, score };
  }
  return best && best.score >= minScore ? best : null;
}

/** Does `phrase` (e.g. a person's name or a due-date phrase) appear in `text`? */
export function appearsIn(phrase, text) {
  const p = normalize(phrase);
  if (!p.length) return false;
  const t = ` ${normalize(text).join(' ')} `;
  return t.includes(` ${p.join(' ')} `);
}

export function chunkSegments(segments, maxWords = 1400) {
  const chunks = [];
  let cur = [], n = 0;
  for (const s of segments) {
    const w = s.text.split(/\s+/).length;
    if (n + w > maxWords && cur.length) { chunks.push(cur); cur = []; n = 0; }
    cur.push(s); n += w;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export const fmtTranscript = (segments) => segments.map((s, i) => `[${i}] ${s.speaker}: ${s.text}`).join('\n');
