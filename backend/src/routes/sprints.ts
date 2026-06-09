import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = Router();

// ── スプリント一覧 ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         s.id, s.name, s.goal, s.start_date, s.end_date, s.status, s.created_at,
         COUNT(p.id)                                       AS total_pieces,
         COUNT(p.id) FILTER (WHERE p.status = 'done')     AS done_pieces,
         COALESCE(SUM(p.business_impact), 0)               AS total_impact
       FROM sprints s
       LEFT JOIN pieces p ON p.sprint_id = s.id
       WHERE s.company_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [req.user!.company_id]
    );
    res.json(rows.map((r: any) => ({
      ...r,
      total_pieces: parseInt(r.total_pieces),
      done_pieces:  parseInt(r.done_pieces),
      total_impact: parseInt(r.total_impact),
    })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スプリント作成 ─────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, goal, start_date, end_date } = req.body;
  if (!name?.trim() || !start_date || !end_date) {
    res.status(400).json({ error: 'name・start_date・end_date は必須です' }); return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO sprints (company_id, name, goal, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 'planning')
       RETURNING id, name, goal, start_date, end_date, status, created_at`,
      [req.user!.company_id, name.trim(), (goal ?? '').trim(), start_date, end_date]
    );
    res.status(201).json({ ...rows[0], total_pieces: 0, done_pieces: 0, total_impact: 0 });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スプリント更新 ─────────────────────────────────────────────────────────
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, goal, start_date, end_date, status } = req.body;

  const allowed = ['planning', 'active', 'completed'];
  if (status && !allowed.includes(status)) {
    res.status(400).json({ error: '無効なステータスです' }); return;
  }

  try {
    const sets: string[] = [];
    const vals: any[]    = [];
    let idx = 1;
    if (name       !== undefined) { sets.push(`name = $${idx++}`);       vals.push(name.trim()); }
    if (goal       !== undefined) { sets.push(`goal = $${idx++}`);       vals.push(goal.trim()); }
    if (start_date !== undefined) { sets.push(`start_date = $${idx++}`); vals.push(start_date); }
    if (end_date   !== undefined) { sets.push(`end_date = $${idx++}`);   vals.push(end_date); }
    if (status     !== undefined) { sets.push(`status = $${idx++}`);     vals.push(status); }
    if (sets.length === 0) { res.status(400).json({ error: '変更項目がありません' }); return; }

    vals.push(id, req.user!.company_id);
    const { rows } = await pool.query(
      `UPDATE sprints SET ${sets.join(', ')}
       WHERE id = $${idx} AND company_id = $${idx + 1}
       RETURNING id, name, goal, start_date, end_date, status`,
      vals
    );
    if (rows.length === 0) { res.status(404).json({ error: 'スプリントが見つかりません' }); return; }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スプリント削除 ─────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM sprints WHERE id = $1 AND company_id = $2',
      [id, req.user!.company_id]
    );
    if (!rowCount) { res.status(404).json({ error: 'スプリントが見つかりません' }); return; }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スプリントのピース一覧 ─────────────────────────────────────────────────
router.get('/:id/pieces', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // まずスプリントがこの会社に属するか確認
    const check = await pool.query(
      'SELECT id FROM sprints WHERE id = $1 AND company_id = $2',
      [id, req.user!.company_id]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'スプリントが見つかりません' }); return; }

    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.status, p.priority, p.progress,
              u.name AS assignee_name, p.due_date
       FROM pieces p
       LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.sprint_id = $1
       ORDER BY p.priority DESC, p.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ピースをスプリントへアサイン ───────────────────────────────────────────
// POST /sprints/:id/pieces  body: { piece_id }
router.post('/:id/pieces', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { piece_id } = req.body;
  if (!piece_id) { res.status(400).json({ error: 'piece_id は必須です' }); return; }
  try {
    const check = await pool.query(
      'SELECT id FROM sprints WHERE id = $1 AND company_id = $2',
      [id, req.user!.company_id]
    );
    if (check.rows.length === 0) { res.status(404).json({ error: 'スプリントが見つかりません' }); return; }

    const { rows } = await pool.query(
      `UPDATE pieces SET sprint_id = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, title, status`,
      [id, piece_id, req.user!.company_id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'ピースが見つかりません' }); return; }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ピースをスプリントから外す ─────────────────────────────────────────────
// DELETE /sprints/:id/pieces/:piece_id
router.delete('/:id/pieces/:piece_id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id, piece_id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE pieces SET sprint_id = NULL
       WHERE id = $1 AND sprint_id = $2 AND company_id = $3
       RETURNING id`,
      [piece_id, id, req.user!.company_id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'ピースが見つかりません' }); return; }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スプリントに追加できるピース候補（未アサイン・同会社） ──────────────────
router.get('/:id/candidates', authenticate, async (req: AuthRequest, res: Response) => {
  const { q } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.status, p.priority, p.business_impact,
              u.name AS assignee_name,
              pr.name AS project_name
       FROM pieces p
       LEFT JOIN users u ON u.id = p.assignee_id
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE p.company_id = $1
         AND p.status NOT IN ('done')
         AND (p.sprint_id IS NULL OR p.sprint_id != $2)
         AND ($3::text IS NULL OR p.title ILIKE '%' || $3 || '%')
       ORDER BY p.priority DESC, p.created_at DESC
       LIMIT 30`,
      [req.user!.company_id, req.params.id, q || null]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
