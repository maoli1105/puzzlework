/**
 * Residue Projection types
 *
 * Context Residue — 仕事の「文脈の残り香」を保存・投影する。
 * チャットではない。通知でもない。
 * 次の担当者が「なぜここまで来たか」を読める、最低限の記憶。
 */

export type ResidueType =
  | 'blocker'      // 止まっていた理由
  | 'insight'      // 作業中に気づいたこと
  | 'caution'      // 次の人への注意点
  | 'handoff'      // 引き継ぎメモ
  | 'uncertainty'  // 決まっていないこと
  | 'decision';    // なぜこうしたか

export interface ResidueNote {
  id:         string;
  piece_id:   string;
  author_id:  string | null;
  type:       ResidueType;
  body:       string;
  created_at: string; // ISO 8601
}

/**
 * computeResidueProjection() の出力。
 * 数値は UI に出さない。
 */
export interface ResidueProjection {
  /** 最新の handoff + decision + insight を圧縮した文脈要約（最大3件） */
  compressedContext: ResidueNote[];
  /** 未解決の blocker / uncertainty（caution 含む） */
  unresolvedResidue: ResidueNote[];
  /** 注意レベル: none / low / high */
  cautionLevel: 'none' | 'low' | 'high';
  /** handoff メモが存在するか（次の人への引き継ぎ準備度） */
  handoffClarity: 'none' | 'partial' | 'clear';
  /** 全件（UI の展開時に使う） */
  all: ResidueNote[];
}
