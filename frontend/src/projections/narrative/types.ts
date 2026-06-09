/**
 * Narrative Projection types
 *
 * 「なぜこうなったか」を piece_logs から意味圧縮して返す。
 * AI 不要。単純集約。
 */

export type NarrativeEventKind =
  | 'status_changed'
  | 'assigned'
  | 'connected'
  | 'blocker_reported'
  | 'field_updated'
  | 'auto_promoted'
  | 'published'
  | 'marketplace_accepted';

export interface NarrativeEvent {
  id:         string;
  kind:       NarrativeEventKind;
  /** 変更を行ったユーザー名 */
  actorName:  string | null;
  /** 変更前の値（status_changed なら 'locked' など） */
  from:       string | null;
  /** 変更後の値 */
  to:         string | null;
  /** 任意の理由・文脈メモ (piece_logs.reason) */
  reason:     string | null;
  timestamp:  string; // ISO8601
}

/** 仕事の勢い。forward=前進中 / blocked=詰まり / cycling=往復 / idle=停止 */
export type NarrativeMomentum = 'forward' | 'blocked' | 'cycling' | 'idle';

export interface NarrativeSummary {
  /** 現在の状態を一文で表す。例: "田中が3日前に引き取り、昨日着手した" */
  headline:    string;
  /** 未解決の問題一覧。例: "下流2枚が locked" */
  openIssues:  string[];
  /** 繰り返しパターン。例: "locked → in_progress を3回繰り返している" */
  patterns:    string[];
  /** 仕事の勢い（Cognitive Pressure Engine が使用する） */
  momentum:    NarrativeMomentum;
}

/** narrative API から返ってくる residue の圧縮表現 */
export interface NarrativeResidueItem {
  type:       string;
  body:       string;
  created_at: string;
}

export interface NarrativeProjection {
  pieceId:  string;
  events:   NarrativeEvent[];
  summary:  NarrativeSummary;
  /** 文脈の残り香（最大10件、新しい順） */
  residue:  NarrativeResidueItem[];
  loading:  boolean;
  error:    string | null;
}
