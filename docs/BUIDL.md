# DoraHacks BUIDL — Pocket Minutes (AI Yako)

**Project name:** Pocket Minutes

**Tagline (one line):** Meeting minutes that never leave your device — diarized, grounded in the transcript, and shipped with a verifiable Offline Receipt. Built on Tether QVAC.

**Track:** Cloud → Pocket  *(a cloud product — AI meeting notes — moved onto the device)*

**Links**
- Source (public, MIT): https://github.com/demir-sama/pocket-minutes
- Hosted demo (a clearly-labelled **replay of a real local run**; QVAC cannot run in a browser tab): https://pocket-minutes-sama-5806.vercel.app
- Demo video (the real local app, recorded inside a sandbox with no network): https://github.com/demir-sama/pocket-minutes/blob/main/docs/demo.mp4
- Benchmark: https://github.com/demir-sama/pocket-minutes/blob/main/eval/results.md

---

## The problem
Every AI meeting-notes product asks you to upload the most sensitive audio you have — board meetings, hiring calls, client conversations, medical or legal consultations — to someone else's servers. Companies ban those tools; people use them anyway. The notes are valuable; the upload is the problem. This is a worldwide, everyday need for anyone who takes part in meetings.

## What Pocket Minutes does
Drop in a recording. Everything below runs **on your own CPU, with the network unplugged**:

1. **Transcribes** it (Whisper for an instant draft, then MOSS-Transcribe-Diarize for speaker turns).
2. **Tells the speakers apart** and infers their names from how people address each other (rename with one click).
3. **Writes the minutes — decisions, action items with owners, risks — grounded in the transcript.** A small local model is easy to make hallucinate, so every item must quote evidence that really appears in the transcript; a deterministic verifier drops anything it cannot ground, and the UI shows how many suggestions it removed. Every item is a **click-to-audio** time chip that jumps to the exact second.
4. **Answers questions** about the meeting with retrieval (EmbeddingGemma + QVAC RAG). Citations are verified against the retrieved lines, and unanswerable questions get "That was not discussed in this meeting."
5. **Translates** the minutes on-device (Bergamot, 12 languages).
6. **Seals an Offline Receipt**: network interfaces, failed DNS/TCP probes, every socket sampled every 200 ms and attributed to the app's own process tree, models + SHA-256, timings, peak memory — all **SHA-256 hash-chained**. The browser re-verifies the chain, and a "tamper" button shows it break. Verdict: `OFFLINE` / `ONLINE` / `EXTERNAL_SOCKETS_SEEN`. It is evidence, not proof, and the app says so.

`npm run airgapped` runs the whole app in a Linux network namespace with **no interface but loopback** — the video and the recorded replay were produced that way (0 external sockets over 803 samples, no model downloaded during the run).

## Why this is a good fit for QVAC / "Cloud → Pocket"
It uses five QVAC capabilities in one real workflow — speech-to-text, diarized transcription, LLM completion, embeddings + RAG, and NMT translation — through `@qvac/sdk` 0.22.0, with models from the QVAC registry. The product *is* the privacy property, and it is verifiable by the user rather than asserted by the vendor.

## Honest numbers (measured on an 8-core CPU box, no GPU; one 137 s synthetic meeting)
| Profile | Audio → result | Peak memory | WER | Speakers | Minutes recall / precision |
|---|---|---|---|---|---|
| balanced | 161 s (1.17× real time) | 8.0 GB | 0.3 % | 3/3 | 11/12 · 10/11 |
| lite | 46 s (0.34×) | 5.0 GB | 0.8 % | no diarization | 2/12 · 2/5 |

Limits we state openly: balanced is slower than real time on CPU and needs ~8 GB RAM; lite is weak; prompts were developed on this one sample so the score is smoke-level, not held-out; clean TTS audio flatters WER; cloud tools are not benchmarked and may be more accurate on hard audio.

## What is synthetic / mocked
- The sample meeting is **fictional** and its audio is **text-to-speech** (Kokoro). Narration in the video is TTS too.
- The hosted Vercel page is a **recorded replay** (it cannot process new audio). It does not use cloud AI; it computes nothing. The offline AI feature only runs locally.
- The Offline Receipt is evidence of what ran on one machine, not a cryptographic proof against a malicious host.

## Tech stack
Tether **QVAC** (`@qvac/sdk` 0.22.0: transcribe, completion, embed/ragSearch, translate) · Whisper.cpp (`WHISPER_EN_BASE_Q8_0`) · MOSS-Transcribe-Diarize Q8 · Qwen3-4B-Instruct Q4_K_M (lite: Qwen3-1.7B) · EmbeddingGemma-300M Q4_0 · Bergamot NMT · Node.js ≥ 22.17 · vanilla ES-module front end (no build step, self-hosted OFL fonts, Web Audio waveform, SubtleCrypto) · Linux network namespaces (`unshare -rn`) for the air-gapped run · `node --test` (21 tests) · Playwright + ffmpeg + Kokoro TTS for the video · Vercel (static replay).

## How to run it (offline reproduction)
```
git clone https://github.com/demir-sama/pocket-minutes && cd pocket-minutes
npm install && npm run models      # only step that needs internet
npm start                          # http://127.0.0.1:4747
npm run airgapped                  # same app, no network at all (Linux)
```

## Team
Demir ([@demir-sama](https://github.com/demir-sama)) — solo, early-career developer.

## Built during the event
Written from scratch for AI Yako, starting 28 Oct 2026. Third-party code/models are listed in the README.
