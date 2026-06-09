import { pool } from '../db';

interface SkillEntry {
  level: number;
  pieces_done: number;
  avg_rating: number;
}

interface SkillTree {
  skills: Record<string, SkillEntry>;
  total_pieces_done: number;
  overall_rating: number;
  badges: string[];
}

// Pieces needed to reach each level
const LEVEL_THRESHOLDS = [0, 1, 3, 7, 15, 30];

function computeLevel(pieces_done: number): number {
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (pieces_done >= LEVEL_THRESHOLDS[i]) level = i;
  }
  return Math.min(level, 5);
}

export async function updateSkillTreeOnPieceDone(
  assigneeId: string,
  skillTags: string[]
): Promise<{ leveled_up: boolean; category: string | null }> {
  if (!assigneeId || !skillTags.length) return { leveled_up: false, category: null };

  const { rows: [user] } = await pool.query(
    `SELECT skill_tree, total_pieces_done FROM users WHERE id = $1`,
    [assigneeId]
  );
  if (!user) return { leveled_up: false, category: null };

  const tree: SkillTree = user.skill_tree || {
    skills: {}, total_pieces_done: 0, overall_rating: 0, badges: [],
  };

  let leveledUpCategory: string | null = null;

  for (const tag of skillTags) {
    if (!tag) continue;
    const entry: SkillEntry = tree.skills[tag] || { level: 0, pieces_done: 0, avg_rating: 0 };
    const prevLevel = entry.level;
    entry.pieces_done += 1;
    entry.level = computeLevel(entry.pieces_done);
    tree.skills[tag] = entry;
    if (entry.level > prevLevel && !leveledUpCategory) {
      leveledUpCategory = tag;
    }
  }

  tree.total_pieces_done = (tree.total_pieces_done || 0) + 1;

  // Update badges
  const totalDone = tree.total_pieces_done;
  const BADGE_MILESTONES: [number, string][] = [
    [1, 'first_piece'], [10, 'ten_pieces'], [50, 'fifty_pieces'], [100, 'century'],
  ];
  for (const [threshold, badge] of BADGE_MILESTONES) {
    if (totalDone >= threshold && !tree.badges.includes(badge)) {
      tree.badges.push(badge);
    }
  }

  await pool.query(
    `UPDATE users SET skill_tree = $1, total_pieces_done = $2 WHERE id = $3`,
    [JSON.stringify(tree), tree.total_pieces_done, assigneeId]
  );

  return { leveled_up: !!leveledUpCategory, category: leveledUpCategory };
}
