-- ============================================================
-- PuzzleWork デモシード: Web制作会社
-- 特徴: クライアント案件並行/一部納期超過/熟成案件/停滞中プロジェクト
-- 実行: psql $DATABASE_URL -f scripts/seed_web_agency.sql
-- ============================================================

BEGIN;

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

INSERT INTO users (name, email, password_hash, role, company_id) VALUES
  ('田中',  'tanaka@webagency-demo.jp',   '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('佐藤',  'sato@webagency-demo.jp',     '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('鈴木',  'suzuki@webagency-demo.jp',   '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('高橋',  'takahashi@webagency-demo.jp','$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('伊藤',  'ito@webagency-demo.jp',      '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO projects (id, name, company_id, color, due_date, description) VALUES
  ('cc002001-0000-0000-0000-000000000000','クライアントA コーポレートサイト','11111111-1111-1111-1111-111111111111','#6366F1','2026-06-30','BtoB製造業 サイトリニューアル'),
  ('cc002002-0000-0000-0000-000000000000','クライアントB EC構築',           '11111111-1111-1111-1111-111111111111','#F97316','2026-05-25','アパレルEC 新規立ち上げ (遅延中)'),
  ('cc002003-0000-0000-0000-000000000000','クライアントC LP制作 ×3',        '11111111-1111-1111-1111-111111111111','#10B981','2026-06-10','新商品発売LP 3本セット'),
  ('cc002004-0000-0000-0000-000000000000','自社サービス開発',                '11111111-1111-1111-1111-111111111111','#EC4899','2026-09-30','制作進捗管理ツール β版'),
  ('cc002005-0000-0000-0000-000000000000','クライアントD (完了)',             '11111111-1111-1111-1111-111111111111','#94A3B8','2026-01-31','医療法人 採用サイト 納品済み'),
  ('cc002006-0000-0000-0000-000000000000','クライアントE (完了)',             '11111111-1111-1111-1111-111111111111','#64748B','2025-11-30','不動産 物件検索サイト 納品済み'),
  ('cc002007-0000-0000-0000-000000000000','社内ブランディング整備',           '11111111-1111-1111-1111-111111111111','#A78BFA','2026-10-31','会社ロゴ・資料テンプレ刷新')
ON CONFLICT (id) DO NOTHING;

-- ▼ クライアントA: 活発進行中 (ACTIVE ROOM)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002001-0001-0000-0000-000000000000','ヒアリング・要件定義',  'クライアントとのキックオフ・現状サイト分析・要件整理',   '11111111-1111-1111-1111-111111111111',ARRAY['consulting','spec'],  '2026-05-01','2026-05-10',4,'done',       'cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  300000,100,'2026-05-01','2026-05-09'),
  ('dd002001-0002-0000-0000-000000000000','ワイヤーフレーム',      'サイトマップ確定・主要ページWF作成・クライアント承認',   '11111111-1111-1111-1111-111111111111',ARRAY['ux','wireframe'],     '2026-05-09','2026-05-19',4,'done',       'cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    200000,100,'2026-05-09','2026-05-19'),
  ('dd002001-0003-0000-0000-000000000000','デザイン制作',          'トップ・会社概要・製品・採用 デザイン4画面',             '11111111-1111-1111-1111-111111111111',ARRAY['design','ui'],        '2026-05-19','2026-06-02',4,'in_progress','cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    400000, 60,'2026-05-21',NULL),
  ('dd002001-0004-0000-0000-000000000000','HTML/CSSコーディング',  'レスポンシブ対応・アクセシビリティ・CMS組み込み',        '11111111-1111-1111-1111-111111111111',ARRAY['html','css','coding'], '2026-06-02','2026-06-16',4,'locked',     'cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  500000,  0,NULL,NULL),
  ('dd002001-0005-0000-0000-000000000000','テスト・修正',          'ブラウザ互換・表示確認・クライアント修正対応',           '11111111-1111-1111-1111-111111111111',ARRAY['qa','testing'],       '2026-06-16','2026-06-23',3,'locked',     'cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='suzuki@webagency-demo.jp'),  150000,  0,NULL,NULL),
  ('dd002001-0006-0000-0000-000000000000','納品・公開',            'サーバー設定・本番公開・クライアントへの引き渡し',        '11111111-1111-1111-1111-111111111111',ARRAY['deploy','delivery'],  '2026-06-23','2026-06-30',3,'locked',     'cc002001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  100000,  0,NULL,NULL);

-- ▼ クライアントB: EC構築 - STALLED OVERDUE (納期超過・停滞)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002002-0001-0000-0000-000000000000','要件定義・IA設計',     'EC機能要件・商品カテゴリ・ユーザーフロー設計',           '11111111-1111-1111-1111-111111111111',ARRAY['spec','ia'],          '2026-03-01','2026-03-20',4,'done',       'cc002002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  200000,100,'2026-03-01','2026-03-22'),
  ('dd002002-0002-0000-0000-000000000000','デザイン (商品ページ)', 'トップ・カテゴリー・商品詳細・カート画面デザイン',        '11111111-1111-1111-1111-111111111111',ARRAY['design','ec'],        '2026-03-22','2026-04-11',4,'in_progress','cc002002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    600000, 30,'2026-03-25',NULL),
  ('dd002002-0003-0000-0000-000000000000','Shopify実装',          'テーマカスタマイズ・商品データ移行・決済設定',            '11111111-1111-1111-1111-111111111111',ARRAY['shopify','coding'],   '2026-04-11','2026-04-30',5,'locked',     'cc002002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  800000,  0,NULL,NULL),
  ('dd002002-0004-0000-0000-000000000000','決済・配送設定',        '決済ゲートウェイ・送料計算・在庫管理連携',               '11111111-1111-1111-1111-111111111111',ARRAY['payment','integration'],'2026-04-30','2026-05-15',5,'locked',    'cc002002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  400000,  0,NULL,NULL),
  ('dd002002-0005-0000-0000-000000000000','テスト・公開',          '注文フロー確認・クロスブラウザ・本番公開',               '11111111-1111-1111-1111-111111111111',ARRAY['qa','deploy'],        '2026-05-15','2026-05-25',5,'locked',     'cc002002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='suzuki@webagency-demo.jp'),  200000,  0,NULL,NULL);

-- ▼ クライアントC: LP制作 - ACTIVE MID ROOM
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002003-0001-0000-0000-000000000000','LP-1 デザイン',         'コスメ新商品LP デザイン・コピーライティング',            '11111111-1111-1111-1111-111111111111',ARRAY['lp','design'],        '2026-05-15','2026-05-27',3,'done',       'cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    180000,100,'2026-05-15','2026-05-27'),
  ('dd002003-0002-0000-0000-000000000000','LP-1 コーディング',      'SP対応・GTM設定・フォーム実装',                         '11111111-1111-1111-1111-111111111111',ARRAY['lp','coding'],        '2026-05-27','2026-06-03',3,'in_progress','cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  180000, 70,'2026-05-27',NULL),
  ('dd002003-0003-0000-0000-000000000000','LP-2 デザイン',          'サプリ新商品LP デザイン',                               '11111111-1111-1111-1111-111111111111',ARRAY['lp','design'],        '2026-05-20','2026-06-01',3,'in_progress','cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    150000, 45,'2026-05-23',NULL),
  ('dd002003-0004-0000-0000-000000000000','LP-2 コーディング',      'SP対応・動画埋め込み・測定タグ',                        '11111111-1111-1111-1111-111111111111',ARRAY['lp','coding'],        '2026-06-01','2026-06-08',3,'locked',     'cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  150000,  0,NULL,NULL),
  ('dd002003-0005-0000-0000-000000000000','LP-3 デザイン',          'フード新商品LP デザイン',                               '11111111-1111-1111-1111-111111111111',ARRAY['lp','design'],        '2026-06-01','2026-06-08',2,'ready',      'cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),    120000,  0,NULL,NULL),
  ('dd002003-0006-0000-0000-000000000000','LP-3 コーディング',      'SP対応・ABテスト設定',                                  '11111111-1111-1111-1111-111111111111',ARRAY['lp','coding'],        '2026-06-08','2026-06-10',2,'locked',     'cc002003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),  120000,  0,NULL,NULL);

-- ▼ 自社サービス開発: DORMANT PRISTINE
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002004-0001-0000-0000-000000000000','コンセプト設計',        '制作会社向けSaaS 差別化要件・MVPスコープ確定',           '11111111-1111-1111-1111-111111111111',ARRAY['strategy','spec'],   '2026-04-01','2026-05-31',2,'locked','cc002004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='ito@webagency-demo.jp'),  100000,0,NULL,NULL),
  ('dd002004-0002-0000-0000-000000000000','UI/UXデザイン',         'ダッシュボード・案件管理画面のプロトタイプ',              '11111111-1111-1111-1111-111111111111',ARRAY['design','ux'],        '2026-05-31','2026-07-31',2,'locked','cc002004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),   150000,0,NULL,NULL),
  ('dd002004-0003-0000-0000-000000000000','フロントエンド開発',    'Next.js + Tailwind で管理画面MVP実装',                   '11111111-1111-1111-1111-111111111111',ARRAY['frontend','react'],   '2026-07-31','2026-09-15',2,'locked','cc002004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'), 200000,0,NULL,NULL),
  ('dd002004-0004-0000-0000-000000000000','バックエンド開発',      'API・認証・データベース設計と実装',                       '11111111-1111-1111-1111-111111111111',ARRAY['backend','api'],      '2026-07-31','2026-09-15',2,'locked','cc002004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='ito@webagency-demo.jp'),  200000,0,NULL,NULL);

-- ▼ クライアントD (完了案件): MATURE ALL-DONE
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002005-0001-0000-0000-000000000000','ヒアリング・設計',     '医療法人 採用サイト要件定義・IA設計',                    '11111111-1111-1111-1111-111111111111',ARRAY['spec','consulting'],  '2025-10-01','2025-10-20',3,'done','cc002005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),200000,100,'2025-10-01','2025-10-20'),
  ('dd002005-0002-0000-0000-000000000000','デザイン制作',         '求人一覧・職種別・応募フォームデザイン',                 '11111111-1111-1111-1111-111111111111',ARRAY['design'],             '2025-10-20','2025-11-10',3,'done','cc002005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),  300000,100,'2025-10-20','2025-11-10'),
  ('dd002005-0003-0000-0000-000000000000','コーディング・実装',   'WP実装・応募フォーム・管理画面',                         '11111111-1111-1111-1111-111111111111',ARRAY['coding','wordpress'], '2025-11-10','2025-12-15',3,'done','cc002005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),350000,100,'2025-11-10','2025-12-15'),
  ('dd002005-0004-0000-0000-000000000000','テスト・納品',         'ブラウザ確認・クライアント承認・本番公開・納品',          '11111111-1111-1111-1111-111111111111',ARRAY['qa','delivery'],      '2025-12-15','2026-01-31',3,'done','cc002005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='suzuki@webagency-demo.jp'),100000,100,'2025-12-15','2026-01-28');

-- ▼ クライアントE (古い完了案件): BACKGROUND ROOM
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd002006-0001-0000-0000-000000000000','要件定義',             '不動産物件検索サイト 要件定義',                          '11111111-1111-1111-1111-111111111111',ARRAY['spec'],               '2025-07-01','2025-08-01',3,'done','cc002006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='tanaka@webagency-demo.jp'),150000,100,'2025-07-01','2025-07-30'),
  ('dd002006-0002-0000-0000-000000000000','デザイン・コーディング','物件一覧・詳細・検索機能デザイン+実装',                 '11111111-1111-1111-1111-111111111111',ARRAY['design','coding'],    '2025-08-01','2025-10-01',3,'done','cc002006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='sato@webagency-demo.jp'),  400000,100,'2025-08-01','2025-10-10'),
  ('dd002006-0003-0000-0000-000000000000','テスト・納品',         '検索精度確認・本番公開・引き渡し',                        '11111111-1111-1111-1111-111111111111',ARRAY['qa','delivery'],      '2025-10-10','2025-11-30',3,'done','cc002006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='suzuki@webagency-demo.jp'),100000,100,'2025-10-10','2025-11-25');

-- 接続
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd002001-0001-0000-0000-000000000000','dd002001-0002-0000-0000-000000000000','sequential'),
  ('dd002001-0002-0000-0000-000000000000','dd002001-0003-0000-0000-000000000000','sequential'),
  ('dd002001-0003-0000-0000-000000000000','dd002001-0004-0000-0000-000000000000','sequential'),
  ('dd002001-0004-0000-0000-000000000000','dd002001-0005-0000-0000-000000000000','sequential'),
  ('dd002001-0005-0000-0000-000000000000','dd002001-0006-0000-0000-000000000000','sequential'),
  -- クライアントB
  ('dd002002-0001-0000-0000-000000000000','dd002002-0002-0000-0000-000000000000','sequential'),
  ('dd002002-0002-0000-0000-000000000000','dd002002-0003-0000-0000-000000000000','sequential'),
  ('dd002002-0003-0000-0000-000000000000','dd002002-0004-0000-0000-000000000000','sequential'),
  ('dd002002-0004-0000-0000-000000000000','dd002002-0005-0000-0000-000000000000','sequential'),
  -- クライアントC LP
  ('dd002003-0001-0000-0000-000000000000','dd002003-0002-0000-0000-000000000000','sequential'),
  ('dd002003-0003-0000-0000-000000000000','dd002003-0004-0000-0000-000000000000','sequential'),
  ('dd002003-0005-0000-0000-000000000000','dd002003-0006-0000-0000-000000000000','sequential'),
  -- D完了
  ('dd002005-0001-0000-0000-000000000000','dd002005-0002-0000-0000-000000000000','sequential'),
  ('dd002005-0002-0000-0000-000000000000','dd002005-0003-0000-0000-000000000000','sequential'),
  ('dd002005-0003-0000-0000-000000000000','dd002005-0004-0000-0000-000000000000','sequential'),
  -- E完了
  ('dd002006-0001-0000-0000-000000000000','dd002006-0002-0000-0000-000000000000','sequential'),
  ('dd002006-0002-0000-0000-000000000000','dd002006-0003-0000-0000-000000000000','sequential'),
  -- クロスプロジェクト: Aのコーディング → LP-1コーディング (デザインリソース共有)
  ('dd002001-0003-0000-0000-000000000000','dd002003-0002-0000-0000-000000000000','parallel'),
  ('dd002001-0003-0000-0000-000000000000','dd002003-0003-0000-0000-000000000000','parallel')
ON CONFLICT DO NOTHING;

COMMIT;
