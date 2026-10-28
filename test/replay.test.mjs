import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifyChain } from '../src/offline/monitor.mjs';

const path = new URL('../public/replay/session.json', import.meta.url).pathname;
test('recorded replay is a real, internally consistent session', { skip: !fs.existsSync(path) }, () => {
  const s = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert.equal(s.schema, 'pocket-minutes/replay@1');
  const types = s.events.map((e) => e.type);
  for (const t of ['audio', 'draft', 'transcript', 'minutes', 'receipt', 'done']) assert.ok(types.includes(t), t);
  const receipt = s.events.find((e) => e.type === 'receipt').receipt;
  assert.ok(verifyChain(receipt.chain), 'receipt hash chain must verify');
  const minutes = s.events.find((e) => e.type === 'minutes').minutes;
  const nSeg = s.events.find((e) => e.type === 'transcript').segments.length;
  for (const it of [...minutes.decisions, ...minutes.actions, ...minutes.risks]) assert.ok(it.seg >= 0 && it.seg < nSeg, 'every item cites a real transcript line');
});
