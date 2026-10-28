import test from 'node:test';
import assert from 'node:assert/strict';
import { matchItems, scoreMinutes, keyFactRetention } from '../src/eval.mjs';

test('matchItems matches paraphrases and respects the owner gate', () => {
  const gt = [{ owner: 'Marcus', task: 'Fix the payments retry bug' }];
  const ex = [{ owner: 'Hannah', task: 'Fix the payment retry bug' }];
  const gate = (g, e) => g.owner === e.owner;
  assert.equal(matchItems(gt, ex, { text: (x) => x.task, gate }).recall, 0);
  assert.equal(matchItems(gt, [{ owner: 'Marcus', task: 'Fix payments retry bug and report' }], { text: (x) => x.task, gate, threshold: 0.4 }).recall, 1);
});
test('scoreMinutes returns overall recall/precision', () => {
  const gt = { decisions: ['Raise the pro plan to $12'], actionItems: [{ owner: 'A', task: 'Send the email' }], risks: ['Payments fail 4% of runs'] };
  const m = { decisions: [{ text: 'Pro plan raised to twelve dollars' }], actions: [{ owner: 'A', task: 'Send the email to customers' }], risks: [{ text: 'Unrelated worry about weather' }] };
  const s = scoreMinutes(gt, m); assert.equal(s.overall.hit, 2); assert.equal(s.overall.gt, 3); assert.ok(Math.abs(s.overall.recall - 2 / 3) < 1e-9);
});
test('keyFactRetention', () => { const r = keyFactRetention(['four percent', 'twelve dollars'], 'It fails on about 4% and costs $12'); assert.equal(r.kept, 2); });
