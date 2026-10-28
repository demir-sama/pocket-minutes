import { detectApi } from './api.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); } for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid)); return e; };
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLORS = ['#8b7cff', '#38e1ff', '#ff8fab', '#ffc857', '#5cffb0', '#ff9a5c'];
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const toast = (msg, ms = 3200) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); };
const fmtMB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(0) + ' MB');

const S = { api: null, segments: [], diarized: false, minutes: null, speakers: {}, labelColor: {}, receipt: null, lang: null, translations: {}, audioReady: false, started: false, running: false, jobMs: 0, audioUrl: null };
const audio = $('#audio');

// ───────────────────────── boot ─────────────────────────
(async function boot() {
  S.api = await detectApi();
  const api = S.api;
  $('#sdk-ver').textContent = api.health.sdk ?? '';
  $('#foot-mode').textContent = api.mode === 'live' ? `live · ${api.health.profile} profile · ${api.health.device?.cores} cores · ${api.health.device?.memGB} GB` : 'replay of a recorded local run';
  if (api.mode === 'replay') {
    $('#replay-bar').hidden = false;
    const real = api.s.events.at(-1).t;
    $('#replay-text').textContent = `No cloud AI is used here. The offline AI (Tether QVAC) runs only on your own machine; this hosted page just replays a real run of that local app (recorded ${new Date(api.s.recordedAt).toISOString().slice(0, 10)}, ${mmss(real)} of real compute, waits shortened). Transcript, minutes, answers, translations and the Offline Receipt are recorded outputs of that local run, not computed by this site.`;
    $('#upload-text').textContent = 'Upload (local app only)'; $('#btn-upload').setAttribute('aria-disabled', 'true');
    $('#drop-hint').innerHTML = 'Hosted replay mode: the sample meeting is replayed. <a href="https://github.com/demir-sama/pocket-minutes" target="_blank" rel="noopener">Clone the repo</a> to process your own audio.';
  }
  heroWave();
  setupTabs(); setupNet(); setupPlayer();
  $('#btn-sample').addEventListener('click', () => begin({ sample: true }));
  const fileIn = $('#file');
  fileIn.addEventListener('change', () => fileIn.files[0] && begin({ file: fileIn.files[0] }));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); if (api.canUpload) drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => { const f = ev.dataTransfer.files[0]; if (f && api.canUpload) begin({ file: f }); else if (f) toast('Hosted replay cannot process new audio — run it locally.'); });
  if (new URLSearchParams(location.search).has('autostart')) begin({ sample: true });
})();

// ───────────────────────── hero waveform ─────────────────────────
function heroWave() {
  const c = $('#hero-wave'), ctx = c.getContext('2d');
  let t = 0;
  const fit = () => { c.width = c.clientWidth * devicePixelRatio; c.height = 96 * devicePixelRatio; };
  fit(); addEventListener('resize', fit);
  (function frame() {
    if (!c.isConnected || $('#hero').hidden) return;
    const w = c.width, hh = c.height, n = Math.floor(w / (7 * devicePixelRatio)); ctx.clearRect(0, 0, w, hh); t += 0.03;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w, p = i / n;
      const env = Math.sin(p * Math.PI) ** 0.6;
      const amp = (Math.sin(i * 0.31 + t * 2.2) * 0.5 + Math.sin(i * 0.13 - t * 1.3) * 0.35 + Math.sin(i * 0.83 + t * 4) * 0.15) * env;
      const bh = Math.max(3 * devicePixelRatio, Math.abs(amp) * hh * 0.85);
      const g = ctx.createLinearGradient(0, hh / 2 - bh / 2, 0, hh / 2 + bh / 2);
      g.addColorStop(0, '#8b7cff'); g.addColorStop(.5, '#38e1ff'); g.addColorStop(1, '#5cffb0');
      ctx.fillStyle = g; ctx.globalAlpha = 0.25 + env * 0.7;
      const bw = 3.2 * devicePixelRatio; ctx.beginPath(); ctx.roundRect(x, hh / 2 - bh / 2, bw, bh, bw / 2); ctx.fill();
    }
    requestAnimationFrame(frame);
  })();
}

// ───────────────────────── network pill ─────────────────────────
function setupNet() {
  const pill = $('#net-pill'), txt = $('#net-text');
  pill.addEventListener('click', () => { if (!$('#work').hidden) selectTab('receipt'); else toast('Process a meeting to see the Offline Receipt.'); });
  let n = 0;
  const poll = async () => {
    try {
      const d = await S.api.network();
      S.net = d;
      const ext = d.sockets?.length ?? 0, ifs = d.interfaces?.length ?? 0;
      pill.classList.toggle('bad', ext > 0); pill.classList.toggle('warn', ext === 0 && ifs > 0);
      txt.textContent = d.recorded ? `recorded local run: ${d.interfaces.length === 0 ? 'offline' : 'network up'} · ${ext} external connections` : ext > 0 ? `${ext} external connection${ext > 1 ? 's' : ''}!` : ifs === 0 ? 'offline · 0 external connections' : `network up · 0 external connections`;
      pill.title = S.api.mode === 'replay' ? 'This pill shows the network state recorded during the local run (inside a no-network sandbox). It says nothing about this web page.' : ifs === 0 ? 'No network interface is up except loopback.' : `Network interface(s) up: ${d.interfaces.map((i) => i.name).join(', ')}. Pocket Minutes opens no external connection; run "npm run airgapped" to remove the network entirely.`;
    } catch { txt.textContent = 'monitor unavailable'; }
    if (S.api.mode === 'live') setTimeout(poll, 1500);
  };
  poll();
}

// ───────────────────────── tabs ─────────────────────────
function setupTabs() {
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  addEventListener('resize', () => moveInk());
}
function selectTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${name}`));
  moveInk();
  if (name === 'bench') renderBench();
  if (name === 'ask') renderAskPane();
}
function moveInk() { const b = $('#tabs button.on'); if (!b) return; const ink = $('#ink'); ink.style.left = b.offsetLeft + 'px'; ink.style.width = b.offsetWidth + 'px'; }

// ───────────────────────── audio / waveform ─────────────────────────
let peaks = null;
async function loadAudioPeaks(buf) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await ctx.decodeAudioData(buf.slice(0));
  const ch = ab.getChannelData(0), N = 360, step = Math.floor(ch.length / N); peaks = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = 0; for (let k = i * step; k < (i + 1) * step; k += 8) m = Math.max(m, Math.abs(ch[k])); peaks[i] = m; }
  const mx = Math.max(...peaks) || 1; peaks = peaks.map((p) => p / mx);
  S.duration = ab.duration; ctx.close();
}
function drawWave() {
  const c = $('#wave'); if (!c.isConnected) return; const ctx = c.getContext('2d');
  const w = (c.width = c.clientWidth * devicePixelRatio), hh = (c.height = 64 * devicePixelRatio);
  ctx.clearRect(0, 0, w, hh);
  const n = peaks?.length ?? 180, bw = w / n;
  const prog = audio.duration ? audio.currentTime / audio.duration : 0;
  const scanning = S.running ? (performance.now() / 2200) % 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = peaks ? peaks[i] : 0.2 + 0.2 * Math.sin(i * 0.4 + performance.now() / 300), bh = Math.max(3 * devicePixelRatio, p * hh * 0.92), x = i * bw, f = i / n;
    const played = f <= prog; const near = scanning >= 0 && Math.abs(f - scanning) < 0.06;
    ctx.fillStyle = near ? '#5cffb0' : played ? '#38e1ff' : 'rgba(160,168,230,.38)';
    ctx.beginPath(); ctx.roundRect(x + bw * 0.18, hh / 2 - bh / 2, bw * 0.64, bh, bw * 0.3); ctx.fill();
  }
  if (audio.duration) { ctx.fillStyle = '#fff'; ctx.fillRect(prog * w - 1, 0, 2 * devicePixelRatio, hh); }
  requestAnimationFrame(drawWave);
}
function setupPlayer() {
  $('#play').addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  $('#wave').addEventListener('click', (e) => { if (!audio.duration) return; const r = e.currentTarget.getBoundingClientRect(); audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; audio.play(); });
  audio.addEventListener('play', () => ($('#play-ico').setAttribute('d', 'M5 4h3.5v12H5zM11.5 4H15v12h-3.5z')));
  audio.addEventListener('pause', () => ($('#play-ico').setAttribute('d', 'M6 4l10 6-10 6z')));
  audio.addEventListener('timeupdate', () => {
    $('#time').textContent = mmss(audio.currentTime * 1000);
    const ms = audio.currentTime * 1000; let cur = -1;
    for (const s of S.segments) if (s.startMs <= ms + 120) cur = s.id; else break;
    if (cur !== S.cur) { S.cur = cur; $$('.ln.playing').forEach((e) => e.classList.remove('playing')); const el = $(`.ln[data-id="${cur}"]`); if (el) { el.classList.add('playing'); if (!audio.paused) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
  });
}
function seekTo(id, play = true) {
  const s = S.segments.find((x) => x.id === id); if (!s) return;
  flashLine(id);
  if (S.audioReady) { audio.currentTime = s.startMs / 1000; if (play) audio.play().catch(() => {}); }
}
function flashLine(id) { const el = $(`.ln[data-id="${id}"]`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

// ───────────────────────── run ─────────────────────────
async function begin({ sample, file }) {
  if (S.started) return; S.started = true; S.running = true;
  const api = S.api;
  $('#hero').hidden = true; $('#work').hidden = false; scrollTo({ top: 0 });
  selectTab('minutes'); renderMinutesPending();
  // audio
  try {
    if (file) { S.audioUrl = URL.createObjectURL(file); }
    else S.audioUrl = api.audioUrl;
    audio.src = S.audioUrl; S.audioReady = true;
    const buf = await (await fetch(S.audioUrl)).arrayBuffer(); await loadAudioPeaks(buf);
  } catch (e) { console.warn('audio preview unavailable', e); }
  drawWave();
  let payload;
  if (file) { toast('Decoding & resampling to 16 kHz mono in your browser…'); try { payload = await toWav16k(file); } catch (e) { toast('Could not decode that file: ' + e.message); S.started = false; return; } }
  const t0 = performance.now();
  try {
    await api.start(file ? { file: payload } : { sample: true }, onEvent);
  } catch (e) { toast(e.message, 6000); S.started = false; S.running = false; }
}

const STAGES = ['draft', 'diarize', 'minutes', 'index', 'receipt'];
function setStage(id, state, ms) {
  const el = $(`.stage[data-id="${id}"]`); if (!el) return;
  el.classList.toggle('active', state === 'start'); el.classList.toggle('done', state === 'done');
  if (ms != null) $('em', el).textContent = (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
}
function onEvent(ev) {
  if (ev.t != null) { S.jobMs = ev.t; if (S.api.mode === 'replay') $('#clock').textContent = mmss(ev.t); }
  switch (ev.type) {
    case 'audio': $('#meeting-name').textContent = `${ev.name} · ${mmss(ev.seconds * 1000)}`; clockStart(); break;
    case 'stage': setStage(ev.id, ev.state, ev.ms); if (ev.id === 'diarize' && ev.state === 'start') $('#tx-badge').textContent = 'diarizing…'; if (ev.id === 'minutes' && ev.state === 'start') pendingStep('tag'); break;
    case 'draft': S.segments = ev.segments; S.diarized = false; renderLines(false); $('#tx-badge').textContent = 'draft · whisper'; break;
    case 'transcript': S.segments = ev.segments; S.diarized = ev.diarized; renderLines(true); $('#tx-badge').textContent = ev.diarized ? 'diarized · final' : 'final'; $('#tx-badge').classList.add('ok'); renderSpeakers(); break;
    case 'minutes_step': pendingStep(ev.step, ev); break;
    case 'minutes': S.minutes = ev.minutes; S.speakers = ev.minutes.speakers; S.running = false; renderSpeakers(); relabelLines(); renderMinutes(); break;
    case 'indexed': break;
    case 'receipt': S.receipt = ev.receipt; setStage('receipt', 'done', 0.3); $('em', $('.stage[data-id=receipt]')).textContent = ev.receipt.verdict; renderReceipt(); break;
    case 'done': clockStop(); S.running = false; toast('Done — click any ◷ time chip to jump the audio to the exact moment.', 4600); break;
    case 'error': clockStop(); S.running = false; toast(ev.message, 9000); $('#pane-minutes').replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Something went wrong'), h('span', {}, ev.message))); break;
  }
}
let clk;
function clockStart() { if (S.api.mode === 'replay') return; const t0 = performance.now(); clearInterval(clk); clk = setInterval(() => ($('#clock').textContent = mmss(performance.now() - t0)), 250); }
function clockStop() { clearInterval(clk); }

// ───────────────────────── transcript ─────────────────────────
const spkName = (label) => S.speakers?.[label] ?? (S.segments.some((s) => s.speaker !== 'S01') ? `Speaker ${+String(label).replace(/\D/g, '') || 1}` : '');
const colorOf = (label) => { if (!S.labelColor[label]) S.labelColor[label] = COLORS[Object.keys(S.labelColor).length % COLORS.length]; return S.labelColor[label]; };
function renderLines(final) {
  const box = $('#lines'); box.replaceChildren();
  S.segments.forEach((s, i) => {
    const el = h('div', { class: `ln ${final ? 'speaker' : 'draft'} ${final ? 'swap' : ''}`, 'data-id': s.id, style: `--i:${i};--sc:${final ? colorOf(s.speaker) : 'var(--dim)'}`, onclick: () => seekTo(s.id) },
      h('div', { class: 't' }, mmss(s.startMs)),
      h('div', {}, final ? h('div', { class: 'who' }, spkName(s.speaker)) : null, h('div', { class: 'tx' }, s.text)));
    box.append(el);
  });
}
function relabelLines() { $$('.ln').forEach((el) => { const s = S.segments[+el.dataset.id]; const w = $('.who', el); if (w && s) w.textContent = spkName(s.speaker); }); }
function renderSpeakers() {
  const box = $('#speakers'); box.replaceChildren();
  const labels = [...new Set(S.segments.map((s) => s.speaker))];
  if (!S.diarized) return;
  labels.forEach((l, i) => {
    const nm = h('span', { class: 'nm', contenteditable: 'plaintext-only', spellcheck: 'false', title: 'Click to rename — updates everywhere' }, spkName(l));
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } });
    nm.addEventListener('blur', () => { const v = nm.textContent.trim().slice(0, 28) || spkName(l); const old = S.speakers[l]; if (v === old) return; S.speakers[l] = v; if (S.minutes) { S.minutes.actions.forEach((a) => { if (a.ownerLabel === l || a.owner === old) a.owner = v; }); S.minutes.decisions.forEach((d) => { if (d.speaker === old) d.speaker = v; }); } relabelLines(); renderSpeakers(); if (S.minutes) renderMinutes(); toast(`Renamed ${old ?? l} → ${v}`); });
    box.append(h('span', { class: 'spk', style: `animation-delay:${i * 90}ms` }, h('i', { style: `background:${colorOf(l)}` }, (spkName(l) || '?')[0]), nm));
  });
}

// ───────────────────────── minutes ─────────────────────────
const STEP_LABELS = { tag: 'Scanning the transcript in overlapping windows', speakers: 'Resolving who is who from how people address each other', decisions: 'Refining decisions', actions: 'Refining action items', risks: 'Refining risks', summary: 'Writing the summary' };
const STEP_ORDER = ['tag', 'speakers', 'decisions', 'actions', 'risks', 'summary'];
function renderMinutesPending() {
  $('#pane-minutes').replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'steps', id: 'steps' }, ...STEP_ORDER.map((k) => h('div', { class: 'step', 'data-k': k }, h('i'), h('span', {}, STEP_LABELS[k])))), h('div', { style: 'width:min(420px,100%)' }, h('div', { class: 'skel', style: 'width:90%' }), h('div', { class: 'skel', style: 'width:72%' }), h('div', { class: 'skel', style: 'width:84%' }))));
}
function pendingStep(step, ev) {
  const i = STEP_ORDER.indexOf(step); if (i < 0) return;
  $$('#steps .step').forEach((el, k) => { el.classList.toggle('done', k < i); el.classList.toggle('on', k === i); });
  const el = $(`#steps .step[data-k="${step}"] span`); if (el) el.textContent = step === 'tag' && ev?.of ? `${STEP_LABELS.tag} · ${ev.chunk}/${ev.of}` : STEP_LABELS[step];
}
const citeChip = (seg, at, label) => h('button', { class: 'cite', title: 'Jump to this moment in the transcript & audio', onclick: (e) => { e.stopPropagation(); seekTo(seg); } }, '◷ ' + (label ?? mmss(at)), h('span', { 'aria-hidden': true }, '↗'));
function renderMinutes() {
  const m0 = S.minutes, t = S.lang ? S.translations[S.lang] : null;
  const pane = $('#pane-minutes'); pane.replaceChildren();
  const g = m0.grounding;
  pane.append(h('h3', { class: 'm-title' }, t?.title ?? m0.title), h('p', { class: 'm-sum' }, t?.summary ?? m0.summary));
  // language row
  const row = h('div', { class: 'm-tools' }, h('span', { class: 'note' }, '🌐 Translate on-device:'));
  const langs = S.api.mode === 'live' ? S.api.langs : S.api.allLangs;
  row.append(h('button', { class: `lang ${!S.lang ? 'on' : ''}`, onclick: () => setLang(null) }, 'English'));
  for (const [k, label] of Object.entries(langs)) {
    const avail = S.api.mode === 'live' || S.api.langs[k];
    row.append(h('button', { class: `lang ${S.lang === k ? 'on' : ''}`, 'data-lang': k, disabled: !avail, title: avail ? 'Bergamot NMT, runs locally' : 'Not recorded in the hosted replay — available in the local app', onclick: (e) => setLang(k, e.currentTarget) }, label));
  }
  pane.append(row);
  if (t) pane.append(h('div', { class: 'tr-note' }, `Translated ${S.api.mode === 'replay' ? '(recorded) ' : ''}by Bergamot NMT running on-device${t.ms ? ` in ${t.ms} ms` : ''} · citations still point to the original-language transcript.`));
  const dropped = g.droppedTotal;
  pane.append(h('div', { class: 'ground' }, svgShield(), h('div', {}, h('b', {}, 'Grounded: '), `every item below cites the transcript line it came from. ${dropped ? `${dropped} model suggestion${dropped > 1 ? 's' : ''} that could not be verified ${dropped > 1 ? 'were' : 'was'} removed.` : 'Nothing had to be removed.'}`, h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' }, `Candidates tagged: ${g.candidates.decisions} decisions, ${g.candidates.actions} actions, ${g.candidates.risks} risks → verified: ${m0.decisions.length}, ${m0.actions.length}, ${m0.risks.length}.`))));
  const ownerColor = (name) => colorOf(Object.keys(S.speakers).find((l) => S.speakers[l] === name) ?? name);
  const section = (title, n) => h('div', { class: 'sec' }, title, h('span', { class: 'n' }, n));
  pane.append(section('Decisions', m0.decisions.length));
  m0.decisions.forEach((d, i) => pane.append(h('div', { class: 'item', style: `--i:${i}` }, h('div', { class: 'ix' }, i + 1), h('div', {}, h('div', { class: 'tt' }, t?.decisions[i]?.text ?? d.text), h('div', { class: 'meta' }, d.speaker ? h('span', { class: 'pill own' }, 'said by ' + d.speaker) : null)), citeChip(d.seg, d.at), d.quote ? h('div', { class: 'quote' }, '“' + d.quote.slice(0, 200) + '”') : null)));
  pane.append(section('Action items', m0.actions.length));
  m0.actions.forEach((a, i) => pane.append(h('div', { class: 'item act', style: `--i:${i + 3};--c0:${ownerColor(a.owner)}` }, h('div', { class: 'ix' }, (a.owner || '?')[0]), h('div', {}, h('div', { class: 'tt' }, t?.actions[i]?.task ?? a.task), h('div', { class: 'meta' }, h('span', { class: 'pill own' }, a.owner), (t?.actions[i]?.due ?? a.due) ? h('span', { class: 'pill due' }, '📅 ' + (t?.actions[i]?.due ?? a.due)) : null)), citeChip(a.seg, a.at), a.quote ? h('div', { class: 'quote' }, '“' + a.quote.slice(0, 200) + '”') : null)));
  pane.append(section('Risks', m0.risks.length));
  m0.risks.forEach((r, i) => pane.append(h('div', { class: 'item risk', style: `--i:${i + 6}` }, h('div', { class: 'ix' }, '!'), h('div', {}, h('div', { class: 'tt' }, t?.risks[i]?.text ?? r.text)), citeChip(r.seg, r.at), r.quote ? h('div', { class: 'quote' }, '“' + r.quote.slice(0, 200) + '”') : null)));
  const tools = h('div', { class: 'row-actions' }, h('button', { class: 'btn sm', onclick: copyMd }, 'Copy as Markdown'));
  if (S.api.exportUrl()) tools.append(h('a', { class: 'btn sm', href: S.api.exportUrl() }, 'Download .md'));
  pane.append(tools);
}
const svgShield = () => { const d = document.createElement('div'); d.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2.5 4.5 5.5v6c0 4.7 3.1 8.2 7.5 10 4.4-1.8 7.500-5.300 7.500-10v-6z" fill="none" stroke="#5cffb0" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#5cffb0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; return d.firstChild; };
async function setLang(k, btn) {
  if (!k) { S.lang = null; renderMinutes(); return; }
  if (!S.translations[k]) { btn?.classList.add('busy'); try { S.translations[k] = await S.api.translate(k); } catch (e) { toast(e.message, 5000); btn?.classList.remove('busy'); return; } }
  S.lang = k; renderMinutes();
}
function mdText() {
  const m = S.minutes, t = S.lang ? S.translations[S.lang] : null;
  return [`# ${t?.title ?? m.title}`, '', t?.summary ?? m.summary, '', '## Decisions', ...m.decisions.map((d, i) => `- ${t?.decisions[i]?.text ?? d.text} _(${mmss(d.at)})_`), '', '## Action items', ...m.actions.map((a, i) => `- **${a.owner}** — ${t?.actions[i]?.task ?? a.task}${(t?.actions[i]?.due ?? a.due) ? ` _(due ${t?.actions[i]?.due ?? a.due})_` : ''} _(${mmss(a.at)})_`), '', '## Risks', ...m.risks.map((r, i) => `- ${t?.risks[i]?.text ?? r.text} _(${mmss(r.at)})_`), '', `_Generated on-device with Tether QVAC · offline verdict: ${S.receipt?.verdict ?? 'n/a'}_`].join('\n');
}
async function copyMd() { try { await navigator.clipboard.writeText(mdText()); toast('Minutes copied as Markdown'); } catch { toast('Copy blocked by the browser'); } }

// ───────────────────────── ask ─────────────────────────
let askBuilt = false;
function renderAskPane() {
  const pane = $('#pane-ask'); if (askBuilt) return; askBuilt = true;
  const input = h('input', { id: 'q', placeholder: S.api.mode === 'replay' ? 'Pick a recorded question below…' : 'Ask anything about this meeting…', autocomplete: 'off', maxlength: '300' });
  const go = (q) => { q = (q ?? input.value).trim(); if (!q) return; input.value = ''; ask(q); };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  pane.append(h('div', { class: 'ask-box' }, input, h('button', { class: 'btn primary sm', onclick: () => go() }, 'Ask')),
    h('div', { class: 'sugg' }, ...S.api.suggestions().map((q) => h('button', { onclick: () => go(q) }, q))),
    h('div', { id: 'qa-list' }),
    h('div', { class: 'note' }, S.api.mode === 'replay' ? 'Recorded answers from the real local run. Locally you can ask anything.' : 'Answers use EmbeddingGemma retrieval over 3-line transcript windows + Qwen3-4B. A citation only counts if it points to a line that was actually retrieved.'));
}
async function ask(question) {
  if (S.running) { toast('Still processing the meeting — try again in a moment.'); return; }
  const list = $('#qa-list');
  const a = h('div', { class: 'a stream' }); const src = h('div', {}); const ver = h('div', {});
  const card = h('div', { class: 'qa' }, h('div', { class: 'q' }, question), a, ver, src);
  list.prepend(card);
  let text = '', sources = [];
  const renderText = (t, cited = [], unverified = []) => { a.replaceChildren(); t.split(/(\[\d+(?:\s*,\s*\d+)*\])/).forEach((part) => { const m = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/); if (m) m[1].split(',').forEach((n) => { const id = +n.trim(); const seg = S.segments.find((s) => s.id === id); const bad = unverified.includes(id); a.append(h('button', { class: `cite inline ${bad ? 'bad' : ''}`, title: bad ? 'Unverified: this line was not in the retrieved context' : seg?.text ?? '', onclick: () => seekTo(id) }, '◷ ' + (seg ? mmss(seg.startMs) : '#' + id))); }); else a.append(document.createTextNode(part)); }); };
  try {
    await S.api.ask(question, (ev) => {
      if (ev.type === 'sources') { sources = ev.sources; }
      else if (ev.type === 'delta') { text += ev.text; renderText(text.replace(/<\/?think>/g, '').trimStart()); }
      else if (ev.type === 'notice') { a.classList.remove('stream'); a.textContent = ev.text; }
      else if (ev.type === 'done') {
        a.classList.remove('stream'); renderText(ev.text, ev.cited, ev.unverified);
        ver.className = 'verify' + (ev.unverified?.length ? ' warn' : '');
        ver.textContent = ev.cited?.length ? (ev.unverified?.length ? `⚠ ${ev.unverified.length} citation(s) not found in retrieved context` : `✓ ${ev.cited.length} citation${ev.cited.length > 1 ? 's' : ''} verified against the retrieved transcript lines`) : '';
        if (sources.length) { const cs = new Set(ev.cited ?? []); src.className = 'src'; const d = h('details', { class: 'src' }, h('summary', {}, `Retrieved ${sources.length} transcript lines`), ...sources.map((s) => h('div', { class: `s ${cs.has(s.seg) ? 'hit' : ''}`, onclick: () => seekTo(s.seg) }, h('b', {}, mmss(s.at)), h('span', {}, `${s.speaker}: ${s.text}`)))); src.replaceWith(d); }
      } else if (ev.type === 'error') { a.classList.remove('stream'); a.textContent = ev.message; }
    });
  } catch (e) { a.classList.remove('stream'); a.textContent = e.message; }
}

// ───────────────────────── receipt ─────────────────────────
const sha256hex = async (str) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map((b) => b.toString(16).padStart(2, '0')).join('');
function renderReceipt() {
  const r = S.receipt, pane = $('#pane-receipt'); pane.replaceChildren();
  const off = r.verdict === 'OFFLINE', ext = r.network.externalSocketsSeen.length;
  const cls = ext > 0 ? 'bad' : off ? '' : 'online';
  const shield = '<svg viewBox="0 0 24 24"><path d="M12 2 4 5.2v6.3c0 4.9 3.3 8.600 8 10.500 4.700-1.900 8-5.600 8-10.500V5.200z" fill="rgba(92,255,176,.12)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m8.500 12 2.500 2.600 4.600-5.200" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sh = h('div', { class: 'shield', style: `color:${ext > 0 ? 'var(--r)' : off ? 'var(--m)' : 'var(--a)'}` }); sh.innerHTML = shield; sh.append(h('i', { class: 'ring2' }));
  pane.append(h('div', { class: `verdict ${cls}` }, sh, h('div', {}, h('h3', {}, ext > 0 ? 'External connections seen' : off ? 'OFFLINE — verified on this run' : 'Online machine · no external connection seen'), h('p', {}, ext > 0 ? `${ext} non-loopback socket(s) were observed while the AI ran.` : off ? 'No network interface was up, DNS and TCP probes failed, and no external socket appeared while the AI worked.' : 'This computer had internet access, so the receipt cannot claim isolation. It still shows that the app opened 0 external connections. Run `npm run airgapped` for a no-network run.'))));
  const nb = r.network.before, na = r.network.after;
  const rows = [
    [nb.interfaces.length === 0 && na.interfaces.length === 0, 'Network interfaces up (besides loopback)', nb.interfaces.length ? nb.interfaces.map((i) => i.name).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'none'],
    [!nb.probe.online && !na.probe.online, 'Probe: DNS lookup of a public host', `${nb.probe.dns}`],
    [!nb.probe.online && !na.probe.online, 'Probe: TCP connect to 1.1.1.1:443', `${nb.probe.tcp}`],
    [ext === 0, `Non-local sockets opened by the app + QVAC worker (${r.network.socketMonitor.startsWith('linux') ? '/proc/net' : 'unsupported'}, ${r.network.socketSamples} samples @ 200 ms)`, `${ext} seen`],
    [!r.modelsDownloadedDuringJob, 'Model files downloaded during this run', r.modelsDownloadedDuringJob ? 'yes' : 'none — all cached'],
  ];
  pane.append(h('div', { class: 'ev' }, ...rows.map(([ok, label, val], i) => h('div', { style: `--i:${i}` }, h('span', { class: ok ? 'ok' : 'no' }, ok ? '✓' : '•'), h('span', {}, label), h('span', { class: 'val' }, val)))));
  pane.append(h('p', { class: 'note', style: 'margin:10px 0 0' }, 'Probes and socket samples are evidence recorded on this machine — not a mathematical proof. `npm run airgapped` is the strong check: it removes the network entirely.'));
  pane.append(h('div', { class: 'sec' }, 'Hash chain', h('span', { class: 'n' }, r.chain.length)));
  const chain = h('div', { class: 'chain', id: 'chain' });
  r.chain.forEach((e, i) => chain.append(h('div', { class: 'blk', style: `--i:${i}`, 'data-i': i }, h('b', {}, e.k + (e.stage ? ` · ${e.stage}` : '')), h('div', { class: 'h' }, e.hash.slice(0, 14) + '…'), h('div', { class: 'p' }, '← ' + e.prev.slice(0, 8)))));
  pane.append(chain);
  const verifyBtn = h('button', { class: 'btn sm', onclick: () => verifyChain(false) }, 'Verify chain in browser');
  const tamperBtn = h('button', { class: 'btn sm', onclick: () => verifyChain(true) }, 'Tamper with one entry & re-verify');
  const dl = S.api.receiptUrl() ? h('a', { class: 'btn sm', href: S.api.receiptUrl() }, 'Download receipt.json') : h('button', { class: 'btn sm', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })), download: 'offline-receipt.json' }); a.click(); } }, 'Download receipt.json');
  pane.append(h('div', { class: 'row-actions' }, verifyBtn, tamperBtn, dl));
  pane.append(h('div', { class: 'sec' }, 'Models that ran', h('span', { class: 'n' }, r.models.length)));
  pane.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Model (QVAC registry)'), h('th', {}, 'Size'), h('th', {}, 'SHA-256'))), h('tbody', {}, ...r.models.map((m) => h('tr', {}, h('td', {}, m.name), h('td', { class: 'num' }, fmtMB(m.size)), h('td', { class: 'num' }, (m.sha256 ?? '').slice(0, 12) + '…'))))));
  pane.append(h('div', { class: 'sec' }, 'This run', h('span', { class: 'n' }, r.device.cores + ' cores')));
  pane.append(h('table', { class: 'tbl' }, h('tbody', {},
    ...[['Device', `${r.device.cpu} · ${r.device.cores} cores · ${r.device.totalMemGB} GB RAM · CPU only`], ['QVAC SDK', `@qvac/sdk ${r.qvac.version} · ${r.qvac.profile} profile`], ['Audio', `${r.audio.seconds} s · sha256 ${r.audio.sha256.slice(0, 16)}…`], ['Stage times', Object.entries(r.timingsMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(' · ')], ['Peak memory', `${(r.peakRssMB / 1024).toFixed(1)} GB resident (app + QVAC worker)`], ['Created', r.createdAt]].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))))));
  if (S.api.mode === 'live') pane.append(h('div', { class: 'sec' }, 'Prove it yourself'), h('div', { class: 'cmd' }, 'npm run airgapped   # whole app inside a network namespace: no interfaces, no internet'));
}
async function verifyChain(tamper) {
  const r = S.receipt; const blocks = $$('#chain .blk'); blocks.forEach((b) => b.classList.remove('ok', 'bad'));
  let prev = '0'.repeat(64), good = true;
  for (let i = 0; i < r.chain.length; i++) {
    const { prev: p, hash, ...rest } = structuredClone(r.chain[i]);
    if (tamper && i === 2) { const k = Object.keys(rest).find((x) => typeof rest[x] === 'number' && x !== 'samples'); if (k) rest[k] += 1; else rest.k += '!'; }
    const ok = good && p === prev && (await sha256hex(prev + JSON.stringify(rest))) === hash;
    blocks[i].classList.add(ok ? 'ok' : 'bad'); blocks[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (!ok) good = false; prev = hash; await sleep(260);
  }
  toast(good ? '✓ Chain verified — every entry links to the previous hash (SHA-256 computed in your browser).' : '✗ Tampering detected — the chain breaks at the altered entry and everything after it.', 5200);
}

// ───────────────────────── benchmark ─────────────────────────
let benchDone = false;
async function renderBench() {
  const pane = $('#pane-bench'); if (benchDone) return; benchDone = true;
  const b = await S.api.bench();
  if (!b) { pane.replaceChildren(h('div', { class: 'empty' }, 'No benchmark file found. Run `npm run bench`.')); return; }
  const r = b.runs.find((x) => x.profile === 'balanced') ?? b.runs[0], lite = b.runs.find((x) => x.profile === 'lite');
  const pct = (x) => (x * 100).toFixed(1) + '%';
  pane.replaceChildren(
    h('p', { class: 'm-sum', style: 'margin-top:0' }, `Measured on ${b.device.cpu}, ${b.device.cores} cores, ${b.device.memGB} GB RAM, no GPU. Sample: ${r.audioSeconds} s, 3 speakers (synthetic TTS). Every number comes from \`npm run bench\` (eval/results.json).`),
    h('div', { class: 'stats' },
      ...[[pct(r.asr.final?.wer ?? r.asr.draft.wer), 'word error rate · diarized ASR'], [r.speakersFound + '/3', 'speakers separated'], [r.realtimeFactor + '×', 'real-time factor (CPU)'], [(r.peakResidentMB / 1024).toFixed(1) + ' GB', 'peak memory']].map(([v, l]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)))),
    h('div', { class: 'sec' }, 'Accuracy by stage'),
    ...[['Whisper draft — word accuracy', 1 - r.asr.draft.wer], ['MOSS-Transcribe-Diarize — word accuracy', 1 - (r.asr.final?.wer ?? r.asr.draft.wer)], ['Minutes recall (decisions · actions · risks)', r.minutes.overall.recall], ['Minutes precision', r.minutes.overall.precision], ['Key facts kept in transcript', r.keyFacts.kept / r.keyFacts.total]].flatMap(([l, v]) => [h('div', { class: 'note', style: 'justify-content:space-between' }, h('span', {}, l), h('b', { class: 'mono' }, pct(v))), h('div', { class: 'bar' }, h('i', { 'data-w': v * 100 }))]),
    lite ? h('div', {}, h('div', { class: 'sec' }, 'Lite profile (8 GB laptops)'), h('p', { class: 'note' }, `Whisper + Qwen3-1.7B, no diarization: ${(lite.totalMs / 1000).toFixed(0)} s, peak ${(lite.peakResidentMB / 1024).toFixed(1)} GB, minutes recall ${pct(lite.minutes.overall.recall)}, precision ${pct(lite.minutes.overall.precision)}. Smaller footprint, visibly weaker minutes — we report it rather than hide it.`)) : null,
    h('div', { class: 'sec' }, 'Cloud note-taker vs. Pocket Minutes'),
    h('table', { class: 'cmp' }, h('tbody', {}, ...[['Recording leaves the device', 'Typically yes (uploaded to a vendor)', 'Never — verified by the receipt'], ['Works on a plane / air-gapped', 'No', 'Yes (after one-time model download)'], ['Per-meeting fee', 'Typically subscription / per-minute', 'None — your hardware'], ['Citations to the exact second', 'Varies', 'Every item, click-to-audio'], ['Hard-audio accuracy', 'May be higher with large cloud models', 'Smaller local models — see numbers above']].map(([a, c, p]) => h('tr', {}, h('td', {}, a), h('td', { class: 'muted' }, c), h('td', {}, p))))),
    h('p', { class: 'note' }, 'The cloud column is a qualitative category description, not a measurement — no cloud service was benchmarked.'));
  requestAnimationFrame(() => $$('.bar i', pane).forEach((el) => (el.style.width = el.dataset.w + '%')));
}

// ───────────────────────── browser-side audio → 16 kHz mono WAV ─────────────────────────
async function toWav16k(file) {
  const ab = await file.arrayBuffer(); const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const dec = await ctx.decodeAudioData(ab); ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(dec.duration * 16000), 16000); const src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf); const ws = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); ws(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 0x7fff, true);
  return new File([buf], file.name.replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' });
}
