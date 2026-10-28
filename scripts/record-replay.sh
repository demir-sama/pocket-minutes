#!/usr/bin/env bash
# Re-record the hosted-demo replay from a REAL run, executed inside the no-network namespace so the recorded
# Offline Receipt honestly says OFFLINE. Needs models cached first: `npm run models`.
set -euo pipefail
cd "$(dirname "$0")/.."
exec unshare -rn bash -c '
  ip link set lo up
  node src/server.mjs > /tmp/pm-airgapped.log 2>&1 &
  SRV=$!
  for i in $(seq 1 40); do curl -sf http://127.0.0.1:4747/api/health >/dev/null && break; sleep 0.5; done
  node scripts/build-replay.mjs "$@"
  kill $SRV
' _ "$@"
