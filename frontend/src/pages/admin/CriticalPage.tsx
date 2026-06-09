/**
 * CriticalPage — クリティカルパス分析
 *
 * プロジェクト内の依存グラフを分析し、
 * 「どのタスクが遅れると全体に影響するか」を可視化する。
 *
 * 表示:
 *  - サマリーバー（合計期間・クリティカル件数・フロートなし率）
 *  - クリティカルチェーン（最長依存チェーンを横スクロールで表示）
 *  - 全タスク一覧（フロート昇順ソート・リスク色付け）
 */
import { useState, useEffect, useCallback } from 'react';
import { pieces as piecesApi, CriticalPiece } from '../../services/api';
import { AlertTriangle, Clock, Zap, GitBranch, RefreshCw, ChevronRight, Users } from 'lucide-react';

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function riskColor(floatDays: number): { bg: string; text: string; label: string } {
  if (floatDays === 0)   return { bg: '#E6001211', text: '#E60012', label: 'クリティカル' };
  if (floatDays <= 2)    return { bg: '#E6700011', text: '#E67000', label: '要注意' };
  if (floatDays <= 5)    return { bg: '#B4640011', text: '#B46400', label: 'やや余裕' };
  return                        { bg: '#22c55e11', text: '#22c55e', label: '余裕あり' };
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: '進行中',
  ready: '着手可',
  locked: 'ロック',
};
const STATUS_COLOR: Record<string, string> = {
  in_progress: '#B46400',
  ready: '#22c55e',
  locked: '#94a3b8',
};

// ─── チェーンビュー ──────────────────────────────────────────────────────────

function ChainCard({ piece, isFirst }: { piece: CriticalPiece; isFirst: boolean }) {
  const risk = riskColor(piece.float);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {!isFirst && (
        <div style={{ display: 'flex', alignItems: 'center', margin: '0 4px' }}>
          <div style={{ width: 20, height: 2, background: '#E60012', opacity: .5 }} />
          <ChevronRight size={12} style={{ color: '#E60012', opacity: .7 }} />
        </div>
      )}
      <div style={{
        background: risk.bg,
        border: `2px solid ${risk.text}`,
        borderRadius: 10, padding: '10px 14px',
        minWidth: 160, maxWidth: 200,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: risk.text,
            background: risk.bg, padding: '1px 6px', borderRadius: 4,
          }}>
            {piece.float === 0 ? <><AlertTriangle size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />CP</> : `猶予${piece.float}日`}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
            {piece.estimated_days}日
          </span>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          lineHeight: 1.3, marginBottom: 6,
        }}>
          {piece.title}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)' }}>
          <span style={{ color: STATUS_COLOR[piece.status] ?? 'var(--text-3)' }}>
            {STATUS_LABEL[piece.status] ?? piece.status}
          </span>
          {piece.assignee_name && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Users size={9} />{piece.assignee_name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── テーブル行 ──────────────────────────────────────────────────────────────

function PieceRow({ piece, rank }: { piece: CriticalPiece; rank: number }) {
  const risk = riskColor(piece.float);
  const hasOverdue = piece.due_date && new Date(piece.due_date) < new Date();
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)', fontWeight: 600, width: 36 }}>
        {rank}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>
          {piece.title}
        </div>
        {piece.skill_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {piece.skill_tags.slice(0, 3).map(t => (
              <span key={t} style={{ fontSize: 9, padding: '1px 5px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-4)' }}>{t}</span>
            ))}
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
          background: risk.bg, color: risk.text,
        }}>
          {piece.float === 0 ? 'CP' : `+${piece.float}日`}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }}>
        ES:{piece.es} → EF:{piece.ef}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
        {piece.estimated_days}日
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontSize: 10, color: STATUS_COLOR[piece.status], fontWeight: 600 }}>
          {STATUS_LABEL[piece.status] ?? piece.status}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: piece.assignee_name ? 'var(--text-2)' : 'var(--text-4)' }}>
        {piece.assignee_name ?? '未割当'}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: hasOverdue ? '#E60012' : 'var(--text-3)' }}>
        {hasOverdue && <AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />}{fmtDate(piece.due_date)}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
        {piece.predecessors.length > 0 && <span title={`${piece.predecessors.length}件の先行`}>←{piece.predecessors.length}</span>}
        {piece.successors.length > 0 && <span title={`${piece.successors.length}件の後続`} style={{ marginLeft: 4 }}>→{piece.successors.length}</span>}
      </td>
    </tr>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

type FilterMode = 'all' | 'critical' | 'near' | 'isolated';

export default function CriticalPage() {
  const [data, setData] = useState<{
    pieces: CriticalPiece[];
    total_duration: number;
    critical_count: number;
    critical_chain: string[];
    isolated_count: number;
  } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<FilterMode>('all');
  const [sortBy, setSortBy]     = useState<'float' | 'ef' | 'impact'>('float');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    piecesApi.getCriticalPath()
      .then(setData)
      .catch((e) => setError(e?.response?.data?.error ?? 'データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      クリティカルパスを計算中…
    </div>
  );
  if (error) return (
    <div style={{ padding: 24 }}>
      <div style={{ padding: '12px 16px', background: '#E6001211', border: '1px solid #E6001244', borderRadius: 8, fontSize: 13, color: '#E60012', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertTriangle size={14} />{error}
      </div>
      <button onClick={load} style={{ fontSize: 12, padding: '6px 14px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        再試行
      </button>
    </div>
  );
  if (!data) return <div style={{ padding: 24, color: 'var(--text-3)' }}>データなし</div>;

  const pieceMap = Object.fromEntries(data.pieces.map(p => [p.id, p]));
  const chainPieces = data.critical_chain.map(id => pieceMap[id]).filter(Boolean);

  const criticalRate = data.pieces.length > 0
    ? Math.round((data.critical_count / data.pieces.length) * 100)
    : 0;

  // フィルタリング + ソート
  const filtered = data.pieces
    .filter(p => {
      if (filter === 'critical')  return p.float === 0;
      if (filter === 'near')      return p.float > 0 && p.float <= 3;
      if (filter === 'isolated')  return p.predecessors.length === 0 && p.successors.length === 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'float')  return a.float - b.float;
      if (sortBy === 'ef')     return a.ef - b.ef;
      if (sortBy === 'impact') return (b.business_impact ?? 0) - (a.business_impact ?? 0);
      return 0;
    });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      {/* ページヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={18} style={{ color: '#E60012' }} />
            クリティカルパス分析
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            依存関係から「最も遅延が許されないタスク」を特定します
          </p>
        </div>
        <button onClick={load} style={{
          fontSize: 12, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <RefreshCw size={12} />更新
        </button>
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          {
            label: '合計期間（最長チェーン）',
            value: `${data.total_duration}日`,
            icon: <Clock size={14} />,
            color: 'var(--text-2)',
            sub: 'クリティカルパス長',
          },
          {
            label: 'クリティカルタスク',
            value: data.critical_count,
            icon: <AlertTriangle size={14} />,
            color: '#E60012',
            sub: `全体の${criticalRate}%`,
          },
          {
            label: 'チェーン長',
            value: `${chainPieces.length}件`,
            icon: <GitBranch size={14} />,
            color: '#E60012',
            sub: '最長依存チェーン',
          },
          {
            label: '孤立タスク',
            value: data.isolated_count,
            icon: <Zap size={14} />,
            color: '#B46400',
            sub: '依存関係なし',
          },
        ].map(({ label, value, icon, color, sub }) => (
          <div key={label} style={{
            flex: '1 1 160px', minWidth: 140,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 4 }}>
              {icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* クリティカルチェーン */}
      {chainPieces.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#E60012', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={12} />最長クリティカルチェーン（{chainPieces.length}件 / {data.total_duration}日）
          </div>
          <div style={{
            background: 'var(--surface)', border: '1px solid #E6001233', borderRadius: 12,
            padding: '16px 20px', overflowX: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' }}>
              {chainPieces.map((p, i) => (
                <ChainCard key={p.id} piece={p} isFirst={i === 0} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} style={{ color: '#E60012', flexShrink: 0 }} />
            このチェーン上のタスクが1日でも遅れると、後続タスクすべてが連鎖遅延します
          </div>
        </div>
      )}

      {/* フィルター + ソート */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            ['all', `全て (${data.pieces.length})`],
            ['critical', `クリティカル (${data.critical_count})`],
            ['near', `要注意 (${data.pieces.filter(p => p.float > 0 && p.float <= 3).length})`],
            ['isolated', `孤立 (${data.isolated_count})`],
          ] as [FilterMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => setFilter(mode)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: filter === mode ? '#E60012' : 'var(--surface)',
              color: filter === mode ? '#fff' : 'var(--text-3)',
              border: `1px solid ${filter === mode ? '#E60012' : 'var(--border)'}`,
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>ソート:</span>
          {([
            ['float', '余裕日数'],
            ['ef', '完了予定'],
            ['impact', 'インパクト'],
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

      {/* タスク一覧テーブル */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['#', 'タスク名', '余裕', 'ES→EF', '期間', 'ステータス', '担当', '期日', '接続'].map(h => (
                <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textAlign: 'left', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
                該当するタスクがありません
              </td></tr>
            ) : filtered.map((p, i) => (
              <PieceRow key={p.id} piece={p} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-4)', flexWrap: 'wrap' }}>
        <span><strong>ES</strong> = 最短開始日（今日=0）</span>
        <span><strong>EF</strong> = 最短完了日（ES + 期間）</span>
        <span><strong>余裕</strong> = 遅延できる最大日数（0 = クリティカル）</span>
        <span style={{ color: '#E60012', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={10} /> CP = クリティカルパス上のタスク</span>
      </div>
    </div>
  );
}
