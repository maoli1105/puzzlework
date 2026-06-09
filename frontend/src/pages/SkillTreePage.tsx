import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi, PortfolioPiece } from '../services/api';
import { Building2, ChevronDown, ChevronRight, Clock } from 'lucide-react';

// ── ユーティリティ ─────────────────────────────────────────────────────────
function fmtYearMonth(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMinutes(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

// ── ピース行 ───────────────────────────────────────────────────────────────
function PieceRow({ piece }: { piece: PortfolioPiece }) {
  const navigate = useNavigate();
  const act = fmtMinutes(piece.actual_minutes);
  return (
    <div
      onClick={() => navigate(`/piece/${piece.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-sub)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      {/* 年月 */}
      <span style={{
        fontSize: 10, color: 'var(--text-4)', fontWeight: 600,
        minWidth: 44, fontFamily: 'monospace', flexShrink: 0,
      }}>
        {fmtYearMonth(piece.completed_at)}
      </span>

      {/* タイトル */}
      <span style={{
        flex: 1, fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {piece.currently_confidential ? '機密プロジェクト' : piece.title}
      </span>

      {/* 作業時間 */}
      {act && !piece.currently_confidential && (
        <span style={{
          fontSize: 10, color: 'var(--text-3)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <Clock size={9} />{act}
        </span>
      )}

      {/* 企業名 */}
      {piece.company_name && !piece.currently_confidential && (
        <span style={{
          fontSize: 10, color: 'var(--text-4)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 3, maxWidth: 90,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <Building2 size={9} />{piece.company_name}
        </span>
      )}

      <ChevronRight size={11} color="var(--text-4)" style={{ flexShrink: 0 }} />
    </div>
  );
}

// ── スキルセクション ───────────────────────────────────────────────────────
function SkillSection({
  tag, pieces, totalMinutes, defaultOpen,
}: {
  tag: string;
  pieces: PortfolioPiece[];
  totalMinutes: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const totalHours = Math.round(totalMinutes / 60);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* ヘッダー */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-sub)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
      >
        {/* タグ名 */}
        <span style={{
          flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--text-1)',
          letterSpacing: '-0.02em',
        }}>
          {tag}
        </span>

        {/* 件数 */}
        <span style={{
          fontSize: 13, fontWeight: 700, color: '#B46400',
          background: 'rgba(180,100,0,0.08)',
          border: '1px solid rgba(180,100,0,0.18)',
          padding: '2px 10px', borderRadius: 20,
          flexShrink: 0,
        }}>
          {pieces.length}件
        </span>

        {/* 時間 */}
        {totalHours > 0 && (
          <span style={{
            fontSize: 11, color: 'var(--text-3)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Clock size={11} />{totalHours}h
          </span>
        )}

        {/* 展開アイコン */}
        {open
          ? <ChevronDown size={14} color="var(--text-4)" style={{ flexShrink: 0 }} />
          : <ChevronRight size={14} color="var(--text-4)" style={{ flexShrink: 0 }} />
        }
      </button>

      {/* ピース一覧 */}
      {open && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '4px 4px 8px',
        }}>
          {pieces.map(p => <PieceRow key={p.id} piece={p} />)}
        </div>
      )}
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
export default function SkillTreePage() {
  const [pieces,  setPieces]  = useState<PortfolioPiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pieceApi.getPortfolio()
      .then(setPieces)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // スキルタグ別にピースをグループ化
  const skillGroups = useMemo(() => {
    const map = new Map<string, { pieces: PortfolioPiece[]; totalMinutes: number }>();
    pieces.forEach(p => {
      (p.skill_tags ?? []).forEach(tag => {
        if (!map.has(tag)) map.set(tag, { pieces: [], totalMinutes: 0 });
        const entry = map.get(tag)!;
        entry.pieces.push(p);
        entry.totalMinutes += p.actual_minutes ?? 0;
      });
    });
    // 件数の多い順にソート
    return [...map.entries()]
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => b.pieces.length - a.pieces.length);
  }, [pieces]);

  // サマリー
  const totalPieces    = pieces.length;
  const totalSkills    = skillGroups.length;
  const totalHours     = Math.round(pieces.reduce((s, p) => s + (p.actual_minutes ?? 0), 0) / 60);
  const topSkill       = skillGroups[0]?.tag ?? null;

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font)' }}>
      読み込み中...
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 48px', fontFamily: 'var(--font)' }}>

      {/* ── ページタイトル ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em' }}>
          スキルツリー
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
          完成させたピースで証明されたスキル
        </p>
      </div>

      {/* ── サマリー ── */}
      {totalPieces > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24,
        }}>
          {[
            { label: '完成ピース', value: totalPieces, unit: '件', color: '#B46400' },
            { label: 'スキル種別', value: totalSkills,  unit: '種', color: '#4A6FA5' },
            { label: '総作業時間', value: totalHours,   unit: 'h',  color: '#2DA44E' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {value}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 得意分野バッジ */}
      {topSkill && (
        <div style={{
          marginBottom: 20, padding: '10px 14px',
          background: 'rgba(180,100,0,0.05)',
          border: '1px solid rgba(180,100,0,0.18)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: '#B46400', fontWeight: 700 }}>得意領域</span>
          <span style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(180,100,0,0.10)', color: '#B46400',
            border: '1px solid rgba(180,100,0,0.25)',
          }}>{topSkill}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {skillGroups[0].pieces.length}件完成
          </span>
        </div>
      )}

      {/* ── スキル一覧 ── */}
      {skillGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--text-3)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--surface)', border: '1px solid var(--border)',
            margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
            </svg>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>スキルがまだありません</p>
          <p style={{ fontSize: 11 }}>企業ピースを完了するとスキルが蓄積されます</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {skillGroups.map((group, i) => (
            <SkillSection
              key={group.tag}
              tag={group.tag}
              pieces={group.pieces}
              totalMinutes={group.totalMinutes}
              defaultOpen={i < 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}
