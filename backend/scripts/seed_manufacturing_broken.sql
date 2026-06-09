-- ============================================================
-- PuzzleWork デモシード: 製造業 — 修復前（破損状態）
-- 特徴: 試作品中断 / 品質改善・設備更新どちらも凍結 / コリドー断線 / 全室冷却
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
  ('渡辺',  'watanabe@factory-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('伊藤',  'ito2@factory-demo.jp',      '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('山本',  'yamamoto@factory-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('中島',  'nakajima@factory-demo.jp',  '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111'),
  ('前田',  'maeda@factory-demo.jp',     '$2b$10$dummyhashplaceholder0000000000000000', 'worker', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO projects (id, name, company_id, color, due_date, description) VALUES
  ('cc004001-0000-0000-0000-000000000000','新製品A 開発フェーズ',    '11111111-1111-1111-1111-111111111111','#6366F1','2026-09-30','次世代センサーユニット'),
  ('cc004002-0000-0000-0000-000000000000','製品B 量産フェーズ',      '11111111-1111-1111-1111-111111111111','#10B981','2026-07-31','既存製品 ライン増産'),
  ('cc004003-0000-0000-0000-000000000000','品質管理プロセス改善',    '11111111-1111-1111-1111-111111111111','#F97316','2026-05-20','不良率0.3%以下達成'),
  ('cc004004-0000-0000-0000-000000000000','設備更新・自動化',        '11111111-1111-1111-1111-111111111111','#64748B','2026-05-01','溶接ライン 半自動化投資'),
  ('cc004005-0000-0000-0000-000000000000','製品C 旧ライン廃止',      '11111111-1111-1111-1111-111111111111','#94A3B8','2026-02-28','旧製品 生産終了・設備売却済'),
  ('cc004006-0000-0000-0000-000000000000','安全衛生 年次活動',       '11111111-1111-1111-1111-111111111111','#EF4444','2026-12-31','KY活動・設備点検・消防訓練')
ON CONFLICT (id) DO NOTHING;

-- ▼ 新製品A: 設計完了後に試作が凍結 (部品調達問題で止まっている)
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd004001-0001-0000-0000-000000000000','製品コンセプト確定',   '市場調査・競合分析・スペック要件定義',                       '11111111-1111-1111-1111-111111111111',ARRAY['planning','research'],  '2026-02-01','2026-03-15',4,'done',       'cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'), 1500000,100,'2026-02-01','2026-03-10'),
  ('dd004001-0002-0000-0000-000000000000','基本設計 (回路)',       '回路設計・部品選定・BOM作成',                               '11111111-1111-1111-1111-111111111111',ARRAY['electrical','design'],  '2026-03-10','2026-04-30',4,'done',       'cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='ito2@factory-demo.jp'),     2000000,100,'2026-03-10','2026-04-28'),
  ('dd004001-0003-0000-0000-000000000000','基本設計 (筐体)',       '筐体3Dモデル・熱設計・強度シミュレーション',                 '11111111-1111-1111-1111-111111111111',ARRAY['mechanical','cad'],     '2026-03-10','2026-04-30',4,'done',       'cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'), 1800000,100,'2026-03-10','2026-05-02'),
  ('dd004001-0004-0000-0000-000000000000','試作品 第1回製造',      '回路実装・筐体組み立て・初期動作確認',                      '11111111-1111-1111-1111-111111111111',ARRAY['prototype','assembly'],  '2026-04-01','2026-04-25',5,'in_progress','cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakajima@factory-demo.jp'), 2500000,  5,'2026-04-01',NULL),
  ('dd004001-0005-0000-0000-000000000000','試作品 性能評価',       '温度試験・振動試験・電気特性測定・規格適合確認',             '11111111-1111-1111-1111-111111111111',ARRAY['testing','qa'],         '2026-05-31','2026-06-20',5,'locked',     'cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='ito2@factory-demo.jp'),     2500000,  0,NULL,NULL),
  ('dd004001-0006-0000-0000-000000000000','量産設計 移行',         '試作評価反映・量産用図面・工程設計',                        '11111111-1111-1111-1111-111111111111',ARRAY['design','production'],  '2026-07-01','2026-09-30',4,'locked',     'cc004001-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'), 5000000,  0,NULL,NULL);

-- ▼ 製品B 量産: 部品調達が止まっている → 下流もすべて停止
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd004002-0001-0000-0000-000000000000','生産計画 改訂',         '月次生産計画・部品調達スケジュール更新',                    '11111111-1111-1111-1111-111111111111',ARRAY['planning','production'],'2026-04-15','2026-04-30',3,'done',       'cc004002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'), 3000000,100,'2026-04-15','2026-04-28'),
  ('dd004002-0002-0000-0000-000000000000','部品調達 (6月分)',      '主要部品の発注・入荷確認・在庫調整',                        '11111111-1111-1111-1111-111111111111',ARRAY['procurement'],          '2026-04-28','2026-05-10',4,'in_progress','cc004002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='maeda@factory-demo.jp'),    2000000,  6,'2026-04-28',NULL),
  ('dd004002-0003-0000-0000-000000000000','6月第1週 製造',        '製造ライン 週間製造・進捗管理',                             '11111111-1111-1111-1111-111111111111',ARRAY['production','ops'],     '2026-06-01','2026-06-07',4,'locked',     'cc004002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakajima@factory-demo.jp'), 1500000,  0,NULL,NULL),
  ('dd004002-0004-0000-0000-000000000000','出荷検査・梱包',        '全数外観検査・規格確認・梱包・出荷準備',                    '11111111-1111-1111-1111-111111111111',ARRAY['qa','shipping'],        '2026-07-01','2026-07-15',3,'locked',     'cc004002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'),  800000,  0,NULL,NULL),
  ('dd004002-0005-0000-0000-000000000000','顧客納品・完了報告',    '納品先別出荷・受領確認・完了報告書提出',                    '11111111-1111-1111-1111-111111111111',ARRAY['delivery','cs'],        '2026-07-20','2026-07-25',3,'locked',     'cc004002-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'),  500000,  0,NULL,NULL);

-- ▼ 品質管理改善: 検査工程再設計が長期停滞
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd004003-0001-0000-0000-000000000000','不良率データ分析',      '過去1年の不良発生記録の統計分析・原因分類',                 '11111111-1111-1111-1111-111111111111',ARRAY['analysis','quality'],   '2026-02-01','2026-02-25',4,'done',       'cc004003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'),  500000,100,'2026-02-01','2026-02-22'),
  ('dd004003-0002-0000-0000-000000000000','検査工程 再設計',       '目視検査→自動計測化・チェックリスト改訂',                   '11111111-1111-1111-1111-111111111111',ARRAY['process','quality'],    '2026-02-22','2026-03-25',4,'in_progress','cc004003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'),  800000,  4,'2026-02-22',NULL),
  ('dd004003-0003-0000-0000-000000000000','作業員トレーニング',    '改訂手順書に基づく全員教育・確認テスト',                    '11111111-1111-1111-1111-111111111111',ARRAY['training','hr'],        '2026-03-25','2026-04-10',3,'locked',     'cc004003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakajima@factory-demo.jp'),  300000,  0,NULL,NULL),
  ('dd004003-0004-0000-0000-000000000000','不良率 再計測・評価',   '改善後1ヶ月間の不良率計測・効果検証',                       '11111111-1111-1111-1111-111111111111',ARRAY['measurement','quality'],'2026-04-10','2026-04-25',3,'locked',     'cc004003-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'),  400000,  0,NULL,NULL);

-- ▼ 設備更新: ベンダー選定が4ヶ月放置
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd004004-0001-0000-0000-000000000000','設備仕様策定',          '自動化要件定義・ROI算出・予算申請',                         '11111111-1111-1111-1111-111111111111',ARRAY['planning','capex'],     '2026-01-15','2026-02-15',3,'done',       'cc004004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'), 2000000,100,'2026-01-15','2026-02-20'),
  ('dd004004-0002-0000-0000-000000000000','ベンダー選定・発注',    'メーカー3社比較・現地視察・発注決定',                       '11111111-1111-1111-1111-111111111111',ARRAY['vendor','procurement'], '2026-01-20','2026-02-28',4,'in_progress','cc004004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='maeda@factory-demo.jp'),    3000000,  2,'2026-01-20',NULL),
  ('dd004004-0003-0000-0000-000000000000','設備搬入・設置',        '工場レイアウト変更・搬入・電気工事',                        '11111111-1111-1111-1111-111111111111',ARRAY['installation','facility'],'2026-04-01','2026-04-20',4,'locked',    'cc004004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakajima@factory-demo.jp'), 3000000,  0,NULL,NULL),
  ('dd004004-0004-0000-0000-000000000000','試運転・検収',          '動作確認・精度検証・作業員トレーニング',                    '11111111-1111-1111-1111-111111111111',ARRAY['commissioning','qa'],   '2026-04-20','2026-04-30',4,'locked',     'cc004004-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='yamamoto@factory-demo.jp'), 3000000,  0,NULL,NULL);

-- ▼ 旧製品C廃止: 変化なし
INSERT INTO pieces (id, title, objective, company_id, skill_tags, start_date, due_date, priority, status, project_id, assignee_id, business_impact, progress, started_at, completed_at) VALUES
  ('dd004005-0001-0000-0000-000000000000','生産終了告知',          '顧客・取引先への生産終了通知・代替品案内',                  '11111111-1111-1111-1111-111111111111',ARRAY['communication'],        '2025-11-01','2025-11-30',3,'done','cc004005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='watanabe@factory-demo.jp'),100000,100,'2025-11-01','2025-11-28'),
  ('dd004005-0002-0000-0000-000000000000','最終在庫消化',          '残在庫の特別販売・廃棄処分・在庫ゼロ化',                    '11111111-1111-1111-1111-111111111111',ARRAY['sales','logistics'],    '2025-11-30','2026-01-31',3,'done','cc004005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='maeda@factory-demo.jp'),   200000,100,'2025-11-30','2026-01-25'),
  ('dd004005-0003-0000-0000-000000000000','設備撤去・売却',        '製造設備の撤去・中古業者売却・スペース解放',                 '11111111-1111-1111-1111-111111111111',ARRAY['facility','disposal'],  '2026-01-25','2026-02-28',2,'done','cc004005-0000-0000-0000-000000000000',(SELECT id FROM users WHERE email='nakajima@factory-demo.jp'),150000,100,'2026-01-25','2026-02-25');

-- 接続 (クロスプロジェクト コリドーは削除)
INSERT INTO connections (from_piece_id, to_piece_id, type) VALUES
  ('dd004001-0001-0000-0000-000000000000','dd004001-0002-0000-0000-000000000000','sequential'),
  ('dd004001-0001-0000-0000-000000000000','dd004001-0003-0000-0000-000000000000','sequential'),
  ('dd004001-0002-0000-0000-000000000000','dd004001-0004-0000-0000-000000000000','sequential'),
  ('dd004001-0003-0000-0000-000000000000','dd004001-0004-0000-0000-000000000000','sequential'),
  ('dd004002-0001-0000-0000-000000000000','dd004002-0002-0000-0000-000000000000','sequential'),
  ('dd004003-0001-0000-0000-000000000000','dd004003-0002-0000-0000-000000000000','sequential'),
  ('dd004004-0001-0000-0000-000000000000','dd004004-0002-0000-0000-000000000000','sequential'),
  ('dd004005-0001-0000-0000-000000000000','dd004005-0002-0000-0000-000000000000','sequential'),
  ('dd004005-0002-0000-0000-000000000000','dd004005-0003-0000-0000-000000000000','sequential')
ON CONFLICT DO NOTHING;

-- ※ クロスプロジェクト コリドーエッジ: 意図的に削除

COMMIT;
