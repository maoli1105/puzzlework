/**
 * Repair Projection types
 *
 * 「何を捨てるか・何を修復するか」
 */

export type StopReason =
  | 'no_progress'      // 14日以上 in_progress で前進なし
  | 'no_downstream'    // 下流が存在しない孤立ピース
  | 'blocked_chain'    // 上流が locked → 連鎖詰まり
  | 'unassigned_long'; // 14日以上 unassigned

export interface StopCandidate {
  pieceId:    string;
  pieceTitle: string;
  reason:     StopReason;
  /** 重大度: 0–1。高いほど「今すぐ判断が必要」 */
  severity:   number;
}

export interface RepairLoop {
  /** 繰り返し locked に戻っているピース ID */
  pieceId:     string;
  pieceTitle:  string;
  /** 推定修復回数（piece_logs なしでは status 反転数で近似） */
  cycleCount:  number;
}

export interface RepairProjection {
  /** 捨てることを検討すべきピース一覧。severity 降順。 */
  stopCandidates: StopCandidate[];
  /**
   * 修復ループ: 繰り返し詰まっているピース。
   * 現状 piece_logs が未集計の場合は空配列。
   */
  repairLoops:    RepairLoop[];
  /** 崩壊リスク: isolated + locked が多い worker ID 一覧 */
  collapseRisk:   string[];
}
