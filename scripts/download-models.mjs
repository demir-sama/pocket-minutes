// One-time model download (the ONLY step in Pocket Minutes that needs the internet). Models land in ~/.qvac and are verified by QVAC.
import { PROFILES, LANGS, describe } from '../src/engine/models.mjs';
import { load, unload, shutdown } from '../src/engine/qvac.mjs';

const profile = process.argv[2] ?? process.env.POCKET_PROFILE ?? 'balanced';
const withLangs = (process.argv[3] ?? 'es,fr,de,ja').split(',').filter(Boolean);
const P = PROFILES[profile]; if (!P) { console.error(`unknown profile ${profile}; choose: ${Object.keys(PROFILES).join(', ')}`); process.exit(1); }
const list = [P.asrDraft, P.asrFull, P.llm, P.embed].filter(Boolean);
console.log(`Downloading profile "${profile}":`); for (const m of list) { const d = describe(m); console.log(`  • ${d.name}  ${(d.size / 1e6).toFixed(0)} MB`); }
let last = 0;
for (const m of list) {
  process.stdout.write(`\n${m.name} `);
  await load(m.name, m, m.type === 'moss-transcribe' ? { maxThreads: 2, useGPU: false } : {}, { onDownload: (v) => { const pct = Math.floor(v ?? 0); if (pct >= last + 10) { process.stdout.write(`${pct}% `); last = pct; } } });
  last = 0; await unload(m.name); process.stdout.write('✓');
}
for (const l of withLangs) { const L = LANGS[l]; if (!L) continue; process.stdout.write(`\nBergamot EN→${l.toUpperCase()} `); await load(`nmt-${l}`, { name: `BERGAMOT_EN_${l.toUpperCase()}`, src: L.src, type: 'nmt' }, { engine: 'Bergamot', from: 'en', to: l }, {}).catch((e) => process.stdout.write(`skipped (${e.message.slice(0, 60)}) `)); await unload(`nmt-${l}`).catch(() => {}); process.stdout.write('✓'); }
console.log('\n\nDone. You can now go fully offline: `npm run airgapped`.');
await shutdown(); process.exit(0);
