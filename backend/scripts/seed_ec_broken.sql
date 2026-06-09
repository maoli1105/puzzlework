-- ============================================================
-- PuzzleWork デモシード: EC運営会社 — 修復前（破損状態）
-- 特徴: 夏季セール施策が全員overload停滞 / CS・在庫問題が悪化 / コリドー断線
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
  ('山田',  'yamada@ec-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('中村',  'nakamura@ec-demo.jp','$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('小林',  'kobayashi2@ec-demo.jp','$2b$10$dummyhashplaceholder0000000000000000','worker','11111111-1111-1111-1111-111111111111'),
  ('加藤',  'kato@ec-demo.jp',    '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('松本',  'matsumoto@ec-demo.jp','$2b$10$dummyhashplaceholder0000000000000000','worker', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO projects (id, name, company_id, color, due_date, description) VALUES
  ('cc003001-0000-0000-0000-000000000000','夏季セール 2026',          '11111111-1111-1111-1111-111111111111','#EF4444','2026-06-20','年間最大施策 全社総力'),
  ('cc003002-0000-0000-0000-000000000000','新商品ライン A 立ち上げ',  '11111111-1111-1111-1111-111111111111','#F59E0B','2026-06-30','アウトドア用品 5SKU新規'),
  ('cc003003-0000-0000-0000-000000000000','新商品ライン B 立ち上げ',  '11111111-1111-1111-1111-111111111111','#10B981','2026-07-15','フィットネス用品 3SKU'),
  ('cc003004-0000-0000-0000-000000000000','CS改善プロジェクト',        '11111111-1111-1111-1111-111111111111','#6366F1','2026-05-31','返品率低下・満足度向上'),
  ('cc003005-0000-0000-0000-000000000000','在庫管理システム刷新',      '11111111-1111-1111-1111-111111111111','#64748B','2026-05-10','WMS連携・自動発注'),
  ('cc003006-0000-0000-0000-000000000000','春季セール 2026 (完了)',    '11111111-1111-1111-1111-111111111111','#94A3B8','2026-04-20','4/18〜4/20 売上目標達成'),
  ('cc003007-0000-0000-0000-000000000000','広告運用 常時稼働',         '11111111-1111-1111-1111-111111111111','#EC4899','2026-12-31','Google/Meta/楽天広告')
ON CONFLICT (id) DO NOTHING;

-- ▼ 夏季セール: 企画後に全作業が止まっている (LP・モール設定・メール全部locked)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd003001-0001-0000-0000-000000000000','セール企画・予算決定',   '品番選定・割引率・予算計画・承認取得',                     '11111111-1111-1111-1111-111111111111',ARRAY['planning','strategy'],  '2026-05-01','2026-05-15',5,'done',  'cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),    2000000,100,'2026-05-01','2026-05-14'),
  ('dd003001-0002-0000-0000-000000000000','LP制作・バナー制作',     'セールLP・カテゴリバナー・メールヘッダー画像',              '11111111-1111-1111-1111-111111111111',ARRAY['design','lp'],          '2026-05-01','2026-05-18',5,'in_progress','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kobayashi2@ec-demo.jp'),1500000,  7,'2026-05-01',NULL),
  ('dd003001-0003-0000-0000-000000000000','楽天・Amazon出品設定',   '特集ページ申請・クーポン設定・タイムセール登録',            '11111111-1111-1111-1111-111111111111',ARRAY['ec','marketplace'],     '2026-05-20','2026-05-26',5,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),  1000000,  0,NULL,NULL),
  ('dd003001-0004-0000-0000-000000000000','自社EC クーポン設定',    'クーポンコード発行・カート割引ロジック・テスト',            '11111111-1111-1111-1111-111111111111',ARRAY['ec','tech'],            '2026-05-22','2026-05-27',5,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),   800000,  0,NULL,NULL),
  ('dd003001-0005-0000-0000-000000000000','メールマーケティング',   'セグメント別メール作成・配信スケジュール・A/Bテスト',       '11111111-1111-1111-1111-111111111111',ARRAY['email','crm'],          '2026-05-25','2026-05-30',4,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='matsumoto@ec-demo.jp'),  500000,  0,NULL,NULL),
  ('dd003001-0006-0000-0000-000000000000','広告配信設定',           '検索広告・SNS広告・リターゲティング予算配分',              '11111111-1111-1111-1111-111111111111',ARRAY['ads','ppc'],            '2026-06-01','2026-06-10',4,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='matsumoto@ec-demo.jp'),  600000,  0,NULL,NULL),
  ('dd003001-0007-0000-0000-000000000000','在庫・発送体制確認',     'セール時ピーク在庫確保・倉庫追加スタッフ手配',             '11111111-1111-1111-1111-111111111111',ARRAY['ops','logistics'],      '2026-06-01','2026-06-10',5,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),     400000,  0,NULL,NULL),
  ('dd003001-0008-0000-0000-000000000000','セール期間 CS対応強化',  '問い合わせ対応マニュアル・FAQ更新・外部スタッフ調整',      '11111111-1111-1111-1111-111111111111',ARRAY['cs','ops'],             '2026-06-10','2026-06-20',4,'locked','cc003001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kato@ec-demo.jp'),       300000,  0,NULL,NULL);

-- ▼ 新商品A: 仕入後に商品撮影が止まっている
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd003002-0001-0000-0000-000000000000','仕入れ交渉・発注',      'メーカー価格交渉・サンプル確認・発注確定',                 '11111111-1111-1111-1111-111111111111',ARRAY['purchasing'],           '2026-05-01','2026-05-20',4,'done',  'cc003002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),     800000,100,'2026-05-01','2026-05-18'),
  ('dd003002-0002-0000-0000-000000000000','商品撮影・素材作成',    '商品写真・動画・モデル使用コンテンツ制作',                 '11111111-1111-1111-1111-111111111111',ARRAY['photography','design'], '2026-05-01','2026-05-15',4,'in_progress','cc003002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kobayashi2@ec-demo.jp'),  500000,  5,'2026-05-01',NULL),
  ('dd003002-0003-0000-0000-000000000000','商品ページ制作',        '楽天・Amazon・自社EC 商品詳細ページ制作',                  '11111111-1111-1111-1111-111111111111',ARRAY['ec','copywriting'],     '2026-05-31','2026-06-10',4,'locked','cc003002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),   600000,  0,NULL,NULL),
  ('dd003002-0004-0000-0000-000000000000','各モール出品',          '5SKU × 3モール 出品作業・価格設定',                        '11111111-1111-1111-1111-111111111111',ARRAY['ec','marketplace'],     '2026-06-14','2026-06-20',4,'locked','cc003002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),   500000,  0,NULL,NULL),
  ('dd003002-0005-0000-0000-000000000000','初回入荷・在庫登録',    '倉庫入荷確認・在庫数登録・引当設定',                       '11111111-1111-1111-1111-111111111111',ARRAY['logistics','ops'],      '2026-06-25','2026-06-30',3,'locked','cc003002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),     300000,  0,NULL,NULL);

-- ▼ CS改善: 完全放置 (FAQ改善が2ヶ月以上停滞)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd003004-0001-0000-0000-000000000000','返品原因分析',          '過去6ヶ月の返品データ分析・カテゴリ別原因特定',            '11111111-1111-1111-1111-111111111111',ARRAY['analysis','data'],      '2026-02-01','2026-02-25',3,'done',  'cc003004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kato@ec-demo.jp'),       200000,100,'2026-02-01','2026-02-24'),
  ('dd003004-0002-0000-0000-000000000000','FAQ・商品説明改善',     '返品理由TOP10の商品説明・FAQ修正',                          '11111111-1111-1111-1111-111111111111',ARRAY['cs','copywriting'],     '2026-02-25','2026-03-15',3,'in_progress','cc003004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kato@ec-demo.jp'),       300000,  4,'2026-02-25',NULL),
  ('dd003004-0003-0000-0000-000000000000','CS対応フロー見直し',    '返品受付・交換フロー・CSマニュアル改訂',                   '11111111-1111-1111-1111-111111111111',ARRAY['cs','ops'],             '2026-03-15','2026-04-01',3,'locked','cc003004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kato@ec-demo.jp'),       200000,  0,NULL,NULL),
  ('dd003004-0004-0000-0000-000000000000','CS効果測定',           '返品率・満足度スコア計測・改善レポート作成',               '11111111-1111-1111-1111-111111111111',ARRAY['analytics'],            '2026-04-01','2026-04-20',2,'locked','cc003004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kato@ec-demo.jp'),       100000,  0,NULL,NULL);

-- ▼ 在庫管理刷新: 3ヶ月以上放置
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd003005-0001-0000-0000-000000000000','要件定義・ベンダー選定', 'WMS要件整理・複数ベンダー比較・選定',                      '11111111-1111-1111-1111-111111111111',ARRAY['spec','vendor'],        '2026-01-10','2026-02-10',4,'in_progress','cc003005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),     500000,  3,'2026-01-10',NULL),
  ('dd003005-0002-0000-0000-000000000000','システム設計・API連携',  'WMS-EC間API設計・受発注データ連携仕様',                    '11111111-1111-1111-1111-111111111111',ARRAY['system','api'],         '2026-03-01','2026-03-20',4,'locked','cc003005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),   600000,  0,NULL,NULL),
  ('dd003005-0003-0000-0000-000000000000','テスト環境構築',        'テストデータ・移行シミュレーション',                        '11111111-1111-1111-1111-111111111111',ARRAY['testing','infra'],      '2026-04-01','2026-04-20',4,'locked','cc003005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakamura@ec-demo.jp'),   400000,  0,NULL,NULL),
  ('dd003005-0004-0000-0000-000000000000','本番移行・切り替え',    '旧システムから新WMSへの本番データ移行',                    '11111111-1111-1111-1111-111111111111',ARRAY['migration','ops'],      '2026-04-20','2026-05-01',5,'locked','cc003005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),     800000,  0,NULL,NULL);

-- ▼ 春季セール (完了): 変化なし
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd003006-0001-0000-0000-000000000000','春セール企画',          '品番・割引率・予算計画',                                    '11111111-1111-1111-1111-111111111111',ARRAY['planning'],             '2026-03-15','2026-04-01',5,'done','cc003006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),   1000000,100,'2026-03-15','2026-03-31'),
  ('dd003006-0002-0000-0000-000000000000','LP・バナー制作',        'セールLP・全バナー制作',                                    '11111111-1111-1111-1111-111111111111',ARRAY['design','lp'],          '2026-04-01','2026-04-10',5,'done','cc003006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='kobayashi2@ec-demo.jp'), 800000,100,'2026-04-01','2026-04-10'),
  ('dd003006-0003-0000-0000-000000000000','配信・実施',            'セール期間実施・広告配信・CS対応',                          '11111111-1111-1111-1111-111111111111',ARRAY['ops','ads'],            '2026-04-18','2026-04-21',5,'done','cc003006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='matsumoto@ec-demo.jp'), 600000,100,'2026-04-18','2026-04-20'),
  ('dd003006-0004-0000-0000-000000000000','効果測定・レポート',    '売上実績・ROI・改善点レポート作成',                         '11111111-1111-1111-1111-111111111111',ARRAY['analytics'],            '2026-04-21','2026-04-30',3,'done','cc003006-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamada@ec-demo.jp'),    300000,100,'2026-04-21','2026-04-28');

-- 接続 (クロスプロジェクト コリドーは削除)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd003001-0001-0000-0000-000000000000','dd003001-0002-0000-0000-000000000000','sequential'),
  ('dd003002-0001-0000-0000-000000000000','dd003002-0002-0000-0000-000000000000','sequential'),
  ('dd003004-0001-0000-0000-000000000000','dd003004-0002-0000-0000-000000000000','sequential'),
  ('dd003005-0001-0000-0000-000000000000','dd003005-0002-0000-0000-000000000000','sequential'),
  ('dd003006-0001-0000-0000-000000000000','dd003006-0002-0000-0000-000000000000','sequential'),
  ('dd003006-0002-0000-0000-000000000000','dd003006-0003-0000-0000-000000000000','sequential'),
  ('dd003006-0003-0000-0000-000000000000','dd003006-0004-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- ※ クロスプロジェクト コリドーエッジ: 意図的に削除

COMMIT;
