"""Generate narration WAVs with local Kokoro TTS. Usage: KOKORO_DIR=/path/to/kokoro python scripts/video/tts.py <outdir>"""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro
d = os.environ.get('KOKORO_DIR', '.')
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
k = Kokoro(os.path.join(d, 'kokoro-v1.0.onnx'), os.path.join(d, 'voices-v1.0.bin'))
scenes = json.load(open(os.path.join(os.path.dirname(__file__), 'narration.json')))
meta = {}
for s in scenes:
    a, sr = k.create(s['text'], voice='am_michael', speed=1.05, lang='en-us')
    sf.write(f"{out}/{s['id']}.wav", a, sr)
    meta[s['id']] = len(a) / sr
    print(s['id'], round(meta[s['id']], 1))
json.dump(meta, open(f'{out}/durations.json', 'w'))
print('total', round(sum(meta.values()), 1))
