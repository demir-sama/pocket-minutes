// "Offline receipt" evidence. Not a proof of isolation — it records what this machine looked like while the AI ran:
//  • non-loopback network interfaces that were UP
//  • any non-loopback TCP/UDP sockets seen in /proc/net/* (Linux) sampled every 200 ms during a job
//  • active outbound probes (DNS + TCP connect) that are expected to FAIL
// The strongest check is `npm run airgapped`, which runs the whole app inside a Linux network namespace with no interfaces.
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import crypto from 'node:crypto';

export function interfaces() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs ?? []) if (!a.internal) out.push({ name, address: a.address, family: a.family });
  return out;
}

const hexIp = (h) => (h.length === 8 ? h.match(/../g).reverse().map((x) => parseInt(x, 16)).join('.') : h);
const isLoop = (ip) => /^127\./.test(ip) || ip === '0.0.0.0' || /^0{32}$/.test(ip) || /^0{31}1$/.test(ip) || /^0{24}0{0,7}$/.test(ip) || ip.toLowerCase().startsWith('0000000000000000ffff00007f');

export function externalSockets() {
  const found = [];
  if (process.platform !== 'linux') return { supported: false, sockets: found };
  for (const f of ['tcp', 'tcp6', 'udp', 'udp6']) {
    let txt = '';
    try { txt = fs.readFileSync(`/proc/net/${f}`, 'utf8'); } catch { continue; }
    for (const line of txt.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 4) continue;
      const [rip] = cols[2].split(':');
      const st = cols[3];
      // 01 ESTABLISHED, 02 SYN_SENT, 03 SYN_RECV ; UDP "connected" sockets show remote != 0
      if (/^0+$/.test(rip) && f.startsWith('udp')) continue;
      if (f.startsWith('tcp') && !['01', '02', '03'].includes(st)) continue;
      if (/^0+$/.test(rip)) continue;
      if (isLoop(f.endsWith('6') ? rip : hexIp(rip))) continue;
      found.push({ proto: f, remote: f.endsWith('6') ? rip : hexIp(rip), state: st });
    }
  }
  return { supported: true, sockets: found };
}

export async function probe({ timeoutMs = 1500 } = {}) {
  const t0 = Date.now();
  const dnsRes = await Promise.race([dns.lookup('example.com').then(() => 'resolved').catch((e) => `failed (${e.code})`), new Promise((r) => setTimeout(() => r('timeout'), timeoutMs))]);
  const tcp = await new Promise((resolve) => {
    const s = net.connect({ host: '1.1.1.1', port: 443, timeout: timeoutMs });
    s.once('connect', () => { s.destroy(); resolve('connected'); });
    s.once('timeout', () => { s.destroy(); resolve('timeout'); });
    s.once('error', (e) => resolve(`failed (${e.code})`));
  });
  const online = dnsRes === 'resolved' || tcp === 'connected';
  return { dns: dnsRes, tcp: tcp, online, ms: Date.now() - t0 };
}

/** Sample sockets while `run()` executes. Returns {result, report}. */
export async function observe(run) {
  const seen = new Map();
  let samples = 0;
  const tick = () => { samples++; for (const s of externalSockets().sockets) seen.set(`${s.proto}|${s.remote}|${s.state}`, s); };
  const iv = setInterval(tick, 200);
  const before = { interfaces: interfaces(), probe: await probe(), at: new Date().toISOString() };
  let result;
  try { result = await run(); } finally { clearInterval(iv); tick(); }
  const after = { interfaces: interfaces(), probe: await probe(), at: new Date().toISOString() };
  const supported = externalSockets().supported;
  return {
    result,
    report: {
      before, after, socketSamples: samples, socketMonitor: supported ? 'linux:/proc/net' : 'unsupported-on-this-os',
      externalSocketsSeen: [...seen.values()],
      verdict: !before.probe.online && !after.probe.online && seen.size === 0 ? 'OFFLINE' : before.probe.online || after.probe.online ? 'ONLINE' : 'EXTERNAL_SOCKETS_SEEN',
    },
  };
}

// ---- hash-chained receipt ----
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function chain(entries) {
  let prev = '0'.repeat(64);
  return entries.map((e) => { const body = JSON.stringify(e); const hash = sha(prev + body); const out = { ...e, prev, hash }; prev = hash; return out; });
}
export function verifyChain(entries) {
  let prev = '0'.repeat(64);
  for (const e of entries) {
    const { prev: p, hash, ...rest } = e;
    if (p !== prev || sha(prev + JSON.stringify(rest)) !== hash) return false;
    prev = hash;
  }
  return true;
}
export const sha256 = sha;
