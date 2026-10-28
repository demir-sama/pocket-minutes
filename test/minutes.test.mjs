import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMinutes, findDue } from '../src/engine/minutes.mjs';

const seg = (id, speaker, text) => ({ id, startMs: id * 5000, endMs: id * 5000 + 4000, speaker, text });
const segments = [
  seg(0, 'S01', 'Marcus, are we ready to ship?'),
  seg(1, 'S02', 'Thanks, Priya. The only blocker is the payment screen failing on four percent of runs.'),
  seg(2, 'S01', 'So the decision is, we ship on Tuesday, the seventeenth of November.'),
  seg(3, 'S02', 'I will fix the payment bug by Friday.'),
  seg(4, 'S01', 'Great, thanks Marcus.'),
];
// A stub "model": returns what a model might say, including hallucinations the verifier must drop.
const stub = async (name) => ({
  tags: { decisionLines: [2, 99], commitmentLines: [3], riskLines: [1] },
  decisions: { items: [{ decision: 'Ship on Tuesday 17 November', lines: [2] }, { decision: 'Move HQ to Mars', lines: [42] }] },
  actions: { items: [{ owner: 'Marcus', task: 'Fix the payment bug', due: 'by Friday', line: 3 }, { owner: 'Zed', task: 'Invented task', due: 'tomorrow', line: 77 }] },
  risks: { items: [{ risk: 'Payment screen fails on 4% of runs', line: 1 }] },
  speakers: { items: [] },
  summary: { title: 'Launch sync', summary: 'Ship on the 17th.' },
})[name];

test('minutes: grounded items survive, hallucinated ones are dropped and counted', async () => {
  const m = await buildMinutes({ segments, ask: async (name) => stub(name) });
  assert.equal(m.decisions.length, 1); assert.equal(m.decisions[0].seg, 2);
  assert.equal(m.actions.length, 1); assert.equal(m.actions[0].owner, 'Marcus'); assert.match(m.actions[0].due, /Friday/);
  assert.equal(m.risks.length, 1);
  assert.equal(m.speakers.S01, 'Priya'); assert.equal(m.speakers.S02, 'Marcus');
  assert.ok(m.grounding.droppedTotal >= 2, 'the Mars decision and the Zed action must be dropped');
  for (const item of [...m.decisions, ...m.actions, ...m.risks]) assert.ok(Number.isInteger(item.seg) && item.seg < segments.length && item.at >= 0);
});
test('findDue extracts deadline phrases', () => { assert.match(findDue('I will do it by Friday, the thirteenth'), /Friday/); assert.equal(findDue('no date here'), ''); });
