/**
 * Workspace Identity System
 * ─────────────────────────
 * 会社の業種・規模・働き方が空間構造に滲み出る。
 *
 * 同じUIでも「SaaS工房」と「製造工房」は
 * 密度・温度・接続性・通路の見え方が変わる。
 *
 * 5秒で「この会社っぽい」が感じられること。
 */

export type ArchetypeId =
  | 'saas'
  | 'web'
  | 'ec'
  | 'manufacturing'
  | 'small'
  | 'unknown';

export interface WorkspaceIdentity {
  archetype: ArchetypeId;

  // ── Layout ──────────────────────────────────────────────────────
  /** ピース間スペーシングの倍率 (1.0 = デフォルト) */
  nodeSpacingMult:   number;
  /** 島（プロジェクト）間ギャップの倍率 */
  islandSpacingMult: number;

  // ── Atmosphere ──────────────────────────────────────────────────
  /** 背景色の色相シフト（+: 暖色側, -: 寒色側） */
  atmosphereHueShift: number;
  /** warmth スコアへのバイアス補正 */
  warmthBias:        number;

  // ── Flow / Edges ─────────────────────────────────────────────────
  /** コリドートレースの視覚的な強さ倍率 */
  corridorProminence: number;
  /** active エッジの「生き生き感」倍率 */
  edgeVitality:      number;
  /** stale エッジの退色強度倍率 */
  staleFadeMult:     number;
}

const DEFAULT: WorkspaceIdentity = {
  archetype:          'unknown',
  nodeSpacingMult:    1.0,
  islandSpacingMult:  1.0,
  atmosphereHueShift: 0,
  warmthBias:         0,
  corridorProminence: 1.0,
  edgeVitality:       1.0,
  staleFadeMult:      1.0,
};

const IDENTITIES: Record<ArchetypeId, WorkspaceIdentity> = {
  unknown: DEFAULT,

  /**
   * SaaS開発工房
   * ─ スプリント中心の密集構造
   * ─ チーム横断コリドーが命綱
   * ─ 修復前後のコントラストが最も鮮明
   */
  saas: {
    ...DEFAULT,
    archetype:          'saas',
    nodeSpacingMult:    0.80,   // 密集 — チームは近い
    islandSpacingMult:  0.75,   // 島も近い — 境界が曖昧
    atmosphereHueShift: 8,      // 少し暖かみ（活発な開発文化）
    warmthBias:         5,
    corridorProminence: 2.0,    // コリドーが一番の語り部
    edgeVitality:       1.4,
    staleFadeMult:      1.3,
  },

  /**
   * Web制作工房
   * ─ 各クライアントが孤立した島
   * ─ 案件間の接点は少ないが、あれば重要
   * ─ 停滞案件が視覚的に際立つ
   */
  web: {
    ...DEFAULT,
    archetype:          'web',
    nodeSpacingMult:    1.0,
    islandSpacingMult:  1.6,    // 島は遠い — 案件ごとに独立した世界
    atmosphereHueShift: -5,     // やや冷たい（プロフェッショナル）
    warmthBias:         -5,
    corridorProminence: 1.2,
    edgeVitality:       1.0,
    staleFadeMult:      1.5,    // 停滞案件は深く褪色する
  },

  /**
   * EC運営工房
   * ─ セール施策が季節的に沸騰する
   * ─ 熱い室と冷えた室の温度差が激しい
   * ─ 流れが切れると一気に崩れる
   */
  ec: {
    ...DEFAULT,
    archetype:          'ec',
    nodeSpacingMult:    0.85,   // タイトな配置（全員が同じ目標を向く）
    islandSpacingMult:  0.90,
    atmosphereHueShift: 18,     // セール熱（オレンジ側）
    warmthBias:         10,
    corridorProminence: 1.8,
    edgeVitality:       1.6,    // 流れが見える
    staleFadeMult:      2.0,    // 放置されると急速に褪せる
  },

  /**
   * 製造工房
   * ─ 設計→製造→品質の横長シーケンス
   * ─ 長い連鎖が途切れると全体が止まる
   * ─ 重厚な停滞感
   */
  manufacturing: {
    ...DEFAULT,
    archetype:          'manufacturing',
    nodeSpacingMult:    1.15,   // 余白あり（工程間にゆとり）
    islandSpacingMult:  1.3,
    atmosphereHueShift: -12,    // クールグレー（工業的精密さ）
    warmthBias:         -8,
    corridorProminence: 1.5,    // 工程間コリドーは太く
    edgeVitality:       0.8,    // 流れは静かで力強い
    staleFadeMult:      1.8,
  },

  /**
   * 小規模工房（5人）
   * ─ 全員が複数プロジェクトに掛け持ち
   * ─ 境界は曖昧、通路は密
   * ─ 停滞しても消えない — 負担として残る
   */
  small: {
    ...DEFAULT,
    archetype:          'small',
    nodeSpacingMult:    0.75,   // 最密 — 5人が全部に関わる
    islandSpacingMult:  0.65,   // 島の境界が溶ける
    atmosphereHueShift: 5,      // 人肌の暖かさ
    warmthBias:         3,
    corridorProminence: 2.5,    // 掛け持ちコリドーが最も密
    edgeVitality:       1.2,
    staleFadeMult:      0.8,    // 停滞は消えず残る（見えない負荷として）
  },
};

export function getIdentity(archetype: ArchetypeId): WorkspaceIdentity {
  return IDENTITIES[archetype] ?? DEFAULT;
}

/**
 * プロジェクト名一覧からアーキタイプを推定する。
 * demo.ts の current 検出と同じロジック。
 */
export function detectArchetype(projectNames: string[]): ArchetypeId {
  if (projectNames.some(n =>
    n.includes('Sprint') || n.includes('インフラ') || n.includes('マーケティング連携')))
    return 'saas';
  if (projectNames.some(n =>
    n.includes('クライアントA') || n.includes('クライアントB') ||
    n.includes('クライアントC') || n.includes('クライアントD')))
    return 'web';
  if (projectNames.some(n =>
    n.includes('セール') || n.includes('EC') || n.includes('出品')))
    return 'ec';
  if (projectNames.some(n =>
    n.includes('製品') || n.includes('量産') || n.includes('製造') ||
    n.includes('試作') || n.includes('設備')))
    return 'manufacturing';
  if (projectNames.some(n =>
    n.includes('クライアントX') || n.includes('クライアントY') ||
    n.includes('クライアントZ')))
    return 'small';
  return 'unknown';
}
