import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = Router();

// ── 振り返り一覧 ──────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.id, r.title, r.sprint_label, r.date, r.status, r.created_at,
         COUNT(ri.id)                                          AS item_count,
         COUNT(ri.id) FILTER (WHERE ri.category = 'action')   AS action_count,
         COALESCE(SUM(ri.votes), 0)                           AS total_votes
       FROM retrospectives r
       LEFT JOIN retro_items ri ON ri.retro_id = r.id
       WHERE r.company_id = $1
       GROUP BY r.id
       ORDER BY r.date DESC, r.created_at DESC`,
      [req.user!.company_id]
    );
    res.json(rows.map((r: any) => ({
      ...r,
      item_count:   parseInt(r.item_count),
      action_count: parseInt(r.action_count),
      total_votes:  parseInt(r.total_votes),
    })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 振り返り詳細（アイテム付き） ─────────────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [retroRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM retrospectives WHERE id = $1 AND company_id = $2`,
        [id, req.user!.company_id]
      ),
      pool.query(
        `SELECT ri.*, u.name AS author_name
         FROM retro_items ri
         LEFT JOIN users u ON u.id = ri.author_id
         WHERE ri.retro_id = $1
         ORDER BY ri.votes DESC, ri.created_at ASC`,
        [id]
      ),
    ]);
    if (!retroRes.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ...retroRes.rows[0], items: itemsRes.rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 振り返り作成 ──────────────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, sprint_label, date } = req.body;
    if (!title || !sprint_label) { res.status(400).json({ error: 'title and sprint_label required' }); return; }
    const { rows: [retro] } = await pool.query(
      `INSERT INTO retrospectives (company_id, title, sprint_label, date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user!.company_id, title, sprint_label, date || new Date().toISOString().slice(0, 10)]
    );
    res.json({ ...retro, items: [] });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 振り返りクローズ ──────────────────────────────────────────────────────────
router.patch('/:id/close', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rows: [retro] } = await pool.query(
      `UPDATE retrospectives SET status = 'closed'
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [id, req.user!.company_id]
    );
    if (!retro) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(retro);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 振り返り削除 ──────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM retrospectives WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user!.company_id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── アイテム追加 ──────────────────────────────────────────────────────────────
router.post('/:id/items', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category, content } = req.body;
    if (!['good', 'bad', 'action'].includes(category) || !content?.trim()) {
      res.status(400).json({ error: 'Invalid category or empty content' }); return;
    }
    // Retro must belong to same company
    const { rows: [retro] } = await pool.query(
      `SELECT id FROM retrospectives WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [id, req.user!.company_id]
    );
    if (!retro) { res.status(404).json({ error: 'Not found or closed' }); return; }

    const { rows: [item] } = await pool.query(
      `INSERT INTO retro_items (retro_id, category, content, author_id, author_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, category, content.trim(), req.user!.id, (req.user as any).name ?? null]
    );
    res.json(item);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 投票 ─────────────────────────────────────────────────────────────────────
router.post('/items/:itemId/vote', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    // Verify the item belongs to a retro of the same company
    const { rows: [check] } = await pool.query(
      `SELECT ri.id FROM retro_items ri
       JOIN retrospectives r ON r.id = ri.retro_id
       WHERE ri.id = $1 AND r.company_id = $2`,
      [itemId, req.user!.company_id]
    );
    if (!check) { res.status(404).json({ error: 'Not found' }); return; }

    const { rows: [item] } = await pool.query(
      `UPDATE retro_items SET votes = votes + 1 WHERE id = $1 RETURNING *`,
      [itemId]
    );
    res.json(item);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── アイテム削除 ──────────────────────────────────────────────────────────────
router.delete('/items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { rows: [check] } = await pool.query(
      `SELECT ri.id FROM retro_items ri
       JOIN retrospectives r ON r.id = ri.retro_id
       WHERE ri.id = $1 AND r.company_id = $2`,
      [itemId, req.user!.company_id]
    );
    if (!check) { res.status(404).json({ error: 'Not found' }); return; }
    await pool.query(`DELETE FROM retro_items WHERE id = $1`, [itemId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
