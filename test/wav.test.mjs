import test from 'node:test';
import assert from 'node:assert/strict';
import { wavInfo, assertSpeechWav } from '../src/util/wav.mjs';

test('sample meeting is a 16 kHz mono 16-bit WAV of the expected length', () => {
  const i = wavInfo(new URL('../samples/launch-sync.wav', import.meta.url).pathname);
  assert.equal(i.sampleRate, 16000); assert.equal(i.channels, 1); assert.equal(i.bits, 16);
  assert.ok(i.seconds > 120 && i.seconds < 160); assertSpeechWav(i);
});
test('assertSpeechWav rejects other formats', () => { assert.throws(() => assertSpeechWav({ sampleRate: 44100, channels: 2, bits: 16, seconds: 10 })); });
