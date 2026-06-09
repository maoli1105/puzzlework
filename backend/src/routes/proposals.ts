/**
 * /api/proposals — ワーカーからのピース提案
 *
 * ワーカー:
 *   GET  /                   自分の提案一覧
 *   POST /                   新規提案
 *   DELETE /:id              自分の pending 提案を取り消す
 *
 * 管理者:
 *   GET  /pending            承認待ち一覧
 *   POST /:id/approve        承認（ピース作成）
 *   POST /:id/reject         却下
 */
import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = Router();
router.use(authenticate);

// ── ワーカー: 自分の提案一覧 ─────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT pp.*,
              pr.name AS project_name,
              u.name  AS reviewer_name
       FROM piece_proposals pp
       LEFT JOIN projects pr ON pr.id = pp.project_id
       LEFT JOIN users u     ON u.id  = pp.reviewed_by
       WHERE pp.proposed_by = $1
       ORDER BY pp.created_at DESC`,
      [req.user!.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ワーカー: 新規提案 ───────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, objective = '', skill_tags = [], priority = 3,
            estimated_days, due_date, project_id, reason = '',
            target_company_id } = req.body;

    if (!title?.trim()) { res.status(400).json({ error: 'title は必須です' }); return; }

    // 提案先会社の決定：指定があれば membership 確認
    let companyId = req.user!.company_id;
    if (target_company_id && target_company_id !== companyId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM company_memberships
         WHERE user_id = $1 AND company_id = $2 AND status = 'active'`,
        [req.user!.id, target_company_id]
      );
      if (rows.length === 0) {
        res.status(403).json({ error: '指定した会社のメンバーではありません' }); return;
      }
      companyId = target_company_id;
    }

    const { rows: [proposal] } = await pool.query(
      `INSERT INTO piece_proposals
         (company_id, proposed_by, title, objective, skill_tags, priority,
          estimated_days, due_date, project_id, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        companyId, req.user!.id,
        title.trim(), objective.trim(), skill_tags, priority,
        estimated_days || null, due_date || null,
        project_id || null, reason.trim(),
      ]
    );
    res.status(201).json(proposal);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ワーカー: 取り消し ───────────────────────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows: [p] } = await pool.query(
      'SELECT * FROM piece_proposals WHERE id = $1', [req.params.id]
    );
    if (!p) { res.status(404).json({ error: '提案が見つかりません' }); return; }
    if (p.proposed_by !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: '権限がありません' }); return;
    }
    if (p.status !== 'pending') {
      res.status(400).json({ error: '審査済みの提案は取り消せません' }); return;
    }
    await pool.query('DELETE FROM piece_proposals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 管理者: 承認待ち一覧 ────────────────────────────────────────────────────
router.get('/pending', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT pp.*,
              u.name  AS proposer_name,
              pr.name AS project_name
       FROM piece_proposals pp
       JOIN  users    u  ON u.id  = pp.proposed_by
       LEFT JOIN projects pr ON pr.id = pp.project_id
       WHERE pp.company_id = $1 AND pp.status = 'pending'
       ORDER BY pp.created_at ASC`,
      [req.user!.company_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 管理者: 承認 → ピース作成 ───────────────────────────────────────────────
router.post('/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const { rows: [proposal] } = await pool.query(
      'SELECT * FROM piece_proposals WHERE id = $1 AND company_id = $2',
      [req.params.id, company_id]
    );
    if (!proposal)      { res.status(404).json({ error: '提案が見つかりません' }); return; }
    if (proposal.status !== 'pending') {
      res.status(400).json({ error: '既に審査済みです' }); return;
    }

    // ピース作成
    const { assignee_id, project_id: overrideProjectId } = req.body;
    const { rows: [piece] } = await pool.query(
      `INSERT INTO pieces
         (company_id, title, objective, skill_tags, priority,
          estimated_days, due_date, project_id, assignee_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'locked')
       RETURNING *`,
      [
        company_id,
        proposal.title, proposal.objective, proposal.skill_tags, proposal.priority,
        proposal.estimated_days, proposal.due_date,
        overrideProjectId ?? proposal.project_id,
        assignee_id || proposal.proposed_by, // デフォルトで提案者を担当者に
      ]
    );

    // 提案を承認済みに更新
    await pool.query(
      `UPDATE piece_proposals
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), created_piece_id = $2
       WHERE id = $3`,
      [req.user!.id, piece.id, req.params.id]
    );

    res.json({ proposal: { ...proposal, status: 'approved' }, piece });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 管理者: 却下 ─────────────────────────────────────────────────────────────
router.post('/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const { reject_reason = '' } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE piece_proposals
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reject_reason = $2
       WHERE id = $3 AND company_id = $4 AND status = 'pending'`,
      [req.user!.id, reject_reason, req.params.id, company_id]
    );
    if (!rowCount) { res.status(404).json({ error: '提案が見つかりません' }); return; }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 管理者: 全提案履歴 ──────────────────────────────────────────────────────
router.get('/all', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT pp.*,
              u.name  AS proposer_name,
              rv.name AS reviewer_name,
              pr.name AS project_name
       FROM piece_proposals pp
       JOIN  users    u   ON u.id  = pp.proposed_by
       LEFT JOIN users rv ON rv.id = pp.reviewed_by
       LEFT JOIN projects pr ON pr.id = pp.project_id
       WHERE pp.company_id = $1
       ORDER BY pp.created_at DESC
       LIMIT 200`,
      [req.user!.company_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
