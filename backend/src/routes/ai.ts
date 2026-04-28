import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
router.use(authenticate);

// Lazy-initialize to avoid hanging when ANTHROPIC_API_KEY is absent at module load
function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy' });
}

/**
 * POST /api/ai/suggest-piece
 * ピースタイトルから Objective・スキルタグ・優先度・期限提案を生成
 */
router.post('/suggest-piece', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { title } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title は必須です' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
    return;
  }

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `あなたはプロジェクト管理の専門家です。
以下のタスクタイトルに対して、JSON形式で情報を補完してください。

タスクタイトル: "${title.trim()}"

以下のJSONを返してください（他のテキストは不要）:
{
  "objective": "このタスクの目的・完了条件を1〜2文で（日本語）",
  "skill_tags": ["関連スキル1", "関連スキル2"],
  "priority": 1〜5の整数（5が最高優先度）,
  "estimated_days": 完了までの推定日数（整数）,
  "due_date_suggestion": "YYYY-MM-DD形式（今日から estimated_days 後）",
  "reason": "優先度と期間の根拠を1文で"
}

今日の日付: ${new Date().toISOString().slice(0, 10)}
スキルタグ例: marketing, ec, sns, creative, sales, design, engineering, data, ops, hr, legal, finance`,
      }],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    // JSONブロックを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: 'AI応答のパースに失敗しました', raw: text }); return; }

    const suggestion = JSON.parse(jsonMatch[0]);
    res.json(suggestion);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'AI提案に失敗しました', detail: msg });
  }
});

/**
 * POST /api/ai/suggest-sprint-name
 * スプリントゴールからスプリント名を提案
 */
router.post('/suggest-sprint-name', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { goal } = req.body;
  if (!goal?.trim()) { res.status(400).json({ error: 'goal は必須です' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY が設定されていません' }); return;
  }

  try {
    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `スプリントゴール「${goal.trim()}」に対して、短いスプリント名を3つ提案してください。
JSON配列のみ返してください: ["名前1", "名前2", "名前3"]`,
      }],
    });
    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
    res.json({ suggestions: arr });
  } catch (e: unknown) {
    res.status(500).json({ error: '提案に失敗しました', detail: String(e) });
  }
});

/**
 * POST /api/ai/suggest-sprint
 * スキルタグ×担当者実績を考慮した最適アサイン提案
 * Body: { pieces: [{id, title, skill_tags, priority}], workers: [{id, name, skill_tree, active_count}] }
 */
router.post('/suggest-sprint', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { pieces, workers } = req.body;
  if (!Array.isArray(pieces) || !Array.isArray(workers)) {
    res.status(400).json({ error: 'pieces と workers は配列で必要です' }); return;
  }
  if (pieces.length === 0 || workers.length === 0) {
    res.json({ assignments: [] }); return;
  }

  // ANTHROPIC_API_KEY なしでもルールベースフォールバック
  if (!process.env.ANTHROPIC_API_KEY) {
    // フォールバック: スキル一致度でルールベース割り当て
    const assignments = ruleBasedAssign(pieces, workers);
    res.json({ assignments, source: 'rule-based' });
    return;
  }

  try {
    const piecesSummary = pieces.slice(0, 20).map((p: { id: string; title: string; skill_tags?: string[]; priority?: number }) =>
      `- ID:${p.id} "${p.title}" スキル:[${(p.skill_tags ?? []).join(',')}] P${p.priority ?? 3}`
    ).join('\n');
    const workersSummary = workers.map((w: { id: string; name: string; active_count?: number; skill_tree?: { skills?: Record<string, { level: number }> } }) =>
      `- ID:${w.id} ${w.name} 稼働中:${w.active_count ?? 0}件 スキル:[${Object.keys(w.skill_tree?.skills ?? {}).join(',')}]`
    ).join('\n');

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `あなたはプロジェクトマネージャーです。以下のピースを担当者に最適割り当てしてください。

## ピース候補
${piecesSummary}

## 担当者（現在の稼働数・スキル）
${workersSummary}

## 割り当てルール
1. スキルタグが一致する担当者を優先
2. 稼働数が少ない担当者を優先（負荷分散）
3. 全担当者に均等に分配

以下のJSON配列のみ返してください（説明不要）:
[{"piece_id":"ID","worker_id":"ID","reason":"一言理由"}]`,
      }],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      const assignments = ruleBasedAssign(pieces, workers);
      res.json({ assignments, source: 'rule-based-fallback' });
      return;
    }
    const assignments = JSON.parse(jsonMatch[0]);
    res.json({ assignments, source: 'ai' });
  } catch (e: unknown) {
    // AI失敗時はルールベースにフォールバック
    const assignments = ruleBasedAssign(pieces, workers);
    res.json({ assignments, source: 'rule-based-fallback', error: String(e) });
  }
});

// ─── ルールベース割り当て（AIのフォールバック）────────────────────────────
function ruleBasedAssign(
  pieces: { id: string; skill_tags?: string[] }[],
  workers: { id: string; active_count?: number; skill_tree?: { skills?: Record<string, unknown> } }[]
): { piece_id: string; worker_id: string; reason: string }[] {
  const workload: Record<string, number> = {};
  for (const w of workers) workload[w.id] = w.active_count ?? 0;

  return pieces.map(piece => {
    // スキル一致スコア計算
    const scores = workers.map(w => {
      const workerSkills = Object.keys(w.skill_tree?.skills ?? {});
      const match = (piece.skill_tags ?? []).filter(t => workerSkills.includes(t)).length;
      const load = workload[w.id] ?? 0;
      return { id: w.id, score: match * 3 - load };
    });
    scores.sort((a, b) => b.score - a.score);
    const winner = scores[0];
    workload[winner.id] = (workload[winner.id] ?? 0) + 1;
    return {
      piece_id: piece.id,
      worker_id: winner.id,
      reason: 'スキル一致・負荷分散',
    };
  });
}

export default router;
