/**
 * Flow State Architecture types
 *
 * Worker の「没入・集中・思考連続性」を保護する。
 * 数値スコアを UI に表示しない。
 * 環境が静かに変わる。
 */

/**
 * Worker の認知流動状態。
 * 5 states — ユーザーには見せない。
 */
export type CognitiveFlowState =
  | 'entering'    // 作業開始直後 / context load 中
  | 'flowing'     // 没入中 — 邪魔しない
  | 'fractured'   // 思考分断 — 次行動1つに圧縮
  | 'exhausted'   // 高負荷疲弊 — 追い込まない
  | 'recovering'; // 修復後 — 流れを取り戻す途中

/**
 * Flow Projection — computeFlowState() の出力。
 * 数値は UI に出さない。内部制御のみ。
 */
export interface FlowStateProjection {
  state:             CognitiveFlowState;
  /** 割り込みリスク 0–1。CollapseWrapper の threshold に使う */
  interruptionRisk:  number;
  /** コンテキスト切り替え負荷 0–1 */
  contextSwitchLoad: number;
  /** 集中の連続性 0–1。高いほど flowing に近い */
  focusIntegrity:    number;
}

/**
 * FlowState から導出する UI ディレクティブ。
 * WorkshopPage はこれだけを見る。
 */
export interface FlowUIDirective {
  /** tertiary layer を完全非表示 */
  tertiaryHidden:    boolean;
  /** CSS animation を止める（ws-shimmer 等） */
  animationsEnabled: boolean;
  /** Hero 以外のコンテンツの opacity 乗数 */
  peripheralOpacity: number;
  /** Hero カードの追加 border-width px（0 | 1 | 2 | 4） */
  heroEmphasis:      number;
  /** Narrative Feed をデフォルト展開するか */
  narrativeExpanded: boolean;
  /** 自動リフレッシュを抑制（flowing 中は poll しない）*/
  suppressRefresh:   boolean;
}

/** WorkshopPage がフック経由で送る session イベント */
export type FlowSignal =
  | { type: 'hero_change';       projectId: string | null }
  | { type: 'progress_update';   value: number }
  | { type: 'handoff_done' }
  | { type: 'blocker_resolved' }
  | { type: 'layer_interact';    layer: string };
