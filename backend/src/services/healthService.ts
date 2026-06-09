import { pool } from '../db';

export async function getOrgHealth(companyId: string): Promise<any> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    summaryRes,
    atRiskRes,
    spofRes,
    doneWeekRes,
    blockerRes,
  ] = await Promise.all([
    // 全体サマリー
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'done' AND completed_at >= $1) AS done_this_week,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('done')) AS overdue_count,
         COUNT(*) FILTER (WHERE status = 'in_progress' AND started_at < $2 AND progress < 20) AS stale_count,
         COUNT(*) FILTER (WHERE assignee_id IS NULL AND status IN ('ready','in_progress')) AS unassigned_count,
         SUM(CASE WHEN due_date >= NOW() OR status = 'done' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) * 100 AS on_time_pct
       FROM pieces WHERE company_id = $3`,
      [weekAgo, staleThreshold, companyId]
    ),
    // リスクのあるピース
    pool.query(
      `SELECT p.id, p.title, p.status, p.due_date, p.business_impact,
              u.name  AS assignee_name,
              u.id    AS assignee_id,
              pr.name AS project_name,
              pr.id   AS project_id,
              CASE
                WHEN p.due_date < NOW() AND p.status NOT IN ('done') THEN 'overdue'
                WHEN p.started_at < $1 AND p.progress < 20 AND p.status = 'in_progress' THEN 'stale'
                ELSE 'unassigned'
              END AS risk_type
       FROM pieces p
       LEFT JOIN users    u  ON u.id  = p.assignee_id
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE p.company_id = $2
         AND (
           (p.due_date < NOW() AND p.status NOT IN ('done'))
           OR (p.started_at < $1 AND p.progress < 20 AND p.status = 'in_progress')
           OR (p.assignee_id IS NULL AND p.status IN ('ready','in_progress'))
         )
       ORDER BY p.business_impact DESC, p.due_date ASC NULLS LAST
       LIMIT 30`,
      [staleThreshold, companyId]
    ),
    // SPOF（単一障害点ユーザー）
    pool.query(
      `SELECT u.id, u.name, u.email,
              COUNT(p.id) AS critical_piece_count,
              SUM(p.business_impact) AS total_business_impact
       FROM users u
       JOIN pieces p ON p.assignee_id = u.id
       WHERE u.company_id = $1
         AND p.status IN ('in_progress','ready')
         AND p.business_impact > 0
       GROUP BY u.id, u.name, u.email
       HAVING COUNT(p.id) >= 3
       ORDER BY total_business_impact DESC
       LIMIT 5`,
      [companyId]
    ),
    // 今週完了数（念のため別取得）
    pool.query(
      `SELECT COUNT(*) AS cnt FROM pieces
       WHERE company_id = $1 AND status = 'done' AND completed_at >= $2`,
      [companyId, weekAgo]
    ),
    // ブロッカー報告（ワーカーが報告した未解決ブロック、最新1件/ピース）
    pool.query(
      `SELECT DISTINCT ON (p.id)
         p.id, p.title, p.status, p.due_date, p.business_impact,
         u.name  AS assignee_name,
         u.id    AS assignee_id,
         pr.name AS project_name,
         pr.id   AS project_id,
         pl.new_value AS blocker_reason,
         pl.created_at AS reported_at,
         reporter.name AS reporter_name
       FROM piece_logs pl
       JOIN pieces p ON p.id = pl.piece_id
       LEFT JOIN users u        ON u.id  = p.assignee_id
       LEFT JOIN projects pr    ON pr.id = p.project_id
       LEFT JOIN users reporter ON reporter.id = pl.user_id
       WHERE p.company_id = $1
         AND pl.event_type = 'blocker_reported'
         AND p.status NOT IN ('done')
       ORDER BY p.id, pl.created_at DESC
       LIMIT 20`,
      [companyId]
    ),
  ]);

  const s = summaryRes.rows[0];
  const atRisk = atRiskRes.rows;
  const spof   = spofRes.rows;

  const inProgressCount = parseInt(s.in_progress_count ?? '0');
  const overdueCount    = parseInt(s.overdue_count ?? '0');
  const staleCount      = parseInt(s.stale_count ?? '0');
  const onTimePct       = parseFloat(s.on_time_pct ?? '100');
  const doneThisWeek    = parseInt(doneWeekRes.rows[0].cnt ?? '0');
  const overloadedCount = spof.length;

  // スコア計算（0-100）
  const score = Math.max(0, Math.round(
    100
    - overdueCount * 4
    - staleCount   * 2
    - overloadedCount * 3
  ));

  const totalBizAtRisk = atRisk.reduce((sum: number, p: any) => sum + (Number(p.business_impact) || 0), 0);

  return {
    score,
    at_risk_pieces: atRisk,
    blocker_pieces: blockerRes.rows,
    spof_users: spof.map((u: any) => ({
      id: u.id, name: u.name, email: u.email,
      critical_piece_count: parseInt(u.critical_piece_count),
      total_business_impact: parseInt(u.total_business_impact ?? '0'),
    })),
    total_business_impact_at_risk: totalBizAtRisk,
    pieces_on_time_pct: Math.round(onTimePct),
    overloaded_count: overloadedCount,
    stale_count: staleCount,
    in_progress_count: inProgressCount,
    done_this_week: doneThisWeek,
  };
}
