// Model catalogue. Every model is a QVAC registry constant exported by @qvac/sdk — nothing is fetched from anywhere else.
import * as q from '@qvac/sdk';

export const PROFILES = {
  // Default: diarized transcript (MOSS) + Qwen3-4B for minutes. ~3.8 GB of models on disk.
  balanced: {
    label: 'Balanced',
    asrDraft: { name: 'WHISPER_EN_BASE_Q8_0', src: q.WHISPER_EN_BASE_Q8_0, type: 'whisper' },
    asrFull: { name: 'MOSS_TRANSCRIBE_DIARIZE_Q8_0', src: q.MOSS_TRANSCRIBE_DIARIZE_Q8_0, type: 'moss-transcribe' },
    llm: { name: 'QWEN3_4B_INST_Q4_K_M', src: q.QWEN3_4B_INST_Q4_K_M, type: 'llm' },
    embed: { name: 'EMBEDDINGGEMMA_300M_Q4_0', src: q.EMBEDDINGGEMMA_300M_Q4_0, type: 'embeddings' },
  },
  // Lite: for 8 GB laptops — Whisper + Qwen3-1.7B. Faster, noticeably less accurate minutes (see eval/results.md).
  lite: {
    label: 'Lite',
    asrDraft: { name: 'WHISPER_EN_BASE_Q8_0', src: q.WHISPER_EN_BASE_Q8_0, type: 'whisper' },
    asrFull: null,
    llm: { name: 'QWEN3_1_7B_INST_Q4', src: q.QWEN3_1_7B_INST_Q4, type: 'llm' },
    embed: { name: 'EMBEDDINGGEMMA_300M_Q4_0', src: q.EMBEDDINGGEMMA_300M_Q4_0, type: 'embeddings' },
  },
};

// Offline text translation (Bergamot NMT, ~30 MB per direction). Keys are BCP-47-ish codes.
export const LANGS = {
  es: { label: 'Español', src: q.BERGAMOT_EN_ES },
  fr: { label: 'Français', src: q.BERGAMOT_EN_FR },
  de: { label: 'Deutsch', src: q.BERGAMOT_EN_DE },
  it: { label: 'Italiano', src: q.BERGAMOT_EN_IT },
  pt: { label: 'Português', src: q.BERGAMOT_EN_PT },
  ru: { label: 'Русский', src: q.BERGAMOT_EN_RU },
  ja: { label: '日本語', src: q.BERGAMOT_EN_JA },
  ko: { label: '한국어', src: q.BERGAMOT_EN_KO },
  zh: { label: '中文', src: q.BERGAMOT_EN_ZH },
  hi: { label: 'हिन्दी', src: q.BERGAMOT_EN_HI },
  tr: { label: 'Türkçe', src: q.BERGAMOT_EN_TR },
  pl: { label: 'Polski', src: q.BERGAMOT_EN_PL },
};

export const describe = (m) => (m ? { name: m.name, size: m.src?.expectedSize ?? null, sha256: m.src?.sha256Checksum ?? null, params: m.src?.params ?? '', quantization: m.src?.quantization ?? '' } : null);
