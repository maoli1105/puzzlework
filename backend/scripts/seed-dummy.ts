/**
 * PuzzleWork ダミーデータ投入スクリプト
 * 50人規模の会社を再現: 45 workers + 5 admins, 15 projects, 300 pieces, 80 connections
 *
 * 実行: npx ts-node scripts/seed-dummy.ts
 */

import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mouritetsuya@localhost:5432/puzzlework',
});

// ── 既存の会社IDを使う ──────────────────────────────────────────
const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const PASSWORD_HASH = '$2a$12$o5dxcTiBva3nFyFswsrUguIPpeeoHFlKSOdQJzLpZARoez3I7XDLi'; // 既存パスワードと同じハッシュ

// ── マスターデータ ─────────────────────────────────────────────

const DEPARTMENTS = ['プロダクト', 'エンジニア', 'デザイン', 'マーケ', 'セールス', 'CS', 'データ', 'HR'];

const WORKER_NAMES = [
  '田中 翔', '佐藤 美咲', '鈴木 健太', '高橋 あかり', '伊藤 拓也',
  '渡辺 彩', '山本 悠', '中村 莉子', '小林 聡', '加藤 なな',
  '吉田 大輝', '山田 ひかり', '松本 勇', '井上 麻衣', '木村 達也',
  '林 さくら', '斎藤 光', '清水 愛', '山口 蓮', '池田 結衣',
  '橋本 凌', '阿部 真由', '石川 海斗', '長谷川 葵', '近藤 涼',
  '坂本 春香', '遠藤 陸', '藤田 るい', '西村 颯', '大野 ゆい',
  '内田 朔', '岡田 まな', '宮崎 隼', '中島 はな', '津田 悠人',
  '前田 彩夏', '菅原 翔太', '河野 恵', '小野 竜也', '島田 詩織',
  '後藤 奏', '長田 慶太', '三浦 梢', '福田 蒼', '原田 凛',
];

const ADMIN_NAMES = ['鈴木 部長', '田中 CTO', '佐藤 VP', '山本 EM', '伊藤 PO'];

const PROJECT_DATA = [
  { name: '新規決済システム刷新', color: '#6366f1', desc: '老朽化した決済基盤をマイクロサービス化し処理速度3倍を目指す', budget: 80000000 },
  { name: 'モバイルアプリv3.0', color: '#0891b2', desc: 'iOS/Androidネイティブアプリの全面リニューアル', budget: 50000000 },
  { name: 'AI推薦エンジン', color: '#7c3aed', desc: 'パーソナライズド推薦でCVRを20%向上させる', budget: 35000000 },
  { name: 'データ基盤構築', color: '#059669', desc: 'リアルタイムDWHの構築とBI整備', budget: 40000000 },
  { name: '組織改革プロジェクト', color: '#dc2626', desc: '評価制度見直しとピープルマネジメント強化', budget: 15000000 },
  { name: 'グローバル展開準備', color: '#d97706', desc: '東南アジア3カ国への同時展開', budget: 120000000 },
  { name: 'セキュリティ強化', color: '#374151', desc: 'SOC2 Type II取得とゼロトラスト移行', budget: 25000000 },
  { name: 'カスタマーサクセス基盤', color: '#db2777', desc: 'チャーン率を現状比50%削減', budget: 20000000 },
  { name: 'ブランドリニューアル', color: '#ea580c', desc: 'VI刷新とコーポレートサイト再構築', budget: 18000000 },
  { name: 'パートナーAPI公開', color: '#0284c7', desc: '外部事業者向けAPI Platform v1', budget: 30000000 },
  { name: 'コスト最適化', color: '#65a30d', desc: 'インフラ費用30%削減と運用効率化', budget: 10000000 },
  { name: '採用強化', color: '#9333ea', desc: '年間採用目標80名達成のための施策', budget: 22000000 },
  { name: 'サービス品質改善', color: '#0f766e', desc: 'P99レイテンシを200ms以下に', budget: 12000000 },
  { name: 'コンプライアンス整備', color: '#b45309', desc: '個人情報保護法改正対応とGDPR準拠', budget: 8000000 },
  { name: 'R&D先行開発', color: '#7c2d12', desc: '次世代コア技術の研究開発', budget: 45000000 },
];

const SKILL_TAGS_POOL = [
  'React', 'TypeScript', 'Python', 'Go', 'Rust', 'SQL', 'AWS', 'GCP', 'Docker', 'K8s',
  'ML/AI', 'データ分析', 'UI設計', 'UXリサーチ', 'コピーライティング', 'SEO',
  'プロジェクト管理', 'ドキュメント', 'QA', 'セキュリティ', 'インフラ', 'API設計',
  '要件定義', '交渉', 'ファシリテーション', '法務', '財務', 'HR', 'マーケ分析',
];

const PIECE_TITLES: Record<string, string[]> = {
  '新規決済システム刷新': [
    '決済APIのOpenAPI仕様策定', 'Stripeとの決済統合実装', '冪等性キーの設計と実装',
    '決済フロー結合テスト', 'PCI-DSS準拠チェック', '決済履歴画面のリデザイン',
    'Webhookイベント処理基盤', 'エラーハンドリングの強化', '負荷テスト計画の策定',
    '決済DB移行スクリプト作成', 'モニタリングダッシュボード構築', '本番移行計画書作成',
    '旧システム廃止手順書', 'チームへの技術レクチャー', '決済KPIダッシュボード',
    'マルチ通貨対応実装', 'サブスクリプション課金フロー',
  ],
  'モバイルアプリv3.0': [
    'デザインシステム定義', 'ナビゲーション構造の設計', 'ホーム画面の実装',
    'プッシュ通知基盤', 'ディープリンク対応', 'オフライン機能実装',
    'App Store審査対応', 'Android Play Store対応', 'パフォーマンス計測',
    'A/Bテスト基盤', 'クラッシュ解析ツール導入', 'ユーザビリティテスト',
    'アクセシビリティ対応', 'ダークモード実装', 'App内課金フロー',
  ],
  'AI推薦エンジン': [
    '協調フィルタリングモデル構築', 'コンテンツベースフィルタリング',
    'ユーザー行動ログ設計', '推薦APIエンドポイント実装', 'A/Bテスト設計',
    'モデル評価指標の定義', 'オフライン評価パイプライン', 'リアルタイム推論基盤',
    'フィードバックループ実装', '推薦理由の説明UI', 'バイアス検知の仕組み',
  ],
  'データ基盤構築': [
    'DWH設計書作成', 'ETLパイプライン構築', 'Airflowワークフロー定義',
    'BIツール選定と導入', 'ダッシュボードv1作成', 'データカタログ整備',
    'データ品質チェック自動化', 'PII匿名化処理', 'コスト監視アラート設定',
    'ステークホルダーへのデモ', 'ドキュメント整備',
  ],
  '組織改革プロジェクト': [
    '現状の評価制度ヒアリング', '他社ベンチマーク調査', '新評価制度の設計',
    '管理職トレーニング', '1on1ガイドライン策定', 'エンゲージメントサーベイ',
    '報酬レンジの見直し', '昇格基準の明文化',
  ],
  'グローバル展開準備': [
    'タイ市場調査', 'ベトナム市場調査', 'インドネシア市場調査',
    '多言語対応（i18n）実装', '現地法人設立手続き', '現地パートナー選定',
    '価格戦略策定', '決済手段現地化', 'カスタマーサポート現地化',
    '規制コンプライアンス確認', 'ローカルマーケティング計画', 'パイロットローンチ',
  ],
};

const STATUSES: ('locked' | 'ready' | 'in_progress' | 'done')[] = ['locked', 'ready', 'in_progress', 'done'];
const STATUS_WEIGHTS = [0.25, 0.25, 0.30, 0.20]; // locked, ready, in_progress, done

function weightedRandom<T>(items: T[], weights: number[]): T {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r < acc) return items[i];
  }
  return items[items.length - 1];
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomTags(n: number): string[] {
  const shuffled = [...SKILL_TAGS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── メイン ──────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 既存ダミーデータをクリア（既存の admin@puzzle.co.jp は保持）
    console.log('🗑  既存のダミーデータをクリア中...');
    await client.query(`
      DELETE FROM connections WHERE id IN (
        SELECT c.id FROM connections c
        JOIN pieces p ON p.id = c.from_piece_id
        WHERE p.company_id = $1 AND p.title LIKE '[DUMMY]%'
      )
    `, [COMPANY_ID]);
    await client.query(`DELETE FROM pieces WHERE company_id = $1 AND title LIKE '[DUMMY]%'`, [COMPANY_ID]);
    await client.query(`DELETE FROM projects WHERE company_id = $1 AND name LIKE '%[D]%'`, [COMPANY_ID]);
    await client.query(`
      DELETE FROM users WHERE company_id = $1
      AND email LIKE 'dummy_%@puzzle.co.jp'
    `, [COMPANY_ID]);

    // ── 1. ワーカー45名 + 管理者4名(既存admin含め5名) を作成 ──
    console.log('👥 ユーザーを作成中...');
    const workerIds: string[] = [];
    for (let i = 0; i < WORKER_NAMES.length; i++) {
      const id = uuid();
      const dept = DEPARTMENTS[i % DEPARTMENTS.length];
      const skills = randomTags(randomInt(2, 5));
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role, company_id, user_skills, onboarded)
        VALUES ($1, $2, $3, $4, 'worker', $5, $6, true)
        ON CONFLICT (email) DO NOTHING
      `, [id, `${WORKER_NAMES[i]}（${dept}）`, `dummy_${i + 1}@puzzle.co.jp`, PASSWORD_HASH, COMPANY_ID, skills]);
      workerIds.push(id);
    }

    for (let i = 0; i < ADMIN_NAMES.length; i++) {
      const id = uuid();
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role, company_id, onboarded)
        VALUES ($1, $2, $3, $4, 'admin', $5, true)
        ON CONFLICT (email) DO NOTHING
      `, [id, ADMIN_NAMES[i], `dummy_admin${i + 1}@puzzle.co.jp`, PASSWORD_HASH, COMPANY_ID]);
    }
    console.log(`  ✅ ${workerIds.length} workers + ${ADMIN_NAMES.length} admins`);

    // ── 2. プロジェクト15本 ──
    console.log('📁 プロジェクトを作成中...');
    const projectIds: string[] = [];
    for (const pj of PROJECT_DATA) {
      const id = uuid();
      const dueDays = randomInt(30, 180);
      await client.query(`
        INSERT INTO projects (id, company_id, name, description, color, status, due_date)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
      `, [id, COMPANY_ID, `${pj.name} [D]`, pj.desc, pj.color, daysFromNow(dueDays)]);
      projectIds.push(id);
    }
    console.log(`  ✅ ${projectIds.length} projects`);

    // ── 3. ピース300本 ──
    console.log('🧩 ピースを作成中...');
    const pieceIds: string[] = [];
    let pieceCount = 0;

    for (let pi = 0; pi < PROJECT_DATA.length; pi++) {
      const projectId = projectIds[pi];
      const projectName = PROJECT_DATA[pi].name;
      const titles = PIECE_TITLES[projectName] ?? [];

      // プロジェクト固有タイトル + 汎用タイトルで合計20枚前後
      const allTitles = [
        ...titles,
        ...Array.from({ length: Math.max(0, 20 - titles.length) }, (_, i) =>
          `タスク#${i + 1}（${projectName.slice(0, 6)}）`
        ),
      ];

      for (let ti = 0; ti < allTitles.length; ti++) {
        const id = uuid();
        const status = weightedRandom(STATUSES, STATUS_WEIGHTS);
        const assigneeId = Math.random() > 0.1 ? randomFrom(workerIds) : null;
        const priority = randomInt(0, 5);
        const tags = randomTags(randomInt(0, 3));
        const progress = status === 'in_progress' ? randomInt(10, 90)
          : status === 'done' ? 100 : 0;
        const dueDays = randomInt(-14, 60); // -14 = 2週間前（overdue）
        const startDays = Math.min(dueDays - randomInt(3, 21), dueDays - 3);
        const businessImpact = randomInt(0, 10) < 7
          ? randomInt(1, 50) * 100000  // 10万〜5000万
          : 0;
        const displayOrder = pieceCount * 10;

        await client.query(`
          INSERT INTO pieces (
            id, title, company_id, project_id, status, assignee_id,
            priority, skill_tags, progress, due_date, start_date,
            business_impact, display_order, objective
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          id,
          `[DUMMY] ${allTitles[ti]}`,
          COMPANY_ID,
          projectId,
          status,
          assigneeId,
          priority,
          tags,
          progress,
          daysFromNow(dueDays),
          daysFromNow(startDays),
          businessImpact,
          displayOrder,
          `${projectName}における${allTitles[ti]}の完了。品質基準を満たした上でステークホルダー合意を得ること。`,
        ]);
        pieceIds.push(id);
        pieceCount++;
      }
    }
    console.log(`  ✅ ${pieceCount} pieces`);

    // ── 4. 接続80本（sequential中心） ──
    console.log('🔗 依存関係を作成中...');
    const usedPairs = new Set<string>();
    let connCount = 0;

    // プロジェクト内での sequential チェーン
    const connectionTypes = ['sequential', 'sequential', 'sequential', 'parallel', 'conditional'];
    const piecesPerProject = Math.floor(pieceIds.length / PROJECT_DATA.length);

    for (let pi = 0; pi < PROJECT_DATA.length; pi++) {
      const start = pi * piecesPerProject;
      const end = Math.min(start + piecesPerProject, pieceIds.length);
      const projectPieceIds = pieceIds.slice(start, end);

      // 各プロジェクトで 4〜7 本の接続
      const targetConns = randomInt(4, 7);
      for (let c = 0; c < targetConns; c++) {
        const fromIdx = randomInt(0, projectPieceIds.length - 2);
        const toIdx   = randomInt(fromIdx + 1, projectPieceIds.length - 1);
        const fromId  = projectPieceIds[fromIdx];
        const toId    = projectPieceIds[toIdx];
        const pairKey = `${fromId}:${toId}`;
        if (usedPairs.has(pairKey) || fromId === toId) continue;
        usedPairs.add(pairKey);

        const type = randomFrom(connectionTypes);
        try {
          await client.query(`
            INSERT INTO connections (id, from_piece_id, to_piece_id, type)
            VALUES ($1, $2, $3, $4)
          `, [uuid(), fromId, toId, type]);
          connCount++;
        } catch {}
      }
    }

    // クロスプロジェクト接続（依存関係の複雑さを演出）
    for (let c = 0; c < 15; c++) {
      const fromId = randomFrom(pieceIds);
      const toId   = randomFrom(pieceIds);
      const pairKey = `${fromId}:${toId}`;
      if (usedPairs.has(pairKey) || fromId === toId) continue;
      usedPairs.add(pairKey);
      try {
        await client.query(`
          INSERT INTO connections (id, from_piece_id, to_piece_id, type)
          VALUES ($1, $2, $3, 'sequential')
        `, [uuid(), fromId, toId]);
        connCount++;
      } catch {}
    }
    console.log(`  ✅ ${connCount} connections`);

    await client.query('COMMIT');
    console.log('\n🎉 シード完了！');
    console.log(`   Users: ${workerIds.length + ADMIN_NAMES.length}`);
    console.log(`   Projects: ${projectIds.length}`);
    console.log(`   Pieces: ${pieceCount}`);
    console.log(`   Connections: ${connCount}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ エラー:', e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
