import test from 'node:test';
import assert from 'node:assert/strict';
import { windows, parseCitations, WINDOW, STRIDE } from '../src/engine/ask.mjs';

test('windows overlap and carry line numbers used for citations', () => {
  const segs = Array.from({ length: 7 }, (_, i) => ({ speaker: 'S01', text: `line ${i}` }));
  const w = windows(segs);
  assert.equal(w[0].start, 0); assert.equal(w[0].end, WINDOW - 1); assert.equal(w[1].start, STRIDE);
  assert.equal(w.at(-1).end, 6); assert.match(w[1].content, /\[2\] S01: line 2/);
});
test('parseCitations extracts unique line numbers', () => { assert.deepEqual(parseCitations('Yes [3] and [#5], again [3].'), [3, 5]); });
