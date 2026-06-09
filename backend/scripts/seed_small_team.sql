-- ============================================================
-- PuzzleWork デモシード: 小規模チーム（5人）
-- 特徴: 仕事は多い・人は少ない / 全員が複数プロジェクト掛け持ち / 優先順位の混乱
-- 実行: psql $DATABASE_URL -f scripts/seed_small_team.sql
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
  ('オーナー', 'owner@small-demo.jp',   '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('中田',    'nakata@small-demo.jp',   '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('斉藤',    'saito@small-demo.jp',    '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('橋本',    'hashimoto@small-demo.jp','$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('松田',    'matsuda@small-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO projects (id, name, company_id, color, due_date, description) VALUES
  ('cc005001-0000-0000-0000-000000000000','クライアントX 主力案件',   '11111111-1111-1111-1111-111111111111','#6366F1','2026-06-30','売上の40%を占める大口クライアント'),
  ('cc005002-0000-0000-0000-000000000000','クライアントY メンテ',     '11111111-1111-1111-1111-111111111111','#94A3B8','2026-05-31','月次保守 (後回しになりがち)'),
  ('cc005003-0000-0000-0000-000000000000','自社サービス開発',          '11111111-1111-1111-1111-111111111111','#EC4899','2026-12-31','隙間時間でMVP構築中'),
  ('cc005004-0000-0000-0000-000000000000','クライアントZ 新規',        '11111111-1111-1111-1111-111111111111','#F59E0B','2026-06-15','新規参入 スタートアップ支援'),
  ('cc005005-0000-0000-0000-000000000000','事務・総務・採用',          '11111111-1111-1111-1111-111111111111','#64748B','2026-12-31','バックオフィス常時稼働'),
  ('cc005006-0000-0000-0000-000000000000','クライアントW (完了)',       '11111111-1111-1111-1111-111111111111','#10B981','2026-03-31','飲食店向けDXツール 納品済み')
ON CONFLICT (id) DO NOTHING;

-- ▼ クライアントX: 主力案件 ACTIVE HERO ROOM (全員が関わっている)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005001-0001-0000-0000-000000000000','追加機能 要件ヒアリング',  'クライアントとのMTG・追加開発スコープ確定',                '11111111-1111-1111-1111-111111111111',ARRAY['consulting','spec'],   '2026-05-10','2026-05-20',5,'done',       'cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),    500000,100,'2026-05-10','2026-05-19'),
  ('dd005001-0002-0000-0000-000000000000','UIデザイン変更',           '新機能追加に伴うUI改善・モック作成',                        '11111111-1111-1111-1111-111111111111',ARRAY['design','ui'],         '2026-05-19','2026-05-31',5,'in_progress','cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakata@small-demo.jp'),   300000, 70,'2026-05-22',NULL),
  ('dd005001-0003-0000-0000-000000000000','バックエンド実装',         'DB設計変更・API追加・既存機能改修',                         '11111111-1111-1111-1111-111111111111',ARRAY['backend','api'],       '2026-05-19','2026-06-07',5,'in_progress','cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='saito@small-demo.jp'),    500000, 50,'2026-05-21',NULL),
  ('dd005001-0004-0000-0000-000000000000','フロントエンド実装',       '新UIをNext.jsで実装・既存画面との統合',                     '11111111-1111-1111-1111-111111111111',ARRAY['frontend','react'],    '2026-06-07','2026-06-20',5,'locked',     'cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='hashimoto@small-demo.jp'), 400000,  0,NULL,NULL),
  ('dd005001-0005-0000-0000-000000000000','テスト・受入確認',         'バグ修正・クライアントレビュー・承認取得',                  '11111111-1111-1111-1111-111111111111',ARRAY['qa','cs'],             '2026-06-20','2026-06-28',5,'locked',     'cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakata@small-demo.jp'),   200000,  0,NULL,NULL),
  ('dd005001-0006-0000-0000-000000000000','本番デプロイ・納品',       '本番環境デプロイ・動作確認・請求処理',                      '11111111-1111-1111-1111-111111111111',ARRAY['deploy','delivery'],   '2026-06-28','2026-06-30',5,'locked',     'cc005001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),    100000,  0,NULL,NULL);

-- ▼ クライアントY メンテ: STALLED NEGLECTED (全員が後回しにしている)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005002-0001-0000-0000-000000000000','月次バグ修正 (4月分)',    '4月報告分のバグ修正・デプロイ (超過してます)',              '11111111-1111-1111-1111-111111111111',ARRAY['maintenance','fix'],   '2026-04-01','2026-04-30',2,'in_progress','cc005002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='saito@small-demo.jp'),     80000, 10,'2026-04-15',NULL),
  ('dd005002-0002-0000-0000-000000000000','月次バグ修正 (5月分)',    '5月報告分のバグ修正 (まだ着手できていません)',              '11111111-1111-1111-1111-111111111111',ARRAY['maintenance','fix'],   '2026-05-01','2026-05-31',2,'locked',     'cc005002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='saito@small-demo.jp'),     80000,  0,NULL,NULL),
  ('dd005002-0003-0000-0000-000000000000','サーバー更新対応',        'Node.jsバージョンアップ・依存パッケージ更新',               '11111111-1111-1111-1111-111111111111',ARRAY['maintenance','devops'], '2026-04-15','2026-05-15',3,'locked',     'cc005002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='hashimoto@small-demo.jp'),  60000,  0,NULL,NULL);

-- ▼ 自社サービス: DORMANT PASSION PROJECT
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005003-0001-0000-0000-000000000000','コンセプト・ターゲット確定','誰の何の問題を解くか 最終決定',                           '11111111-1111-1111-1111-111111111111',ARRAY['strategy','product'],  '2026-03-01','2026-04-30',1,'done',       'cc005003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),     50000,100,'2026-03-01','2026-04-20'),
  ('dd005003-0002-0000-0000-000000000000','MVP設計 (ワイヤーフレーム)','主要機能3つのUI/UX設計',                                 '11111111-1111-1111-1111-111111111111',ARRAY['design','ux'],         '2026-04-20','2026-06-30',1,'in_progress','cc005003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakata@small-demo.jp'),    30000, 20,'2026-05-01',NULL),
  ('dd005003-0003-0000-0000-000000000000','MVP エンジニアリング',    'フロント+バック 最小実装',                                  '11111111-1111-1111-1111-111111111111',ARRAY['frontend','backend'],  '2026-07-01','2026-10-31',1,'locked',     'cc005003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='saito@small-demo.jp'),     30000,  0,NULL,NULL),
  ('dd005003-0004-0000-0000-000000000000','β版リリース',             '身内テスト・フィードバック収集',                            '11111111-1111-1111-1111-111111111111',ARRAY['launch','beta'],       '2026-11-01','2026-12-31',1,'locked',     'cc005003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),     20000,  0,NULL,NULL);

-- ▼ クライアントZ 新規: ACTIVE ROOM (入ってきたばかり)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005004-0001-0000-0000-000000000000','キックオフ・ヒアリング',  '新規クライアント オンボーディング・要件ヒアリング',         '11111111-1111-1111-1111-111111111111',ARRAY['consulting'],          '2026-05-20','2026-05-25',4,'done',       'cc005004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),    200000,100,'2026-05-20','2026-05-24'),
  ('dd005004-0002-0000-0000-000000000000','提案書・見積もり作成',    '技術提案・スケジュール・費用見積もり',                      '11111111-1111-1111-1111-111111111111',ARRAY['proposal','planning'], '2026-05-24','2026-05-31',4,'in_progress','cc005004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),    400000, 60,'2026-05-25',NULL),
  ('dd005004-0003-0000-0000-000000000000','設計・開発着手',          '提案承認後 詳細設計開始',                                   '11111111-1111-1111-1111-111111111111',ARRAY['design','dev'],        '2026-06-01','2026-06-15',4,'locked',     'cc005004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='hashimoto@small-demo.jp'), 600000,  0,NULL,NULL);

-- ▼ 事務・総務: BACKGROUND CONSTANT
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005005-0001-0000-0000-000000000000','経理・請求処理 (5月)',    '5月分請求書発行・支払い確認・freee入力',                    '11111111-1111-1111-1111-111111111111',ARRAY['accounting'],          '2026-05-25','2026-05-31',3,'in_progress','cc005005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='matsuda@small-demo.jp'),  50000,50,'2026-05-27',NULL),
  ('dd005005-0002-0000-0000-000000000000','採用面接 (エンジニア)',   '応募者3名 書類選考・面接日程調整',                          '11111111-1111-1111-1111-111111111111',ARRAY['hr','recruiting'],     '2026-05-20','2026-06-15',2,'in_progress','cc005005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),   100000,30,'2026-05-22',NULL),
  ('dd005005-0003-0000-0000-000000000000','社内Wiki整備',           '手順書・ナレッジのNotionまとめ',                            '11111111-1111-1111-1111-111111111111',ARRAY['docs','knowledge'],    '2026-04-01','2026-07-31',1,'locked',     'cc005005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='matsuda@small-demo.jp'),  20000, 0,NULL,NULL);

-- ▼ クライアントW (完了): MATURE ALL-DONE
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd005006-0001-0000-0000-000000000000','要件定義・設計',         '飲食店向けDXツール 要件・IA設計',                           '11111111-1111-1111-1111-111111111111',ARRAY['spec','design'],       '2025-12-01','2026-01-15',3,'done','cc005006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakata@small-demo.jp'),  300000,100,'2025-12-01','2026-01-14'),
  ('dd005006-0002-0000-0000-000000000000','開発・実装',             'React + Firebase でMVP実装',                               '11111111-1111-1111-1111-111111111111',ARRAY['frontend','firebase'], '2026-01-14','2026-02-28',3,'done','cc005006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='saito@small-demo.jp'),   500000,100,'2026-01-14','2026-02-28'),
  ('dd005006-0003-0000-0000-000000000000','納品・引き渡し',         'オンボーディング・マニュアル・完了報告',                    '11111111-1111-1111-1111-111111111111',ARRAY['delivery','cs'],       '2026-02-28','2026-03-31',3,'done','cc005006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='owner@small-demo.jp'),   100000,100,'2026-02-28','2026-03-28');

-- 接続
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  -- クライアントX
  ('dd005001-0001-0000-0000-000000000000','dd005001-0002-0000-0000-000000000000','sequential'),
  ('dd005001-0001-0000-0000-000000000000','dd005001-0003-0000-0000-000000000000','sequential'),
  ('dd005001-0002-0000-0000-000000000000','dd005001-0004-0000-0000-000000000000','sequential'),
  ('dd005001-0003-0000-0000-000000000000','dd005001-0004-0000-0000-000000000000','sequential'),
  ('dd005001-0004-0000-0000-000000000000','dd005001-0005-0000-0000-000000000000','sequential'),
  ('dd005001-0005-0000-0000-000000000000','dd005001-0006-0000-0000-000000000000','sequential'),
  -- クライアントY
  ('dd005002-0001-0000-0000-000000000000','dd005002-0002-0000-0000-000000000000','sequential'),
  -- 自社サービス
  ('dd005003-0001-0000-0000-000000000000','dd005003-0002-0000-0000-000000000000','sequential'),
  ('dd005003-0002-0000-0000-000000000000','dd005003-0003-0000-0000-000000000000','sequential'),
  ('dd005003-0003-0000-0000-000000000000','dd005003-0004-0000-0000-000000000000','sequential'),
  -- クライアントZ
  ('dd005004-0001-0000-0000-000000000000','dd005004-0002-0000-0000-000000000000','sequential'),
  ('dd005004-0002-0000-0000-000000000000','dd005004-0003-0000-0000-000000000000','sequential'),
  -- W完了
  ('dd005006-0001-0000-0000-000000000000','dd005006-0002-0000-0000-000000000000','sequential'),
  ('dd005006-0002-0000-0000-000000000000','dd005006-0003-0000-0000-000000000000','sequential'),
  -- クロスプロジェクト: X バックエンド → Z 設計 (リソース共有・担当者かぶり)
  ('dd005001-0003-0000-0000-000000000000','dd005004-0003-0000-0000-000000000000','parallel'),
  ('dd005001-0002-0000-0000-000000000000','dd005004-0002-0000-0000-000000000000','parallel')
ON CONFLICT DO NOTHING;

COMMIT;
