import { Router, Response } from 'express';
import { authenticate, requireAdmin, requirePlan, AuthRequest } from '../middleware/auth';
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

/**
 * POST /api/ai/parse-pieces  [Pro以上限定]
 * 自然言語テキスト（Slack・議事録など）からピース一覧を抽出する
 */
router.post(
  '/parse-pieces',
  requireAdmin,
  requirePlan('pro'),
  async (req: AuthRequest, res: Response) => {
    const { text, project_names } = req.body as {
      text?: string;
      project_names?: string[];
    };

    if (!text?.trim() || text.trim().length < 10) {
      res.status(400).json({ error: 'テキストが短すぎます（10文字以上）' });
      return;
    }
    if (text.length > 8000) {
      res.status(400).json({ error: 'テキストが長すぎます（8000文字以内）' });
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const projectsHint = project_names?.length
      ? `\n利用可能なプロジェクト名: ${project_names.join(', ')}`
      : '';

    const prompt = `あなたはプロジェクト管理の専門家です。
以下のテキスト（Slackメッセージ・議事録・メモなど）からタスク・アクションアイテムを抽出し、JSON配列で返してください。

テキスト:
"""
${text.trim()}
"""

今日の日付: ${today}${projectsHint}

抽出ルール:
- アクションアイテム・TODO・依頼・タスクをすべて抽出する
- 担当者名が書いてあれば assignee_hint に入れる（姓だけでも可）
- 期限・日付が書いてあれば due_date に YYYY-MM-DD 形式で入れる
- プロジェクト名が推定できれば project_name に入れる（利用可能なプロジェクト名から選ぶ）
- タスクが存在しない場合は空配列を返す

必ず以下のJSON形式のみを返す（他のテキスト・Markdownコードブロック不要）:
{
  "pieces": [
    {
      "title": "タスクタイトル（簡潔に20文字以内）",
      "objective": "目的・内容の補足説明（省略可、1文）",
      "status": "ready",
      "due_date": "YYYY-MM-DD または null",
      "assignee_hint": "担当者の名前（省略可）",
      "project_name": "プロジェクト名（省略可）",
      "priority": 3,
      "skill_tags": ["関連スキル（省略可）"]
    }
  ]
}`;

    try {
      const message = await getClient().messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = (message.content[0] as { type: string; text: string }).text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: 'AI応答のパースに失敗しました', raw });
        return;
      }

      const parsed = JSON.parse(jsonMatch[0]) as { pieces: unknown[] };
      if (!Array.isArray(parsed.pieces)) {
        res.status(500).json({ error: '解析結果が不正です' });
        return;
      }

      res.json({ pieces: parsed.pieces, model: 'claude-haiku-4-5' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  }
);

/**
 * POST /api/ai/suggest-project-structure
 * プロジェクト名・説明から全体構成を自動生成する
 *
 * ① 自社の velocity_log からスキル別平均完了日数を収集
 * ② 類似テンプレートをキーワードマッチで検索
 * ③ Claude にコンテキストを与えてピース構成を生成
 * ④ ANTHROPIC_API_KEY 未設定時はテンプレートマッチ or フォールバック
 */
router.post('/suggest-project-structure', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, description = '' } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name は必須です' }); return; }

  const company_id = req.user!.company_id;

  try {
    // ① 自社スキル別平均完了日数
    const { rows: velocityRows } = await (await import('../db')).pool.query(
      `SELECT unnest(skill_tags) AS tag, AVG(actual_days)::numeric(6,1) AS avg_days, COUNT(*)::int AS done_count
       FROM piece_velocity_log
       WHERE company_id = $1
       GROUP BY tag
       ORDER BY done_count DESC
       LIMIT 20`,
      [company_id]
    );

    // ② 類似テンプレート（キーワードマッチ）
    const keywords = name.trim().toLowerCase().split(/[\s　]+/).filter(k => k.length >= 2);
    const { rows: templates } = await (await import('../db')).pool.query(
      `SELECT name, structure FROM project_templates
       WHERE company_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [company_id]
    );
    const similar = templates.filter((t: { name: string }) =>
      keywords.some(kw => t.name.toLowerCase().includes(kw))
    );

    const skillContext = velocityRows.length > 0
      ? velocityRows.map((r: any) => `${r.tag}(平均${r.avg_days}日・${r.done_count}件実績)`).join(', ')
      : '実績データなし';

    const templateHint = similar.length > 0 ? `
過去の類似プロジェクト「${similar[0].name}」の構成参考:
${JSON.stringify((similar[0].structure as any).pieces?.slice(0, 6).map((p: any) => p.title) ?? [], null, 2)}` : '';

    // ANTHROPIC_API_KEY 未設定 → テンプレートフォールバック
    if (!process.env.ANTHROPIC_API_KEY) {
      if (similar.length > 0) {
        const tmpl = similar[0].structure as any;
        const pieces = (tmpl.pieces ?? []).slice(0, 10).map((p: any, i: number) => ({
          index:          i,
          title:          p.title,
          objective:      p.description ?? '',
          skill_tags:     p.skill_tags ?? [],
          estimated_days: p.estimated_days ?? 3,
          priority:       p.priority ?? 3,
          depends_on:     i > 0 ? [i - 1] : [],
        }));
        res.json({ pieces, source: 'template', template_name: similar[0].name });
        return;
      }
      // フォールバック: 汎用5ステップ
      res.json({
        pieces: [
          { index: 0, title: '要件定義', objective: '', skill_tags: ['ops'], estimated_days: 3, priority: 5, depends_on: [] },
          { index: 1, title: '設計', objective: '', skill_tags: [], estimated_days: 3, priority: 4, depends_on: [0] },
          { index: 2, title: '実装', objective: '', skill_tags: [], estimated_days: 5, priority: 4, depends_on: [1] },
          { index: 3, title: 'テスト', objective: '', skill_tags: [], estimated_days: 3, priority: 3, depends_on: [2] },
          { index: 4, title: 'リリース', objective: '', skill_tags: [], estimated_days: 1, priority: 3, depends_on: [3] },
        ],
        source: 'fallback',
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `あなたはプロジェクト管理の専門家です。以下のプロジェクトに必要なタスク構成を提案してください。

プロジェクト名: "${name.trim()}"
${description.trim() ? `概要: "${description.trim()}"` : ''}
今日の日付: ${today}

自社のスキル別平均完了日数（参考）:
${skillContext}
${templateHint}

以下のJSON形式のみで返してください（他のテキスト不要）:
{
  "pieces": [
    {
      "index": 0,
      "title": "タスクタイトル（15文字以内・具体的に）",
      "objective": "このタスクの目的・完了条件（1文・日本語）",
      "skill_tags": ["スキル名"],
      "estimated_days": 推定日数（整数・上記の平均実績を参考に現実的な値），
      "priority": 1〜5（5が最高），
      "depends_on": [先行タスクのindex番号（なければ空配列）]
    }
  ]
}

ルール:
- タスクは6〜12件程度
- skill_tagsは上記の自社実績スキルから選ぶこと（複数可・最大3つ）
- estimated_daysは上記の平均実績日数を参考に設定すること
- depends_onで現実的な依存関係を表現すること（並行作業は別のタスクにつながらなくてよい）
- priorityは後続タスクが詰まると全体に影響するものを高く設定`;

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: 'AI応答のパースに失敗しました', raw }); return; }

    const parsed = JSON.parse(jsonMatch[0]) as { pieces: unknown[] };
    if (!Array.isArray(parsed.pieces)) { res.status(500).json({ error: '解析結果が不正です' }); return; }

    res.json({ pieces: parsed.pieces, source: 'ai', model: 'claude-haiku-4-5' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'AI提案に失敗しました', detail: msg });
  }
});

export default router;
