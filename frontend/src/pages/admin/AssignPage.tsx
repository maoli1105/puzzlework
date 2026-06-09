/**
 * AssignPage — AI自動アサイン提案
 *
 * 未割当タスクを一覧し、スキル×速度×負荷×空き状況で
 * 最適な担当者を提案する。ワンクリックで確定できる。
 *
 * スコアリング内訳:
 *  skillScore (0-35) : 該当スキルの完了実績数・種類
 *  speedScore (0-30) : 全社平均比の完了速度
 *  loadScore  (0-25) : アクティブタスク数の少なさ
 *  availScore (0-10) : 直近7日の休暇なし
 */
import { useState, useEffect, useCallback } from 'react';
import { users as usersApi, pieces as piecesApi, BulkSuggestion } from '../../services/api';
import {
  Sparkles, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, Users, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function isOverdue(d: string | null) {
  return !!d && new Date(d) < new Date();
}

function scoreColor(s: number) {
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#B46400';
  if (s >= 40) return '#E67000';
  return '#94a3b8';
}

const STATUS_LABEL: Record<string, string> = { ready: '着手可', locked: 'ロック', in_progress: '進行中' };
const STATUS_COL:   Record<string, string> = { ready: '#22c55e', locked: '#94a3b8', in_progress: '#B46400' };

// ─── スコアゲージ ────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const col = scoreColor(score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: `3px solid ${col}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 14, color: col,
        background: col + '12',
      }}>
        {score}
      </div>
      <div style={{ fontSize: 9, color: col, fontWeight: 600 }}>
        {score >= 80 ? '推奨' : score >= 60 ? '適正' : score >= 40 ? '可' : '低'}
      </div>
    </div>
  );
}

// ─── スコア内訳バー ──────────────────────────────────────────────────────────

function BreakdownBar({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>
        <span>{label}</span><span>{val}/{max}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(val / max) * 100}%`, background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

// ─── 担当者候補カード ────────────────────────────────────────────────────────

function CandidateCard({
  candidate, isTop, onAssign, assigning,
}: {
  candidate: BulkSuggestion['top_candidates'][0];
  isTop: boolean;
  onAssign: () => void;
  assigning: boolean;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div style={{
      border: `1px solid ${isTop ? scoreColor(candidate.score) : 'var(--border)'}`,
      borderRadius: 3, padding: '10px 12px',
      background: isTop ? scoreColor(candidate.score) + '08' : 'transparent',
      flex: '1 1 180px', minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <ScoreGauge score={candidate.score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {isTop && <Sparkles size={11} style={{ color: '#B46400', flexShrink: 0 }} />}
            {candidate.worker_name}
            {candidate.on_leave && (
              <span style={{ fontSize: 9, color: '#E67000', border: '1px solid #E67000', borderRadius: 3, padding: '0 4px' }}>休暇予定</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>
            {candidate.reason}
          </div>
          {candidate.matched_tags.length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
              {candidate.matched_tags.map(t => (
                <span key={t} style={{ fontSize: 9, padding: '1px 5px', background: '#B4640022', color: '#B46400', borderRadius: 3, fontWeight: 600 }}>
                  ✓{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={onAssign}
          disabled={assigning}
          style={{
            flex: 1, fontSize: 11, fontWeight: 700, padding: '5px 8px',
            background: assigning ? 'var(--border)' : isTop ? '#B46400' : 'var(--surface)',
            color: assigning ? 'var(--text-4)' : isTop ? '#fff' : 'var(--text-2)',
            border: `1px solid ${isTop ? '#B46400' : 'var(--border)'}`,
            borderRadius: 2, cursor: assigning ? 'default' : 'pointer',
          }}
        >
          {assigning ? '...' : 'アサイン'}
        </button>
        <button
          onClick={() => setShowBreakdown(v => !v)}
          style={{
            fontSize: 10, padding: '5px 6px', background: 'none',
            border: '1px solid var(--border)', borderRadius: 2, cursor: 'pointer',
            color: 'var(--text-4)', display: 'flex', alignItems: 'center',
          }}
        >
          {showBreakdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {showBreakdown && (
        <div style={{ marginTop: 8, padding: '8px 0 0', borderTop: '1px solid var(--border)' }}>
          <BreakdownBar label="スキル一致" val={0} max={35} color="#B46400" />
          <BreakdownBar label="完了速度" val={0} max={30} color="#22c55e" />
          <BreakdownBar label="負荷余裕" val={Math.max(0, 25 - candidate.active_pieces * 5)} max={25} color="#6366f1" />
          <BreakdownBar label="空き状況" val={candidate.on_leave ? 0 : 10} max={10} color="#0ea5e9" />
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>
            現在 {candidate.active_pieces}件担当中
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ピース行 ────────────────────────────────────────────────────────────────

function SuggestionRow({
  suggestion, onAssigned,
}: {
  suggestion: BulkSuggestion;
  onAssigned: (pieceId: string, workerId: string, workerName: string) => void;
}) {
  const [assigned, setAssigned]   = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  async function handleAssign(workerId: string, workerName: string) {
    setAssigning(workerId);
    try {
      await piecesApi.assign(suggestion.piece_id, workerId);
      setAssigned(workerName);
      onAssigned(suggestion.piece_id, workerId, workerName);
    } finally {
      setAssigning(null);
    }
  }

  if (assigned) {
    return (
      <div style={{
        background: '#22c55e11', border: '1px solid #22c55e33',
        borderRadius: 3, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <CheckCircle2 size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{suggestion.piece_title}</div>
          <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>✓ {assigned} にアサインしました</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 3, padding: '14px 18px',
    }}>
      {/* ピース情報 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              {suggestion.piece_title}
            </span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              color: STATUS_COL[suggestion.status], background: STATUS_COL[suggestion.status] + '15',
              fontWeight: 600,
            }}>
              {STATUS_LABEL[suggestion.status] ?? suggestion.status}
            </span>
            {suggestion.project_name && (
              <span style={{ fontSize: 10, color: 'var(--text-4)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 3 }}>
                {suggestion.project_name}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {suggestion.skill_tags.map(t => (
              <span key={t} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-3)' }}>{t}</span>
            ))}
            {suggestion.due_date && (
              <span style={{ fontSize: 11, color: isOverdue(suggestion.due_date) ? '#E60012' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} />
                {isOverdue(suggestion.due_date) ? '⚠️ ' : ''}{fmtDate(suggestion.due_date)}
              </span>
            )}
            {suggestion.business_impact > 0 && (
              <span style={{ fontSize: 10, color: '#B46400', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Zap size={9} />Impact {suggestion.business_impact}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 候補カード */}
      {suggestion.top_candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '8px 0' }}>
          <Users size={12} style={{ marginRight: 4 }} />割当可能なワーカーがいません
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {suggestion.top_candidates.map((c, i) => (
            <CandidateCard
              key={c.worker_id}
              candidate={c}
              isTop={i === 0}
              onAssign={() => handleAssign(c.worker_id, c.worker_name)}
              assigning={assigning === c.worker_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

type FilterMode = 'all' | 'high_priority' | 'overdue' | 'no_match';

export default function AssignPage() {
  const [suggestions, setSuggestions]   = useState<BulkSuggestion[]>([]);
  const [loading, setLoading]           = useState(true);
  const [assigned, setAssigned]         = useState<Set<string>>(new Set());
  const [filter, setFilter]             = useState<FilterMode>('all');
  const [sortBy, setSortBy]             = useState<'priority' | 'due_date' | 'match'>('match');

  const load = useCallback(() => {
    setLoading(true);
    usersApi.bulkSuggest()
      .then(d => setSuggestions(d.suggestions))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAssigned(pieceId: string) {
    setAssigned(prev => new Set([...prev, pieceId]));
  }

  const filtered = suggestions
    .filter(s => {
      if (assigned.has(s.piece_id)) return false;
      if (filter === 'high_priority') return s.priority >= 4;
      if (filter === 'overdue') return isOverdue(s.due_date);
      if (filter === 'no_match') return s.top_candidates[0]?.matched_tags.length === 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return (b.priority ?? 0) - (a.priority ?? 0);
      if (sortBy === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      // sort by top candidate score
      return (b.top_candidates[0]?.score ?? 0) - (a.top_candidates[0]?.score ?? 0);
    });

  const overdueCount   = suggestions.filter(s => isOverdue(s.due_date) && !assigned.has(s.piece_id)).length;
  const highPrioCount  = suggestions.filter(s => s.priority >= 4 && !assigned.has(s.piece_id)).length;
  const noMatchCount   = suggestions.filter(s => s.top_candidates[0]?.matched_tags.length === 0 && !assigned.has(s.piece_id)).length;
  const remainingCount = suggestions.filter(s => !assigned.has(s.piece_id)).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#B46400' }} />
            AI自動アサイン
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            スキル実績 × 完了速度 × 現在の負荷 × 空き状況で最適担当者を提案します
          </p>
        </div>
        <button onClick={load} style={{
          fontSize: 12, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)',
          borderRadius: 3, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <RefreshCw size={12} />再スキャン
        </button>
      </div>

      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: '未割当タスク',   value: remainingCount,         color: 'var(--text-2)', icon: <Users size={13} /> },
          { label: '期限超過',       value: overdueCount,           color: overdueCount > 0 ? '#E60012' : 'var(--text-3)', icon: <AlertTriangle size={13} /> },
          { label: '優先度高',       value: highPrioCount,          color: '#B46400',       icon: <Zap size={13} /> },
          { label: 'スキル不一致',   value: noMatchCount,           color: '#94a3b8',       icon: <Clock size={13} /> },
          { label: '今回アサイン済み', value: assigned.size,          color: '#22c55e',       icon: <CheckCircle2 size={13} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{
            flex: '1 1 130px', minWidth: 110,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 3, padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color, marginBottom: 3 }}>
              {icon}<span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* フィルター + ソート */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            ['all',           `すべて (${remainingCount})`],
            ['high_priority', `優先度高 (${highPrioCount})`],
            ['overdue',       `期限超過 (${overdueCount})`],
            ['no_match',      `スキル不一致 (${noMatchCount})`],
          ] as [FilterMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => setFilter(mode)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
              background: filter === mode ? '#B46400' : 'var(--surface)',
              color: filter === mode ? '#fff' : 'var(--text-3)',
              border: `1px solid ${filter === mode ? '#B46400' : 'var(--border)'}`,
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>ソート:</span>
          {([
            ['match',    'マッチ度'],
            ['priority', '優先度'],
            ['due_date', '期日'],
          ] as [typeof sortBy, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              background: sortBy === key ? '#B46400' : 'transparent',
              color: sortBy === key ? '#fff' : 'var(--text-3)',
              border: `1px solid ${sortBy === key ? '#B46400' : 'var(--border)'}`,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* スコア凡例 */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-4)', marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>スコア:</span>
        {[['80+', '#22c55e', '推奨'], ['60-79', '#B46400', '適正'], ['40-59', '#E67000', '可'], ['<40', '#94a3b8', '低']].map(([range, col, label]) => (
          <span key={range} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, display: 'inline-block' }} />
            {range} {label}
          </span>
        ))}
      </div>

      {/* ローディング */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
          スコアを計算中…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 3,
          color: 'var(--text-3)', fontSize: 13,
        }}>
          {assigned.size > 0
            ? `🎉 このセッションで ${assigned.size}件アサインしました！`
            : '未割当タスクがありません'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(s => (
            <SuggestionRow
              key={s.piece_id}
              suggestion={s}
              onAssigned={(pid) => handleAssigned(pid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
