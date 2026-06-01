#!/usr/bin/env bash
# Serves the shareable WMS dashboard on this machine's LAN IP so other
# users on the same network can hit it in their browser. Press Ctrl+C
# to stop. Your laptop must stay awake and on the network while it runs.

set -euo pipefail

PORT="${PORT:-8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="index-shareable.html"

if [ ! -f "$SCRIPT_DIR/$FILE" ]; then
  echo "ERROR: $FILE not found in $SCRIPT_DIR" >&2
  exit 1
fi

# Find this machine's primary LAN IP (works on macOS — falls back to a
# generic ifconfig parse on other Unixes).
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "${LAN_IP:-}" ]; then
  LAN_IP="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"
fi
LAN_IP="${LAN_IP:-<your-lan-ip>}"

cat <<EOF

  UNIS WMS Dashboard — local sharing server
  ─────────────────────────────────────────
  Folder:  $SCRIPT_DIR
  File:    $FILE
  Port:    $PORT

  Share this URL with colleagues on the same network:

      http://${LAN_IP}:${PORT}/${FILE}

  Press Ctrl+C to stop.

  If teammates can reach the page but every API call fails in their
  browser DevTools with a CORS error, the Atlas/Wise APIs don't allow
  your LAN origin. Fixes (in order of effort):
    1. Ask IT to add http://${LAN_IP}:${PORT} to the CORS allow-list,
       OR allow http://*:* on the LAN.
    2. Switch to a *.item.com subdomain (see IT-hosting-request.md).
    3. Stand up a tiny proxy backend on this machine that forwards
       /api/* to atlas.item.com and unis.item.com (ask me).

  If teammates can't even reach the page (browser hangs / connection
  refused), it's usually one of:
    - macOS firewall blocking inbound — System Settings → Network →
      Firewall → Options → allow incoming connections for python3.
    - Network has "client isolation" enabled (common on guest WiFi) —
      switch to your main corporate network or wired.
    - Wrong IP — re-run this script after rejoining the network.

EOF

cd "$SCRIPT_DIR"
exec python3 -m http.server "$PORT" --bind 0.0.0.0