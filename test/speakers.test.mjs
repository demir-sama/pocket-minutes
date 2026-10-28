import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSpeakerNames } from '../src/engine/speakers.mjs';

const seg = (speaker, text) => ({ speaker, text });
test('infers names from vocatives and self-introductions', () => {
  const names = inferSpeakerNames([
    seg('S01', 'Okay, let us start.'), seg('S02', 'Thanks, Priya.'), seg('S01', 'Marcus, you own that.'),
    seg('S02', 'Agreed.'), seg('S03', 'Hi, I am Hannah from support.'), seg('S01', 'Thanks, Hannah.'),
  ]);
  assert.equal(names.S01, 'Priya'); assert.equal(names.S02, 'Marcus'); assert.equal(names.S03, 'Hannah');
});
test('does not mistake filler words or weekdays for names', () => {
  const names = inferSpeakerNames([seg('S01', 'Okay, we ship.'), seg('S02', 'Friday, probably.'), seg('S01', 'Good, thanks.')]);
  assert.deepEqual(names, {});
});
