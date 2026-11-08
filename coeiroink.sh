#!/usr/bin/env bash
set -e

# COEIROINK Engine 起動・管理スクリプト

COMMAND="${1:-start}"
MODE="${2:-cpu}"

case "$COMMAND" in
  start)
    if [ "$MODE" = "gpu" ]; then
      echo "🚀 COEIROINK Engine (GPU版) を起動しています..."
      docker compose --profile coeiroink-gpu up -d --build coeiroink-gpu
    else
      echo "🚀 COEIROINK Engine (CPU版) を起動しています..."
      docker compose --profile coeiroink up -d --build coeiroink-cpu
    fi
    echo "✅ 起動完了: http://localhost:50032"
    ;;
  stop)
    echo "🛑 COEIROINK Engine を停止しています..."
    docker stop coeiroink_engine coeiroink_engine_gpu 2>/dev/null || true
    docker rm coeiroink_engine coeiroink_engine_gpu 2>/dev/null || true
    echo "✅ 停止しました"
    ;;
  status)
    docker compose ps
    echo "--- ヘルスチェック (COEIROINK: 50032) ---"
    if curl -s http://localhost:50032/v1/speakers > /dev/null 2>&1; then
      echo "✅ COEIROINK は正常に動作しています (http://localhost:50032)"
    elif curl -s http://localhost:50032/docs > /dev/null 2>&1; then
      echo "✅ COEIROINK は正常に動作しています (http://localhost:50032)"
    else
      echo "⚠️ COEIROINK は停止しています (http://localhost:50032)"
    fi
    ;;
  logs)
    docker logs -f coeiroink_engine 2>/dev/null || docker logs -f coeiroink_engine_gpu
    ;;
  *)
    echo "使用方法: $0 {start|stop|status|logs} [cpu|gpu]"
    echo "  例: $0 start        (CPU版起動: port 50032)"
    echo "  例: $0 start gpu    (NVIDIA GPU版起動: port 50032)"
    echo "  例: $0 status       (ステータス確認)"
    echo "  例: $0 stop         (停止)"
    exit 1
    ;;
esac
