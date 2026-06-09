/**
 * notifications routes
 * ─────────────────────────────────────────────
 * GET  /api/notifications/settings   — Slack webhook URL 取得
 * PUT  /api/notifications/settings   — Slack webhook URL 保存
 * POST /api/notifications/test       — テスト通知送信
 */

import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../db';
import { runNotificationCron } from '../services/notificationCron';

const router = Router();

// ── 設定取得 ────────────────────────────────────────────────────────────────
router.get('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM company_settings WHERE company_id = $1 AND key IN ('slack_webhook_url', 'slack_channel')`,
      [req.user!.company_id]
    );
    const settings: Record<string, string> = {};
    rows.forEach((r: { key: string; value: string }) => { settings[r.key] = r.value; });
    res.json({
      slack_webhook_url: settings['slack_webhook_url'] ?? '',
      slack_channel:     settings['slack_channel'] ?? '',
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 設定保存 ────────────────────────────────────────────────────────────────
router.put('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { slack_webhook_url } = req.body as { slack_webhook_url?: string };
  const url = (slack_webhook_url ?? '').trim();

  // 簡易バリデーション（空 or hooks.slack.com で始まる URL のみ許可）
  if (url && !url.startsWith('https://hooks.slack.com/')) {
    res.status(400).json({ error: '有効な Slack Webhook URL を入力してください (https://hooks.slack.com/...)' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO company_settings (company_id, key, value)
       VALUES ($1, 'slack_webhook_url', $2)
       ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [req.user!.company_id, url]
    );
    res.json({ success: true, slack_webhook_url: url });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── テスト送信 ───────────────────────────────────────────────────────────────
router.post('/test', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM company_settings WHERE company_id = $1 AND key = 'slack_webhook_url'`,
      [req.user!.company_id]
    );
    const url = rows[0]?.value ?? '';
    if (!url) {
      res.status(400).json({ error: 'Slack Webhook URL が設定されていません' });
      return;
    }

    const { rows: [company] } = await pool.query(
      'SELECT name FROM companies WHERE id = $1', [req.user!.company_id]
    );

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *PuzzleWork テスト通知*\n${company?.name ?? ''} の Slack 連携が正常に動作しています。`,
            },
          },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      res.status(502).json({ error: `Slack への送信に失敗しました: ${txt}` });
      return;
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── 手動実行（テスト用） ─────────────────────────────────────────────────────
router.post('/run-now', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await runNotificationCron();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
