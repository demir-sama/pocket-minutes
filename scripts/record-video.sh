#!/usr/bin/env bash
# Re-record docs/demo.mp4 inside a no-network namespace (server + Chrome both inside it).
# Needs: models cached (npm run models), Kokoro TTS for narration (KOKORO_DIR + python deps; see scripts/video/tts.py),
# google-chrome, ffmpeg, Linux unprivileged user namespaces.  Usage: KOKORO_DIR=... AUDIO_DIR=/tmp/pm-tts scripts/record-video.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# On an 8-core box, pin inference and the recorder apart so screen capture cannot starve the model:
#   SRV_CPUS=0-5 REC_CPUS=6,7 scripts/record-video.sh
exec unshare -rn bash -c '
  ip link set lo up
  POCKET_PROFILE=balanced PORT=4747 ${SRV_CPUS:+taskset -c $SRV_CPUS} node src/server.mjs > /tmp/pm-video-server.log 2>&1 &
  SRV=$!; trap "kill $SRV 2>/dev/null" EXIT
  for i in $(seq 1 40); do curl -sf http://127.0.0.1:4747/api/health >/dev/null && break; sleep 0.5; done
  ${REC_CPUS:+taskset -c $REC_CPUS} node scripts/make-video.mjs
'
