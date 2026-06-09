/**
 * Human Projection — 誰が何を持ち、誰に聞くか
 *
 * Rule: ReactFlow を import しない。UI state を持たない。返すだけ。
 */

export type LoadState = 'available' | 'busy' | 'deep_focus';

export interface WorkerMetric {
  /** Load Score: 0–1。in_progress/locked/stale/recentDone の加重和。 */
  loadScore:          number;
  /** Available (<0.30) / Busy (0.30–0.65) / Deep Focus (≥0.65) */
  loadState:          LoadState;
  /** 他担当者との cross-worker edge が存在しない = true */
  isIsolated:         boolean;
  /** 最も比率の高いプロジェクト ID */
  topProjectId:       string | null;
  /**
   * Project Composition — D-03「誰がこの文脈を知っているか」
   * 重み: locked=1.2 / in_progress=1.0 / ready=0.5
   * ratio は 0–1 で正規化、降順。
   */
  projectComposition: Array<{ projectId: string; color: string; ratio: number }>;
}

export interface HumanProjection {
  /** ワーカー ID → メトリクス */
  metrics: Record<string, WorkerMetric>;
  /**
   * KCS (Knowledge Concentration Score) per project
   * true = 1人に70%超の知識が集中している
   */
  kcsMap: Record<string, boolean>;
}
