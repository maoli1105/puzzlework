/**
 * notificationCron — Slack 定期通知
 * ────────────────────────────────────────────────────────────
 * 毎朝 09:00 JST に各社の Slack Webhook へ通知を送る。
 *
 * 通知内容:
 *   1. 期限超過ピース（due_date < today, status != done）
 *   2. 本日締め切りピース（due_date = today）
 *   3. WIP 上限超過ワーカー
 *
 * company_settings テーブルの (company_id, 'slack_webhook_url') で
 * Webhook URL を保持。未設定の会社はスキップ。
 */

import { pool } from '../db';

// ─── Slack メッセージ送信 ────────────────────────────────────────────────
async function postToSlack(webhookUrl: string, blocks: object[]): Promise<void> {
  const resp = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ blocks }),
  });
  if (!resp.ok) {
    throw new Error(`Slack POST failed: ${resp.status} ${await resp.text()}`);
  }
}

// ─── 1社分の通知を組み立てて送信 ──────────────────────────────────────────
async function notifyCompany(companyId: string, webhookUrl: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // 期限超過
  const { rows: overdue } = await pool.query<{
    title: string; assignee_name: string | null; due_date: string;
  }>(
    `SELECT p.title, u.name AS assignee_name, p.due_date::date AS due_date
     FROM pieces p
     LEFT JOIN users u ON u.id = p.assignee_id
     WHERE p.company_id = $1
       AND p.status NOT IN ('done', 'cancelled')
       AND p.due_date < $2::date
     ORDER BY p.due_date ASC
     LIMIT 20`,
    [companyId, todayStr]
  );

  // 本日締め切り
  const { rows: dueToday } = await pool.query<{
    title: string; assignee_name: string | null;
  }>(
    `SELECT p.title, u.name AS assignee_name
     FROM pieces p
     LEFT JOIN users u ON u.id = p.assignee_id
     WHERE p.company_id = $1
       AND p.status NOT IN ('done', 'cancelled')
       AND p.due_date::date = $2::date
     ORDER BY p.title
     LIMIT 20`,
    [companyId, todayStr]
  );

  // 何も通知することがない場合はスキップ
  if (overdue.length === 0 && dueToday.length === 0) return;

  // 会社名
  const { rows: [company] } = await pool.query(
    'SELECT name FROM companies WHERE id = $1', [companyId]
  );
  const companyName = company?.name ?? companyId;

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 PuzzleWork デイリーレポート — ${companyName}`,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'plain_text', text: `${todayStr}（自動通知）`, emoji: false }],
    },
    { type: 'divider' },
  ];

  // 期限超過セクション
  if (overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 期限超過 ${overdue.length}件*`,
      },
    });
    const lines = overdue.map(p => {
      const assignee = p.assignee_name ? ` — ${p.assignee_name}` : '';
      const due = String(p.due_date).slice(0, 10);
      return `• ${p.title}${assignee}  \`${due}\``;
    }).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines } });
  }

  // 本日締め切りセクション
  if (dueToday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🟡 本日締め切り ${dueToday.length}件*`,
      },
    });
    const lines = dueToday.map(p => {
      const assignee = p.assignee_name ? ` — ${p.assignee_name}` : '';
      return `• ${p.title}${assignee}`;
    }).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines } });
  }

  await postToSlack(webhookUrl, blocks);
}

// ─── 全社に一括通知 ────────────────────────────────────────────────────────
export async function runNotificationCron(): Promise<void> {
  const { rows } = await pool.query<{ company_id: string; value: string }>(
    `SELECT company_id, value FROM company_settings WHERE key = 'slack_webhook_url' AND value IS NOT NULL AND value <> ''`
  );
  const results = await Promise.allSettled(
    rows.map(r => notifyCompany(r.company_id, r.value))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      process.stderr.write(`[NotificationCron] company ${rows[i].company_id} 送信失敗: ${r.reason}\n`);
    }
  });
  process.stdout.write(`[NotificationCron] 完了 (${rows.length} 社チェック)\n`);
}

// ─── cron スケジューラ (setInterval ベース、node-cron 不要) ───────────────
function msUntilNext9amJST(): number {
  const now = new Date();
  // JST = UTC+9
  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJST = new Date(now.getTime() + jstOffset);
  const next9 = new Date(nowJST);
  next9.setUTCHours(0, 0, 0, 0); // JST 00:00 = UTC 15:00 前日
  next9.setUTCHours(0);          // reset
  // 次の JST 09:00 を UTC で計算
  const target = new Date(Date.UTC(
    nowJST.getUTCFullYear(),
    nowJST.getUTCMonth(),
    nowJST.getUTCDate(),
    0, 0, 0, 0
  ) - jstOffset + 9 * 60 * 60 * 1000); // JST 09:00

  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

export function startNotificationCron(): void {
  const scheduleNext = () => {
    const ms = msUntilNext9amJST();
    const hh = Math.floor(ms / 3600000);
    const mm = Math.floor((ms % 3600000) / 60000);
    process.stdout.write(`[NotificationCron] 次回実行まで ${hh}時間${mm}分\n`);

    setTimeout(async () => {
      try {
        await runNotificationCron();
      } catch (e) {
        process.stderr.write(`[NotificationCron] エラー: ${e}\n`);
      }
      scheduleNext(); // 翌日分を再スケジュール
    }, ms);
  };

  scheduleNext();
}
