#!/usr/bin/env bash
# stop.sh — stop the server + tunnel started by start.sh.
cd "$(dirname "$0")"
if [ -f .pids ]; then
  kill $(cat .pids) 2>/dev/null || true
  rm -f .pids
fi
# Belt-and-braces: kill any lingering bun/cloudflared started from here.
pkill -f "bun server.mjs" 2>/dev/null || true
pkill -f "cloudflared tunnel.*trycloudflare" 2>/dev/null || true
rm -f .tunnel-url
echo "stopped"
