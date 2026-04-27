/**
 * seed_gantt.ts
 * スプレッドシートのガントデータをPuzzleWorkへインポート
 * 実行: npx ts-node scripts/seed_gantt.ts
 *
 * 投入内容:
 *  - 担当者 5名 (小林, 牧, 黒島, 大庭, 東條)
 *  - プロジェクト 15件 (製品ライン)
 *  - ピース 50件 (LP / Press Release / SNS / デザイン / 仕様確認)
 *  - 依存接続 (仕様確認→デザイン→LP→PR→SNS)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';

// ── 担当者定義 ─────────────────────────────────────────────
const WORKERS = [
  { key: 'kobayashi', name: '小林',  email: 'kobayashi@puzzle.co.jp',  role: 'worker' as const },
  { key: 'maki',      name: '牧',    email: 'maki@puzzle.co.jp',        role: 'worker' as const },
  { key: 'kuroshima', name: '黒島',  email: 'kuroshima@puzzle.co.jp',   role: 'worker' as const },
  { key: 'oba',       name: '大庭',  email: 'oba@puzzle.co.jp',         role: 'worker' as const },
  { key: 'tojo',      name: '東條',  email: 'tojo@puzzle.co.jp',        role: 'worker' as const },
];

// ── 製品プロジェクト定義 ──────────────────────────────────────
interface ProductDef {
  key: string;
  name: string;
  color: string;
  /** [start_date, due_date] YYYY-MM-DD */
  range: [string, string];
  designer: 'kuroshima' | 'oba' | 'tojo';
  lp_owner: 'kobayashi' | 'maki';
  pr_owner: 'kobayashi' | 'maki';
  impact: number;
  status_note: string;
}

const PRODUCTS: ProductDef[] = [
  { key: 'sandstepper',  name: 'サンドステッパー',          color: '#F59E0B', range: ['2025-08-04','2025-10-31'], designer:'kuroshima', lp_owner:'kobayashi', pr_owner:'maki',      impact:850000,  status_note:'スペック調整中' },
  { key: 'richrise',     name: 'リッチライズプロテイン',    color: '#10B981', range: ['2025-08-18','2025-11-14'], designer:'oba',       lp_owner:'maki',      pr_owner:'kobayashi', impact:1200000, status_note:'最終仕様確認' },
  { key: 'roomrunner',   name: 'ルームランナー',            color: '#3B82F6', range: ['2025-09-01','2025-12-19'], designer:'tojo',      lp_owner:'kobayashi', pr_owner:'kobayashi', impact:2300000, status_note:'発注済' },
  { key: 'wristrap',     name: 'リストラップ',              color: '#8B5CF6', range: ['2025-09-15','2025-11-28'], designer:'kuroshima', lp_owner:'maki',      pr_owner:'maki',      impact:420000,  status_note:'製品概要確認' },
  { key: 'battlerope',   name: 'バトルロープEvo',           color: '#EF4444', range: ['2025-10-01','2026-01-16'], designer:'oba',       lp_owner:'kobayashi', pr_owner:'maki',      impact:980000,  status_note:'スペック調整中' },
  { key: 'spinbike',     name: 'スピンバイクAir',           color: '#06B6D4', range: ['2025-10-20','2026-02-06'], designer:'tojo',      lp_owner:'maki',      pr_owner:'kobayashi', impact:3100000, status_note:'最終仕様確認' },
  { key: 'neckmassager', name: 'ネックマッサージャー',      color: '#F97316', range: ['2025-11-10','2026-02-27'], designer:'kuroshima', lp_owner:'kobayashi', pr_owner:'maki',      impact:760000,  status_note:'発注済' },
  { key: 'st144',        name: 'ST144',                     color: '#64748B', range: ['2025-09-08','2025-11-07'], designer:'oba',       lp_owner:'maki',      pr_owner:'maki',      impact:550000,  status_note:'製品概要確認' },
  { key: 'st158',        name: 'ST158',                     color: '#64748B', range: ['2025-10-06','2025-12-05'], designer:'tojo',      lp_owner:'kobayashi', pr_owner:'kobayashi', impact:620000,  status_note:'スペック調整中' },
  { key: 'st104',        name: 'ST104',                     color: '#64748B', range: ['2025-11-03','2026-01-02'], designer:'kuroshima', lp_owner:'maki',      pr_owner:'maki',      impact:490000,  status_note:'最終仕様確認' },
  { key: 'st141',        name: 'ST141',                     color: '#64748B', range: ['2025-11-17','2026-01-16'], designer:'oba',       lp_owner:'kobayashi', pr_owner:'maki',      impact:530000,  status_note:'発注済' },
  { key: 'st135',        name: 'ST135',                     color: '#64748B', range: ['2025-12-01','2026-01-30'], designer:'tojo',      lp_owner:'maki',      pr_owner:'kobayashi', impact:580000,  status_note:'製品概要確認' },
  { key: 'st102',        name: 'ST102',                     color: '#64748B', range: ['2026-01-05','2026-03-06'], designer:'kuroshima', lp_owner:'kobayashi', pr_owner:'maki',      impact:470000,  status_note:'スペック調整中' },
  { key: 'st101',        name: 'ST101',                     color: '#64748B', range: ['2026-02-02','2026-04-03'], designer:'oba',       lp_owner:'maki',      pr_owner:'maki',      impact:510000,  status_note:'最終仕様確認' },
  { key: 'st120',        name: 'ST120',                     color: '#64748B', range: ['2026-03-02','2026-07-19'], designer:'tojo',      lp_owner:'kobayashi', pr_owner:'kobayashi', impact:680000,  status_note:'製品概要確認' },
];

// ステータス変換
function mapStatus(note: string): string {
  if (note === '発注済') return 'in_progress';
  if (note === '最終仕様確認') return 'ready';
  return 'locked';
}

// 日付オフセット (YYYY-MM-DD + days)
function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// 区間を n 等分した第 i 点
function interpolateDate(start: string, end: string, i: number, n: number): string {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const t = s + (e - s) * (i / n);
  return new Date(t).toISOString().slice(0, 10);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. 担当者を upsert ────────────────────────────────────
    console.log('👤 担当者を登録中...');
    const workerIds: Record<string, string> = {};

    for (const w of WORKERS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, company_id)
         VALUES ($1, $2, '$2b$10$dummyhashplaceholder0000000000000000', $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [w.name, w.email, w.role, COMPANY_ID]
      );
      workerIds[w.key] = rows[0].id;
      console.log(`  ✓ ${w.name} → ${rows[0].id}`);
    }

    // ── 2. プロジェクトを upsert ──────────────────────────────
    console.log('\n📦 プロジェクトを登録中...');
    const projectIds: Record<string, string> = {};

    for (const p of PRODUCTS) {
      const { rows } = await client.query(
        `INSERT INTO projects (name, company_id, color, due_date, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [p.name, COMPANY_ID, p.color, p.range[1], p.status_note]
      );
      if (rows[0]) {
        projectIds[p.key] = rows[0].id;
      } else {
        // already exists — fetch it
        const { rows: ex } = await client.query(
          'SELECT id FROM projects WHERE name=$1 AND company_id=$2', [p.name, COMPANY_ID]
        );
        projectIds[p.key] = ex[0].id;
      }
      console.log(`  ✓ ${p.name} → ${projectIds[p.key]}`);
    }

    // ── 3. ピースを投入 ───────────────────────────────────────
    console.log('\n🧩 ピースを生成中...');
    // 各製品ごとに 5工程: 仕様確認→デザイン→LP→Press Release→SNS
    // piece_id を記録して dependency を繋ぐ
    const pieceIds: Record<string, Record<string, string>> = {};

    for (const p of PRODUCTS) {
      const pid = projectIds[p.key];
      const [rangeStart, rangeEnd] = p.range;
      const status = mapStatus(p.status_note);

      // ── 工程日付を 5分割 ──
      const d0 = rangeStart;
      const d1 = interpolateDate(rangeStart, rangeEnd, 1, 5);
      const d2 = interpolateDate(rangeStart, rangeEnd, 2, 5);
      const d3 = interpolateDate(rangeStart, rangeEnd, 3, 5);
      const d4 = interpolateDate(rangeStart, rangeEnd, 4, 5);
      const d5 = rangeEnd;

      const tasks = [
        {
          key: 'spec',
          title: `【${p.name}】製品仕様確認`,
          objective: `${p.name}の製品スペック・概要の最終確認 (${p.status_note})`,
          skill_tags: ['product', 'spec'],
          assignee: workerIds[p.lp_owner],
          start_date: d0, due_date: d1,
          priority: 3, impact: Math.round(p.impact * 0.1),
          status: status === 'in_progress' ? 'done' : status,
        },
        {
          key: 'design',
          title: `【${p.name}】デザイン制作`,
          objective: `LP・SNS用バナー・画像のデザイン作成`,
          skill_tags: ['design', 'creative'],
          assignee: workerIds[p.designer],
          start_date: d1, due_date: d2,
          priority: 3, impact: Math.round(p.impact * 0.15),
          status: status === 'in_progress' ? 'in_progress' : 'locked',
        },
        {
          key: 'lp',
          title: `【${p.name}】LP制作`,
          objective: `製品ランディングページの制作・公開`,
          skill_tags: ['lp', 'copywriting', 'html'],
          assignee: workerIds[p.lp_owner],
          start_date: d2, due_date: d3,
          priority: 4, impact: Math.round(p.impact * 0.3),
          status: 'locked',
        },
        {
          key: 'pr',
          title: `【${p.name}】プレスリリース`,
          objective: `プレスリリース作成・配信`,
          skill_tags: ['pr', 'copywriting'],
          assignee: workerIds[p.pr_owner],
          start_date: d3, due_date: d4,
          priority: 3, impact: Math.round(p.impact * 0.2),
          status: 'locked',
        },
        {
          key: 'sns',
          title: `【${p.name}】外部・SNS施策`,
          objective: `インフルエンサー・SNS広告・外部メディア連携`,
          skill_tags: ['sns', 'marketing', 'influencer'],
          assignee: workerIds[p.pr_owner],
          start_date: d4, due_date: d5,
          priority: 2, impact: Math.round(p.impact * 0.25),
          status: 'locked',
        },
      ];

      pieceIds[p.key] = {};

      for (const t of tasks) {
        const { rows: [piece] } = await client.query(
          `INSERT INTO pieces
             (title, objective, company_id, skill_tags, start_date, due_date, priority,
              status, project_id, assignee_id, business_impact)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            t.title, t.objective, COMPANY_ID,
            t.skill_tags, t.start_date, t.due_date,
            t.priority, t.status, pid, t.assignee,
            t.impact,
          ]
        );
        pieceIds[p.key][t.key] = piece.id;
        console.log(`  ✓ ${t.title}`);
      }
    }

    // ── 4. 依存接続: 仕様確認→デザイン→LP→PR→SNS ─────────────
    console.log('\n🔗 依存接続を生成中...');
    const CHAIN = ['spec', 'design', 'lp', 'pr', 'sns'];

    for (const p of PRODUCTS) {
      for (let i = 0; i < CHAIN.length - 1; i++) {
        const from = pieceIds[p.key][CHAIN[i]];
        const to   = pieceIds[p.key][CHAIN[i + 1]];
        await client.query(
          `INSERT INTO connections (from_piece_id, to_piece_id, type)
           VALUES ($1, $2, 'sequential')
           ON CONFLICT DO NOTHING`,
          [from, to]
        );
      }
      console.log(`  ✓ ${p.name}: 5工程チェーン接続`);
    }

    await client.query('COMMIT');
    console.log('\n✅ シード完了！');
    console.log(`  担当者: ${WORKERS.length} 名`);
    console.log(`  プロジェクト: ${PRODUCTS.length} 件`);
    console.log(`  ピース: ${PRODUCTS.length * 5} 件`);
    console.log(`  接続: ${PRODUCTS.length * 4} 件`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ エラー発生、ロールバックしました:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
