// Grounded meeting minutes. The LLM proposes; deterministic code disposes.
//  1. TAG    one fast pass labels transcript line numbers as decision / commitment / risk candidates.
//  2. REFINE one focused call per label sees only the candidate lines (+1 line of context) and writes the final items,
//            each citing the line numbers it came from. Items that cite lines outside the candidate set are dropped.
//  3. CHECK  owners/names must exist in the transcript, due-dates must be words that were actually said near the line.
// Because every item carries line numbers, the UI can jump to the exact audio moment for any claim.
import { appearsIn, normalize } from '../util/text.mjs';
import { inferSpeakerNames } from './speakers.mjs';

const ints = { type: 'array', items: { type: 'integer' } };
export const SCHEMAS = {
  tags: { type: 'object', properties: { decisionLines: ints, commitmentLines: ints, riskLines: ints }, required: ['decisionLines', 'commitmentLines', 'riskLines'] },
  decisions: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, lines: ints }, required: ['decision', 'lines'] } } }, required: ['items'] },
  actions: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string' }, task: { type: 'string' }, due: { type: 'string' }, line: { type: 'integer' } }, required: ['owner', 'task', 'due', 'line'] } } }, required: ['items'] },
  risks: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { risk: { type: 'string' }, line: { type: 'integer' } }, required: ['risk', 'line'] } } }, required: ['items'] },
  speakers: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { speaker: { type: 'string' }, name: { type: 'string' } }, required: ['speaker', 'name'] } } }, required: ['items'] },
  summary: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' } }, required: ['title', 'summary'] },
};

const SYS = 'You are a meticulous meeting secretary. You only report what is explicitly said in the transcript. Never invent names, numbers or dates.';

const TAG_PROMPT = `Label the lines:
- decisionLines: lines where a decision is SETTLED (e.g. "the decision is…", "we ship…", "we keep…", "we reduce…", "that is acceptable", and recap lines restating decisions). Not mere proposals or discussion.
- commitmentLines: lines where a person promises to do a task ("I will…", "I will have it merged…", or a "yes" to "can your team do it?").
- riskLines: lines that state a risk, blocker or concern.`;

const windowOf = (segments, lines, speakerOf = (s) => s.speaker, radius = 1) => {
  const show = new Set();
  for (const l of lines) for (let k = l - radius; k <= l + radius; k++) if (k >= 0 && k < segments.length) show.add(k);
  return [...show].sort((a, b) => a - b).map((k) => `${lines.includes(k) ? '*' : ' '}[${k}] ${speakerOf(segments[k])}: ${segments[k].text}`).join('\n');
};

const DAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const DUE_RE = new RegExp(`\\b(?:by|before|on|until)\\s+(?:the\\s+)?(?:${DAY}|tomorrow|today|end of (?:day|week|month)|next ${DAY}|next week)(?:,?\\s+the\\s+\\w+(?:\\s+of\\s+\\w+)?)?|\\btoday\\b|\\btomorrow\\b`, 'i');
export const findDue = (text) => (text.match(DUE_RE)?.[0] ?? '').trim();

const uniqInts = (arr, lo, hi) => [...new Set((arr ?? []).filter((n) => Number.isInteger(n) && n >= lo && n < hi))].sort((a, b) => a - b);

/** Build minutes for a diarized transcript. `ask(name, system, user, schema)` returns parsed JSON. */
export async function buildMinutes({ segments, ask, onStep = () => {}, maxWords = 1400 }) {
  const dropped = { decisions: 0, actions: 0, risks: 0, speakers: 0 };
  const cand = { decisions: [], actions: [], risks: [] };
    // ---- 1. TAG (overlapping windows: small models label short windows far more reliably than whole transcripts) ----
  const WIN = 14, STRIDE = 10;
  const starts = [];
  for (let st = 0; st < segments.length; st += STRIDE) { starts.push(st); if (st + WIN >= segments.length) break; }
  for (const [wi, st] of starts.entries()) {
    onStep({ step: 'tag', chunk: wi + 1, of: starts.length });
    const hi = Math.min(segments.length, st + WIN);
    const numbered = segments.slice(st, hi).map((x, i) => `[${st + i}] ${x.speaker}: ${x.text}`).join('\n');
    const t = await ask('tags', SYS, `Transcript:\n${numbered}\n\n${TAG_PROMPT}`, SCHEMAS.tags);
    cand.decisions.push(...uniqInts(t.decisionLines, st, hi));
    cand.actions.push(...uniqInts(t.commitmentLines, st, hi));
    cand.risks.push(...uniqInts(t.riskLines, st, hi));
  }
  for (const k of Object.keys(cand)) cand[k] = [...new Set(cand[k])].sort((x, y) => x - y);

  // ---- speaker names (deterministic vote + validated LLM suggestions) ----
  onStep({ step: 'speakers' });
  const labels = new Set(segments.map((s) => s.speaker));
  const names = inferSpeakerNames(segments);
  if (labels.size > 1 && Object.keys(names).length < labels.size) {
    const spk = await ask('speakers', SYS, `Transcript:\n${segments.map((s, i) => `[${i}] ${s.speaker}: ${s.text}`).join('\n').slice(0, 14000)}\n\nTask: for each speaker label whose first name is explicitly evident (they are addressed by name by another speaker, or introduce themselves), return {speaker, name}. Skip anyone whose name is not stated.`, SCHEMAS.speakers);
    const allText = segments.map((s) => s.text).join(' ');
    for (const it of spk.items ?? []) {
      const ok = labels.has(it.speaker) && !names[it.speaker] && it.name && appearsIn(it.name, allText) && !Object.values(names).includes(it.name) && !labels.has(it.name)
        && segments.some((s) => s.speaker !== it.speaker && appearsIn(it.name, s.text));
      if (ok) names[it.speaker] = it.name; else dropped.speakers++;
    }
  }
  const who = (label) => names[label] ?? label;
  const nameOf = (s) => who(s.speaker);

  // ---- 2. REFINE ----
  const refine = async (kind, lines, instruction, schema, radius = 2) => {
    if (!lines.length) return [];
    onStep({ step: kind });
    const out = await ask(kind, SYS, `Transcript lines (lines marked * are candidates):\n${windowOf(segments, lines, nameOf, radius)}\n\nTask: ${instruction}`, schema);
    return out.items ?? [];
  };
  const decRaw = await refine('decisions', cand.decisions, 'Write the final list of decisions that were actually settled. Merge duplicates (e.g. a decision and its later recap become ONE item). Each item: decision = one clear sentence including the key numbers/dates; lines = the candidate line numbers (marked *) it comes from. Skip proposals and non-decisions.', SCHEMAS.decisions);
  const actRaw = await refine('actions', cand.actions, 'Write the action items: tasks a person committed to do. Each item: owner = the first name of the person who commits (use the speaker label shown if no name is shown); task = short imperative sentence; due = the deadline words exactly as spoken near the line (e.g. "by Friday, the thirteenth") or "" if none; line = the candidate line number (marked *). Merge duplicates; skip lines that are not commitments.', SCHEMAS.actions, 3);
  const riskRaw = await refine('risks', cand.risks, 'Write the risks, blockers and concerns that were raised. Each item: risk = one clear sentence; line = the candidate line number (marked *). Merge duplicates.', SCHEMAS.risks);

  const decisions = [];
  for (const d of decRaw) {
    const lines = uniqInts(d.lines, 0, segments.length).filter((l) => cand.decisions.includes(l));
    if (!lines.length || !d.decision?.trim()) { dropped.decisions++; continue; }
    decisions.push({ text: d.decision.trim(), seg: lines[0], segs: lines, at: segments[lines[0]].startMs, speaker: nameOf(segments[lines[0]]), quote: lines.map((l) => segments[l].text).join(' ') });
  }
  decisions.sort((a, b) => a.seg - b.seg);
  // Merge near-duplicate decisions (a decision and its recap).
  for (let i = 0; i < decisions.length; i++) for (let j = decisions.length - 1; j > i; j--) {
    const A = new Set(normalize(decisions[i].text)), B = new Set(normalize(decisions[j].text));
    const inter = [...A].filter((w) => B.has(w)).length;
    if (inter / Math.min(A.size, B.size) > 0.6) { decisions[i].segs = [...new Set([...decisions[i].segs, ...decisions[j].segs])]; decisions.splice(j, 1); dropped.decisions++; }
  }

  const actions = [];
  const seenA = new Set();
  const allText = segments.map((s) => s.text).join(' ');
  for (const a of actRaw) {
    const l = a.line;
    if (!Number.isInteger(l) || !cand.actions.includes(l) || !a.task?.trim()) { dropped.actions++; continue; }
    const firstPerson = /\b(i will|i'll|i can|i am going to|i'm going to)\b/i.test(segments[l].text);
    let owner = (a.owner ?? '').trim();
    const ownerOk = owner && (Object.values(names).includes(owner) || labels.has(owner) || appearsIn(owner, allText));
    let ownerLabel = labels.has(owner) ? owner : Object.keys(names).find((k) => names[k] === owner);
    if (firstPerson || !ownerOk) { ownerLabel = segments[l].speaker; owner = who(ownerLabel); }
    const near = [segments[l - 1]?.text, segments[l].text, segments[l + 1]?.text].filter(Boolean).join(' ');
    let due = (a.due ?? '').trim();
    if (due && !appearsIn(due.replace(/^(by|on|before|until)\s+/i, ''), near)) due = '';
    if (!due) due = findDue(segments[l].text) || findDue(segments[l + 1]?.text ?? '');
    const key = `${owner}|${normalize(a.task).slice(0, 5).join(' ')}`;
    if (seenA.has(key)) continue; seenA.add(key);
    actions.push({ owner, ownerLabel, task: a.task.trim().replace(/\.$/, ''), due, seg: l, at: segments[l].startMs, quote: segments[l].text });
  }
  actions.sort((a, b) => a.seg - b.seg);

  const risks = [];
  const seenR = new Set();
  for (const r of riskRaw) {
    const l = r.line;
    if (!Number.isInteger(l) || !cand.risks.includes(l) || !r.risk?.trim()) { dropped.risks++; continue; }
    if (seenR.has(l)) continue; seenR.add(l);
    risks.push({ text: r.risk.trim(), seg: l, at: segments[l].startMs, speaker: nameOf(segments[l]), quote: segments[l].text });
  }
  risks.sort((a, b) => a.seg - b.seg);

  // ---- summary ----
  onStep({ step: 'summary' });
  const digest = [
    ...decisions.map((d) => `Decision: ${d.text}`),
    ...actions.map((a) => `Action: ${a.owner} — ${a.task}${a.due ? ` (${a.due})` : ''}`),
    ...risks.map((r) => `Risk: ${r.text}`),
  ].join('\n');
  const sum = await ask('summary', SYS, `Verified items from the meeting:\n${digest}\n\nFirst lines of the transcript:\n${segments.slice(0, 4).map((s) => s.text).join(' ')}\n\nTask: write a short descriptive meeting title (max 8 words) and a 2–3 sentence summary that mentions the key decisions and numbers. Use only the facts above.`, SCHEMAS.summary);

  return {
    title: sum.title?.trim() || 'Meeting minutes',
    summary: sum.summary?.trim() || '',
    speakers: names,
    decisions, actions, risks,
    grounding: {
      dropped,
      droppedTotal: Object.values(dropped).reduce((a, b) => a + b, 0),
      candidates: { decisions: cand.decisions.length, actions: cand.actions.length, risks: cand.risks.length },
      rule: 'Every item cites transcript line numbers from the tagging pass; owners and names must appear in the transcript and due-dates must be words that were actually said near that line. Anything else is dropped.',
    },
  };
}
