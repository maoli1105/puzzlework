/**
 * Temporal Projection types
 *
 * 時間を「数字」で見せない。「空気」で感じさせる。
 */

export interface TemporalProjection {
  /**
   * deadlineGravity per piece: 0–1
   * 0 = 締切なし/完了済み
   * 1 = 今日締切または超過
   * 数式: daysLeft <= 0 → 1.0 / else → max(0.15, 1 - daysLeft/30)
   */
  gravityMap: Record<string, number>;

  /**
   * criticalPath per piece: downstream 数 × 深度
   * 高いほど「ここが止まると全部止まる」
   */
  criticalityMap: Record<string, number>;

  /**
   * futureResidue per piece: 0–∞
   * blockedDependents × 0.15 + staleDays × 0.02 + repairCount × 0.10
   * 0.5 超で「後方に残像」を出す
   */
  residueMap: Record<string, number>;

  /**
   * temporalCompression per project
   * requiredRate / completionRate
   * 1.4 超 = 「時間が詰まっている」
   */
  compressionMap: Record<string, number>;

  /**
   * throughput per project: 0–1
   * completedEdges / totalEdges
   * 高 = 流れている / 低 = 詰まっている
   */
  throughputMap: Record<string, number>;
}
