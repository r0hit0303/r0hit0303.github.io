#!/usr/bin/env bash
# Serve this GitHub Pages repo locally.
# Usage: ./serve.sh [port]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-${PORT:-8000}}"
BIND="${BIND:-127.0.0.1}"

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if port_in_use "$PORT"; then
  start="$PORT"
  PORT=""
  for try in $(seq "$start" $((start + 20))); do
    if ! port_in_use "$try"; then
      PORT="$try"
      echo "Port $start is in use; using $PORT instead." >&2
      break
    fi
  done
  if [[ -z "$PORT" ]]; then
    echo "No free port in $start–$((start + 20))." >&2
    exit 1
  fi
fi

cd "$ROOT"
echo "Serving $ROOT"
echo "  http://${BIND}:${PORT}/"
echo "  http://${BIND}:${PORT}/test-pages/polyglot-download.html"
echo "Ctrl+C to stop."
exec python3 -m http.server "$PORT" --bind "$BIND" --directory "$ROOT"
