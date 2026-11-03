#!/usr/bin/env bash
set -e

# VOICEVOX Engine 起動・管理スクリプト

COMMAND="${1:-start}"
MODE="${2:-cpu}"

case "$COMMAND" in
  start)
    if [ "$MODE" = "gpu" ]; then
      echo "🚀 VOICEVOX Engine (GPU版) を起動しています..."
      docker compose --profile gpu up -d voicevox-gpu
    else
      echo "🚀 VOICEVOX Engine (CPU版) を起動しています..."
      docker compose up -d voicevox-cpu
    fi
    echo "✅ 起動完了: http://localhost:50021"
    ;;
  stop)
    echo "🛑 VOICEVOX Engine を停止しています..."
    docker compose down
    echo "✅ 停止しました"
    ;;
  status)
    docker compose ps
    echo "--- ヘルスチェック ---"
    curl -s http://localhost:50021/version || echo "VOICEVOXは停止しています"
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "使用方法: $0 {start|stop|status|logs} [cpu|gpu]"
    echo "  例: $0 start        (CPU版起動)"
    echo "  例: $0 start gpu    (NVIDIA GPU版起動)"
    echo "  例: $0 stop         (停止)"
    exit 1
    ;;
esac
