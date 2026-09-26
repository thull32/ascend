#!/usr/bin/env bash
# Start (or restart) the local API detached, logging to the scratchpad.
# Usage: scripts/dev-api.sh [logfile]
set -euo pipefail
LOG="${1:-/tmp/ascend-api.log}"
pkill -x ascend-api 2>/dev/null || true
sleep 0.5
cd "$(dirname "$0")/.."
CONTENT_LENIENT=1 setsid ./target/debug/ascend-api >"$LOG" 2>&1 < /dev/null &
for i in $(seq 1 40); do
  if curl -sf localhost:8080/api/healthz >/dev/null 2>&1; then echo "api up (pid $(pgrep -x ascend-api | head -1))"; exit 0; fi
  sleep 0.5
done
echo "api failed to start; last log lines:"; tail -5 "$LOG"; exit 1
