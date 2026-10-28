import fs from 'node:fs';
/** Minimal RIFF/WAV header reader (PCM). The browser resamples everything to 16 kHz mono 16-bit before upload. */
export function wavInfo(path) {
  const b = fs.readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let p = 12, fmt = null, dataBytes = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(p + 10), sampleRate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { dataBytes = Math.min(size, b.length - p - 8); break; }
    p += 8 + size + (size % 2);
  }
  if (!fmt) throw new Error('WAV has no fmt chunk');
  const seconds = dataBytes / (fmt.sampleRate * fmt.channels * (fmt.bits / 8));
  return { ...fmt, seconds: +seconds.toFixed(2), bytes: b.length };
}
export function assertSpeechWav(info) {
  if (info.sampleRate !== 16000 || info.channels !== 1 || info.bits !== 16) throw new Error(`expected 16 kHz mono 16-bit WAV, got ${info.sampleRate} Hz / ${info.channels} ch / ${info.bits}-bit`);
  if (info.seconds > 3 * 3600) throw new Error('audio longer than 3 hours');
}
