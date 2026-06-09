import { Router, Response } from 'express';
import { authenticate, requireAdmin, requirePlan, AuthRequest } from '../middleware/auth';
import {
  getMarketplace,
  acceptMarketplacePiece,
} from '../controllers/pieceController';
import { pool } from '../db';

const router = Router();

router.use(authenticate);

// 自社の出品中ピース一覧 (admin)
router.get('/mine', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.user!.company_id;
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.status, p.reward, p.skill_tags,
              p.business_impact, p.due_date, p.created_at,
              u.name AS assignee_name,
              proj.name AS project_name,
              COUNT(rl.id) AS accept_count
       FROM pieces p
       LEFT JOIN users u ON u.id = p.assignee_id
       LEFT JOIN projects proj ON proj.id = p.project_id
       LEFT JOIN reward_logs rl ON rl.piece_id = p.id
       WHERE p.company_id = $1 AND p.is_external = true
       GROUP BY p.id, u.name, proj.name
       ORDER BY p.created_at DESC`,
      [companyId]
    );
    res.json(rows.map(r => ({ ...r, accept_count: parseInt(r.accept_count, 10) })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 出品可能なピース一覧 (status=ready, is_external=false) (admin)
router.get('/publishable', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.user!.company_id;
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.status, p.reward, p.skill_tags,
              p.business_impact, p.due_date,
              u.name AS assignee_name,
              proj.name AS project_name
       FROM pieces p
       LEFT JOIN users u ON u.id = p.assignee_id
       LEFT JOIN projects proj ON proj.id = p.project_id
       WHERE p.company_id = $1 AND p.is_external = false AND p.status = 'ready'
       ORDER BY p.business_impact DESC, p.created_at DESC
       LIMIT 100`,
      [companyId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 全社公開ピース一覧 — pro プラン以上
router.get('/', requirePlan('pro'), getMarketplace);

// 受注 — pro プラン以上
router.post('/:id/accept', requirePlan('pro'), acceptMarketplacePiece);

export default router;
