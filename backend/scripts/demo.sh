#!/bin/bash
# ============================================================
# PuzzleWork デモシード 切り替えスクリプト
# 使い方: ./scripts/demo.sh <company-type>
#
# company-type:
#   saas          SaaS開発会社 (スプリント/インフラ停滞/成熟リリース)
#   web           Web制作会社 (クライアント案件/納期超過/アーカイブ)
#   ec            EC運営会社  (セール過負荷/在庫停滞/常時稼働)
#   manufacturing 製造業      (長期開発/量産/設備停止)
#   small         小規模5人   (主力案件/後回し/自社サービス)
#   gantt         元データ    (既存のガントシードに戻す)
#
# 例: DATABASE_URL=postgres://... ./scripts/demo.sh saas
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TYPE="${1:-saas}"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL が設定されていません"
  echo "   export DATABASE_URL=postgres://user:pass@localhost:5432/puzzlework"
  exit 1
fi

case "$TYPE" in
  saas)
    echo "🚀 SaaS開発会社 シードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_saas.sql"
    echo "✅ SaaS開発会社: Sprint #12, バグ修正, インフラ停滞, 成熟リリース済み"
    ;;
  web)
    echo "🎨 Web制作会社 シードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_web_agency.sql"
    echo "✅ Web制作会社: クライアント案件4本, 納期超過あり, アーカイブ2本"
    ;;
  ec)
    echo "🛒 EC運営会社 シードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_ec.sql"
    echo "✅ EC運営会社: 夏季セール過負荷, 在庫システム停滞, 春セール完了"
    ;;
  manufacturing|mfg)
    echo "🏭 製造業 シードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_manufacturing.sql"
    echo "✅ 製造業: 新製品A試作中, 量産進行, 設備更新停滞, 旧製品廃止完了"
    ;;
  small|team)
    echo "👥 小規模チーム(5人) シードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_small_team.sql"
    echo "✅ 小規模チーム: 主力案件進行中, メンテ後回し, 自社サービス構想中"
    ;;
  gantt)
    echo "📊 元のガントシードを読み込んでいます..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed_gantt.sql"
    echo "✅ ガントシード: 15製品 × 5工程"
    ;;
  *)
    echo "❌ 不明なタイプ: $TYPE"
    echo "   使い方: $0 [saas|web|ec|manufacturing|small|gantt]"
    exit 1
    ;;
esac

echo ""
echo "📋 現在のデータ:"
psql "$DATABASE_URL" -c "
SELECT p.name AS project, COUNT(pc.id) AS pieces,
  COUNT(*) FILTER (WHERE pc.status='in_progress') AS in_prog,
  COUNT(*) FILTER (WHERE pc.status='done') AS done,
  COUNT(*) FILTER (WHERE pc.status='ready') AS ready,
  COUNT(*) FILTER (WHERE pc.status='locked') AS locked
FROM projects p
LEFT JOIN pieces pc ON pc.project_id = p.id
WHERE p.company_id = '11111111-1111-1111-1111-111111111111'
GROUP BY p.name ORDER BY in_prog DESC, pieces DESC;
"
