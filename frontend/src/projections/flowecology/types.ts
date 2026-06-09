/**
 * FlowEcology types
 *
 * friction / reentry / continuity / environment の統合型定義。
 * Worker に見せる情報と、内部診断を明確に分離する。
 *
 * 禁止:
 * - Worker に frictionLevel / continuityState / environmentMode を見せない
 * - brain score / focus score / productivity score
 * - 数値負荷表示
 */

import type { CognitiveFlowState } from '../flowstate/types';
import type { NarrativeMomentum } from '../narrative/types';

export type { CognitiveFlowState, NarrativeMomentum };

// ── Shared Primitive Types ────────────────────────────────────────────────────

export type FrictionType =
  | 'ambiguity'
  | 'waiting'
  | 'rework'
  | 'ownership'
  | 'dependency'
  | 'context_gap';

export type FrictionLevel  = 'low' | 'medium' | 'high' | 'critical';
export type ReentryCost    = 'low' | 'medium' | 'high';

export type ReentryMode    = 'quick' | 'review' | 'reset';
export type DecayLevel     = 'full' | 'summary' | 'pattern';

export type ContinuityState =
  | 'immersed'
  | 'stable'
  | 'fragmented'
  | 'scattered'
  | 'overloaded';

export type EnvironmentMode =
  | 'open'
  | 'focused'
  | 'protected'
  | 'recovery'
  | 'shelter';

export type SuppressedElement =
  | 'growth_candidates'
  | 'narrative_events'
  | 'repair_shelf'
  | 'context_rail'
  | 'tertiary_layer'
  | 'edge_animations'
  | 'handoff_suggestions'
  | 'exploration_ui'
  | 'peripheral_content';

/**
 * 再突入時に確認すべき未完了の問題。最大2件。
 */
export interface UnresolvedThread {
  kind:    'blocker' | 'uncertainty' | 'caution' | 'open_issue';
  body:    string;
  urgency: 'high' | 'medium' | 'low';
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface NarrativeEventSlim {
  kind:      string;
  timestamp: string;
  from?:     string | null;
  to?:       string | null;
  reason?:   string | null;
}

export interface ResidueNoteSlim {
  type:       string;
  body:       string;
  created_at: string;
}

export interface FlowEcologyInput {
  // ── Narrative 由来 ────────────────────────────────────────────
  events:    NarrativeEventSlim[];
  headline:  string;
  openIssues: string[];
  momentum:  NarrativeMomentum;
  residue:   ResidueNoteSlim[];

  // ── FlowState 由来 ────────────────────────────────────────────
  flowState:         CognitiveFlowState;
  contextSwitchLoad: number;
  interruptionRisk:  number;
  focusIntegrity:    number;

  // ── CognitivePressure 由来 ────────────────────────────────────
  quietMode: boolean;

  // ── Workshop/Meta ─────────────────────────────────────────────
  staleDays:           number;
  repairCount:         number;
  heroTitle:           string | null;
  /** useFlowState の lastRecoveryAt の ms タイムスタンプ */
  lastRecoveryAt:      number | null;
  now:                 number;
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface FlowEcologyProjection {
  // ── Worker に見せる情報 ───────────────────────────────────────
  /** 再開点。1文。「〇〇から再開」 */
  restartPoint:      string;
  /** 次に取るべき1歩 */
  nextLikelyAction:  string;
  /** 未解決の糸口。最大2件 */
  unresolvedThreads: UnresolvedThread[];
  /** 再突入モード */
  reentryMode:       ReentryMode;
  /** イベント表示の decay レベル */
  decayLevel:        DecayLevel;

  // ── 環境制御 ─────────────────────────────────────────────────
  /**
   * Workshop renderer に返す最小の環境ヒント。
   *
   * 注意: これは純粋な piece-level ではない。
   * deriveEnvironmentMode() は piece state (frictionLevel, reentryCost) だけでなく
   * session state (flowState, contextSwitchLoad) や workshop state (quietMode, repairCount) も参照する。
   *
   * しかしこの合成ロジックを WorkshopPage 側に移すと、
   * `if (quietMode && reentryCost==='high' && ...)` のような条件が renderer に漏れ出す。
   * それはより悪い leaky abstraction になる。
   *
   * FlowEcology は "piece-centered UI ecology" として、
   * piece 起点で合成した状態を renderer hint として返す役割を担う。
   * suppression / emphasis の具体的な表示制御は WorkshopPage 側が持つ。
   *
   * 禁止: この下に visibilityBudget / suppressedElements のような
   * renderer component 語彙を持つフィールドを追加しない。
   */
  environmentMode:    EnvironmentMode;
  suppressedElements: SuppressedElement[];
  interruptionShield: boolean;

  // ── 内部診断（Worker に見せない） ────────────────────────────
  diagnostics: {
    frictionLevel:   FrictionLevel;
    frictionTypes:   FrictionType[];
    continuityState: ContinuityState;
    reentryCost:     ReentryCost;
    contextGap:      boolean;
    activeThread:    string;
    environmentalPressure: 'none' | 'low' | 'medium' | 'high';
  };
}
