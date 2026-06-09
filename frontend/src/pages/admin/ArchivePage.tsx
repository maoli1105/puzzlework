/**
 * ArchivePage — 保管庫
 * ───────────────────────────────────────────────────────────
 * 完成した仕事の記録置き場。
 * 現在の作業空間から切り離し、工房の床を軽くする。
 *
 * 設計原則:
 *   - 暗く、静か、整理されている
 *   - 削除できない (保管するだけ)
 *   - プロジェクト × 月で grouping
 *   - 検索で掘れる
 *   - 「完成した記録」と「現在の作業」の空間分離
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi } from '../../services/api';
import { Search } from 'lucide-react';

interface DonePiece {
  id:              string;
  title:           string;
  status:          string;
  project_id:      string | null;
  project_name:    string | null;
  assignee_name:   string | null;
  completed_at:    string | null;
  progress:        number;
  business_impact: number;
  skill_tags:      string[] | null;
}

// ─── 月グルーピング ──────────────────────────────────────────────────────────
function monthKey(dateStr: string | null): string {
  if (!dateStr) return '日付不明';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function monthOrder(key: string): number {
  // '2025年3月' → 20250300
  const m = key.match(/(\d{4})年(\d+)月/);
  if (!m) return 0;
  return parseInt(m[1]) * 100 + parseInt(m[2]);
}

// ─── ピース行 ────────────────────────────────────────────────────────────────
function PieceRow({ piece, onClick }: { piece: DonePiece; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const dateLabel = piece.completed_at
    ? new Date(piece.completed_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : '';
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '7px 10px',
        borderRadius: 4,
        cursor:       'pointer',
        background:   hovered ? 'var(--surface-hover, rgba(0,0,0,0.025))' : 'transparent',
        transition:   'background 0.12s',
      }}
    >
      {/* 完了チェック (静か) */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '1.5px solid #9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, opacity: 0.6,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#9ca3af' }} />
      </div>

      {/* タイトル */}
      <div style={{
        flex: 1, fontSize: 11,
        color: 'var(--text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {piece.title}
      </div>

      {/* スキルタグ (先頭2件) */}
      {(piece.skill_tags ?? []).slice(0, 2).map(tag => (
        <span key={tag} style={{
          fontSize: 8, padding: '1px 6px',
          background: 'var(--surface-sub)', color: 'var(--text-3)',
          border: '1px solid var(--border)', borderRadius: 99, flexShrink: 0,
        }}>
          {tag}
        </span>
      ))}

      {/* インパクト */}
      {piece.business_impact > 0 && (
        <span style={{ fontSize: 9, color: '#B46400', fontWeight: 600, flexShrink: 0 }}>
          ¥{piece.business_impact.toLocaleString()}
        </span>
      )}

      {/* 担当 */}
      {piece.assignee_name && (
        <span style={{ fontSize: 9, color: 'var(--text-4, var(--text-3))', flexShrink: 0 }}>
          {piece.assignee_name}
        </span>
      )}

      {/* 日付 */}
      {dateLabel && (
        <span style={{ fontSize: 9, color: 'var(--text-4, var(--text-3))', flexShrink: 0, minWidth: 36 }}>
          {dateLabel}
        </span>
      )}
    </div>
  );
}

// ─── ArchivePage ─────────────────────────────────────────────────────────────
export default function ArchivePage() {
  const navigate = useNavigate();
  const [pieces, setPieces]   = useState<DonePiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  useEffect(() => {
    setLoading(true);
    pieceApi.list({ status: 'done', limit: '500' })
      .then((res: any) => {
        const arr = Array.isArray(res) ? res : (res.items ?? res.pieces ?? res.data ?? []);
        setPieces(arr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return pieces;
    const q = query.toLowerCase();
    return pieces.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.project_name ?? '').toLowerCase().includes(q) ||
      (p.assignee_name ?? '').toLowerCase().includes(q)
    );
  }, [pieces, query]);

  // プロジェクト → 月 → ピース の階層でグループ化
  const grouped = useMemo(() => {
    const byProject: Record<string, { name: string; byMonth: Record<string, DonePiece[]> }> = {};
    for (const p of filtered) {
      const pid  = p.project_id ?? '__none__';
      const pname = p.project_name ?? 'プロジェクトなし';
      if (!byProject[pid]) byProject[pid] = { name: pname, byMonth: {} };
      const mk = monthKey(p.completed_at);
      if (!byProject[pid].byMonth[mk]) byProject[pid].byMonth[mk] = [];
      byProject[pid].byMonth[mk].push(p);
    }
    // プロジェクトを名前順 / 月を新しい順にソート
    return Object.entries(byProject)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'ja'))
      .map(([pid, { name, byMonth }]) => ({
        pid, name,
        months: Object.entries(byMonth)
          .sort(([a], [b]) => monthOrder(b) - monthOrder(a))
          .map(([month, ps]) => ({
            month,
            pieces: ps.sort((a, b) =>
              (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
            ),
          })),
      }));
  }, [filtered]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── ヘッダー ── */}
      <div style={{
        height: 48, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
          保管庫
        </span>
        {!loading && (
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {pieces.length}件 完了
          </span>
        )}
        {/* 検索 */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm, 4px)',
          padding: '4px 8px',
        }}>
          <Search size={10} style={{ color: 'var(--text-3)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ピース・プロジェクト・担当者"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontSize: 10, color: 'var(--text-1)', width: 160,
            }}
          />
        </div>
      </div>

      {/* ── ボディ ── */}
      {/*
        保管庫の空気: 静か、色褪せた、整理されている。
        filter: saturate(72%) → 記憶の彩度は現在より低い。
        「完成した仕事は生きていない。でも消えてもいない。」
      */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '28px 36px',
        background: 'var(--bg)',
        filter: 'saturate(72%)',
      }}>
        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: 240, gap: 12, color: 'var(--text-3)',
          }}>
            <div style={{ fontSize: 28, opacity: 0.3 }}>○</div>
            <div style={{ fontSize: 12 }}>
              {query ? '該当するものがない' : '保管庫はまだ空'}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 36 }}>
            {grouped.map(({ pid, name, months }) => (
              <section key={pid}>
                {/* プロジェクト名 */}
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
                  marginBottom: 14, letterSpacing: '-0.01em',
                }}>
                  {name}
                </div>

                {months.map(({ month, pieces: ps }) => (
                  <div key={month} style={{ marginBottom: 16 }}>
                    {/* 月ラベル */}
                    <div style={{
                      fontSize: 9, fontWeight: 500,
                      color: 'var(--text-4, var(--text-3))',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      paddingBottom: 4,
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {month}
                    </div>

                    {/* ピース行 */}
                    {ps.map(p => (
                      <PieceRow
                        key={p.id}
                        piece={p}
                        onClick={() => navigate(`/board?piece=${p.id}`)}
                      />
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
