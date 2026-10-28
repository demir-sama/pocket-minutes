#!/usr/bin/env bash
# Re-record docs/demo.mp4 inside a no-network namespace (server + Chrome both inside it).
# Needs: models cached (npm run models), Kokoro TTS for narration (KOKORO_DIR + python deps; see scripts/video/tts.py),
# google-chrome, ffmpeg, Linux unprivileged user namespaces.  Usage: KOKORO_DIR=... AUDIO_DIR=/tmp/pm-tts scripts/record-video.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# Screen capture competes with inference for CPU. llama.cpp's spinning thread pool collapses when it has fewer free cores than
# threads, so cap the LLM threads below the core count while recording (POCKET_THREADS, default cores-2).
export POCKET_THREADS=${POCKET_THREADS:-$(( $(nproc) > 4 ? $(nproc) - 2 : 2 ))}
exec unshare -rn bash -c '
  ip link set lo up
  POCKET_PROFILE=balanced PORT=4747 ${SRV_CPUS:+taskset -c $SRV_CPUS} node src/server.mjs > /tmp/pm-video-server.log 2>&1 &
  SRV=$!; trap "kill $SRV 2>/dev/null" EXIT
  for i in $(seq 1 40); do curl -sf http://127.0.0.1:4747/api/health >/dev/null && break; sleep 0.5; done
  ${REC_CPUS:+taskset -c $REC_CPUS} node scripts/make-video.mjs
'
