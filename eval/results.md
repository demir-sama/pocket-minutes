# Benchmark — Pocket Minutes

Sample: `launch-sync` (137.12s, 3 speakers, synthetic TTS audio with a written ground truth). Device: Intel(R) Xeon(R) Processor, 8 cores, 16.8 GB RAM, none (CPU only). QVAC SDK 0.22.0. Generated 2026-10-28T07:43:21.569Z.

| Profile | Models | Audio→result | Real-time factor | Peak memory | Word error rate | Speakers found | Minutes recall | Minutes precision |
|---|---|---|---|---|---|---|---|---|
| balanced | WHISPER_EN_BASE_Q8_0, MOSS_TRANSCRIBE_DIARIZE_Q8_0, QWEN3_4B_INST_Q4_K_M, EMBEDDINGGEMMA_300M_Q4_0 | 167 s | 1.22× | 8.0 GB | 0.3% | 3 | 54.5% (6/11) | 50.0% (6/12) |
| lite | WHISPER_EN_BASE_Q8_0, QWEN3_1_7B_INST_Q4, EMBEDDINGGEMMA_300M_Q4_0 | 45 s | 0.33× | 4.9 GB | 2.6% | 1 | 36.4% (4/11) | 30.8% (4/13) |

## Detail
### balanced
- Stage times (ms): {"draft":5032,"diarize":62040,"minutes":89034,"index":3125}
- Draft transcript WER: 2.6% (WHISPER_EN_BASE_Q8_0); diarized transcript WER: 0.3% (MOSS_TRANSCRIBE_DIARIZE_Q8_0)
- Key facts kept in transcript: 8/8
- Decisions 2/4, actions 3/5, risks 1/2; ungrounded items dropped by the verifier: 4

### lite
- Stage times (ms): {"draft":4517,"minutes":31950,"index":3091}
- Draft transcript WER: 2.6% (WHISPER_EN_BASE_Q8_0)
- Key facts kept in transcript: 6/8 (missing: twelve dollars, nine dollars)
- Decisions 2/4, actions 0/5, risks 2/2; ungrounded items dropped by the verifier: 3

## Method & caveats
- WER: Levenshtein over normalised words (numbers/ordinals spoken↔digits) against the script the TTS voices read.
- Recall/precision: each ground-truth item is matched one-to-one to an extracted item by content-word coverage (≥50%; actions also need the right owner). Deterministic; no LLM judge. See `src/eval.mjs`.
- One 2-minute synthetic meeting is a smoke-level benchmark, not a leaderboard claim. Real meetings are noisier.
- Cloud tools are not benchmarked here. The honest trade-off is qualitative: they may be more accurate on hard audio, but the recording leaves the device; Pocket Minutes never sends it anywhere (see the Offline Receipt).
