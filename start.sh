#!/bin/bash
# PuzzleWork — バックエンド＋フロントエンドを起動
# < /dev/null + disown で Terminal を閉じてもプロセスが生き続ける

BACKEND_PORT=3002
FRONTEND_PORT=3000
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🧩 PuzzleWork を起動します..."
echo ""

# ── バックエンド ──────────────────────────────────────────────────────────────
echo "▶ バックエンド..."
OLD=$(lsof -ti :$BACKEND_PORT 2>/dev/null || true)
if [ -n "$OLD" ]; then
  echo "  既存プロセス($OLD)を停止"
  echo "$OLD" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

cd "$ROOT/backend"
echo "  ビルド中..."
if ! npm run build > /dev/null 2>&1; then
  echo "❌ ビルド失敗"; exit 1
fi

nohup node dist/server.js < /dev/null >> "$ROOT/backend/backend.log" 2>&1 &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo "  PID $BACKEND_PID → http://localhost:$BACKEND_PORT"

# ── フロントエンド ────────────────────────────────────────────────────────────
echo "▶ フロントエンド..."
OLD=$(lsof -ti :$FRONTEND_PORT 2>/dev/null || true)
if [ -n "$OLD" ]; then
  echo "  既存プロセス($OLD)を停止"
  echo "$OLD" | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

cd "$ROOT/frontend"
nohup npm run dev < /dev/null >> /tmp/puzzlework-vite.log 2>&1 &
FRONTEND_PID=$!
disown $FRONTEND_PID 2>/dev/null || true
echo "  PID $FRONTEND_PID → http://localhost:$FRONTEND_PORT"

# ── 起動確認 ──────────────────────────────────────────────────────────────────
echo ""
echo "確認中..."
sleep 4

for i in 1 2 3 4 5; do
  if curl -s http://localhost:$BACKEND_PORT/health | grep -q "ok"; then
    echo "✅ バックエンド  http://localhost:$BACKEND_PORT"; break
  fi
  [ $i -eq 5 ] && echo "❌ バックエンド 起動確認タイムアウト → backend/backend.log 確認"
  sleep 1
done

for i in 1 2 3; do
  if curl -s http://localhost:$FRONTEND_PORT | grep -q "html"; then
    echo "✅ フロントエンド http://localhost:$FRONTEND_PORT"; break
  fi
  [ $i -eq 3 ] && echo "✅ フロントエンド http://localhost:$FRONTEND_PORT (Vite起動中)"
  sleep 1
done

echo ""
echo "停止: kill \$(lsof -ti :$BACKEND_PORT :$FRONTEND_PORT 2>/dev/null)"
