import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { pool } from '../db';
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
  getOrgHealthReport,
  getVelocityInsights,
  getStandupReport,
  reportBlocker,
  deleteConnection,
  updateConnection,
} from '../controllers/pieceController';

const router = Router();

router.use(authenticate);

router.get('/', listPieces);
router.post('/', requireAdmin, createPiece);
router.get('/bottlenecks', requireAdmin, getBottlenecks);
router.get('/org-health', requireAdmin, getOrgHealthReport);
router.get('/velocity', requireAdmin, getVelocityInsights);
router.get('/standup', requireAdmin, getStandupReport);
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
  const userId = (req as { user?: { id: string } }).user?.id;
  if (!content?.trim()) { res.status(400).json({ error: 'Content required' }); return; }
  const { rows: [comment] } = await pool.query(
    `INSERT INTO piece_comments (piece_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [id, userId, content.trim()]
  );
  const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
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
