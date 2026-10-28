import test from 'node:test';
import assert from 'node:assert/strict';
import { mmss, normalize, wer, locateQuote, appearsIn, chunkSegments } from '../src/util/text.mjs';

test('mmss formats milliseconds', () => { assert.equal(mmss(0), '00:00'); assert.equal(mmss(65_400), '01:05'); assert.equal(mmss(3_599_000), '59:59'); });
test('normalize maps spoken numbers, ordinals, symbols', () => {
  assert.deepEqual(normalize('the seventeenth of November'), ['the', '17', 'of', 'november']);
  assert.deepEqual(normalize('$12 and 4%'), ['12', 'dollars', 'and', '4', 'percent']);
  assert.deepEqual(normalize('twenty four hours'), ['24', 'hours']);
});
test('wer is 0 for equivalent spoken/written numbers and counts edits', () => {
  assert.equal(wer('ship on the seventeenth', 'Ship on the 17th.').wer, 0);
  const r = wer('a b c d', 'a x c'); assert.equal(r.edits, 2); assert.equal(r.wer, 0.5);
});
test('locateQuote grounds a quote in the right segment, and refuses fabricated text', () => {
  const segs = [{ text: 'We ship on Tuesday.' }, { text: 'Marcus will fix the payments bug.' }, { text: 'Lunch is at noon.' }];
  assert.equal(locateQuote('Marcus will fix the payment bug', segs).index, 1);
  assert.equal(locateQuote('The moon landing was staged', segs), null);
});
test('appearsIn matches whole words only', () => { assert.ok(appearsIn('Priya', 'Thanks, Priya.')); assert.ok(!appearsIn('Pri', 'Thanks, Priya.')); });
test('chunkSegments splits by word budget', () => {
  const segs = Array.from({ length: 10 }, () => ({ text: 'one two three four five' }));
  assert.equal(chunkSegments(segs, 20).length, 3);
});
