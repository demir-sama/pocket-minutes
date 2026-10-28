#!/usr/bin/env bash
# Run Pocket Minutes inside a Linux network namespace that has NO network interfaces except loopback.
# If anything in the app tried to phone home it would fail — and the Offline Receipt will show it.
# Requires: Linux with unprivileged user namespaces (`unshare -rn`). Models must already be cached (`npm run models`).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v unshare >/dev/null || { echo "unshare not found (Linux only)"; exit 1; }
exec unshare -rn bash -c '
  ip link set lo up
  echo "── network namespace ─────────────────────────────"
  ip -br addr
  (curl -sm2 -o /dev/null https://example.com && echo "reachable: example.com  (!!)") || echo "example.com: unreachable (expected)"
  echo "──────────────────────────────────────────────────"
  exec node src/server.mjs
'
