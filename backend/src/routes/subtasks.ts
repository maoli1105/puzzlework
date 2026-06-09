import { Router } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /pieces/:pieceId/subtasks
router.get('/pieces/:pieceId/subtasks', authenticate, async (req: AuthRequest, res) => {
  const { pieceId } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM subtasks WHERE piece_id = $1 ORDER BY position ASC, created_at ASC`,
    [pieceId]
  );
  res.json(rows);
});

// POST /pieces/:pieceId/subtasks
router.post('/pieces/:pieceId/subtasks', authenticate, async (req: AuthRequest, res) => {
  const { pieceId } = req.params;
  const { title } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }

  const { rows: [maxRow] } = await pool.query(
    `SELECT COALESCE(MAX(position), -1) AS maxpos FROM subtasks WHERE piece_id = $1`,
    [pieceId]
  );
  const position = (maxRow.maxpos as number) + 1;

  const { rows: [subtask] } = await pool.query(
    `INSERT INTO subtasks (piece_id, title, position) VALUES ($1, $2, $3) RETURNING *`,
    [pieceId, title.trim(), position]
  );
  res.status(201).json(subtask);
});

// PATCH /subtasks/:id
router.patch('/subtasks/:id', authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { done, title } = req.body;
  const sets: string[] = [];
  const params: unknown[] = [];

  if (done !== undefined) { params.push(done); sets.push(`done = $${params.length}`); }
  if (title !== undefined) { params.push(title.trim()); sets.push(`title = $${params.length}`); }

  if (sets.length === 0) { res.status(400).json({ error: 'nothing to update' }); return; }

  params.push(id);
  const { rows: [subtask] } = await pool.query(
    `UPDATE subtasks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!subtask) { res.status(404).json({ error: 'not found' }); return; }
  res.json(subtask);
});

// DELETE /subtasks/:id
router.delete('/subtasks/:id', authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM subtasks WHERE id = $1`, [id]);
  res.json({ ok: true });
});

// PATCH /pieces/:pieceId/memo  — ワーカーの個人メモ
router.patch('/pieces/:pieceId/memo', authenticate, async (req: AuthRequest, res) => {
  const { pieceId } = req.params;
  const { memo } = req.body;
  const { rows: [piece] } = await pool.query(
    `UPDATE pieces SET worker_memo = $1 WHERE id = $2 RETURNING id, worker_memo`,
    [memo ?? '', pieceId]
  );
  if (!piece) { res.status(404).json({ error: 'not found' }); return; }
  res.json(piece);
});

export default router;
