import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { chain, verifyChain, externalSockets, ownedInodes, interfaces } from '../src/offline/monitor.mjs';

test('hash chain verifies and detects tampering anywhere', () => {
  const c = chain([{ k: 'audio', n: 1 }, { k: 'stage', ms: 10 }, { k: 'minutes', n: 3 }]);
  assert.ok(verifyChain(c));
  const t = structuredClone(c); t[1].ms = 11; assert.ok(!verifyChain(t));
  const r = structuredClone(c); r.splice(1, 1); assert.ok(!verifyChain(r));
});
test('interfaces() lists only non-loopback addresses', () => { for (const i of interfaces()) assert.ok(!/^127\./.test(i.address)); });
test('loopback sockets are never reported as external', { skip: process.platform !== 'linux' }, async () => {
  const srv = net.createServer().listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
  const c = net.connect(srv.address().port, '127.0.0.1'); await new Promise((r) => c.once('connect', r));
  assert.ok(ownedInodes().size >= 2);
  assert.equal(externalSockets().sockets.length, 0);
  c.destroy(); srv.close();
});
