-- ============================================================
-- PuzzleWork デモシード: SaaS開発会社 — 修復前（破損状態）
-- 特徴: スプリント停滞 / コリドー切断 / 全室冷却 / HERO消滅
-- 実行: psql $DATABASE_URL -f scripts/seed_saas_broken.sql
-- ============================================================

BEGIN;

-- ── 既存データをクリア ─────────────────────────────────────────
DELETE FROM piece_velocity_log  WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM piece_logs          WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM piece_comments      WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM piece_watchers      WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM piece_okr_links     WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM reward_logs         WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM time_logs           WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM flow_alerts         WHERE blocking_piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM flow_unlock_events  WHERE unlocked_piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111') OR unlocking_piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM notifications       WHERE piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM connections         WHERE from_piece_id IN (SELECT id FROM pieces WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM pieces              WHERE company_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM project_milestones  WHERE project_id IN (SELECT id FROM projects WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM project_templates   WHERE source_project_id IN (SELECT id FROM projects WHERE company_id = '11111111-1111-1111-1111-111111111111');
DELETE FROM projects            WHERE company_id = '11111111-1111-1111-1111-111111111111';

-- ── 担当者 upsert ────────────────────────────────────────────
INSERT INTO users (name, email, password_hash, role, company_id) VALUES
  ('Alice',  'alice@saas-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('Bob',    'bob@saas-demo.jp',    '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('Carol',  'carol@saas-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('David',  'david@saas-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('Emma',   'emma@saas-demo.jp',   '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- ── プロジェクト ─────────────────────────────────────────────
INSERT INTO projects (id, name, company_id, color, due_date, description) VALUES
  ('cc001001-0000-0000-0000-000000000000','機能開発 Sprint #12',   '11111111-1111-1111-1111-111111111111','#6366F1','2026-06-15','v2.5 ユーザー管理機能'),
  ('cc001002-0000-0000-0000-000000000000','バグ修正 Sprint #9',    '11111111-1111-1111-1111-111111111111','#F97316','2026-05-31','本番障害対応 + QA'),
  ('cc001003-0000-0000-0000-000000000000','インフラ刷新',           '11111111-1111-1111-1111-111111111111','#64748B','2026-05-15','K8s移行・CI/CD整備'),
  ('cc001004-0000-0000-0000-000000000000','v2.3 リリース済み',      '11111111-1111-1111-1111-111111111111','#10B981','2026-02-28','決済機能 v2.3 完了'),
  ('cc001005-0000-0000-0000-000000000000','ドキュメント整備',        '11111111-1111-1111-1111-111111111111','#94A3B8','2026-08-31','APIドキュメント・ガイド'),
  ('cc001006-0000-0000-0000-000000000000','マーケティング連携',      '11111111-1111-1111-1111-111111111111','#EC4899','2026-06-30','LP改善・SEO・分析連携')
ON CONFLICT (id) DO NOTHING;

-- ── ピース ──────────────────────────────────────────────────

-- ▼ Sprint #12: 仕様まで完了したが実装が止まっている
-- フロント・バックともにlocked/overdue → HERO消滅 → 冷室
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001001-0001-0000-0000-000000000000','仕様設計・UI検討',     'ユーザー管理画面の仕様確定とモックアップ作成', '11111111-1111-1111-1111-111111111111', ARRAY['design','spec'],   '2026-05-12','2026-05-20',4,'done',  'cc001001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'),  200000, 100,'2026-05-12','2026-05-20'),
  ('dd001001-0002-0000-0000-000000000000','フロントエンド実装',   'React + TypeScript でユーザー管理UI実装',       '11111111-1111-1111-1111-111111111111', ARRAY['frontend','react'], '2026-05-01','2026-05-09',4,'locked','cc001001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='alice@saas-demo.jp'),  350000,   0, NULL, NULL),
  ('dd001001-0003-0000-0000-000000000000','バックエンド実装',     'Node.js + PostgreSQL でユーザーCRUD API実装',   '11111111-1111-1111-1111-111111111111', ARRAY['backend','api'],   '2026-05-01','2026-05-09',4,'locked','cc001001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),    350000,   0, NULL, NULL),
  ('dd001001-0004-0000-0000-000000000000','E2E テスト',           'フロント・バック統合テスト + シナリオ確認',      '11111111-1111-1111-1111-111111111111', ARRAY['qa','testing'],    '2026-06-03','2026-06-10',3,'locked','cc001001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'),  150000,   0, NULL, NULL),
  ('dd001001-0005-0000-0000-000000000000','リリース準備',         'ステージング確認・移行スクリプト・リリースノート','11111111-1111-1111-1111-111111111111', ARRAY['devops','release'], '2026-06-10','2026-06-15',3,'locked','cc001001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),  100000,   0, NULL, NULL);

-- ▼ Sprint #9: 調査完了後に修正が止まった / 期限超過
-- 本番障害が未修正のまま放置されている状態
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001002-0001-0000-0000-000000000000','バグ原因調査',         'ログ分析・スタックトレース解析・再現確認',       '11111111-1111-1111-1111-111111111111', ARRAY['debugging'],       '2026-05-10','2026-05-14',5,'done',  'cc001002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),    500000, 100,'2026-05-10','2026-05-14'),
  ('dd001002-0002-0000-0000-000000000000','修正実装 (API側)',     '認証トークン検証ロジックの修正・ユニットテスト',  '11111111-1111-1111-1111-111111111111', ARRAY['backend','fix'],   '2026-05-14','2026-05-20',5,'locked','cc001002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),    500000,   0, NULL, NULL),
  ('dd001002-0003-0000-0000-000000000000','修正実装 (フロント側)','エラーハンドリング改善・ユーザー通知UI修正',     '11111111-1111-1111-1111-111111111111', ARRAY['frontend','fix'],  '2026-05-14','2026-05-20',4,'locked','cc001002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='alice@saas-demo.jp'),  300000,   0, NULL, NULL),
  ('dd001002-0004-0000-0000-000000000000','回帰テスト',           '修正後の全機能回帰テスト + 本番リグレッション確認','11111111-1111-1111-1111-111111111111', ARRAY['qa'],              '2026-05-20','2026-05-22',5,'locked','cc001002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'),  500000,   0, NULL, NULL);

-- ▼ インフラ刷新: 完全停止 — 計画書さえ半端で放置
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001003-0001-0000-0000-000000000000','現状分析・要件整理',   '現行インフラの課題洗い出しとK8s移行要件定義',   '11111111-1111-1111-1111-111111111111', ARRAY['infra','spec'],    '2026-02-01','2026-02-28',3,'done',  'cc001003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),  150000, 100,'2026-02-01','2026-03-05'),
  ('dd001003-0002-0000-0000-000000000000','K8s移行計画策定',      'クラスター設計・移行手順書・ロールバック計画',    '11111111-1111-1111-1111-111111111111', ARRAY['infra','k8s'],     '2026-02-10','2026-03-15',3,'in_progress','cc001003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'), 200000,   8,'2026-02-10', NULL),
  ('dd001003-0003-0000-0000-000000000000','ステージング環境移行', 'K8sクラスターへのステージング環境移行と動作確認',  '11111111-1111-1111-1111-111111111111', ARRAY['devops','k8s'],    '2026-04-01','2026-04-20',3,'locked','cc001003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),  180000,   0, NULL, NULL),
  ('dd001003-0004-0000-0000-000000000000','セキュリティ監査',     '外部セキュリティ診断・脆弱性対応',               '11111111-1111-1111-1111-111111111111', ARRAY['security'],        '2026-03-15','2026-04-15',4,'locked','cc001003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),    400000,   0, NULL, NULL),
  ('dd001003-0005-0000-0000-000000000000','本番環境移行',         '本番K8sクラスターへの完全移行',                  '11111111-1111-1111-1111-111111111111', ARRAY['devops','k8s'],    '2026-05-01','2026-05-10',3,'locked','cc001003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),  300000,   0, NULL, NULL);

-- ▼ v2.3 リリース済み: MATURE ALL-DONE ROOM (変化なし)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001004-0001-0000-0000-000000000000','決済フロー設計',       'Stripeインテグレーション設計・ユースケース定義',  '11111111-1111-1111-1111-111111111111', ARRAY['design','spec'],   '2025-12-01','2025-12-20',4,'done','cc001004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'), 500000,100,'2025-12-01','2025-12-20'),
  ('dd001004-0002-0000-0000-000000000000','Stripe API実装',       'サーバーサイド決済処理・Webhook対応',            '11111111-1111-1111-1111-111111111111', ARRAY['backend','api'],   '2025-12-20','2026-01-17',4,'done','cc001004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),   800000,100,'2025-12-20','2026-01-17'),
  ('dd001004-0003-0000-0000-000000000000','決済UI実装',           '購入フロー・カード入力UI・確認画面',             '11111111-1111-1111-1111-111111111111', ARRAY['frontend'],        '2026-01-17','2026-02-07',4,'done','cc001004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='alice@saas-demo.jp'),  600000,100,'2026-01-17','2026-02-07'),
  ('dd001004-0004-0000-0000-000000000000','決済テスト・QA',       'テストカード・本番決済フロー確認・負荷テスト',    '11111111-1111-1111-1111-111111111111', ARRAY['qa','testing'],    '2026-02-07','2026-02-21',5,'done','cc001004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'), 800000,100,'2026-02-07','2026-02-21'),
  ('dd001004-0005-0000-0000-000000000000','v2.3 本番リリース',    'DB移行・機能フラグON・本番確認',                 '11111111-1111-1111-1111-111111111111', ARRAY['devops','release'], '2026-02-21','2026-02-28',5,'done','cc001004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),1200000,100,'2026-02-21','2026-02-28');

-- ▼ ドキュメント整備: 変化なし（元から休眠）
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001005-0001-0000-0000-000000000000','API リファレンス整備', 'REST API 全エンドポイントのOpenAPI仕様書作成',   '11111111-1111-1111-1111-111111111111', ARRAY['docs'],            '2026-04-01','2026-06-30',2,'locked','cc001005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='alice@saas-demo.jp'),  80000,0,NULL,NULL),
  ('dd001005-0002-0000-0000-000000000000','ユーザーガイド作成',   '機能別操作ガイド・スクリーンショット付き',       '11111111-1111-1111-1111-111111111111', ARRAY['docs'],            '2026-04-15','2026-07-15',2,'ready', 'cc001005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='carol@saas-demo.jp'),  60000,0,NULL,NULL),
  ('dd001005-0003-0000-0000-000000000000','開発者向けガイド',     'SDK・Webhook設定・サンプルコード',               '11111111-1111-1111-1111-111111111111', ARRAY['docs','api'],      '2026-05-01','2026-07-31',2,'locked','cc001005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='bob@saas-demo.jp'),    70000,0,NULL,NULL),
  ('dd001005-0004-0000-0000-000000000000','アーキテクチャ図',     '現行システムアーキテクチャの図解と説明文書',     '11111111-1111-1111-1111-111111111111', ARRAY['docs','infra'],    '2026-03-01','2026-08-31',1,'locked','cc001005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='david@saas-demo.jp'),  40000,0,NULL,NULL);

-- ▼ マーケティング連携: 全locked — コリドーなし
-- 開発が止まったので連携施策も凍結
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd001006-0001-0000-0000-000000000000','LP改善施策',           '新機能紹介LPのデザイン・コピー改善・A/Bテスト', '11111111-1111-1111-1111-111111111111', ARRAY['marketing','lp'],  '2026-05-15','2026-05-25',3,'locked','cc001006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='emma@saas-demo.jp'),   180000, 0,NULL,NULL),
  ('dd001006-0002-0000-0000-000000000000','アナリティクス設定',   'GA4イベント設定・ファネル分析・コンバージョン計測','11111111-1111-1111-1111-111111111111', ARRAY['analytics'],       '2026-05-20','2026-05-28',3,'locked','cc001006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='emma@saas-demo.jp'),   150000, 0,NULL,NULL),
  ('dd001006-0003-0000-0000-000000000000','SNSキャンペーン',      '新機能リリースに合わせたSNS告知・インフルエンサー','11111111-1111-1111-1111-111111111111', ARRAY['sns','marketing'], '2026-06-10','2026-06-30',2,'locked','cc001006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='emma@saas-demo.jp'),   120000, 0,NULL,NULL);

-- ── 接続 ────────────────────────────────────────────────────
-- Sprint #12 (フロー断片: 仕様→実装は切断、フロー固定)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd001001-0001-0000-0000-000000000000','dd001001-0002-0000-0000-000000000000','sequential'),
  ('dd001001-0001-0000-0000-000000000000','dd001001-0003-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- Sprint #9 バグ修正 (原因調査のみ繋がっている)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd001002-0001-0000-0000-000000000000','dd001002-0002-0000-0000-000000000000','sequential'),
  ('dd001002-0001-0000-0000-000000000000','dd001002-0003-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- インフラ刷新 (最初の接続のみ)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd001003-0001-0000-0000-000000000000','dd001003-0002-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- v2.3 リリース済み (全done — 変化なし)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd001004-0001-0000-0000-000000000000','dd001004-0002-0000-0000-000000000000','sequential'),
  ('dd001004-0002-0000-0000-000000000000','dd001004-0003-0000-0000-000000000000','sequential'),
  ('dd001004-0003-0000-0000-000000000000','dd001004-0004-0000-0000-000000000000','sequential'),
  ('dd001004-0004-0000-0000-000000000000','dd001004-0005-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- ※ クロスプロジェクト コリドーエッジ: 意図的に削除 (修復前は断線状態)

COMMIT;

SELECT
  p.name AS project,
  COUNT(pc.id) AS pieces,
  COUNT(pc.id) FILTER (WHERE pc.status = 'in_progress') AS in_prog,
  COUNT(pc.id) FILTER (WHERE pc.status = 'done')        AS done,
  COUNT(pc.id) FILTER (WHERE pc.status = 'ready')       AS ready,
  COUNT(pc.id) FILTER (WHERE pc.status = 'locked')      AS locked
FROM projects p
LEFT JOIN pieces pc ON pc.project_id = p.id
WHERE p.company_id = '11111111-1111-1111-1111-111111111111'
GROUP BY p.name
ORDER BY p.name;
