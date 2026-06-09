#!/bin/bash
# ============================================================
# PuzzleWork — 本番デプロイスクリプト
# 使い方: bash deploy.sh
# 何をするか:
#   1. バックエンドをビルド
#   2. データベースマイグレーションを実行（既適用はスキップ）
#   3. バックエンドを再起動
#   4. フロントエンドをビルド（本番用静的ファイル生成）
# ============================================================

set -e  # エラーで即停止

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=3002

echo "🧩 PuzzleWork デプロイ開始"
echo ""

# ── 1. バックエンド ビルド ─────────────────────────────────────────────────
echo "▶ バックエンド ビルド..."
cd "$ROOT/backend"
npm install --production=false
npm run build
echo "  ✓ ビルド完了"

# ── 2. マイグレーション ────────────────────────────────────────────────────
echo "▶ DB マイグレーション..."
npm run migrate
echo "  ✓ マイグレーション完了"

# ── 3. バックエンド 再起動 ────────────────────────────────────────────────
echo "▶ バックエンド 再起動..."
OLD=$(lsof -ti :$BACKEND_PORT 2>/dev/null || true)
if [ -n "$OLD" ]; then
  echo "  既存プロセス停止: $OLD"
  echo "$OLD" | xargs kill 2>/dev/null || true
  sleep 2
fi
nohup node dist/server.js < /dev/null >> "$ROOT/backend/backend.log" 2>&1 &
NEW_PID=$!
disown $NEW_PID 2>/dev/null || true
echo "  PID $NEW_PID 起動"

# 起動確認
for i in 1 2 3 4 5; do
  sleep 1
  if curl -s http://localhost:$BACKEND_PORT/health | grep -q "ok"; then
    echo "  ✓ バックエンド起動確認"
    break
  fi
  [ $i -eq 5 ] && echo "  ⚠ 起動確認タイムアウト — backend.log 確認"
done

# ── 4. フロントエンド ビルド（本番用）────────────────────────────────────
echo "▶ フロントエンド ビルド..."
cd "$ROOT/frontend"
npm install
npm run build
echo "  ✓ dist/ に出力完了"

echo ""
echo "✅ デプロイ完了"
echo "  バックエンド: http://localhost:$BACKEND_PORT"
echo "  フロントエンド: ./frontend/dist/ (Nginx/Caddy で配信)"
echo ""
echo "ログ: tail -f $ROOT/backend/backend.log"
