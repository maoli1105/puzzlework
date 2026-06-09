import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { pool } from '../db';
import { notifyUser } from '../websocket';
import {
  createPiece,
  getPiece,
  listPieces,
  updateStatus,
  updatePiece,
  assignPiece,
  connectPiece,
  getBottlenecks,
  getConnections,
  publishPiece,
  unpublishPiece,
  getCascadeImpact,
  applyCascade,
  getDeps,
  getOrgHealthReport,
  getVelocityInsights,
  getVelocityGrowth,
  getStandupReport,
  reportBlocker,
  deleteConnection,
  updateConnection,
  getCriticalPath,
} from '../controllers/pieceController';

const router = Router();

router.use(authenticate);

router.get('/', listPieces);
router.post('/', requireAdmin, createPiece);

// ── 個人タスク作成（ワーカーが自分でタスクを追加） ──────────────────
router.post('/personal', async (req: any, res) => {
  const userId = req.user!.id;
  const { title, due_date, objective, recurrence_rule } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  const { rows: [piece] } = await pool.query(
    `INSERT INTO pieces
       (title, objective, value_metric, expected_impact,
        assignee_id, company_id, priority, skill_tags,
        status, source, worker_memo, recurrence_rule)
     VALUES ($1, $2, '', '', $3, NULL, 0, '{}', 'ready', 'personal', '', $4)
     RETURNING *`,
    [title.trim(), objective || '', userId, recurrence_rule || null]
  );
  if (due_date) {
    await pool.query(`UPDATE pieces SET due_date = $1 WHERE id = $2`, [due_date, piece.id]);
    piece.due_date = due_date;
  }
  res.status(201).json(piece);
});

// ── 個人タスク更新（ワーカーが自分のタスクのみ編集可） ──────────────────
router.patch('/personal/:id', async (req: any, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { title, due_date, objective, recurrence_rule,
          is_today_focus, estimated_minutes, actual_minutes, personal_tags } = req.body;

  // is_today_focus は自分のピース全体（企業ピース含む）に適用できる
  const allowedWithoutPersonalCheck = is_today_focus !== undefined
    && Object.keys(req.body).length === 1;

  const { rows: [existing] } = await pool.query(
    allowedWithoutPersonalCheck
      ? `SELECT id FROM pieces WHERE id = $1 AND assignee_id = $2`
      : `SELECT id FROM pieces WHERE id = $1 AND assignee_id = $2 AND source = 'personal'`,
    [id, userId]
  );
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (title !== undefined)              { updates.push(`title = $${idx++}`);              params.push(title.trim()); }
  if (objective !== undefined)          { updates.push(`objective = $${idx++}`);          params.push(objective); }
  if (due_date !== undefined)           { updates.push(`due_date = $${idx++}`);           params.push(due_date || null); }
  if (recurrence_rule !== undefined)    { updates.push(`recurrence_rule = $${idx++}`);    params.push(recurrence_rule || null); }
  if (is_today_focus !== undefined)     { updates.push(`is_today_focus = $${idx++}`);     params.push(!!is_today_focus); }
  if (estimated_minutes !== undefined)  { updates.push(`estimated_minutes = $${idx++}`);  params.push(estimated_minutes || null); }
  if (actual_minutes !== undefined)     { updates.push(`actual_minutes = $${idx++}`);     params.push(actual_minutes || null); }
  if (personal_tags !== undefined)      { updates.push(`personal_tags = $${idx++}`);      params.push(personal_tags); }

  if (updates.length === 0) { res.status(400).json({ error: 'no fields' }); return; }

  params.push(id);
  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  res.json(piece);
});

// ── 個人タスク削除（ワーカーが自分のタスクのみ削除可） ──────────────────
router.delete('/personal/:id', async (req: any, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { rowCount } = await pool.query(
    `DELETE FROM pieces WHERE id = $1 AND assignee_id = $2 AND source = 'personal'`,
    [id, userId]
  );
  if (!rowCount) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ ok: true });
});

// ── 個人タスク完了時・繰り返し次回作成 ─────────────────────────────────
router.post('/personal/:id/complete', async (req: any, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET status = 'done', completed_at = now()
     WHERE id = $1 AND assignee_id = $2 AND source = 'personal'
     RETURNING *`,
    [id, userId]
  );
  if (!piece) { res.status(404).json({ error: 'not found' }); return; }

  // 繰り返しルールがあれば次回分を自動生成
  if (piece.recurrence_rule) {
    const nextDue = piece.due_date ? (() => {
      const d = new Date(piece.due_date);
      if (piece.recurrence_rule === 'daily')   d.setDate(d.getDate() + 1);
      if (piece.recurrence_rule === 'weekly')  d.setDate(d.getDate() + 7);
      if (piece.recurrence_rule === 'monthly') d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    })() : null;

    const { rows: [next] } = await pool.query(
      `INSERT INTO pieces
         (title, objective, assignee_id, company_id, status, source,
          recurrence_rule, due_date, priority, skill_tags,
          value_metric, expected_impact, worker_memo)
       VALUES ($1, $2, $3, NULL, 'ready', 'personal', $4, $5, $6, '{}', '', '', '')
       RETURNING *`,
      [piece.title, piece.objective, userId, piece.recurrence_rule, nextDue, piece.priority]
    );
    res.json({ completed: piece, next });
  } else {
    res.json({ completed: piece, next: null });
  }
});
router.get('/bottlenecks', requireAdmin, getBottlenecks);
router.get('/org-health', requireAdmin, getOrgHealthReport);
router.get('/velocity', requireAdmin, getVelocityInsights);
router.get('/velocity/growth', requireAdmin, getVelocityGrowth);
router.get('/standup', requireAdmin, getStandupReport);
router.get('/critical-path', requireAdmin, getCriticalPath);
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || (q as string).trim().length < 2) { res.json([]); return; }
  const company_id = (req as { user?: { company_id: string } }).user?.company_id;
  const term = `%${(q as string).trim()}%`;
  const { rows } = await pool.query(
    `SELECT 'piece' as type, id, title as name, status, project_id FROM pieces
     WHERE company_id = $1 AND (title ILIKE $2 OR objective ILIKE $2 OR $2 = ANY(skill_tags::text[]))
     UNION ALL
     SELECT 'project' as type, id, name, status, NULL as project_id FROM projects
     WHERE company_id = $1 AND name ILIKE $2
     ORDER BY name LIMIT 10`,
    [company_id, term]
  );
  res.json(rows);
});
// CSV bulk import (フロント側でパース済みのJSON配列を受信)
router.post('/bulk', requireAdmin, async (req, res) => {
  const company_id = (req as { user?: { company_id: string } }).user?.company_id;
  const rows: {
    title: string; objective?: string; skill_tags?: string[];
    due_date?: string; start_date?: string; priority?: number;
    project_id?: string; assignee_id?: string; status?: string;
    business_impact?: number;
  }[] = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: '配列が必要です' }); return;
  }
  if (rows.length > 200) {
    res.status(400).json({ error: '一度に200件まで' }); return;
  }
  const validStatuses = ['locked', 'ready', 'in_progress', 'done'];
  const created: unknown[] = [];
  for (const row of rows) {
    if (!row.title?.trim()) continue;
    const status = validStatuses.includes(row.status ?? '') ? row.status : 'locked';
    const { rows: [piece] } = await pool.query(
      `INSERT INTO pieces
         (title, objective, company_id, skill_tags, due_date, start_date, priority, status, project_id, assignee_id, business_impact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, title, status, project_id, assignee_id`,
      [
        row.title.trim(),
        row.objective?.trim() || '',
        company_id,
        Array.isArray(row.skill_tags) ? row.skill_tags : [],
        row.due_date   || null,
        row.start_date || null,
        Number(row.priority) || 0,
        status,
        row.project_id || null,
        row.assignee_id || null,
        Number(row.business_impact) || 0,
      ]
    );
    created.push(piece);
  }
  res.status(201).json({ created: created.length, pieces: created });
});

// ── ワーカーポートフォリオ GET /pieces/portfolio ─────────────────────────
// 本人向け：機密ピースも全部表示（詳細あり）、機密フラグを付与
router.get('/portfolio', async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.title,
         p.objective,
         p.skill_tags,
         p.personal_tags,
         p.source,
         p.status,
         p.completed_at,
         p.estimated_minutes,
         p.actual_minutes,
         p.business_impact,
         p.company_id,
         p.is_confidential,
         p.confidential_until,
         -- 現時点で機密中かどうか（期限切れなら公開扱い）
         CASE
           WHEN p.is_confidential AND (p.confidential_until IS NULL OR p.confidential_until > $2)
           THEN true ELSE false
         END AS currently_confidential,
         c.name AS company_name
       FROM pieces p
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.assignee_id = $1
         AND p.status = 'done'
         AND p.completed_at IS NOT NULL
         AND (p.source IS NULL OR p.source != 'personal')
       ORDER BY p.completed_at DESC`,
      [userId, now]
    );
    res.json(rows);
  } catch (err) {
    console.error('portfolio error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ── ワーカー個人統計 GET /pieces/my-stats ─────────────────────────────────
router.get('/my-stats', async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const now = new Date();
    const monthStart      = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const thirtyDaysAgo   = new Date(now.getTime() - 30 * 86400000).toISOString();
    const twelveWeeksAgo  = new Date(now.getTime() - 84 * 86400000).toISOString();

    const [summaryRes, dailyRes, upcomingRes, skillRes, weeklyRes, timeRes, tagRes, companyRes] = await Promise.all([
      // 今月・先月・進行中・着手可・期限超過
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= $1)                        AS done_this_month,
           COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= $2 AND completed_at < $1)  AS done_last_month,
           COUNT(*) FILTER (WHERE status = 'in_progress')                                        AS in_progress_count,
           COUNT(*) FILTER (WHERE status = 'ready')                                              AS ready_count,
           COUNT(*) FILTER (WHERE status NOT IN ('done') AND due_date < NOW())                   AS overdue_count,
           ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/86400)
             FILTER (WHERE status = 'done' AND completed_at IS NOT NULL AND started_at IS NOT NULL), 1) AS avg_days,
           COALESCE(SUM(business_impact) FILTER (WHERE status = 'done' AND completed_at >= $1), 0) AS impact_this_month,
           COALESCE(SUM(actual_minutes)  FILTER (WHERE status = 'done' AND completed_at >= $1), 0) AS minutes_this_month
         FROM pieces WHERE assignee_id = $3`,
        [monthStart, lastMonthStart, userId]
      ),
      // 過去30日の日別完了数
      pool.query(
        `SELECT DATE(completed_at) AS date, COUNT(*) AS count
         FROM pieces
         WHERE assignee_id = $1 AND status = 'done' AND completed_at >= $2
         GROUP BY DATE(completed_at) ORDER BY date ASC`,
        [userId, thirtyDaysAgo]
      ),
      // 直近の期限ピース（完了以外）
      pool.query(
        `SELECT id, title, status, due_date, business_impact, priority, source
         FROM pieces
         WHERE assignee_id = $1 AND status NOT IN ('done') AND due_date IS NOT NULL
         ORDER BY due_date ASC LIMIT 10`,
        [userId]
      ),
      // 企業スキルタグ別完了数（全期間）
      pool.query(
        `SELECT UNNEST(skill_tags) AS tag, COUNT(*) AS count
         FROM pieces
         WHERE assignee_id = $1 AND status = 'done' AND array_length(skill_tags, 1) > 0
         GROUP BY tag ORDER BY count DESC LIMIT 12`,
        [userId]
      ),
      // 週次完了サマリー（過去12週）
      pool.query(
        `SELECT
           DATE_TRUNC('week', completed_at) AS week_start,
           COUNT(*)                          AS count,
           COALESCE(SUM(actual_minutes), 0)  AS minutes,
           COUNT(*) FILTER (WHERE source = 'personal') AS personal_count,
           COUNT(*) FILTER (WHERE source != 'personal' OR source IS NULL) AS company_count
         FROM pieces
         WHERE assignee_id = $1 AND status = 'done' AND completed_at >= $2
         GROUP BY week_start ORDER BY week_start ASC`,
        [userId, twelveWeeksAgo]
      ),
      // 今月の合計作業時間（見積 vs 実績）
      pool.query(
        `SELECT
           COALESCE(SUM(estimated_minutes), 0) AS est_total,
           COALESCE(SUM(actual_minutes), 0)    AS act_total,
           COUNT(*) FILTER (WHERE actual_minutes IS NOT NULL) AS timed_count
         FROM pieces
         WHERE assignee_id = $1 AND status = 'done' AND completed_at >= $2`,
        [userId, monthStart]
      ),
      // 個人タグ別完了数（全期間）
      pool.query(
        `SELECT UNNEST(personal_tags) AS tag, COUNT(*) AS count,
                COALESCE(SUM(actual_minutes), 0) AS minutes
         FROM pieces
         WHERE assignee_id = $1 AND status = 'done'
           AND array_length(personal_tags, 1) > 0
         GROUP BY tag ORDER BY count DESC LIMIT 12`,
        [userId]
      ),
      // 企業別完了数（全期間）
      pool.query(
        `SELECT c.name AS company_name, COUNT(*) AS count,
                COALESCE(SUM(p.actual_minutes), 0) AS minutes
         FROM pieces p
         LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.assignee_id = $1 AND p.status = 'done'
         GROUP BY c.name ORDER BY count DESC LIMIT 8`,
        [userId]
      ),
    ]);

    const s = summaryRes.rows[0];
    const t = timeRes.rows[0];
    res.json({
      done_this_month:    s.done_this_month,
      done_last_month:    s.done_last_month,
      in_progress_count:  s.in_progress_count,
      ready_count:        s.ready_count,
      overdue_count:      s.overdue_count,
      avg_days:           s.avg_days,
      impact_this_month:  s.impact_this_month,
      minutes_this_month: s.minutes_this_month,
      daily_done:         dailyRes.rows,
      upcoming:           upcomingRes.rows,
      skill_breakdown:    skillRes.rows,
      weekly_summary:     weeklyRes.rows,
      time_summary:       { est_total: t.est_total, act_total: t.act_total, timed_count: t.timed_count },
      personal_tag_breakdown: tagRes.rows,
      company_breakdown:  companyRes.rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get('/connections', getConnections);
router.delete('/connections/:id', requireAdmin, deleteConnection);
router.patch('/connections/:id', requireAdmin, updateConnection);

// Activity log for company (recent piece events)
router.get('/activity', requireAdmin, async (req, res) => {
  const company_id = (req as { user?: { company_id: string } }).user?.company_id;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const { rows } = await pool.query(
    `SELECT pl.id, pl.event_type, pl.old_value, pl.new_value, pl.created_at,
            p.title as piece_title, p.id as piece_id,
            u.name as user_name
     FROM piece_logs pl
     JOIN pieces p ON p.id = pl.piece_id
     LEFT JOIN users u ON u.id = pl.user_id
     WHERE p.company_id = $1
     ORDER BY pl.created_at DESC
     LIMIT $2`,
    [company_id, limit]
  );
  res.json(rows);
});

// Worker: update own progress (no admin required)
router.patch('/:id/progress', async (req, res) => {
  const { id } = req.params;
  const { progress } = req.body;
  const userId = (req as { user?: { id: string } }).user?.id;
  const val = Number(progress);
  if (isNaN(val) || val < 0 || val > 100) { res.status(400).json({ error: 'progress must be 0-100' }); return; }
  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }
  if (piece.assignee_id !== userId && (req as { user?: { role: string } }).user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await pool.query('UPDATE pieces SET progress = $1 WHERE id = $2', [val, id]);
  res.json({ success: true });
});

// Admin: reorder piece within a column (drag-sort)
router.patch('/:id/reorder', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { before_order, after_order } = req.body as { before_order?: number; after_order?: number };
  const company_id = (req as { user?: { company_id: string } }).user?.company_id;
  const { rows: [piece] } = await pool.query('SELECT id FROM pieces WHERE id = $1 AND company_id = $2', [id, company_id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  let newOrder: number;
  if (before_order === undefined && after_order === undefined) {
    newOrder = 0;
  } else if (before_order === undefined) {
    newOrder = (after_order as number) - 1;
  } else if (after_order === undefined) {
    newOrder = (before_order as number) + 1;
  } else {
    newOrder = ((before_order as number) + (after_order as number)) / 2;
  }

  await pool.query('UPDATE pieces SET display_order = $1 WHERE id = $2', [newOrder, id]);
  res.json({ success: true, display_order: newOrder });
});

router.get('/:id', getPiece);

// ピース別変更履歴
router.get('/:id/logs', authenticate, async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
  const { rows } = await pool.query(
    `SELECT pl.id, pl.event_type, pl.old_value, pl.new_value, pl.created_at,
            u.name as user_name
     FROM piece_logs pl
     LEFT JOIN users u ON u.id = pl.user_id
     WHERE pl.piece_id = $1
     ORDER BY pl.created_at DESC
     LIMIT $2`,
    [id, limit]
  );
  res.json(rows);
});

// Narrative Projection — piece_logs を集約して「なぜこうなったか」を返す
router.get('/:id/narrative', authenticate, async (req, res) => {
  const { id } = req.params;

  const { rows: [piece] } = await pool.query(
    `SELECT p.*, u.name as assignee_name
     FROM pieces p LEFT JOIN users u ON u.id = p.assignee_id
     WHERE p.id = $1`,
    [id]
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  const { rows: logs } = await pool.query(
    `SELECT pl.id, pl.event_type, pl.old_value, pl.new_value, pl.reason, pl.created_at,
            u.name as user_name
     FROM piece_logs pl LEFT JOIN users u ON u.id = pl.user_id
     WHERE pl.piece_id = $1 ORDER BY pl.created_at ASC`,
    [id]
  );

  const { rows: downstream } = await pool.query(
    `SELECT p.id, p.status FROM connections c JOIN pieces p ON p.id = c.to_piece_id
     WHERE c.from_piece_id = $1`,
    [id]
  );

  // ── Events ────────────────────────────────────────────────────────────────
  const VALID_KINDS = new Set([
    'status_changed', 'assigned', 'connected', 'blocker_reported',
    'field_updated', 'auto_promoted', 'published', 'marketplace_accepted',
  ]);
  const events = logs.map((l: {
    id: string; event_type: string; old_value: string | null; new_value: string | null;
    reason: string | null; created_at: string; user_name: string | null;
  }) => {
    const kind = l.event_type.startsWith('field_updated') ? 'field_updated'
      : VALID_KINDS.has(l.event_type) ? l.event_type
      : 'field_updated';
    return { id: l.id, kind, actorName: l.user_name ?? null,
             from: l.old_value ?? null, to: l.new_value ?? null,
             reason: l.reason ?? null, timestamp: l.created_at };
  });

  // ── Summary helpers ───────────────────────────────────────────────────────
  const now = Date.now();
  function daysAgo(iso: string): string {
    const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    return d === 0 ? '今日' : d === 1 ? '昨日' : `${d}日前`;
  }

  // headline
  const rev = [...logs].reverse();
  const lastDone    = rev.find((l: { event_type: string; new_value: string }) => l.event_type === 'status_changed' && l.new_value === 'done');
  const lastStarted = rev.find((l: { event_type: string; new_value: string }) => l.event_type === 'status_changed' && l.new_value === 'in_progress');
  const lastAssign  = rev.find((l: { event_type: string }) => l.event_type === 'assigned');

  let headline = '';
  if (lastDone) {
    headline = `${(lastDone as { user_name?: string }).user_name ?? '誰か'}が${daysAgo((lastDone as { created_at: string }).created_at)}に完了させた`;
  } else if (lastStarted) {
    const actor = (lastStarted as { user_name?: string }).user_name ?? piece.assignee_name ?? '誰か';
    if (lastAssign && (lastAssign as { created_at: string }).created_at < (lastStarted as { created_at: string }).created_at) {
      headline = `${(lastAssign as { user_name?: string }).user_name ?? actor}が${daysAgo((lastAssign as { created_at: string }).created_at)}に引き取り、${daysAgo((lastStarted as { created_at: string }).created_at)}に着手`;
    } else {
      headline = `${actor}が${daysAgo((lastStarted as { created_at: string }).created_at)}に着手中`;
    }
  } else if (piece.assignee_name) {
    headline = `${piece.assignee_name}に割り当てられている（未着手）`;
  } else if (piece.status === 'locked') {
    headline = 'ブロックされており、着手できない状態';
  } else {
    headline = '未割当・未着手';
  }

  // openIssues
  const openIssues: string[] = [];
  const lockedDown = (downstream as { status: string }[]).filter(d => d.status === 'locked').length;
  if (lockedDown > 0) openIssues.push(`下流${lockedDown}枚がlocked`);
  if (piece.status === 'locked') openIssues.push('このピース自体がブロックされている');
  const lastBlocker = rev.find((l: { event_type: string }) => l.event_type === 'blocker_reported');
  if (lastBlocker) openIssues.push(`ブロッカーが${daysAgo((lastBlocker as { created_at: string }).created_at)}に報告されている`);
  if (piece.status === 'in_progress' && piece.started_at) {
    const staleDays = Math.floor((now - new Date(piece.started_at).getTime()) / 86_400_000);
    if (staleDays > 14) openIssues.push(`${staleDays}日間着手中で完了していない`);
  }

  // patterns: ステータスの往復を検出
  const patterns: string[] = [];
  const statusChanges = logs.filter((l: { event_type: string }) => l.event_type === 'status_changed') as { new_value: string; created_at: string }[];
  let cycleCount = 0;
  let prev = '';
  for (const sc of statusChanges) {
    if (prev === 'in_progress' && sc.new_value === 'locked') cycleCount++;
    prev = sc.new_value;
  }
  if (cycleCount >= 2) patterns.push(`locked → in_progress を${cycleCount + 1}回繰り返している`);

  const reassignCount = logs.filter((l: { event_type: string }) => l.event_type === 'assigned').length;
  if (reassignCount >= 3) patterns.push(`担当者が${reassignCount}回変更されている`);

  // momentum: 仕事の勢い
  type Momentum = 'forward' | 'blocked' | 'cycling' | 'idle';
  let momentum: Momentum;
  const lastLog = logs.length > 0 ? logs[logs.length - 1] as { event_type: string; new_value: string; created_at: string } : null;
  const hoursSinceLast = lastLog
    ? (now - new Date(lastLog.created_at).getTime()) / 3_600_000
    : Infinity;
  if (cycleCount >= 2) {
    momentum = 'cycling';
  } else if (piece.status === 'locked' || (lastLog && lastLog.event_type === 'blocker_reported')) {
    momentum = 'blocked';
  } else if (lastLog && ['status_changed','assigned','auto_promoted'].includes(lastLog.event_type) && hoursSinceLast < 48) {
    momentum = 'forward';
  } else {
    momentum = 'idle';
  }

  // ── Residue integration ──────────────────────────────────────────────────
  const { rows: residueRows } = await pool.query(
    `SELECT id, piece_id, author_id, type, body, created_at
     FROM residue_notes WHERE piece_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [id]
  );
  const residue = (residueRows as { type: string; body: string; created_at: string }[]).map(r => ({
    type:       r.type,
    body:       r.body,
    created_at: r.created_at,
  }));

  // residue からの追加 openIssues
  const residueCautions = residue.filter(r => r.type === 'caution' || r.type === 'blocker' || r.type === 'uncertainty');
  for (const rc of residueCautions.slice(0, 2)) {
    openIssues.push(`[文脈] ${rc.body}`);
  }

  // handoff メモがあれば patterns に追加
  const handoffNotes = residue.filter(r => r.type === 'handoff');
  if (handoffNotes.length > 0) {
    patterns.push(`引き継ぎメモが${handoffNotes.length}件記録されている`);
  }

  res.json({ events, summary: { headline, openIssues, patterns, momentum }, residue });
});

// Residue Notes — GET /pieces/:id/residue
router.get('/:id/residue', authenticate, async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT rn.id, rn.piece_id, rn.author_id, rn.type, rn.body, rn.created_at,
            u.name as author_name
     FROM residue_notes rn LEFT JOIN users u ON u.id = rn.author_id
     WHERE rn.piece_id = $1
     ORDER BY rn.created_at DESC`,
    [id]
  );
  res.json(rows);
});

// Residue Notes — POST /pieces/:id/residue
router.post('/:id/residue', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = (req as { user?: { id: string } }).user?.id;
  const { type, body } = req.body as { type: string; body: string };

  const validTypes = ['blocker', 'insight', 'caution', 'handoff', 'uncertainty', 'decision'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: 'type が不正です' }); return;
  }
  const trimmed = (body ?? '').trim();
  if (trimmed.length === 0 || trimmed.length > 140) {
    res.status(400).json({ error: '本文は1〜140文字で入力してください' }); return;
  }

  // piece が存在することを確認
  const { rows: [piece] } = await pool.query('SELECT id FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  const { rows: [note] } = await pool.query(
    `INSERT INTO residue_notes (piece_id, author_id, type, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, piece_id, author_id, type, body, created_at`,
    [id, userId ?? null, type, trimmed]
  );
  res.status(201).json(note);
});

router.patch('/:id', requireAdmin, updatePiece);
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const company_id = (req as { user?: { company_id: string } }).user?.company_id;
  // 同社のピースのみ削除可
  const { rows: [piece] } = await pool.query(
    'SELECT id FROM pieces WHERE id = $1 AND company_id = $2', [id, company_id]
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }
  // 依存関係を削除
  await pool.query('DELETE FROM connections WHERE from_piece_id = $1 OR to_piece_id = $1', [id]);
  // 子ピースの親を解除（孤立させる）
  await pool.query('UPDATE pieces SET parent_id = NULL WHERE parent_id = $1', [id]);
  // コメント・タイムログ・ログは CASCADE DELETE（FK設定次第）、なければ手動
  await pool.query('DELETE FROM piece_comments WHERE piece_id = $1', [id]);
  await pool.query('DELETE FROM time_logs WHERE piece_id = $1', [id]);
  await pool.query('DELETE FROM piece_logs WHERE piece_id = $1', [id]);
  await pool.query('DELETE FROM pieces WHERE id = $1', [id]);
  res.json({ success: true });
});
router.patch('/:id/status', updateStatus);
router.patch('/:id/assign', requireAdmin, assignPiece);
router.post('/:id/connect', requireAdmin, connectPiece);
router.patch('/:id/publish', requireAdmin, publishPiece);
router.patch('/:id/unpublish', requireAdmin, unpublishPiece);
router.get('/:id/cascade-impact', getCascadeImpact);
router.post('/:id/cascade-apply', requireAdmin, applyCascade);
router.get('/:id/deps', authenticate, getDeps);
router.post('/:id/report-blocker', reportBlocker);

// Comments
router.get('/:id/comments', authenticate, async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT pc.*, u.name as user_name FROM piece_comments pc JOIN users u ON u.id = pc.user_id
     WHERE pc.piece_id = $1 ORDER BY pc.created_at ASC`, [id]
  );
  res.json(rows);
});
router.post('/:id/comments', authenticate, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = (req as { user?: { id: string; company_id: string } }).user?.id;
  const companyId = (req as { user?: { id: string; company_id: string } }).user?.company_id;
  if (!content?.trim()) { res.status(400).json({ error: 'Content required' }); return; }
  const { rows: [comment] } = await pool.query(
    `INSERT INTO piece_comments (piece_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [id, userId, content.trim()]
  );
  const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  const { rows: [piece] } = await pool.query('SELECT title FROM pieces WHERE id = $1', [id]);

  // @メンション解析: 会社メンバーの名前を含むかチェックして通知
  // スペースを含む名前に対応するため regex ではなく includes で照合
  if (companyId) {
    const { rows: companyUsers } = await pool.query(
      `SELECT u.id, u.name FROM users u
       JOIN company_memberships cm ON cm.user_id = u.id
       WHERE cm.company_id = $1 AND u.id != $2 AND cm.status = 'active'`,
      [companyId, userId]
    );
    for (const target of companyUsers) {
      if (content.includes(`@${target.name}`)) {
        notifyUser(target.id, {
          type: 'comment_mention',
          payload: {
            piece_id:    id,
            piece_title: piece?.title ?? '',
            from_name:   user.name,
            content:     content.trim(),
            comment_id:  comment.id,
          },
        });
      }
    }

    // Slack Webhook 転送: ピースのプロジェクトに設定があれば投稿
    const { rows: [proj] } = await pool.query(
      `SELECT p.slack_webhook_url, pr.name AS project_name
       FROM pieces pi
       LEFT JOIN projects p ON p.id = pi.project_id
       LEFT JOIN projects pr ON pr.id = pi.project_id
       WHERE pi.id = $1`, [id]
    );
    if (proj?.slack_webhook_url) {
      const slackBody = {
        text: `*[${proj.project_name ?? 'プロジェクト'}]* ${user.name}: ${content.trim()}`,
        username: 'PuzzleWork',
      };
      fetch(proj.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackBody),
      }).catch(() => {}); // 失敗しても無視
    }
  }

  res.status(201).json({ ...comment, user_name: user.name });
});

// Time logs
router.get('/:id/time-logs', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT tl.*, u.name as user_name
     FROM time_logs tl LEFT JOIN users u ON u.id = tl.user_id
     WHERE tl.piece_id = $1 ORDER BY tl.logged_date DESC, tl.created_at DESC`,
    [id]
  );
  const total = rows.reduce((s: number, r: { logged_minutes: number }) => s + r.logged_minutes, 0);
  res.json({ logs: rows, total_minutes: total });
});

router.post('/:id/time-logs', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = (req as { user?: { id: string; company_id: string } }).user?.id;
  const company_id = (req as { user?: { id: string; company_id: string } }).user?.company_id;
  const { logged_minutes, note, logged_date } = req.body;
  if (!logged_minutes || logged_minutes <= 0) { res.status(400).json({ error: 'logged_minutes は1以上が必要です' }); return; }
  const { rows: [log] } = await pool.query(
    `INSERT INTO time_logs (piece_id, user_id, company_id, logged_minutes, note, logged_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, userId, company_id, logged_minutes, note ?? '', logged_date ?? new Date().toISOString().slice(0, 10)]
  );
  const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  res.status(201).json({ ...log, user_name: user?.name });
});

router.delete('/time-logs/:logId', authenticate, async (req, res) => {
  const userId = (req as { user?: { id: string } }).user?.id;
  await pool.query('DELETE FROM time_logs WHERE id = $1 AND user_id = $2', [req.params.logId, userId]);
  res.json({ ok: true });
});

export default router;
