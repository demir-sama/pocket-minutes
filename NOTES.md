# NOTES (AI Yako entry) — updated as I go
Started Oct 28 2026 08:10 WAT. Deadline Oct 30 15:00 WAT (DoraHacks, QVAC hackathon).
## Facts (verified via Luma + mirrors of DoraHacks page; dorahacks.io blocked by WAF for curl)
- Tracks: Offline AI apps (700 USDt) / Cloud to Pocket (900) / Agentic finance WDK (400); overall winner 1500; total 3500 USDt.
- Core QVAC AI feature MUST run offline; cloud AI API for that feature => ineligible for prizes.
- Judging: real user value, meaningful QVAC integration, working implementation, usability, clarity+reproducibility of offline demo. Credit reused work.
- Submit: repo, demo video (internet disconnected), QVAC integration (SDK versions, model names, download steps, files), device/OS/memory/licences, list of features that need network.
- Remote OK, solo OK. No eligibility restriction found.
## Feasibility
- @qvac/sdk 0.22.0 needs Node >=22.17; box has node 20 -> using ~/node22/bin (v22.21.1). Works on CPU (8 cores, 16GB shared, ~2.7GB free). Qwen3-600M: ~100 tok/s.
- models cache ~/.qvac
## Decision
- Project: Pocket Minutes (Cloud to Pocket track): meeting recorder/notes (ASR + LLM + embeddings RAG + NMT) fully local.
