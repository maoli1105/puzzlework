import { Router } from 'express';
import { pool } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// プロジェクト一覧
router.get('/', async (req: AuthRequest, res) => {
  try {
    const company_id = req.user!.company_id;
    const { rows } = await pool.query(
      'SELECT * FROM projects WHERE company_id = $1 ORDER BY created_at DESC',
      [company_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクトサマリーレポート
router.get('/report', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const company_id = req.user!.company_id;

    const [projectsRes, assigneeRes, weeklyRes] = await Promise.all([
      // プロジェクト基本集計
      pool.query(
        `SELECT
           p.id, p.name, p.description, p.status, p.color, p.due_date, p.created_at,
           COUNT(pi.id)::int                                              AS total_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'done')::int           AS done_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'in_progress')::int    AS in_progress_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'ready')::int          AS ready_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'locked')::int         AS locked_pieces,
           COALESCE(AVG(pi.progress) FILTER (WHERE pi.status != 'done'), 0)::int AS avg_progress,
           COUNT(pi.id) FILTER (
             WHERE pi.due_date < NOW() AND pi.status NOT IN ('done')
           )::int                                                         AS overdue_pieces,
           COALESCE(SUM(pi.business_impact) FILTER (WHERE pi.status = 'done'), 0)::int AS delivered_impact,
           COALESCE(SUM(pi.business_impact), 0)::int                     AS total_impact,
           MIN(pi.due_date) FILTER (
             WHERE pi.due_date >= NOW() AND pi.status NOT IN ('done')
           )                                                              AS next_due
         FROM projects p
         LEFT JOIN pieces pi ON pi.project_id = p.id
         WHERE p.company_id = $1
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [company_id]
      ),
      // プロジェクト別担当者内訳（上位3名/プロジェクト）
      pool.query(
        `SELECT pi.project_id, u.name AS assignee_name,
                COUNT(pi.id)::int AS piece_count,
                COUNT(pi.id) FILTER (WHERE pi.status = 'done')::int AS done_count
         FROM pieces pi
         JOIN users u ON u.id = pi.assignee_id
         WHERE pi.project_id IN (
           SELECT id FROM projects WHERE company_id = $1
         )
         GROUP BY pi.project_id, u.id, u.name
         ORDER BY piece_count DESC`,
        [company_id]
      ),
      // 過去4週の週別完了数（全社）
      pool.query(
        `SELECT DATE_TRUNC('week', completed_at) AS week,
                COUNT(*)::int AS done_count
         FROM pieces
         WHERE company_id = $1
           AND status = 'done'
           AND completed_at > NOW() - INTERVAL '4 weeks'
         GROUP BY week
         ORDER BY week`,
        [company_id]
      ),
    ]);

    // 担当者マップ: project_id → assignees[]
    const assigneeMap: Record<string, { name: string; piece_count: number; done_count: number }[]> = {};
    for (const row of assigneeRes.rows) {
      if (!assigneeMap[row.project_id]) assigneeMap[row.project_id] = [];
      if (assigneeMap[row.project_id].length < 4) {
        assigneeMap[row.project_id].push({
          name: row.assignee_name,
          piece_count: row.piece_count,
          done_count: row.done_count,
        });
      }
    }

    const projects = projectsRes.rows.map((p: any) => ({
      ...p,
      assignees: assigneeMap[p.id] ?? [],
      completion_pct: p.total_pieces > 0
        ? Math.round((p.done_pieces / p.total_pieces) * 100)
        : 0,
    }));

    res.json({ projects, weekly_trend: weeklyRes.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクト作成
router.post('/', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const company_id = req.user!.company_id;
    const { name, description = '', color = '#6366f1', due_date } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects (company_id, name, description, color, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company_id, name, description, color, due_date || null]
    );
    res.json(proj);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクト更新
router.patch('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, status, due_date, slack_webhook_url } = req.body;
    const { rows: [proj] } = await pool.query(
      `UPDATE projects SET
         name              = COALESCE($1, name),
         description       = COALESCE($2, description),
         color             = COALESCE($3, color),
         status            = COALESCE($4, status),
         due_date          = COALESCE($5, due_date),
         slack_webhook_url = CASE WHEN $7 THEN $6 ELSE slack_webhook_url END
       WHERE id = $8 RETURNING *`,
      [name, description, color, status, due_date || null,
       slack_webhook_url ?? null, slack_webhook_url !== undefined, id]
    );
    res.json(proj);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ズームビュー: プロジェクト詳細（メンバー別内訳 + ピース一覧）
router.get('/zoom/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user!.company_id;

    const [projectRes, piecesRes, membersRes] = await Promise.all([
      pool.query(
        `SELECT p.*,
           COUNT(pi.id)::int                                              AS total_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'done')::int           AS done_pieces,
           COUNT(pi.id) FILTER (WHERE pi.status = 'in_progress')::int    AS in_progress_pieces,
           COUNT(pi.id) FILTER (WHERE pi.due_date < NOW() AND pi.status NOT IN ('done'))::int AS overdue_pieces
         FROM projects p
         LEFT JOIN pieces pi ON pi.project_id = p.id
         WHERE p.id = $1 AND p.company_id = $2
         GROUP BY p.id`,
        [id, company_id]
      ),
      pool.query(
        `SELECT pi.*, u.name AS assignee_name
         FROM pieces pi
         LEFT JOIN users u ON u.id = pi.assignee_id
         WHERE pi.project_id = $1 AND pi.company_id = $2
         ORDER BY
           CASE pi.status
             WHEN 'in_progress' THEN 1
             WHEN 'ready'       THEN 2
             WHEN 'locked'      THEN 3
             WHEN 'done'        THEN 4
           END,
           pi.priority DESC, pi.due_date ASC NULLS LAST`,
        [id, company_id]
      ),
      // メンバー別サマリー
      pool.query(
        `SELECT u.id, u.name,
           COUNT(pi.id)::int                                                   AS total,
           COUNT(pi.id) FILTER (WHERE pi.status = 'in_progress')::int         AS in_progress,
           COUNT(pi.id) FILTER (WHERE pi.status = 'done')::int                AS done,
           COUNT(pi.id) FILTER (
             WHERE pi.due_date < NOW() AND pi.status NOT IN ('done')
           )::int                                                              AS overdue,
           COALESCE(SUM(pi.business_impact) FILTER (WHERE pi.status = 'done'),0)::int AS delivered_impact,
           MIN(pi.due_date) FILTER (
             WHERE pi.due_date >= NOW() AND pi.status NOT IN ('done')
           )                                                                   AS next_due
         FROM pieces pi
         JOIN users u ON u.id = pi.assignee_id
         WHERE pi.project_id = $1 AND pi.company_id = $2
         GROUP BY u.id, u.name
         ORDER BY in_progress DESC, total DESC`,
        [id, company_id]
      ),
    ]);

    if (!projectRes.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = {
      ...projectRes.rows[0],
      completion_pct: projectRes.rows[0].total_pieces > 0
        ? Math.round((projectRes.rows[0].done_pieces / projectRes.rows[0].total_pieces) * 100)
        : 0,
    };

    res.json({
      project,
      pieces: piecesRes.rows,
      members: membersRes.rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクト配下のピース一覧
router.get('/:id/pieces', async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS assignee_name
       FROM pieces p
       LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.project_id = $1 AND p.company_id = $2
       ORDER BY p.priority DESC, p.created_at ASC`,
      [req.params.id, req.user!.company_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクト削除
router.delete('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── テンプレート ────────────────────────────────────────────────────────────

// テンプレート一覧
router.get('/templates', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const company_id = req.user!.company_id;
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS source_project_name
       FROM project_templates t
       LEFT JOIN projects p ON p.id = t.source_project_id
       WHERE t.company_id = $1
       ORDER BY t.created_at DESC`,
      [company_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// プロジェクトをテンプレートとして保存
router.post('/:id/save-as-template', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user!.company_id;
    const { name } = req.body;

    // プロジェクト存在確認
    const { rows: [proj] } = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND company_id = $2',
      [id, company_id]
    );
    if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }

    // ピース一覧取得
    const { rows: pieces } = await pool.query(
      `SELECT id, title, description, skill_tags, priority, estimated_days, business_impact, parent_id
       FROM pieces WHERE project_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    // 接続一覧取得
    const { rows: connections } = await pool.query(
      `SELECT from_piece_id, to_piece_id, type
       FROM connections
       WHERE from_piece_id IN (SELECT id FROM pieces WHERE project_id = $1)`,
      [id]
    );

    // 完了ピースの平均所要日数を計算
    const { rows: [durationRow] } = await pool.query(
      `SELECT ROUND(AVG(
         EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400
       ))::int AS avg_days
       FROM pieces
       WHERE project_id = $1 AND status = 'done' AND completed_at IS NOT NULL`,
      [id]
    );

    const structure = {
      pieces: pieces.map(p => ({
        _orig_id: p.id,
        title: p.title,
        description: p.description || '',
        skill_tags: p.skill_tags || [],
        priority: p.priority || 0,
        estimated_days: p.estimated_days || null,
        business_impact: p.business_impact || 0,
        parent_orig_id: p.parent_id || null,
      })),
      connections: connections.map(c => ({
        from_orig_id: c.from_piece_id,
        to_orig_id:   c.to_piece_id,
        type:         c.type,
      })),
    };

    const { rows: [tmpl] } = await pool.query(
      `INSERT INTO project_templates (company_id, name, source_project_id, structure, avg_duration_days)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company_id, name || proj.name, id, JSON.stringify(structure), durationRow?.avg_days || null]
    );
    res.json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// テンプレートからプロジェクト作成
router.post('/from-template', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const company_id = req.user!.company_id;
    const { template_id, name, color = '#B46400', start_offset_days = 0 } = req.body;
    if (!template_id || !name) {
      res.status(400).json({ error: 'template_id and name are required' });
      return;
    }

    const { rows: [tmpl] } = await pool.query(
      'SELECT * FROM project_templates WHERE id = $1 AND company_id = $2',
      [template_id, company_id]
    );
    if (!tmpl) { res.status(404).json({ error: 'Template not found' }); return; }

    const structure = tmpl.structure as {
      pieces: {
        _orig_id: string; title: string; description: string;
        skill_tags: string[]; priority: number; estimated_days: number | null;
        business_impact: number; parent_orig_id: string | null;
      }[];
      connections: { from_orig_id: string; to_orig_id: string; type: string }[];
    };

    // プロジェクト作成
    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects (company_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
      [company_id, name, color]
    );

    // ピース作成 & orig_id → new_id マッピング
    const idMap: Record<string, string> = {};
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + start_offset_days);

    for (const p of structure.pieces) {
      const due = p.estimated_days
        ? new Date(startDate.getTime() + p.estimated_days * 86400000)
        : null;
      const { rows: [newPiece] } = await pool.query(
        `INSERT INTO pieces (company_id, project_id, title, description, skill_tags, priority, estimated_days, business_impact, status, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'locked', $9) RETURNING id`,
        [company_id, proj.id, p.title, p.description, p.skill_tags, p.priority, p.estimated_days, p.business_impact, due]
      );
      idMap[p._orig_id] = newPiece.id;
    }

    // 親子関係を設定
    for (const p of structure.pieces) {
      if (p.parent_orig_id && idMap[p.parent_orig_id]) {
        await pool.query(
          'UPDATE pieces SET parent_id = $1 WHERE id = $2',
          [idMap[p.parent_orig_id], idMap[p._orig_id]]
        );
      }
    }

    // 接続作成
    for (const c of structure.connections) {
      const fromId = idMap[c.from_orig_id];
      const toId   = idMap[c.to_orig_id];
      if (fromId && toId) {
        await pool.query(
          `INSERT INTO connections (from_piece_id, to_piece_id, type, company_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [fromId, toId, c.type || 'sequential', company_id]
        );
      }
    }

    // 作成したプロジェクト + ピース数を返す
    res.json({ project: proj, piece_count: structure.pieces.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// テンプレート削除
router.delete('/templates/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await pool.query(
      'DELETE FROM project_templates WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user!.company_id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
