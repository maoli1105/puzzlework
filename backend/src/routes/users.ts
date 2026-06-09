import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../db';

const router = Router();

// プラン変更（admin のみ）
router.patch('/company/plan', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { plan } = req.body;
  const valid = ['free', 'pro', 'enterprise'];
  if (!valid.includes(plan)) {
    res.status(400).json({ error: '無効なプランです' }); return;
  }
  try {
    const { rows } = await pool.query(
      `UPDATE companies SET plan = $1 WHERE id = $2 RETURNING id, name, plan`,
      [plan, req.user!.company_id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 会社名更新（admin のみ）
router.patch('/company', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: '会社名を入力してください' }); return;
  }
  try {
    const { rows } = await pool.query(
      `UPDATE companies SET name = $1 WHERE id = $2 RETURNING id, name, plan`,
      [name.trim(), req.user!.company_id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 自分の情報
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.company_id,
              u.onboarded, u.user_skills,
              c.name AS company_name, c.plan
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [userId]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 自分が所属する全会社一覧（マルチカンパニー）
router.get('/my-companies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.plan, cm.role, cm.status, cm.created_at AS joined_at
       FROM company_memberships cm
       JOIN companies c ON c.id = cm.company_id
       WHERE cm.user_id = $1
       ORDER BY cm.created_at ASC`,
      [req.user!.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── オンボーディング完了 PATCH /users/me/onboarding ─────────────────────
router.patch('/me/onboarding', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { user_skills } = req.body; // string[]
  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users
       SET onboarded = true,
           user_skills = COALESCE($2, user_skills)
       WHERE id = $1
       RETURNING id, name, email, role, company_id, onboarded, user_skills`,
      [userId, user_skills?.length ? user_skills : null]
    );
    res.json(user);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ワーカー一覧（担当可能なメンバー）
router.get('/workers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.role,
         COUNT(p.id) FILTER (WHERE p.status IN ('in_progress','ready'))            AS active_pieces,
         COUNT(p.id) FILTER (WHERE p.status = 'done')                              AS total_pieces_done,
         COUNT(p.id) FILTER (WHERE p.status != 'done' AND p.due_date < NOW())      AS overdue_pieces
       FROM users u
       LEFT JOIN pieces p ON p.assignee_id = u.id AND p.company_id = $1
       WHERE u.company_id = $1
       GROUP BY u.id, u.name, u.email, u.role
       ORDER BY active_pieces DESC, u.name`,
      [company_id]
    );
    res.json(rows.map((r: any) => ({
      ...r,
      active_pieces:     parseInt(r.active_pieces),
      total_pieces_done: parseInt(r.total_pieces_done),
      overdue_pieces:    parseInt(r.overdue_pieces),
    })));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ─── スマートアサイン候補（v2: スキル × 速度 × 負荷 × 空き状況）──────────────
router.get('/smart-suggest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const tags = String(req.query.tags || '').split(',').filter(Boolean);

    const [workersRes, velocityRes, leaveRes, orgAvgRes] = await Promise.all([
      // 全ワーカー + 現在の負荷
      pool.query(
        `SELECT u.id, u.name,
           COUNT(p.id) FILTER (WHERE p.status IN ('in_progress','ready'))       AS active_pieces,
           COUNT(p.id) FILTER (WHERE p.status != 'done' AND p.due_date < NOW()) AS overdue_pieces,
           COUNT(p.id) FILTER (WHERE p.status = 'done')                         AS total_done
         FROM users u
         LEFT JOIN pieces p ON p.assignee_id = u.id AND p.company_id = $1
         WHERE u.company_id = $1 AND u.role = 'worker'
         GROUP BY u.id, u.name`,
        [company_id]
      ),
      // 速度ログ: タグ別の完了実績
      tags.length > 0
        ? pool.query(
            `SELECT vl.assignee_id,
               unnest(vl.skill_tags) AS tag,
               COUNT(*)::int          AS tag_count,
               AVG(vl.actual_days)   AS tag_avg_days
             FROM piece_velocity_log vl
             WHERE vl.company_id = $1
               AND vl.skill_tags && $2::text[]
             GROUP BY vl.assignee_id, tag`,
            [company_id, tags]
          )
        : { rows: [] },
      // 直近7日の休暇
      pool.query(
        `SELECT user_id FROM leave_requests
         WHERE company_id = $1
           AND status = 'approved'
           AND start_date <= NOW() + INTERVAL '7 days'
           AND end_date   >= NOW()`,
        [company_id]
      ),
      // 全社の平均速度（基準値）
      tags.length > 0
        ? pool.query(
            `SELECT AVG(vl.actual_days) AS org_avg
             FROM piece_velocity_log vl
             WHERE vl.company_id = $1
               AND vl.skill_tags && $2::text[]`,
            [company_id, tags]
          )
        : pool.query(
            `SELECT AVG(actual_days) AS org_avg FROM piece_velocity_log WHERE company_id = $1`,
            [company_id]
          ),
    ]);

    const orgAvgDays: number = parseFloat(orgAvgRes.rows[0]?.org_avg) || 5;
    const onLeaveIds = new Set(leaveRes.rows.map((r: any) => r.user_id));

    // velocityMap: userId → { tag → { count, avg_days } }
    const velocityMap: Record<string, Record<string, { count: number; avg_days: number }>> = {};
    for (const r of velocityRes.rows as any[]) {
      if (!velocityMap[r.assignee_id]) velocityMap[r.assignee_id] = {};
      velocityMap[r.assignee_id][r.tag] = {
        count:    parseInt(r.tag_count),
        avg_days: parseFloat(r.tag_avg_days),
      };
    }

    const results = workersRes.rows.map((w: any) => {
      const activePieces  = parseInt(w.active_pieces);
      const overduePieces = parseInt(w.overdue_pieces);
      const totalDone     = parseInt(w.total_done);
      const onLeave       = onLeaveIds.has(w.id);
      const vel           = velocityMap[w.id] ?? {};

      // ─ スキル一致スコア (0-35): タグごとの完了実績
      let skillMatchCount = 0;
      let matchedTags: string[] = [];
      let weightedAvgDays: number | null = null;
      let totalTagDone = 0;
      let totalTagAvgDaysSum = 0;

      for (const tag of tags) {
        if (vel[tag]) {
          skillMatchCount++;
          matchedTags.push(tag);
          totalTagDone += vel[tag].count;
          totalTagAvgDaysSum += vel[tag].avg_days * vel[tag].count;
        }
      }
      if (totalTagDone > 0) {
        weightedAvgDays = totalTagAvgDaysSum / totalTagDone;
      }

      // スキルスコア: 一致タグ数 × 実績数の重み付け
      const skillScore = Math.min(35, skillMatchCount * 8 + Math.min(15, totalTagDone * 1.5));

      // ─ 速度スコア (0-30): 平均速度が全社より速いほど高い
      let speedScore = 15; // デフォルト（実績なし）
      if (weightedAvgDays !== null) {
        const ratio = (orgAvgDays - weightedAvgDays) / orgAvgDays;
        speedScore = Math.max(0, Math.min(30, Math.round(15 + ratio * 20)));
      }

      // ─ 負荷スコア (0-25): アクティブタスク少ない + 期限超過なし
      const loadScore = Math.max(0, 25 - activePieces * 5 - overduePieces * 3);

      // ─ 空き状況スコア (0-10)
      const availScore = onLeave ? 0 : 10;

      const totalScore = Math.min(100, Math.round(skillScore + speedScore + loadScore + availScore));

      // ─ 理由文を生成
      const parts: string[] = [];
      if (matchedTags.length > 0) {
        parts.push(`${matchedTags.join('・')}を${totalTagDone}件完了`);
      }
      if (weightedAvgDays !== null) {
        const faster = orgAvgDays > 0
          ? Math.round(((orgAvgDays - weightedAvgDays) / orgAvgDays) * 100)
          : 0;
        if (faster > 5)  parts.push(`平均${weightedAvgDays.toFixed(1)}日（全社比${faster}%速い）`);
        else if (faster < -5) parts.push(`平均${weightedAvgDays.toFixed(1)}日（全社比${Math.abs(faster)}%遅め）`);
        else             parts.push(`平均${weightedAvgDays.toFixed(1)}日（全社並み）`);
      }
      if (activePieces === 0)  parts.push('現在空き');
      else                      parts.push(`現在${activePieces}件担当中`);
      if (onLeave) parts.push('⚠️ 近日休暇あり');

      return {
        id:           w.id,
        name:         w.name,
        score:        totalScore,
        active_pieces:  activePieces,
        overdue_pieces: overduePieces,
        total_done:     totalDone,
        on_leave:       onLeave,
        skill_match_count: skillMatchCount,
        matched_tags:  matchedTags,
        weighted_avg_days: weightedAvgDays ? parseFloat(weightedAvgDays.toFixed(1)) : null,
        org_avg_days:  parseFloat(orgAvgDays.toFixed(1)),
        breakdown: { skillScore, speedScore, loadScore, availScore },
        reason:    parts.join(' / '),
      };
    });

    res.json(results.sort((a: any, b: any) => b.score - a.score));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ─── 一括アサイン提案: 全未割当ピース × 最適ワーカー ─────────────────────────
router.get('/bulk-suggest', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;

    // 未割当の非完了ピース（最大100件）
    const { rows: unassigned } = await pool.query(
      `SELECT p.id, p.title, p.skill_tags, p.priority, p.due_date,
              p.business_impact, p.status, p.project_id,
              pr.name AS project_name
       FROM pieces p
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE p.company_id = $1
         AND p.assignee_id IS NULL
         AND p.status NOT IN ('done')
       ORDER BY p.priority DESC, p.due_date ASC NULLS LAST
       LIMIT 100`,
      [company_id]
    );

    if (unassigned.length === 0) {
      res.json({ suggestions: [] });
      return;
    }

    // 全ワーカーの速度ログ・負荷を一括取得
    const [workersRes, velocityRes, leaveRes, orgAvgRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.name,
           COUNT(p.id) FILTER (WHERE p.status IN ('in_progress','ready')) AS active_pieces,
           COUNT(p.id) FILTER (WHERE p.status != 'done' AND p.due_date < NOW()) AS overdue_pieces
         FROM users u
         LEFT JOIN pieces p ON p.assignee_id = u.id AND p.company_id = $1
         WHERE u.company_id = $1 AND u.role = 'worker'
         GROUP BY u.id, u.name`,
        [company_id]
      ),
      pool.query(
        `SELECT vl.assignee_id,
           unnest(vl.skill_tags) AS tag,
           COUNT(*)::int          AS tag_count,
           AVG(vl.actual_days)   AS tag_avg_days
         FROM piece_velocity_log vl
         WHERE vl.company_id = $1
         GROUP BY vl.assignee_id, tag`,
        [company_id]
      ),
      pool.query(
        `SELECT user_id FROM leave_requests
         WHERE company_id = $1 AND status = 'approved'
           AND start_date <= NOW() + INTERVAL '7 days'
           AND end_date >= NOW()`,
        [company_id]
      ),
      pool.query(
        `SELECT unnest(skill_tags) AS tag, AVG(actual_days) AS avg_days
         FROM piece_velocity_log WHERE company_id = $1
         GROUP BY tag`,
        [company_id]
      ),
    ]);

    const onLeaveIds = new Set(leaveRes.rows.map((r: any) => r.user_id));

    // orgAvgMap: tag → avg_days
    const orgAvgMap: Record<string, number> = {};
    for (const r of orgAvgRes.rows as any[]) orgAvgMap[r.tag] = parseFloat(r.avg_days);

    // velocityMap: userId → tag → { count, avg_days }
    const velocityMap: Record<string, Record<string, { count: number; avg_days: number }>> = {};
    for (const r of velocityRes.rows as any[]) {
      if (!velocityMap[r.assignee_id]) velocityMap[r.assignee_id] = {};
      velocityMap[r.assignee_id][r.tag] = { count: parseInt(r.tag_count), avg_days: parseFloat(r.tag_avg_days) };
    }

    const workers = workersRes.rows.map((w: any) => ({
      id: w.id, name: w.name,
      active: parseInt(w.active_pieces),
      overdue: parseInt(w.overdue_pieces),
      onLeave: onLeaveIds.has(w.id),
    }));

    // For each piece, score all workers and pick best
    function scoreWorker(worker: typeof workers[0], tags: string[]): { score: number; reason: string; matched_tags: string[] } {
      const vel = velocityMap[worker.id] ?? {};
      let skillMatchCount = 0;
      let matchedTags: string[] = [];
      let totalTagDone = 0;
      let totalTagAvgDaysSum = 0;

      for (const tag of tags) {
        if (vel[tag]) {
          skillMatchCount++;
          matchedTags.push(tag);
          totalTagDone += vel[tag].count;
          totalTagAvgDaysSum += vel[tag].avg_days * vel[tag].count;
        }
      }
      const weightedAvg = totalTagDone > 0 ? totalTagAvgDaysSum / totalTagDone : null;
      const skillScore  = Math.min(35, skillMatchCount * 8 + Math.min(15, totalTagDone * 1.5));

      let speedScore = 15;
      if (weightedAvg !== null && tags.length > 0) {
        const orgAvg = tags.reduce((s, t) => s + (orgAvgMap[t] ?? 5), 0) / tags.length;
        const ratio  = (orgAvg - weightedAvg) / orgAvg;
        speedScore   = Math.max(0, Math.min(30, Math.round(15 + ratio * 20)));
      }

      const loadScore  = Math.max(0, 25 - worker.active * 5 - worker.overdue * 3);
      const availScore = worker.onLeave ? 0 : 10;
      const score      = Math.min(100, Math.round(skillScore + speedScore + loadScore + availScore));

      const parts: string[] = [];
      if (matchedTags.length > 0) parts.push(`${matchedTags.join('・')}実績${totalTagDone}件`);
      if (worker.active === 0) parts.push('空き');
      else parts.push(`担当${worker.active}件`);
      if (worker.onLeave) parts.push('休暇予定あり');

      return { score, reason: parts.join(' / '), matched_tags: matchedTags };
    }

    const suggestions = unassigned.map(piece => {
      const tags = piece.skill_tags ?? [];
      const scored = workers.map(w => ({ worker: w, ...scoreWorker(w, tags) }));
      scored.sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3).map(s => ({
        worker_id:    s.worker.id,
        worker_name:  s.worker.name,
        score:        s.score,
        reason:       s.reason,
        matched_tags: s.matched_tags,
        active_pieces: s.worker.active,
        on_leave:     s.worker.onLeave,
      }));
      return {
        piece_id:      piece.id,
        piece_title:   piece.title,
        skill_tags:    tags,
        priority:      piece.priority,
        due_date:      piece.due_date,
        business_impact: piece.business_impact,
        status:        piece.status,
        project_id:    piece.project_id,
        project_name:  piece.project_name,
        top_candidates: top3,
      };
    });

    res.json({ suggestions });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ユーザー個別統計
router.get('/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [inProgressRes, completedRes] = await Promise.all([
      pool.query(
        `SELECT id, title, status, progress, due_date, skill_tags, business_impact
         FROM pieces WHERE assignee_id = $1 AND status IN ('in_progress','ready')
         ORDER BY due_date ASC NULLS LAST LIMIT 10`,
        [id]
      ),
      pool.query(
        `SELECT id, title, completed_at, skill_tags
         FROM pieces WHERE assignee_id = $1 AND status = 'done'
         ORDER BY completed_at DESC LIMIT 10`,
        [id]
      ),
    ]);
    res.json({
      in_progress: inProgressRes.rows,
      recently_completed: completedRes.rows,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 全ユーザー一覧（管理者用）
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const { rows } = await pool.query(
      'SELECT id, name, email, role FROM users WHERE company_id = $1 ORDER BY name',
      [company_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// メンバーのロール変更（admin のみ・自分自身は変更不可）
router.patch('/:id/role', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['admin', 'worker'].includes(role)) {
    res.status(400).json({ error: '無効なロールです' }); return;
  }
  if (id === req.user!.id) {
    res.status(400).json({ error: '自分自身のロールは変更できません' }); return;
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET role = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, name, email, role`,
      [role, id, req.user!.company_id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'メンバーが見つかりません' }); return; }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// メンバー削除（admin のみ・自分自身は削除不可）
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (id === req.user!.id) {
    res.status(400).json({ error: '自分自身は削除できません' }); return;
  }
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user!.company_id]
    );
    if (!rowCount) { res.status(404).json({ error: 'メンバーが見つかりません' }); return; }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// 企業スキルツリー（全ワーカーの完了ピース集計） ※ /:id/skills より先に定義する
router.get('/company/skills', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const company_id = req.user!.company_id;
    const LEVEL_THRESHOLDS = [5, 20, 50, 100, 200];

    // 全ワーカーのskill_tag集計（誰がどのスキルを何件・どれだけのインパクトで完了したか）
    const { rows: tagRows } = await pool.query<{
      tag: string; worker_id: string; worker_name: string;
      count: string; impact: string;
    }>(
      `SELECT unnest(p.skill_tags) AS tag,
              u.id AS worker_id, u.name AS worker_name,
              COUNT(*) AS count,
              COALESCE(SUM(p.business_impact), 0) AS impact
       FROM pieces p
       JOIN users u ON u.id = p.assignee_id
       WHERE p.company_id = $1 AND p.status = 'done' AND p.skill_tags IS NOT NULL
       GROUP BY tag, u.id, u.name
       ORDER BY tag, count DESC`,
      [company_id]
    );

    // スキルごとに集計
    const skillMap: Record<string, { total: number; total_impact: number; workers: { id: string; name: string; count: number }[] }> = {};
    for (const row of tagRows) {
      if (!skillMap[row.tag]) skillMap[row.tag] = { total: 0, total_impact: 0, workers: [] };
      const n = parseInt(row.count, 10);
      skillMap[row.tag].total += n;
      skillMap[row.tag].total_impact += parseInt(row.impact, 10) || 0;
      skillMap[row.tag].workers.push({ id: row.worker_id, name: row.worker_name, count: n });
    }

    const skills = Object.entries(skillMap).map(([tag, { total, total_impact, workers }]) => ({
      tag,
      total_done:   total,
      total_impact,
      level: LEVEL_THRESHOLDS.findIndex(t => total < t) === -1 ? 5 : LEVEL_THRESHOLDS.findIndex(t => total < t),
      workers,
    })).sort((a, b) => b.total_done - a.total_done);

    // ワーカー数と全体合計
    const { rows: [summary] } = await pool.query(
      `SELECT COUNT(DISTINCT assignee_id) AS worker_count, COUNT(*) AS total_done
       FROM pieces WHERE company_id = $1 AND status = 'done'`,
      [company_id]
    );

    res.json({
      skills,
      worker_count: parseInt(summary?.worker_count ?? '0', 10),
      total_done: parseInt(summary?.total_done ?? '0', 10),
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ユーザースキルツリー（完了済みピースのskill_tagsを集計）※ /company/skills より後に定義
router.get('/:id/skills', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const LEVEL_THRESHOLDS = [5, 20, 50, 100, 200];

    // 完了済みピースからskill_tagsを集計
    const { rows: tagRows } = await pool.query<{ tag: string; count: string }>(
      `SELECT unnest(skill_tags) AS tag, COUNT(*) AS count
       FROM pieces
       WHERE assignee_id = $1 AND status = 'done' AND skill_tags IS NOT NULL
       GROUP BY tag`,
      [id]
    );

    const skills: Record<string, { level: number; pieces_done: number; avg_rating: number }> = {};
    let total = 0;
    for (const row of tagRows) {
      const n = parseInt(row.count, 10);
      const level = LEVEL_THRESHOLDS.findIndex(t => n < t);
      skills[row.tag] = {
        level: level === -1 ? 5 : level,
        pieces_done: n,
        avg_rating: 0,
      };
      total += n;
    }

    // ユーザー情報
    const { rows: [u] } = await pool.query(
      'SELECT id, name FROM users WHERE id = $1',
      [id]
    );

    res.json({
      id: u?.id ?? id,
      name: u?.name ?? '',
      skill_tree: {
        skills,
        total_pieces_done: total,
        overall_rating: 0,
        badges: [],
      },
      total_pieces_done: total,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// パスワード変更
router.post('/me/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      res.status(400).json({ error: '全項目を入力してください' }); return;
    }
    if (new_password.length < 8) {
      res.status(400).json({ error: 'パスワードは8文字以上にしてください' }); return;
    }
    const bcrypt = await import('bcryptjs');
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const ok = await bcrypt.compare(current_password, rows[0]?.password_hash ?? '');
    if (!ok) {
      res.status(400).json({ error: '現在のパスワードが違います' }); return;
    }
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── スキル更新 PATCH /users/me/skills ──────────────────────────────────
router.patch('/me/skills', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { user_skills } = req.body;
  if (!Array.isArray(user_skills)) {
    res.status(400).json({ error: 'user_skills (array) required' }); return;
  }
  try {
    await pool.query(
      'UPDATE users SET user_skills = $1 WHERE id = $2',
      [user_skills, userId]
    );
    res.json({ user_skills });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── ポートフォリオ公開設定 PATCH /users/portfolio-visibility ─────────────
router.patch('/portfolio-visibility', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { is_public } = req.body;
  if (typeof is_public !== 'boolean') {
    res.status(400).json({ error: 'is_public (boolean) required' }); return;
  }
  try {
    await pool.query(
      'UPDATE users SET is_portfolio_public = $1 WHERE id = $2',
      [is_public, userId]
    );
    res.json({ is_public });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 自分のポートフォリオ公開状態を取得 ─────────────────────────────────
router.get('/portfolio-visibility', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const { rows } = await pool.query(
      'SELECT is_portfolio_public FROM users WHERE id = $1',
      [userId]
    );
    res.json({ is_public: rows[0]?.is_portfolio_public ?? false, user_id: userId });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 公開ポートフォリオへの連絡送信 POST /users/contact/:userId ────────────
// 認証不要 — 送信者のメールは相手に非公開
router.post('/contact/:userId', async (req, res: Response) => {
  const { userId } = req.params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(userId)) { res.status(404).json({ error: 'not found' }); return; }

  const { sender_name, sender_email, message } = req.body;
  if (!sender_name?.trim() || !sender_email?.trim() || !message?.trim()) {
    res.status(400).json({ error: '名前・メール・メッセージは必須です' }); return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: 'メッセージは2000文字以内にしてください' }); return;
  }

  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, name, is_portfolio_public FROM users WHERE id = $1',
      [userId]
    );
    if (!user) { res.status(404).json({ error: 'not found' }); return; }
    if (!user.is_portfolio_public) {
      res.status(403).json({ error: 'このユーザーは連絡を受け付けていません' }); return;
    }

    await pool.query(
      `INSERT INTO contact_requests (target_user_id, sender_name, sender_email, message)
       VALUES ($1, $2, $3, $4)`,
      [userId, sender_name.trim(), sender_email.trim(), message.trim()]
    );

    res.status(201).json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 自分への連絡一覧 GET /users/my-contacts ──────────────────────────────
router.get('/my-contacts', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const { rows } = await pool.query(
      `SELECT id, sender_name, sender_email, message, created_at, read_at
       FROM contact_requests
       WHERE target_user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 連絡を既読にする PATCH /users/my-contacts/:id/read ───────────────────
router.patch('/my-contacts/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE contact_requests SET read_at = now()
       WHERE id = $1 AND target_user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 公開ポートフォリオ取得 GET /users/public-portfolio/:userId ────────────
// 認証不要 — 公開設定のユーザーのデータのみ返す
router.get('/public-portfolio/:userId', async (req, res: Response) => {
  const { userId } = req.params;
  // UUID形式チェック
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(userId)) { res.status(404).json({ error: 'not found' }); return; }
  try {
    // ユーザー情報 + 公開設定を確認
    const { rows: [user] } = await pool.query(
      `SELECT id, name, is_portfolio_public, created_at, user_skills FROM users WHERE id = $1`,
      [userId]
    );
    if (!user) { res.status(404).json({ error: 'not found' }); return; }
    if (!user.is_portfolio_public) {
      res.status(403).json({ error: 'private', name: user.name });
      return;
    }

    // 完了ピース（企業ピースのみ）— 機密フラグ付きで全取得
    const now = new Date().toISOString();
    const { rows: allPieces } = await pool.query(
      `SELECT
         p.id, p.title, p.objective, p.skill_tags, p.personal_tags,
         p.source, p.completed_at, p.estimated_minutes, p.actual_minutes,
         p.business_impact, p.company_id, p.is_confidential, p.confidential_until,
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

    // 機密中のピースは内容をマスクして、公開ピースと分離
    const publicPieces = allPieces
      .filter((p: any) => !p.currently_confidential)
      .map((p: any) => {
        const { is_confidential, confidential_until, currently_confidential, ...rest } = p;
        return rest;
      });

    // 機密ピースは企業別・スキル集合だけ残して集約
    const confidentialPieces = allPieces.filter((p: any) => p.currently_confidential);
    const confByCompany: Record<string, { company_name: string | null; tags: Set<string>; count: number; earliest: string; latest: string }> = {};
    confidentialPieces.forEach((p: any) => {
      const key = p.company_id ?? '__personal';
      if (!confByCompany[key]) {
        confByCompany[key] = { company_name: p.company_name, tags: new Set(), count: 0, earliest: p.completed_at, latest: p.completed_at };
      }
      confByCompany[key].count += 1;
      (p.skill_tags ?? []).forEach((t: string) => confByCompany[key].tags.add(t));
      if (p.completed_at < confByCompany[key].earliest) confByCompany[key].earliest = p.completed_at;
      if (p.completed_at > confByCompany[key].latest)   confByCompany[key].latest   = p.completed_at;
    });
    const confidentialSummary = Object.values(confByCompany).map(v => ({
      ...v,
      tags: [...v.tags],
    }));

    // スキル別集計（公開ピースのみ — スキル自体は機密情報ではないので機密ピースも含める）
    const skillMap: Record<string, { count: number; minutes: number }> = {};
    allPieces.forEach((p: any) => {
      (p.skill_tags ?? []).forEach((tag: string) => {
        if (!skillMap[tag]) skillMap[tag] = { count: 0, minutes: 0 };
        skillMap[tag].count += 1;
        skillMap[tag].minutes += p.actual_minutes ?? 0;
      });
    });
    const skillBreakdown = Object.entries(skillMap)
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => b.count - a.count);

    // サマリー（全ピース対象）
    const companies = new Set(allPieces.filter((p: any) => p.company_id).map((p: any) => p.company_id));
    const totalMinutes = allPieces.reduce((s: number, p: any) => s + (p.actual_minutes ?? 0), 0);

    res.json({
      user: { id: user.id, name: user.name, member_since: user.created_at, user_skills: user.user_skills ?? [] },
      pieces: publicPieces,
      confidential_summary: confidentialSummary,
      skill_breakdown: skillBreakdown,
      summary: {
        total_pieces: allPieces.length,
        total_companies: companies.size,
        total_hours: Math.round(totalMinutes / 60),
      },
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
