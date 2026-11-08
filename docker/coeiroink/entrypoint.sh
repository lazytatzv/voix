#!/bin/sh
set -e

INTERNAL_PORT=50032
EXTERNAL_PORT=50033

echo "🚀 Starting COEIROINK Engine..."

# Find engine executable
ENGINE_BIN=""
if [ -f "/app/coeiroink/engine/engine" ]; then
  ENGINE_BIN="/app/coeiroink/engine/engine"
elif [ -f "/app/coeiroink/COEIROINKv2" ]; then
  ENGINE_BIN="/app/coeiroink/COEIROINKv2"
elif [ -f "/app/coeiroink/engine" ]; then
  ENGINE_BIN="/app/coeiroink/engine"
else
  # Search recursively
  FOUND=$(find /app/coeiroink -type f -name "engine" -o -name "COEIROINKv2" 2>/dev/null | head -n 1)
  if [ -n "$FOUND" ]; then
    ENGINE_BIN="$FOUND"
  fi
fi

if [ -z "$ENGINE_BIN" ]; then
  echo "❌ Error: Could not locate COEIROINK engine binary."
  ls -la /app/coeiroink/
  exit 1
fi

chmod +x "$ENGINE_BIN"
echo "Found engine at: $ENGINE_BIN"

# Start engine in background
"$ENGINE_BIN" &
ENGINE_PID=$!

echo "⏳ Waiting for COEIROINK engine to listen on 127.0.0.1:${INTERNAL_PORT}..."
READY=0
for i in $(seq 1 60); do
  if nc -z 127.0.0.1 ${INTERNAL_PORT} 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ $READY -eq 1 ]; then
  echo "✅ COEIROINK engine is listening on 127.0.0.1:${INTERNAL_PORT}."
else
  echo "⚠️ Engine did not respond on 127.0.0.1:${INTERNAL_PORT} within 30s, proceeding to forward..."
fi

echo "📡 Exposing port ${EXTERNAL_PORT} on 0.0.0.0 via socat proxy..."
exec socat TCP-LISTEN:${EXTERNAL_PORT},fork,reuseaddr TCP:127.0.0.1:${INTERNAL_PORT}
