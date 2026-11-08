#!/usr/bin/env bash
set -e

# Voix Studio — Unified TTS Engines Manager (VOICEVOX & COEIROINK)

COMMAND="${1:-start}"
TARGET="${2:-all}"
MODE="${3:-cpu}"

case "$COMMAND" in
  start)
    if [ "$TARGET" = "voicevox" ]; then
      ./voicevox.sh start "$MODE"
    elif [ "$TARGET" = "coeiroink" ]; then
      ./coeiroink.sh start "$MODE"
    else
      echo "🚀 Starting all TTS engines (VOICEVOX: 50021 & COEIROINK: 50032)..."
      ./voicevox.sh start "$MODE"
      ./coeiroink.sh start "$MODE"
      echo "✅ All TTS engines started!"
    fi
    ;;
  stop)
    if [ "$TARGET" = "voicevox" ]; then
      ./voicevox.sh stop
    elif [ "$TARGET" = "coeiroink" ]; then
      ./coeiroink.sh stop
    else
      echo "🛑 Stopping all TTS engines..."
      ./voicevox.sh stop
      ./coeiroink.sh stop
      echo "✅ All TTS engines stopped."
    fi
    ;;
  status)
    echo "=================================================="
    echo "  VOICEVOX Status (http://localhost:50021)"
    echo "=================================================="
    ./voicevox.sh status || true
    echo ""
    echo "=================================================="
    echo "  COEIROINK Status (http://localhost:50032)"
    echo "=================================================="
    ./coeiroink.sh status || true
    ;;
  logs)
    if [ "$TARGET" = "coeiroink" ]; then
      ./coeiroink.sh logs
    else
      ./voicevox.sh logs
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|status|logs} [all|voicevox|coeiroink] [cpu|gpu]"
    echo "  Example: $0 start all       (Start both VOICEVOX & COEIROINK in CPU mode)"
    echo "  Example: $0 start coeiroink (Start only COEIROINK)"
    echo "  Example: $0 status          (Check status of both engines)"
    echo "  Example: $0 stop all        (Stop all engines)"
    exit 1
    ;;
esac
