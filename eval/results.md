# Benchmark — Pocket Minutes

Sample: `launch-sync` (137.12s, 3 speakers, synthetic TTS audio with a written ground truth). Device: Intel(R) Xeon(R) Processor, 8 cores, 16.8 GB RAM, none (CPU only). QVAC SDK 0.22.0. Generated 2026-10-28T07:56:59.519Z.

| Profile | Models | Audio→result | Real-time factor | Peak memory | Word error rate | Speakers found | Minutes recall | Minutes precision |
|---|---|---|---|---|---|---|---|---|
| balanced | WHISPER_EN_BASE_Q8_0, MOSS_TRANSCRIBE_DIARIZE_Q8_0, QWEN3_4B_INST_Q4_K_M, EMBEDDINGGEMMA_300M_Q4_0 | 161 s | 1.17× | 8.0 GB | 0.3% | 3 | 91.7% (11/12) | 90.9% (10/11) |
| lite | WHISPER_EN_BASE_Q8_0, QWEN3_1_7B_INST_Q4, EMBEDDINGGEMMA_300M_Q4_0 | 46 s | 0.34× | 5.0 GB | 0.8% | 1 | 16.7% (2/12) | 40.0% (2/5) |

## Detail
### balanced
- Stage times (ms): {"draft":5002,"diarize":61943,"minutes":82668,"index":2963}
- Draft transcript WER: 0.8% (WHISPER_EN_BASE_Q8_0); diarized transcript WER: 0.3% (MOSS_TRANSCRIBE_DIARIZE_Q8_0)
- Key facts kept in transcript: 8/8
- Decisions 5/5, actions 4/5, risks 2/2; ungrounded items dropped by the verifier: 2

### lite
- Stage times (ms): {"draft":4515,"minutes":34172,"index":2928}
- Draft transcript WER: 0.8% (WHISPER_EN_BASE_Q8_0)
- Key facts kept in transcript: 8/8
- Decisions 1/5, actions 0/5, risks 1/2; ungrounded items dropped by the verifier: 5

## Method & caveats
- WER: Levenshtein over normalised words (numbers/ordinals spoken↔digits) against the script the TTS voices read.
- Recall/precision: each ground-truth item is matched to its best extracted item (a model may merge related statements, so many-to-one is allowed) by content-word coverage (≥50%; actions also need the right owner). Deterministic; no LLM judge. See `src/eval.mjs`.
- One 2-minute synthetic meeting is a smoke-level benchmark, not a leaderboard claim. Real meetings are noisier.
- Cloud tools are not benchmarked here. The honest trade-off is qualitative: they may be more accurate on hard audio, but the recording leaves the device; Pocket Minutes never sends it anywhere (see the Offline Receipt).
