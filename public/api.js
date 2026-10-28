// Two interchangeable back-ends behind one interface:
//  • LiveApi   — talks to the local Node server that runs Tether QVAC on this machine.
//  • ReplayApi — plays back a recorded session of a real local run (used by the hosted demo, where an on-device AI cannot run).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `${u} → ${r.status}`); return r; };

export async function detectApi() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { const health = await r.json(); if (health.app === 'pocket-minutes') return new LiveApi(health); }
  } catch {}
  const session = await (await fetch('replay/session.json')).json();
  const bench = await fetch('replay/bench.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return new ReplayApi(session, bench);
}

class LiveApi {
  mode = 'live';
  constructor(health) { this.health = health; this.langs = health.langs; this.sample = Object.entries(health.samples)[0]; this.audioUrl = '/audio/launch-sync.mp3'; }
  canUpload = true;
  async start({ sample, file }, onEvent) {
    let id;
    if (file) id = (await (await j('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-name': encodeURIComponent(file.name ?? 'Recording') }, body: file })).json()).id;
    else id = (await (await j('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sample: this.sample[0] }) })).json()).id;
    this.id = id;
    const res = await fetch(`/api/jobs/${id}/events`); const dec = new TextDecoder(); let buf = '';
    (async () => { for await (const chunk of res.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); if (l.startsWith('data:')) { const ev = JSON.parse(l.slice(5)); onEvent(ev); if (ev.type === 'done' || ev.type === 'error') return; } } } })();
  }
  async ask(question, onEvent) {
    const r = await j(`/api/jobs/${this.id}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
    const dec = new TextDecoder(); let b = '';
    for await (const c of r.body) { b += dec.decode(c, { stream: true }); let k; while ((k = b.indexOf('\n')) >= 0) { const l = b.slice(0, k); b = b.slice(k + 1); if (l) onEvent(JSON.parse(l)); } }
  }
  async translate(lang) { return (await j(`/api/jobs/${this.id}/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) })).json(); }
  async network() { return (await j('/api/network')).json(); }
  async bench() { const r = await fetch('/replay/bench.json').catch(() => null); return r && r.ok ? r.json() : null; }
  receiptUrl() { return `/api/jobs/${this.id}/receipt`; }
  exportUrl() { return `/api/jobs/${this.id}/export.md`; }
  suggestions() { return ['Who is drafting the customer email and what is the deadline?', 'Why was the launch not moved to Friday?', 'What is the new price and how are existing subscribers treated?']; }
}

class ReplayApi {
  mode = 'replay';
  canUpload = false;
  constructor(session, bench) { this.s = session; this.health = session.health; this.langs = Object.fromEntries(Object.entries(session.health.langs).filter(([k]) => session.translations[k])); this.allLangs = session.health.langs; this.benchData = bench; this.audioUrl = 'audio/launch-sync.mp3'; this.sample = [session.sample, { title: 'Q4 launch readiness sync (synthetic)' }]; }
  /** Recorded gaps are compressed (≤ 2.4 s each) so the visit is short; the UI clock still shows the real recorded time. */
  async start(_, onEvent) {
    let prev = 0;
    for (const ev of this.s.events) {
      const gap = ev.t - prev; prev = ev.t;
      await sleep(Math.min(2400, Math.max(40, gap * 0.12)));
      onEvent(ev);
    }
  }
  async ask(question, onEvent) {
    const rec = this.s.asks.find((a) => a.question === question);
    if (!rec) { onEvent({ type: 'notice', text: 'This hosted page replays recorded answers. Run Pocket Minutes locally to ask anything about your own meeting.' }); return; }
    let prev = 0;
    for (const ev of rec.events) { await sleep(Math.min(120, Math.max(20, (ev.t - prev) * 0.5))); prev = ev.t; onEvent(ev); }
  }
  async translate(lang) { await sleep(450); const t = this.s.translations[lang]; if (!t) throw new Error('Language not recorded in replay — run locally'); return t; }
  async network() { return { ...this.s.network, recorded: true }; }
  async bench() { return this.benchData; }
  receiptUrl() { return null; }
  exportUrl() { return null; }
  suggestions() { return this.s.asks.map((a) => a.question); }
}
