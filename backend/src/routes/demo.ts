/**
 * demo.ts — デモ工房切替 API
 * ───────────────────────────────────────
 * POST /api/demo/switch { type: 'saas' | 'web' | 'ec' | 'manufacturing' | 'small' }
 * 指定した会社タイプのシードを実行してデータを差し替える。
 * 本番環境での使用禁止 (DEMO_ENABLED=true のときのみ有効)
 */

import { Router } from 'express';
import { pool } from '../db';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';

const SEED_FILES: Record<string, string> = {
  saas:                'seed_saas.sql',
  web:                 'seed_web_agency.sql',
  ec:                  'seed_ec.sql',
  manufacturing:       'seed_manufacturing.sql',
  small:               'seed_small_team.sql',
  saas_before:         'seed_saas_broken.sql',
  web_before:          'seed_web_broken.sql',
  ec_before:           'seed_ec_broken.sql',
  manufacturing_before:'seed_manufacturing_broken.sql',
  small_before:        'seed_small_broken.sql',
};

// スクリプトディレクトリを探す（backend root 基準）
function findSeedDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../scripts'),
    path.resolve(__dirname, '../../scripts'),
    path.resolve(process.cwd(), 'scripts'),
  ];
  for (const d of candidates) {
    if (fs.existsSync(d)) return d;
  }
  return candidates[0];
}

router.post('/switch', async (req, res) => {
  const { type } = req.body as { type?: string };

  if (!type || !SEED_FILES[type]) {
    return res.status(400).json({
      error: 'Invalid type',
      valid: Object.keys(SEED_FILES),
    });
  }

  const seedDir  = findSeedDir();
  const seedPath = path.join(seedDir, SEED_FILES[type]);

  if (!fs.existsSync(seedPath)) {
    return res.status(500).json({ error: `Seed file not found: ${seedPath}` });
  }

  const sql = fs.readFileSync(seedPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query(sql);

    // 切替後の状態をサマリーで返す
    const { rows } = await client.query(`
      SELECT
        COUNT(DISTINCT pr.id)::int                                             AS projects,
        COUNT(p.id)::int                                                       AS pieces,
        COUNT(p.id) FILTER (WHERE p.status = 'in_progress')::int              AS in_progress,
        COUNT(p.id) FILTER (WHERE p.status = 'done')::int                     AS done,
        COUNT(p.id) FILTER (
          WHERE p.due_date < NOW() AND p.status != 'done'
        )::int                                                                 AS overdue,
        COUNT(c.id)::int                                                       AS connections
      FROM projects pr
      LEFT JOIN pieces p ON p.project_id = pr.id
      LEFT JOIN connections c ON c.from_piece_id = p.id
      WHERE pr.company_id = $1
    `, [COMPANY_ID]);

    res.json({ ok: true, type, stats: rows[0] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    client.release();
  }
});

// 現在のデモタイプを推測する（プロジェクト名パターンから）
router.get('/current', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT name FROM projects WHERE company_id = $1 LIMIT 3',
      [COMPANY_ID]
    );
    const names = rows.map(r => r.name as string);

    let type = 'unknown';
    if (names.some(n => n.includes('Sprint') || n.includes('インフラ'))) type = 'saas';
    else if (names.some(n => n.includes('クライアントA') || n.includes('クライアントB'))) type = 'web';
    else if (names.some(n => n.includes('セール') || n.includes('EC'))) type = 'ec';
    else if (names.some(n => n.includes('製品') || n.includes('量産') || n.includes('製造'))) type = 'manufacturing';
    else if (names.some(n => n.includes('クライアントX') || n.includes('小規模'))) type = 'small';
    else if (names.some(n => n.includes('ルームランナー') || n.includes('ST'))) type = 'gantt';

    res.json({ type });
  } catch {
    res.json({ type: 'unknown' });
  }
});

export default router;
