/**
 * Cognitive Pressure types
 *
 * 「何を消すか」「何を黙らせるか」を計算する。
 * 情報を追加しない。迷いを除去する。
 */

export type LayerName =
  | 'hero'
  | 'contextRail'
  | 'repair'
  | 'narrative'
  | 'growth'
  | 'handoff'
  | 'queue';

/** visible: 全表示 / collapsed: 折り畳み（1行サマリー） / hidden: DOM から除去 */
export type CollapseState = 'visible' | 'collapsed' | 'hidden';

/** primary: 全不透明・動作あり / secondary: opacity 0.72 / tertiary: hover のみ開示 */
export type AttentionTier = 'primary' | 'secondary' | 'tertiary';

/**
 * 今この瞬間にとるべき主行動。
 * Hero を前進させることが目的。
 */
export type DominantAction =
  | 'start'     // Hero が ready → 着手する
  | 'progress'  // Hero が in_progress かつ進捗 < 80%
  | 'done'      // Hero が in_progress かつ進捗 ≥ 80% → 渡す
  | 'unblock'   // Hero が locked か Repair 優先 → ブロック解除
  | 'rest';     // 全完了 or 割当なし

export interface CognitivePressure {
  /** 今の最優先行動 */
  dominantAction:     DominantAction;
  /** 各 Layer の表示状態 */
  collapseState:      Record<LayerName, CollapseState>;
  /** 各 Layer の注意段階 */
  attentionTier:      Record<LayerName, AttentionTier>;
  /** 各 Layer の重み 0–1（opacity / size 計算用） */
  attentionWeightMap: Record<LayerName, number>;
  /**
   * 高負荷状態。
   * true のとき: Growth 折り畳み、animation 停止、ambient 効果削減。
   */
  quietMode:          boolean;
}
