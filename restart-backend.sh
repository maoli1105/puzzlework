#!/bin/bash
# バックエンドのみ再起動（Viteは触らない）

BACKEND_PORT=3002
BACKEND_DIR="$(dirname "$0")/backend"

echo "🔄 バックエンドを再起動します..."

# ── 既存プロセスを停止 ─────────────────────────────────────────────────────
OLD_PIDS=$(lsof -ti :$BACKEND_PORT 2>/dev/null)
if [ -n "$OLD_PIDS" ]; then
  echo "  停止中: PID $OLD_PIDS (port $BACKEND_PORT)"
  echo "$OLD_PIDS" | xargs kill 2>/dev/null
  sleep 1
  # 念のため強制終了
  echo "$OLD_PIDS" | xargs kill -9 2>/dev/null
  # ポート解放を確認
  for i in 1 2 3; do
    sleep 0.5
    if ! lsof -ti :$BACKEND_PORT >/dev/null 2>&1; then break; fi
  done
fi

# ── ビルド ────────────────────────────────────────────────────────────────
echo "  ビルド中..."
cd "$BACKEND_DIR" || exit 1
npm run build 2>&1
if [ $? -ne 0 ]; then
  echo "❌ ビルドに失敗しました。起動を中断します。"
  exit 1
fi

# ── 起動 ─────────────────────────────────────────────────────────────────
echo "  サーバー起動中..."
nohup node dist/server.js < /dev/null >> backend.log 2>&1 &
NEW_PID=$!
disown $NEW_PID   # Terminal閉じても死なないように
echo "  PID: $NEW_PID"

# ── 起動確認 ──────────────────────────────────────────────────────────────
for i in 1 2 3 4 5; do
  sleep 1
  if curl -s http://localhost:$BACKEND_PORT/health | grep -q "ok"; then
    echo "✅ バックエンド起動完了 (http://localhost:$BACKEND_PORT)"
    exit 0
  fi
  echo "  待機中... ($i/5)"
done

echo "❌ 起動確認がタイムアウトしました。backend.log を確認してください。"
exit 1
