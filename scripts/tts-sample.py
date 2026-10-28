"""Render samples/*.script.json to a 16 kHz mono WAV with local Kokoro TTS (dev tool; NOT part of the app runtime).
Usage: KOKORO_DIR=/workspace/tts /workspace/tts-venv/bin/python scripts/tts-sample.py samples/launch-sync.script.json samples/launch-sync.wav"""
import json, os, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
d = os.environ.get('KOKORO_DIR', '.')
k = Kokoro(os.path.join(d, 'kokoro-v1.0.onnx'), os.path.join(d, 'voices-v1.0.bin'))
spec = json.load(open(sys.argv[1]))
chunks, sr_out, t, timeline = [], 24000, 0.0, []
for who, text in spec['turns']:
    a, sr = k.create(text, voice=spec['voices'][who], speed=1.0, lang='en-gb' if spec['voices'][who].startswith('b') else 'en-us')
    gap = np.zeros(int(sr * 0.45), dtype=np.float32)
    timeline.append({'speaker': who, 'start': round(t, 2), 'end': round(t + len(a) / sr, 2), 'text': text})
    chunks += [a.astype(np.float32), gap]; t += (len(a) + len(gap)) / sr; sr_out = sr
audio = np.concatenate(chunks)
sf.write('/tmp/_full.wav', audio, sr_out)
os.system(f"ffmpeg -y -loglevel error -i /tmp/_full.wav -ac 1 -ar 16000 {sys.argv[2]}")
json.dump(timeline, open(sys.argv[2].replace('.wav', '.timeline.json'), 'w'), indent=1)
print('seconds', round(t, 1))
