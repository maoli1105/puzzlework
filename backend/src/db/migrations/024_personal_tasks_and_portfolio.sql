-- ============================================================
-- 024: 個人タスク・ポートフォリオ・機密設定・オンボーディング
-- このセッションで追加した全カラム・テーブルを冪等に適用
-- ============================================================

-- pieces: 個人タスク関連
ALTER TABLE pieces ADD COLUMN IF NOT EXISTS recurrence_rule text
  CHECK (recurrence_rule IN ('daily','weekly','monthly'));

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS is_today_focus boolean NOT NULL DEFAULT false;

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS estimated_minutes integer;

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS actual_minutes integer;

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS personal_tags text[] NOT NULL DEFAULT '{}';

-- pieces: 機密設定
ALTER TABLE pieces ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS confidential_until timestamptz;

-- users: ポートフォリオ公開設定
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_portfolio_public boolean NOT NULL DEFAULT false;

-- users: オンボーディング
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_skills text[] NOT NULL DEFAULT '{}';

-- contact_requests: 連絡機能
CREATE TABLE IF NOT EXISTS contact_requests (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_contact_requests_target ON contact_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_pieces_personal ON pieces(assignee_id, source) WHERE source = 'personal';
CREATE INDEX IF NOT EXISTS idx_pieces_portfolio ON pieces(assignee_id, status, completed_at)
  WHERE status = 'done' AND completed_at IS NOT NULL;
