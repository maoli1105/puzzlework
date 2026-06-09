import { Response } from 'express';
import { pool } from '../db';
import { fireTriggersOnDone } from '../services/triggerService';
import { detectBottlenecks } from '../services/bottleneckService';
import { getOrgHealth } from '../services/healthService';
import { updateSkillTreeOnPieceDone } from '../services/skillTreeService';
import { notifyUser } from '../websocket/index';
import { AuthRequest } from '../middleware/auth';

export async function createPiece(req: AuthRequest, res: Response) {
  const { title, objective, value_metric, expected_impact, assignee_id, priority, skill_tags, project_id, due_date, parent_id, status: reqStatus } = req.body;
  const company_id = req.user!.company_id;
  const VALID_STATUS = ['locked', 'ready', 'in_progress'];
  const status = VALID_STATUS.includes(reqStatus) ? reqStatus : 'locked';

  const { rows: [piece] } = await pool.query(
    `INSERT INTO pieces (title, objective, value_metric, expected_impact, assignee_id, company_id, priority, skill_tags, status, project_id, due_date, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [title, objective || '', value_metric || '', expected_impact || '', assignee_id || null, company_id, priority || 0, skill_tags || [], status, project_id || null, due_date || null, parent_id || null]
  );

  res.status(201).json(piece);
}

export async function getPiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(piece);
}

export async function listPieces(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;
  const userId     = req.user!.id;
  const role       = req.user!.role;
  const { status, assignee_id, cursor, cursor_id, limit: limitQ } = req.query;

  // ワーカーが自分のピースを取得する場合：複数会社メンバーシップ対応
  const isWorkerOwnPieces = role === 'worker' && assignee_id === userId;
  let query: string;
  let params: unknown[];

  if (isWorkerOwnPieces) {
    // 個人タスク ＋ 所属企業のピース（company_memberships 経由）を一括取得
    query = `SELECT p.*, u.name AS assignee_name, pr.name AS project_name,
                    c.name AS company_name
             FROM pieces p
             LEFT JOIN users u ON u.id = p.assignee_id
             LEFT JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN companies c ON c.id = p.company_id
             WHERE p.assignee_id = $1
               AND (
                 p.company_id IS NULL
                 OR p.company_id IN (
                   SELECT company_id FROM company_memberships
                   WHERE user_id = $1 AND status = 'active'
                 )
               )`;
    params = [userId];
    if (status) { query += ` AND p.status = $${params.push(status)}`; }
  } else {
    query = `SELECT p.*, u.name AS assignee_name, pr.name AS project_name,
                    c.name AS company_name
             FROM pieces p
             LEFT JOIN users u ON u.id = p.assignee_id
             LEFT JOIN projects pr ON pr.id = p.project_id
             LEFT JOIN companies c ON c.id = p.company_id
             WHERE p.company_id = $1`;
    params = [company_id];
    if (status) { query += ` AND p.status = $${params.push(status)}`; }
    if (assignee_id) { query += ` AND p.assignee_id = $${params.push(assignee_id)}`; }
  }

  query += ' ORDER BY p.priority DESC, p.created_at ASC, p.id ASC';

  // Pagination mode: when limit param provided, return { items, hasMore, nextCursor }
  if (limitQ) {
    const limit = Math.min(Number(limitQ) || 50, 200);

    if (cursor && cursor_id) {
      const [prio, ts] = (cursor as string).split('|');
      query += ` AND (priority < $${params.push(Number(prio))} OR (priority = $${params.length} AND (created_at > $${params.push(ts)} OR (created_at = $${params.length} AND id > $${params.push(cursor_id)}))))`;
    }

    query += ` LIMIT $${params.push(limit + 1)}`;
    const { rows } = await pool.query(query, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    res.json({
      items,
      hasMore,
      nextCursor: hasMore && last ? `${last.priority}|${last.created_at.toISOString()}` : null,
      nextCursorId: hasMore && last ? last.id : null,
    });
    return;
  }

  // Legacy: return flat array
  const { rows } = await pool.query(query, params);
  res.json(rows);
}

export async function updateStatus(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user!.id;

  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  // in_progressへの遷移時：started_atを記録
  if (status === 'in_progress' && piece.status === 'ready') {
    await pool.query(
      `UPDATE pieces SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
      [id]
    );
    await logPieceEvent(id, userId, 'status_changed', piece.status, status);
    // ワーカーが開始したことを管理者へ通知
    await notifyAdmins(piece.company_id, {
      type: 'piece_status_changed',
      payload: { piece_id: id, title: piece.title, status: 'in_progress' },
    });
    res.json({ success: true });
    return;
  }

  // doneへの遷移：トリガー発火 + スキルツリー更新 + 自動昇格
  if (status === 'done' && piece.status === 'in_progress') {
    // ステータスを done に更新
    await pool.query(
      `UPDATE pieces SET status = 'done', completed_at = NOW() WHERE id = $1`,
      [id]
    );
    await logPieceEvent(id, userId, 'status_changed', piece.status, 'done');

    await fireTriggersOnDone(id);

    if (piece.assignee_id) {
      const result = await updateSkillTreeOnPieceDone(piece.assignee_id, piece.skill_tags ?? []);
      if (result.leveled_up && result.category) {
        notifyUser(piece.assignee_id, {
          type: 'skill_levelup',
          payload: { category: result.category, message: `スキルが上がりました：${result.category}` },
        });
      }
    }

    // 依存ピースの自動昇格
    await autoPromoteDependents(id, userId, piece.company_id);

    // ワーカーが完了したことを管理者へ通知（担当者名を含める）
    const { rows: [assigneeRow] } = piece.assignee_id
      ? await pool.query('SELECT name FROM users WHERE id = $1', [piece.assignee_id])
      : { rows: [null] };
    await notifyAdmins(piece.company_id, {
      type: 'piece_done',
      payload: { piece_id: id, title: piece.title, assignee_name: assigneeRow?.name ?? null },
    });

    res.json({ success: true });
    return;
  }

  // Admin override: allow any transition with direct DB update
  if (req.user!.role === 'admin') {
    const VALID = ['locked', 'ready', 'in_progress', 'done'];
    if (!VALID.includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
    await pool.query('UPDATE pieces SET status = $1 WHERE id = $2', [status, id]);
    await logPieceEvent(id, userId, 'status_changed', piece.status, status);
    // doneに変更された場合は依存ピースの自動昇格も実行
    if (status === 'done') {
      await autoPromoteDependents(id, userId, piece.company_id);
    }
    res.json({ success: true });
    return;
  }

  res.status(400).json({ error: `Invalid status transition: ${piece.status} → ${status}` });
}

export async function updatePiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const userId = req.user!.id;
  const { project_id, due_date, start_date, title, objective, value_metric, expected_impact, priority, skill_tags } = req.body;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if ('project_id' in req.body) { params.push(project_id || null); setClauses.push(`project_id = $${params.length}`); }
  if ('due_date'   in req.body) { params.push(due_date   || null); setClauses.push(`due_date = $${params.length}`); }
  if ('start_date' in req.body) { params.push(start_date || null); setClauses.push(`start_date = $${params.length}`); }
  if ('title'      in req.body) { params.push(title);              setClauses.push(`title = $${params.length}`); }
  if ('objective'  in req.body) { params.push(objective);          setClauses.push(`objective = $${params.length}`); }
  if ('value_metric'    in req.body) { params.push(value_metric);        setClauses.push(`value_metric = $${params.length}`); }
  if ('expected_impact' in req.body) { params.push(expected_impact);     setClauses.push(`expected_impact = $${params.length}`); }
  if ('priority'        in req.body) { params.push(priority);                      setClauses.push(`priority = $${params.length}`); }
  if ('skill_tags'         in req.body) { params.push(skill_tags);                    setClauses.push(`skill_tags = $${params.length}`); }
  if ('status'             in req.body) {
    const VALID = ['locked','ready','in_progress','done'];
    if (VALID.includes(req.body.status)) { params.push(req.body.status); setClauses.push(`status = $${params.length}`); }
  }
  if ('progress'           in req.body) { params.push(Math.max(0, Math.min(100, Number(req.body.progress)))); setClauses.push(`progress = $${params.length}`); }
  if ('business_impact'    in req.body) { params.push(Number(req.body.business_impact) || 0);                 setClauses.push(`business_impact = $${params.length}`); }
  if ('is_confidential'    in req.body) { params.push(Boolean(req.body.is_confidential));                     setClauses.push(`is_confidential = $${params.length}`); }
  if ('confidential_until' in req.body) { params.push(req.body.confidential_until || null);                   setClauses.push(`confidential_until = $${params.length}`); }

  if (setClauses.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  // 変更ログ用に現在値を取得
  const { rows: [before] } = await pool.query(
    'SELECT title, objective, value_metric, expected_impact, skill_tags FROM pieces WHERE id = $1',
    [id]
  );

  params.push(id);
  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  // テキストフィールドが変わった場合だけログを書く
  const LOG_FIELDS: { key: string; label: string }[] = [
    { key: 'title',           label: 'タイトル' },
    { key: 'objective',       label: '目的' },
    { key: 'value_metric',    label: '評価指標' },
    { key: 'expected_impact', label: '期待成果' },
    { key: 'skill_tags',      label: 'スキルタグ' },
  ];
  for (const f of LOG_FIELDS) {
    if (!(f.key in req.body)) continue;
    const oldVal = before ? String(before[f.key] ?? '') : '';
    const newVal = f.key === 'skill_tags'
      ? (skill_tags as string[] | undefined)?.join(', ') ?? ''
      : String(req.body[f.key] ?? '');
    if (oldVal !== newVal) {
      await logPieceEvent(id, userId, `field_updated:${f.label}`, oldVal || null, newVal || null);
    }
  }

  res.json(piece);
}

export async function connectPiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { to_piece_id, type, condition } = req.body;

  const { rows: [connection] } = await pool.query(
    `INSERT INTO connections (from_piece_id, to_piece_id, type, condition)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, to_piece_id, type || 'sequential', condition || null]
  );

  await logPieceEvent(id, req.user!.id, 'connected', null, to_piece_id);
  res.status(201).json(connection);
}

export async function assignPiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { assignee_id } = req.body;

  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET assignee_id = $1 WHERE id = $2 RETURNING *`,
    [assignee_id || null, id]
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  await logPieceEvent(id, req.user!.id, 'assigned', null, assignee_id || 'unassigned');

  if (assignee_id) {
    if (piece.status === 'ready') {
      // 着手可能なピース → すぐ動ける
      notifyUser(assignee_id, {
        type: 'piece_ready',
        payload: { piece_id: id, message: `新しいピースが割り当てられました：「${piece.title}」` },
      });
    } else if (piece.status === 'locked') {
      // ロック中のピース → 前工程完了後に着手
      notifyUser(assignee_id, {
        type: 'piece_assigned',
        payload: { piece_id: id, message: `ピースが割り当てられました：「${piece.title}」（前の工程完了後に着手可能）` },
      });
    }
  }

  res.json(piece);
}

export async function getBottlenecks(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;
  const report = await detectBottlenecks(company_id);
  res.json(report);
}

export async function getOrgHealthReport(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;
  const report = await getOrgHealth(company_id);
  res.json(report);
}

export async function reportBlocker(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user!.id;
  const company_id = req.user!.company_id;

  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  // Log the blocker
  await pool.query(
    `INSERT INTO piece_logs (piece_id, user_id, event_type, old_value, new_value)
     VALUES ($1, $2, 'blocker_reported', NULL, $3)`,
    [id, userId, reason || 'ブロッカーが報告されました']
  );

  // Notify all admins in the company
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND role = 'admin'`,
    [company_id]
  );
  const { rows: [reporter] } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);

  for (const admin of admins) {
    notifyUser(admin.id, {
      type: 'alert',
      payload: {
        message: `🚧 ${reporter.name}さんが「${piece.title}」でブロックに遭遇: ${reason || '詳細なし'}`,
        piece_id: id,
      },
    });
  }

  res.json({ success: true });
}

export async function getStandupReport(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;

  const [completedRes, inProgressRes, overdueRes, blockedRes] = await Promise.all([
    pool.query(
      `SELECT p.title, u.name as assignee_name, p.completed_at
       FROM pieces p LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.company_id = $1 AND p.status = 'done' AND p.completed_at > NOW() - INTERVAL '24 hours'
       ORDER BY p.completed_at DESC`,
      [company_id]
    ),
    pool.query(
      `SELECT p.title, u.name as assignee_name, p.due_date, p.progress, p.business_impact
       FROM pieces p LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.company_id = $1 AND p.status = 'in_progress'
       ORDER BY p.priority DESC, p.due_date ASC NULLS LAST`,
      [company_id]
    ),
    pool.query(
      `SELECT p.title, u.name as assignee_name, p.due_date, p.business_impact
       FROM pieces p LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.company_id = $1 AND p.status != 'done' AND p.due_date < NOW()
       ORDER BY p.business_impact DESC`,
      [company_id]
    ),
    pool.query(
      `SELECT p.title, p.business_impact
       FROM pieces p
       WHERE p.company_id = $1 AND p.status IN ('ready','locked') AND p.assignee_id IS NULL
       ORDER BY p.priority DESC`,
      [company_id]
    ),
  ]);

  res.json({
    generated_at: new Date().toISOString(),
    completed_yesterday: completedRes.rows,
    in_progress: inProgressRes.rows,
    overdue: overdueRes.rows,
    unassigned_ready: blockedRes.rows,
  });
}

export async function getVelocityInsights(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;

  // Per-person stats
  const { rows: byPerson } = await pool.query(
    `SELECT u.id, u.name,
       COUNT(vl.id)::int as pieces_done,
       ROUND(AVG(vl.actual_days))::int as avg_days,
       MIN(vl.actual_days) as min_days,
       MAX(vl.actual_days) as max_days,
       COALESCE(SUM(vl.business_impact), 0)::bigint as total_impact,
       MAX(vl.created_at) as last_completed_at
     FROM users u
     LEFT JOIN piece_velocity_log vl ON vl.assignee_id = u.id
     WHERE u.company_id = $1 AND u.role = 'worker'
     GROUP BY u.id, u.name
     ORDER BY pieces_done DESC, avg_days ASC NULLS LAST`,
    [company_id]
  );

  // Per-skill stats
  const { rows: bySkill } = await pool.query(
    `SELECT skill, COUNT(*)::int as pieces_done, ROUND(AVG(actual_days))::int as avg_days
     FROM piece_velocity_log, unnest(skill_tags) as skill
     WHERE company_id = $1
     GROUP BY skill
     ORDER BY pieces_done DESC`,
    [company_id]
  );

  // Trend: weekly completions (last 8 weeks)
  const { rows: weeklyTrend } = await pool.query(
    `SELECT DATE_TRUNC('week', created_at) as week,
       COUNT(*)::int as pieces_done,
       ROUND(AVG(actual_days))::int as avg_days
     FROM piece_velocity_log
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '8 weeks'
     GROUP BY week ORDER BY week`,
    [company_id]
  );

  res.json({ by_person: byPerson, by_skill: bySkill, weekly_trend: weeklyTrend });
}

/**
 * 個人別成長トレンド — 「最近半分 vs 過去半分」の速度比較
 * 各ワーカーのスキル別実績と成長率を返す
 */
export async function getVelocityGrowth(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;

  // ── 個人別: 全件 / 前半 / 後半 の avg_days ─────────────────────────────────
  const { rows: growthRows } = await pool.query<{
    id: string; name: string;
    total_done: string;
    avg_days_all: string | null;
    avg_days_early: string | null;   // 時系列前半
    avg_days_recent: string | null;  // 時系列後半
    total_impact: string;
  }>(
    `WITH ranked AS (
       SELECT
         vl.assignee_id,
         vl.actual_days,
         vl.business_impact,
         ROW_NUMBER() OVER (PARTITION BY vl.assignee_id ORDER BY vl.created_at) AS rn,
         COUNT(*) OVER (PARTITION BY vl.assignee_id) AS cnt
       FROM piece_velocity_log vl
       WHERE vl.company_id = $1
     )
     SELECT
       u.id, u.name,
       COUNT(r.actual_days)::int AS total_done,
       ROUND(AVG(r.actual_days)::numeric, 1) AS avg_days_all,
       ROUND(AVG(CASE WHEN r.rn <= r.cnt / 2 THEN r.actual_days END)::numeric, 1) AS avg_days_early,
       ROUND(AVG(CASE WHEN r.rn >  r.cnt / 2 THEN r.actual_days END)::numeric, 1) AS avg_days_recent,
       COALESCE(SUM(r.business_impact), 0)::bigint AS total_impact
     FROM users u
     LEFT JOIN ranked r ON r.assignee_id = u.id
     WHERE u.company_id = $1 AND u.role = 'worker'
     GROUP BY u.id, u.name
     ORDER BY total_done DESC`,
    [company_id]
  );

  // ── 個人×スキル別速度 ────────────────────────────────────────────────────────
  const { rows: skillRows } = await pool.query<{
    assignee_id: string;
    tag: string;
    count: string;
    avg_days: string | null;
  }>(
    `SELECT
       vl.assignee_id,
       unnest(vl.skill_tags) AS tag,
       COUNT(*)::int AS count,
       ROUND(AVG(vl.actual_days)::numeric, 1) AS avg_days
     FROM piece_velocity_log vl
     WHERE vl.company_id = $1
     GROUP BY vl.assignee_id, tag
     ORDER BY vl.assignee_id, count DESC`,
    [company_id]
  );

  // ── 週次傾向 (最近12週) ──────────────────────────────────────────────────────
  const { rows: trendRows } = await pool.query<{
    week: string; pieces_done: string; avg_days: string | null;
  }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('week', created_at), 'MM/DD') AS week,
       COUNT(*)::int AS pieces_done,
       ROUND(AVG(actual_days)::numeric, 1) AS avg_days
     FROM piece_velocity_log
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '12 weeks'
     GROUP BY DATE_TRUNC('week', created_at)
     ORDER BY DATE_TRUNC('week', created_at)`,
    [company_id]
  );

  // ── スキル全体ランキング ──────────────────────────────────────────────────────
  const { rows: skillRankRows } = await pool.query<{
    tag: string; count: string; avg_days: string | null; total_impact: string;
  }>(
    `SELECT
       unnest(skill_tags) AS tag,
       COUNT(*)::int AS count,
       ROUND(AVG(actual_days)::numeric, 1) AS avg_days,
       COALESCE(SUM(business_impact), 0)::bigint AS total_impact
     FROM piece_velocity_log
     WHERE company_id = $1
     GROUP BY tag
     ORDER BY count DESC`,
    [company_id]
  );

  // skillRows を assignee_id でグルーピング
  const skillByPerson: Record<string, { tag: string; count: number; avg_days: number | null }[]> = {};
  for (const r of skillRows) {
    if (!skillByPerson[r.assignee_id]) skillByPerson[r.assignee_id] = [];
    skillByPerson[r.assignee_id].push({
      tag: r.tag,
      count: parseInt(r.count, 10),
      avg_days: r.avg_days ? parseFloat(r.avg_days) : null,
    });
  }

  const workers = growthRows.map(r => {
    const avgAll    = r.avg_days_all    ? parseFloat(r.avg_days_all)    : null;
    const avgEarly  = r.avg_days_early  ? parseFloat(r.avg_days_early)  : null;
    const avgRecent = r.avg_days_recent ? parseFloat(r.avg_days_recent) : null;
    // trend: improvement rate (positive = faster recently)
    const trend = avgEarly && avgRecent && avgEarly > 0
      ? Math.round(((avgEarly - avgRecent) / avgEarly) * 100)
      : null;
    return {
      id:           r.id,
      name:         r.name,
      total_done:   parseInt(r.total_done, 10),
      avg_days_all: avgAll,
      avg_days_early: avgEarly,
      avg_days_recent: avgRecent,
      trend,          // positive = getting faster (%)
      total_impact: parseInt(r.total_impact, 10),
      top_skills:   (skillByPerson[r.id] ?? []).slice(0, 6),
    };
  });

  res.json({
    workers,
    weekly_trend: trendRows.map(r => ({
      week: r.week,
      pieces_done: parseInt(r.pieces_done, 10),
      avg_days: r.avg_days ? parseFloat(r.avg_days) : null,
    })),
    skill_ranking: skillRankRows.map(r => ({
      tag:          r.tag,
      count:        parseInt(r.count, 10),
      avg_days:     r.avg_days ? parseFloat(r.avg_days) : null,
      total_impact: parseInt(r.total_impact, 10),
    })),
  });
}

export async function getConnections(req: AuthRequest, res: Response) {
  const userId     = req.user!.id;
  const company_id = req.user!.company_id;
  const role       = req.user!.role;

  let rows: unknown[];
  if (role === 'worker' || !company_id) {
    // ワーカー: 所属全会社のピースに関連する接続を取得
    const result = await pool.query(
      `SELECT c.* FROM connections c
       JOIN pieces p ON p.id = c.from_piece_id
       WHERE p.company_id IN (
         SELECT company_id FROM company_memberships
         WHERE user_id = $1 AND status = 'active'
       )`,
      [userId]
    );
    rows = result.rows;
  } else {
    // 管理者: 自社の全接続
    const result = await pool.query(
      `SELECT c.* FROM connections c
       JOIN pieces p ON p.id = c.from_piece_id
       WHERE p.company_id = $1`,
      [company_id]
    );
    rows = result.rows;
  }
  res.json(rows);
}

export async function deleteConnection(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const company_id = req.user!.company_id;
  // verify ownership
  const { rows } = await pool.query(
    `SELECT c.id FROM connections c
     JOIN pieces p ON p.id = c.from_piece_id
     WHERE c.id = $1 AND p.company_id = $2`,
    [id, company_id]
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  await pool.query('DELETE FROM connections WHERE id = $1', [id]);
  res.json({ success: true });
}

export async function updateConnection(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { type, condition } = req.body;
  const company_id = req.user!.company_id;
  const { rows } = await pool.query(
    `SELECT c.id FROM connections c
     JOIN pieces p ON p.id = c.from_piece_id
     WHERE c.id = $1 AND p.company_id = $2`,
    [id, company_id]
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  const { rows: [updated] } = await pool.query(
    `UPDATE connections SET type = COALESCE($1, type), condition = COALESCE($2, condition)
     WHERE id = $3 RETURNING *`,
    [type ?? null, condition ?? null, id]
  );
  res.json(updated);
}

// ============================================================
// Phase 4: External Pieces / Marketplace
// ============================================================

export async function publishPiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { reward } = req.body;

  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET is_external = true, reward = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
    [reward || 0, id, req.user!.company_id]
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  await logPieceEvent(id, req.user!.id, 'published', 'false', 'true');
  res.json(piece);
}

export async function unpublishPiece(req: AuthRequest, res: Response) {
  const { id } = req.params;

  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET is_external = false WHERE id = $1 AND company_id = $2 RETURNING *`,
    [id, req.user!.company_id]
  );
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }

  res.json(piece);
}

export async function getMarketplace(req: AuthRequest, res: Response) {
  const companyId = req.user!.company_id;
  const { q, tags } = req.query as { q?: string; tags?: string };
  const conditions: string[] = [
    `p.is_external = true`,
    `p.status = 'ready'`,
    `p.company_id != $1`,
  ];
  const params: unknown[] = [companyId];

  if (q?.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(p.title ILIKE $${params.length} OR p.objective ILIKE $${params.length})`);
  }
  if (tags?.trim()) {
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      params.push(tagList);
      conditions.push(`p.skill_tags && $${params.length}::text[]`);
    }
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.title, p.objective, p.value_metric, p.expected_impact,
            p.skill_tags, p.reward, p.status, p.business_impact,
            p.estimated_days, p.priority, p.due_date, p.created_at,
            c.name as company_name
     FROM pieces p
     JOIN companies c ON c.id = p.company_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.reward DESC, p.business_impact DESC, p.created_at DESC`,
    params
  );
  res.json(rows);
}

export async function acceptMarketplacePiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const userId = req.user!.id;

  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }
  if (!piece.is_external) { res.status(400).json({ error: 'Not a marketplace piece' }); return; }
  if (piece.status !== 'ready') { res.status(400).json({ error: 'Piece not available' }); return; }

  await pool.query(
    `UPDATE pieces SET assignee_id = $1, status = 'in_progress', started_at = NOW() WHERE id = $2`,
    [userId, id]
  );

  if (piece.reward > 0) {
    await pool.query(
      `INSERT INTO reward_logs (piece_id, user_id, amount) VALUES ($1, $2, $3)`,
      [id, userId, piece.reward]
    );
  }

  await logPieceEvent(id, userId, 'marketplace_accepted', 'ready', 'in_progress');
  res.json({ success: true });
}

// ============================================================
// Phase 4: Agent API (API key auth handled in route middleware)
// ============================================================

export async function agentListPieces(req: AuthRequest, res: Response) {
  const company_id = req.user!.company_id;
  const { rows } = await pool.query(
    `SELECT id, title, objective, value_metric, expected_impact, skill_tags, reward, is_external, status
     FROM pieces WHERE company_id = $1 AND status = 'ready'
     ORDER BY priority DESC, created_at ASC`,
    [company_id]
  );
  res.json({ pieces: rows });
}

export async function agentCompletePiece(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { rating } = req.body;
  const agentId = req.user!.id;

  const { rows: [piece] } = await pool.query('SELECT * FROM pieces WHERE id = $1', [id]);
  if (!piece) { res.status(404).json({ error: 'Not found' }); return; }
  if (piece.status !== 'in_progress') { res.status(400).json({ error: 'Piece is not in_progress' }); return; }

  await fireTriggersOnDone(id);

  res.json({ success: true, piece_id: id, rating: rating || null });
}

export async function getDeps(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const company_id = req.user!.company_id;
    const [upRes, downRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.title, p.status, c.id AS conn_id, c.type AS conn_type, u.name AS assignee_name
         FROM connections c
         JOIN pieces p ON p.id = c.from_piece_id
         LEFT JOIN users u ON u.id = p.assignee_id
         WHERE c.to_piece_id = $1 AND p.company_id = $2
         ORDER BY p.created_at ASC`,
        [id, company_id]
      ),
      pool.query(
        `SELECT p.id, p.title, p.status, c.id AS conn_id, c.type AS conn_type, u.name AS assignee_name
         FROM connections c
         JOIN pieces p ON p.id = c.to_piece_id
         LEFT JOIN users u ON u.id = p.assignee_id
         WHERE c.from_piece_id = $1 AND p.company_id = $2
         ORDER BY p.created_at ASC`,
        [id, company_id]
      ),
    ]);
    res.json({ upstream: upRes.rows, downstream: downRes.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

export async function getCascadeImpact(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { delta_days } = req.query; // signed integer: positive = pushed later, negative = earlier
  const deltaDays = parseInt(delta_days as string) || 0;

  // Load all pieces + connections for this company
  const company_id = req.user!.company_id;
  const { rows: pieces } = await pool.query<{ id: string; title: string; due_date: string | null; start_date: string | null; business_impact: string; assignee_id: string | null }>(
    `SELECT id, title, due_date, start_date, business_impact, assignee_id FROM pieces WHERE company_id = $1`,
    [company_id]
  );
  const { rows: conns } = await pool.query<{ from_piece_id: string; to_piece_id: string }>(
    `SELECT c.from_piece_id, c.to_piece_id FROM connections c
     JOIN pieces p ON p.id = c.from_piece_id WHERE p.company_id = $1`,
    [company_id]
  );

  // Build adjacency list (downstream)
  const downstream = new Map<string, string[]>();
  for (const c of conns) {
    if (!downstream.has(c.from_piece_id)) downstream.set(c.from_piece_id, []);
    downstream.get(c.from_piece_id)!.push(c.to_piece_id);
  }

  // BFS from the changed piece
  const visited = new Set<string>();
  const queue = [id];
  visited.add(id);
  const affected: { id: string; title: string; delta_days: number; new_due_date: string | null; new_start_date: string | null; business_impact: number }[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = downstream.get(cur) || [];
    for (const child of children) {
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
      const p = pieces.find(x => x.id === child);
      if (!p) continue;
      const shiftDate = (d: string | null) => {
        if (!d) return null;
        const dt = new Date(d);
        dt.setDate(dt.getDate() + deltaDays);
        return dt.toISOString();
      };
      affected.push({
        id: child,
        title: p.title,
        delta_days: deltaDays,
        new_due_date: shiftDate(p.due_date),
        new_start_date: shiftDate(p.start_date),
        business_impact: Number(p.business_impact),
      });
    }
  }

  const total_impact = affected.reduce((sum, a) => sum + a.business_impact, 0);
  res.json({ root_id: id, delta_days: deltaDays, affected, total_impact });
}

export async function applyCascade(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { delta_days } = req.body as { delta_days: number };
  const deltaDays = parseInt(String(delta_days)) || 0;
  if (deltaDays === 0) { res.status(400).json({ error: 'delta_days must be non-zero' }); return; }

  const company_id = req.user!.company_id;

  // rootピースのdue_dateをシフト
  await pool.query(
    `UPDATE pieces SET due_date = due_date + ($1 * INTERVAL '1 day')
     WHERE id = $2 AND company_id = $3 AND due_date IS NOT NULL`,
    [deltaDays, id, company_id]
  );

  // downstream 取得（getCascadeImpact と同じロジック）
  const { rows: pieces } = await pool.query<{ id: string; due_date: string | null; start_date: string | null }>(
    `SELECT id, due_date, start_date FROM pieces WHERE company_id = $1`,
    [company_id]
  );
  const { rows: conns } = await pool.query<{ from_piece_id: string; to_piece_id: string }>(
    `SELECT c.from_piece_id, c.to_piece_id FROM connections c
     JOIN pieces p ON p.id = c.from_piece_id WHERE p.company_id = $1`,
    [company_id]
  );

  const downstream = new Map<string, string[]>();
  for (const c of conns) {
    if (!downstream.has(c.from_piece_id)) downstream.set(c.from_piece_id, []);
    downstream.get(c.from_piece_id)!.push(c.to_piece_id);
  }

  const visited = new Set<string>([id]);
  const queue = [id];
  const affectedIds: string[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of downstream.get(cur) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
      const p = pieces.find(x => x.id === child);
      if (!p) continue;
      affectedIds.push(child);
    }
  }

  // 一括更新
  if (affectedIds.length > 0) {
    await pool.query(
      `UPDATE pieces SET
         due_date   = CASE WHEN due_date   IS NOT NULL THEN due_date   + ($1 * INTERVAL '1 day') ELSE NULL END,
         start_date = CASE WHEN start_date IS NOT NULL THEN start_date + ($1 * INTERVAL '1 day') ELSE NULL END
       WHERE id = ANY($2::uuid[]) AND company_id = $3`,
      [deltaDays, affectedIds, company_id]
    );
  }

  res.json({ root_id: id, delta_days: deltaDays, updated_count: affectedIds.length + 1 });
}

/**
 * 完了ピースの依存先を走査し、全依存が完了したピースを自動で "ready" に昇格する。
 * sequential 接続のみ対象（from_piece_id が完了 → to_piece_id がロック解除候補）。
 */
async function autoPromoteDependents(doneId: string, userId: string, companyId: string) {
  // このピースが依存元になっている接続を取得（to_piece_id が昇格候補）
  const { rows: outgoing } = await pool.query(
    `SELECT to_piece_id FROM connections WHERE from_piece_id = $1 AND type = 'sequential'`,
    [doneId]
  );
  if (outgoing.length === 0) return;

  const promoted: { id: string; title: string; assignee_id: string | null }[] = [];

  for (const { to_piece_id } of outgoing) {
    // 候補ピースが locked でなければスキップ
    const { rows: [candidate] } = await pool.query(
      `SELECT id, title, assignee_id, status FROM pieces WHERE id = $1`,
      [to_piece_id]
    );
    if (!candidate || candidate.status !== 'locked') continue;

    // この候補ピースの全依存（from_piece_id）が done かチェック
    const { rows: allDeps } = await pool.query(
      `SELECT p.status FROM connections c
       JOIN pieces p ON p.id = c.from_piece_id
       WHERE c.to_piece_id = $1 AND c.type = 'sequential'`,
      [to_piece_id]
    );
    const allDone = allDeps.every(d => d.status === 'done');
    if (!allDone) continue;

    // 自動昇格: locked → ready
    await pool.query(`UPDATE pieces SET status = 'ready' WHERE id = $1`, [to_piece_id]);
    await logPieceEvent(to_piece_id, userId, 'auto_promoted', 'locked', 'ready');
    promoted.push(candidate);
  }

  if (promoted.length === 0) return;

  // 担当者への WebSocket 通知
  for (const p of promoted) {
    if (p.assignee_id) {
      notifyUser(p.assignee_id, {
        type: 'piece_ready',
        payload: {
          piece_id: p.id,
          message: `依存が解消されました。「${p.title}」が着手可能になりました`,
        },
      });
    }
  }

  // 同社の管理者への通知
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND role = 'admin'`,
    [companyId]
  );
  for (const admin of admins) {
    notifyUser(admin.id, {
      type: 'auto_promoted',
      payload: {
        count: promoted.length,
        titles: promoted.map(p => p.title),
        message: `${promoted.length}件のピースが自動的に着手可能になりました`,
      },
    });
  }
}

async function logPieceEvent(
  pieceId: string,
  userId: string,
  eventType: string,
  oldValue: string | null,
  newValue: string | null,
  reason: string | null = null
) {
  await pool.query(
    `INSERT INTO piece_logs (piece_id, user_id, event_type, old_value, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pieceId, userId, eventType, oldValue, newValue, reason]
  );
}

// ─── クリティカルパス分析 ────────────────────────────────────────────────────
export async function getCriticalPath(req: AuthRequest, res: Response) {
  try {
  const company_id = req.user!.company_id;

  if (!company_id) {
    res.json({ pieces: [], total_duration: 0, critical_count: 0, critical_chain: [], isolated_count: 0 });
    return;
  }

  const [piecesRes, connRes, usersRes] = await Promise.all([
    pool.query(
      `SELECT id, title, status, estimated_days, due_date, assignee_id,
              priority, business_impact, skill_tags, project_id
       FROM pieces
       WHERE company_id = $1 AND status NOT IN ('done')
       ORDER BY created_at ASC`,
      [company_id]
    ),
    pool.query(
      `SELECT c.from_piece_id, c.to_piece_id
       FROM connections c
       WHERE c.from_piece_id IN (SELECT id FROM pieces WHERE company_id = $1 AND status != 'done')
         AND c.to_piece_id   IN (SELECT id FROM pieces WHERE company_id = $1 AND status != 'done')`,
      [company_id]
    ),
    pool.query('SELECT id, name FROM users WHERE company_id = $1', [company_id]),
  ]);

  const userMap: Record<string, string> = {};
  for (const u of usersRes.rows) userMap[u.id] = u.name;

  const pieces = piecesRes.rows;
  const conns  = connRes.rows;

  // adjacency maps
  const out: Record<string, string[]> = {};
  const inc: Record<string, string[]> = {};
  for (const p of pieces) { out[p.id] = []; inc[p.id] = []; }
  for (const c of conns) {
    out[c.from_piece_id]?.push(c.to_piece_id);
    inc[c.to_piece_id]?.push(c.from_piece_id);
  }

  // Kahn topological sort
  const inDeg: Record<string, number> = {};
  for (const p of pieces) inDeg[p.id] = inc[p.id].length;
  const queue = pieces.filter(p => inDeg[p.id] === 0).map(p => p.id);
  const sorted: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const nxt of out[id] ?? []) {
      inDeg[nxt]--;
      if (inDeg[nxt] === 0) queue.push(nxt);
    }
  }

  // Forward pass: Earliest Start (ES) / Earliest Finish (EF)
  const days: Record<string, number> = {};
  for (const p of pieces) days[p.id] = Math.max(1, p.estimated_days ?? 1);
  const ES: Record<string, number> = {};
  const EF: Record<string, number> = {};
  for (const id of sorted) {
    const preds = inc[id] ?? [];
    ES[id] = preds.length === 0 ? 0 : Math.max(...preds.map(p => EF[p] ?? 0));
    EF[id] = ES[id] + days[id];
  }

  const maxEF = pieces.length > 0 ? Math.max(0, ...pieces.map(p => EF[p.id] ?? 0)) : 0;

  // Backward pass: Latest Start (LS) / Latest Finish (LF)
  const LF: Record<string, number> = {};
  const LS: Record<string, number> = {};
  for (const id of [...sorted].reverse()) {
    const succs = out[id] ?? [];
    LF[id] = succs.length === 0 ? maxEF : Math.min(...succs.map(s => LS[s] ?? maxEF));
    LS[id] = LF[id] - days[id];
  }

  // Float & critical
  const result = pieces.map(p => ({
    id:              p.id,
    title:           p.title,
    status:          p.status,
    estimated_days:  days[p.id],
    due_date:        p.due_date,
    priority:        p.priority,
    business_impact: p.business_impact,
    skill_tags:      p.skill_tags ?? [],
    project_id:      p.project_id,
    assignee_id:     p.assignee_id,
    assignee_name:   p.assignee_id ? (userMap[p.assignee_id] ?? null) : null,
    es:  ES[p.id] ?? 0,
    ef:  EF[p.id] ?? 0,
    ls:  LS[p.id] ?? 0,
    lf:  LF[p.id] ?? 0,
    float:       (LS[p.id] ?? 0) - (ES[p.id] ?? 0),
    is_critical: ((LS[p.id] ?? 0) - (ES[p.id] ?? 0)) === 0,
    successors:   out[p.id] ?? [],
    predecessors: inc[p.id] ?? [],
  }));

  // Build the longest critical chain (for display) using DP on topological order
  const critSet = new Set(result.filter(p => p.is_critical).map(p => p.id));
  // longestFrom[id] = longest sub-chain starting at id (memoized, O(V+E))
  const longestFrom: Record<string, string[]> = {};
  for (const id of [...sorted].reverse()) {
    if (!critSet.has(id)) continue;
    const critNexts = (out[id] ?? []).filter(n => critSet.has(n));
    if (critNexts.length === 0) {
      longestFrom[id] = [id];
    } else {
      const best = critNexts.reduce<string[]>((acc, n) => {
        const sub = longestFrom[n] ?? [];
        return sub.length > acc.length ? sub : acc;
      }, []);
      longestFrom[id] = [id, ...best];
    }
  }
  const critRoots = result.filter(p => p.is_critical && !inc[p.id]?.some(id => critSet.has(id)));
  const longestChain = critRoots.reduce<string[]>((acc, r) => {
    const chain = longestFrom[r.id] ?? [];
    return chain.length > acc.length ? chain : acc;
  }, []);

  res.json({
    pieces:          result,
    total_duration:  maxEF,
    critical_count:  critSet.size,
    critical_chain:  longestChain,
    isolated_count:  pieces.filter(p => inc[p.id]?.length === 0 && out[p.id]?.length === 0).length,
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'クリティカルパス計算に失敗しました', detail: msg });
  }
}


// ── 管理者全員に通知 ─────────────────────────────────────────────────────────
import { WSEvent } from '../types';
async function notifyAdmins(companyId: string, event: WSEvent) {
  if (!companyId) return;
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND role = 'admin'`,
    [companyId]
  );
  for (const admin of admins) {
    notifyUser(admin.id, event);
  }
}
