#!/usr/bin/env bash
# start.sh — runs the Founder Curious server + cloudflared quick tunnel.
# Designed to be run detached (via nohup) and stopped with stop.sh.
#
# Writes the public URL to .tunnel-url once available.
# Tails logs into logs/server.log and logs/tunnel.log.

set -u
cd "$(dirname "$0")"

mkdir -p logs
PORT="${PORT:-8766}"
URL_FILE=".tunnel-url"
: > logs/server.log
: > logs/tunnel.log
rm -f "$URL_FILE"

# Keep laptop awake for the duration of this script.
caffeinate -di -w $$ &

# Start the Bun server (Bun auto-loads .env).
bun server.mjs > logs/server.log 2>&1 &
SERVER_PID=$!
echo "server pid $SERVER_PID"

# Give server a moment to bind to port.
for i in 1 2 3 4 5 6 7 8; do
  if lsof -i ":$PORT" -sTCP:LISTEN -P >/dev/null 2>&1; then break; fi
  sleep 0.5
done

# Start the tunnel.
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" \
  > logs/tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "tunnel pid $TUNNEL_PID"

# Extract the trycloudflare URL from the log (waits up to 30s).
for i in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' logs/tunnel.log | head -1)
  if [ -n "$URL" ]; then
    echo "$URL" > "$URL_FILE"
    echo "public url: $URL"
    break
  fi
  sleep 0.5
done

if [ ! -s "$URL_FILE" ]; then
  echo "tunnel URL not detected in 30s; see logs/tunnel.log"
fi

# Write PIDs so stop.sh can kill them.
echo "$SERVER_PID $TUNNEL_PID" > .pids

# Stay in foreground so nohup can own the process group.
wait $SERVER_PID
