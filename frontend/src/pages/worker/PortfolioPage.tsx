import { useEffect, useState, useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi, users as usersApi, PortfolioPiece } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Building2, User, Clock, ChevronRight, Search, X, BarChart2, Tag, Briefcase, Calendar, Globe, Lock, Copy, Check, EyeOff, Pencil } from 'lucide-react';

// ── ユーティリティ ────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function fmtYearMonth(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
}
function fmtMinutes(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

// ── タグチップ ─────────────────────────────────────────────────────────────
function TagChip({ label, kind, onClick }: { label: string; kind: 'skill' | 'personal'; onClick?: (e: React.MouseEvent) => void }) {
  const isSkill = kind === 'skill';
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
        background: isSkill ? 'rgba(180,100,0,0.08)' : 'rgba(74,111,165,0.09)',
        color: isSkill ? '#B46400' : '#4A6FA5',
        border: `1px solid ${isSkill ? 'rgba(180,100,0,0.20)' : 'rgba(74,111,165,0.20)'}`,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {label}
    </span>
  );
}

// ── ピースカード ──────────────────────────────────────────────────────────
function PieceCard({ piece, onTagClick }: { piece: PortfolioPiece; onTagClick: (tag: string) => void }) {
  const navigate = useNavigate();
  const isPersonal = !piece.company_id;
  const est = fmtMinutes(piece.estimated_minutes);
  const act = fmtMinutes(piece.actual_minutes);

  return (
    <div
      onClick={() => navigate(`/piece/${piece.id}`)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.1s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'none';
      }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        {/* ソースアイコン */}
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: isPersonal ? 'rgba(74,111,165,0.1)' : 'rgba(180,100,0,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isPersonal
            ? <User size={11} color="#4A6FA5" />
            : <Building2 size={11} color="#B46400" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.35, wordBreak: 'break-all' }}>
            {piece.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Calendar size={9} />
              {fmtDate(piece.completed_at)}
            </span>
            {piece.company_name && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Building2 size={9} />
                {piece.company_name}
              </span>
            )}
            {isPersonal && (
              <span style={{ color: '#4A6FA5', fontWeight: 600, fontSize: 9 }}>個人</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2 }}>
          {piece.currently_confidential && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: 'rgba(100,100,100,0.08)', color: 'var(--text-3)',
              border: '1px solid var(--border)',
            }}>
              <EyeOff size={8} /> 機密
            </span>
          )}
          <ChevronRight size={13} color="var(--text-4)" />
        </div>
      </div>

      {/* 目的 */}
      {piece.objective && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, margin: '0 0 8px', paddingLeft: 30,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {piece.objective}
        </p>
      )}

      {/* タグ行 */}
      {(piece.skill_tags?.length > 0 || piece.personal_tags?.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 30, marginBottom: 8 }}>
          {piece.skill_tags?.map(t => (
            <TagChip key={`s-${t}`} label={t} kind="skill" onClick={e => { (e as any).stopPropagation?.(); onTagClick(t); }} />
          ))}
          {piece.personal_tags?.map(t => (
            <TagChip key={`p-${t}`} label={t} kind="personal" onClick={e => { (e as any).stopPropagation?.(); onTagClick(t); }} />
          ))}
        </div>
      )}

      {/* 時間 */}
      {(est || act) && (
        <div style={{ paddingLeft: 30, display: 'flex', gap: 12 }}>
          {est && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={9} />見積 {est}
            </span>
          )}
          {act && (
            <span style={{ fontSize: 10, color: '#B46400', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
              <Clock size={9} />実績 {act}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── スキル候補リスト（オンボーディングと共通）───────────────────────────
const ALL_SKILL_OPTIONS = [
  'TypeScript', 'React', 'Node.js', 'Python', 'SQL',
  'AWS', 'Docker', 'Figma', 'UI/UX設計',
  'EC運営', 'Shopify', '商品登録', '在庫管理',
  'SNS運用', 'コンテンツ制作', 'ライティング',
  'データ分析', 'Excel/スプレッドシート',
  '写真撮影', 'デザイン', '動画編集',
  '営業', '顧客対応', 'プロジェクト管理',
  'マーケティング', 'SEO', '広告運用',
];

// ── スキル編集モーダル ─────────────────────────────────────────────────
function SkillEditModal({ current, onSave, onClose }: {
  current: string[];
  onSave: (skills: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([...current]);
  const [saving,   setSaving]   = useState(false);

  function toggle(s: string) {
    setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await usersApi.updateSkills(selected);
      onSave(selected);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 'min(480px, 92vw)', maxHeight: '80vh',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font)',
      }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>スキルを編集</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {ALL_SKILL_OPTIONS.map(skill => {
              const active = selected.includes(skill);
              return (
                <button key={skill} onClick={() => toggle(skill)} style={{
                  padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${active ? '#B46400' : 'var(--border)'}`,
                  background: active ? 'rgba(180,100,0,0.08)' : 'var(--surface)',
                  color: active ? '#B46400' : 'var(--text-2)',
                  cursor: 'pointer', transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {active && <Check size={10} strokeWidth={3} />}
                  {skill}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave} disabled={saving}
            style={{
              width: '100%', padding: '11px 0', background: '#B46400', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={14} strokeWidth={2.5} />
            {saving ? '保存中...' : `${selected.length}件 保存`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { user, refreshUser } = useAuthStore();
  const isMobile = useIsMobile();
  const [pieces,  setPieces]  = useState<PortfolioPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filterTag,   setFilterTag]   = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'company' | 'personal'>('all');
  const [isPublic,    setIsPublic]    = useState(false);
  const [visLoading,  setVisLoading]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [skillEditOpen, setSkillEditOpen] = useState(false);

  useEffect(() => {
    pieceApi.getPortfolio()
      .then(setPieces)
      .catch(() => {})
      .finally(() => setLoading(false));
    // 公開状態を取得
    usersApi.getPortfolioVisibility()
      .then(r => setIsPublic(r.is_public))
      .catch(() => {});
  }, []);

  async function togglePublic() {
    setVisLoading(true);
    try {
      const next = !isPublic;
      await usersApi.setPortfolioVisibility(next);
      setIsPublic(next);
    } catch { /* ignore */ }
    finally { setVisLoading(false); }
  }

  function copyUrl() {
    const url = `${window.location.origin}/u/${user?.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // タグ全収集（スキル + 個人）
  const allTags = useMemo(() => {
    const counts: Record<string, number> = {};
    pieces.forEach(p => {
      p.skill_tags?.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
      p.personal_tags?.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [pieces]);

  // サマリー
  const summary = useMemo(() => {
    const companies = new Set(pieces.filter(p => p.company_id).map(p => p.company_name ?? p.company_id));
    const totalMinutes = pieces.reduce((s, p) => s + (p.actual_minutes ?? 0), 0);
    return {
      total: pieces.length,
      companies: companies.size,
      personalCount: pieces.filter(p => !p.company_id).length,
      totalHours: Math.round(totalMinutes / 60),
    };
  }, [pieces]);

  // フィルター
  const filtered = useMemo(() => {
    let r = pieces;
    if (filterSource === 'company')  r = r.filter(p => !!p.company_id);
    if (filterSource === 'personal') r = r.filter(p => !p.company_id);
    if (filterTag) r = r.filter(p =>
      p.skill_tags?.includes(filterTag) || p.personal_tags?.includes(filterTag)
    );
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.objective?.toLowerCase().includes(q) ||
        p.skill_tags?.some(t => t.toLowerCase().includes(q)) ||
        p.personal_tags?.some(t => t.toLowerCase().includes(q)) ||
        p.company_name?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [pieces, filterSource, filterTag, search]);

  // 年月グループ
  const grouped = useMemo(() => {
    const map = new Map<string, PortfolioPiece[]>();
    filtered.forEach(p => {
      const key = fmtYearMonth(p.completed_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return [...map.entries()];
  }, [filtered]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      読み込み中...
    </div>
  );

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '16px 12px 96px' : '24px 16px 48px', fontFamily: 'var(--font)' }}>

      {/* ── ページタイトル ── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em' }}>
            ポートフォリオ
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
            あなたが完成させた企業ピースの記録
          </p>
        </div>

        {/* 公開トグル */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isPublic && (
            <button
              onClick={copyUrl}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.1s',
              }}
              title="公開URLをコピー"
            >
              {copied ? <Check size={12} color="#2DA44E" /> : <Copy size={12} />}
              {copied ? 'コピーしました' : 'URLをコピー'}
            </button>
          )}
          <button
            onClick={togglePublic}
            disabled={visLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1px solid ${isPublic ? 'var(--accent)' : 'var(--border)'}`,
              background: isPublic ? 'var(--accent-sub)' : 'var(--surface)',
              color: isPublic ? 'var(--accent)' : 'var(--text-2)',
              cursor: visLoading ? 'not-allowed' : 'pointer',
              opacity: visLoading ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {isPublic ? <Globe size={13} /> : <Lock size={13} />}
            {isPublic ? '公開中' : '非公開'}
          </button>
        </div>
      </div>

      {/* 公開URL表示（公開時のみ） */}
      {isPublic && user?.id && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(45,164,78,0.06)', border: '1px solid rgba(45,164,78,0.25)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Globe size={12} color="#2DA44E" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#2DA44E', fontWeight: 600 }}>公開中 —</span>
          <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {window.location.origin}/u/{user.id}
          </span>
        </div>
      )}

      {/* ── 宣言スキル ── */}
      <div style={{
        marginBottom: 20, padding: '14px 16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: user?.user_skills?.length ? 10 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
            できること宣言
          </span>
          <button
            onClick={() => setSkillEditOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: '3px 6px', borderRadius: 5 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Pencil size={11} /> 編集
          </button>
        </div>
        {user?.user_skills?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {user.user_skills.map(skill => (
              <span key={skill} style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                background: 'rgba(180,100,0,0.08)', color: '#B46400',
                border: '1px solid rgba(180,100,0,0.20)',
              }}>{skill}</span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-4)', paddingTop: 2 }}>
            スキルを追加して、公開ポートフォリオに「できること」を表示しましょう
          </div>
        )}
      </div>

      {/* ── サマリーカード ── */}
      {pieces.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 20,
        }}>
          {[
            { icon: <Briefcase size={14} />, label: '完成ピース',   value: summary.total,        unit: '件', color: '#B46400' },
            { icon: <Building2  size={14} />, label: '参加企業',     value: summary.companies,    unit: '社', color: '#4A6FA5' },
            { icon: <User       size={14} />, label: '個人タスク',   value: summary.personalCount, unit: '件', color: '#6B7CB9' },
            { icon: <Clock      size={14} />, label: '総作業時間',   value: summary.totalHours,   unit: 'h',  color: '#2DA44E' },
          ].map(({ icon, label, value, unit, color }) => (
            <div key={label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color, marginBottom: 4 }}>
                {icon}
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {value}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── タグクラウド ── */}
      {allTags.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tag size={9} /> タグで絞り込む
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                style={{
                  padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${filterTag === tag ? 'var(--accent)' : 'var(--border)'}`,
                  background: filterTag === tag ? 'var(--accent-sub)' : 'var(--surface)',
                  color: filterTag === tag ? 'var(--accent)' : 'var(--text-2)',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                {tag} <span style={{ opacity: 0.6, fontWeight: 400 }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── フィルターバー ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* 検索 */}
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="タイトル・タグ・企業名で検索"
            style={{
              width: '100%', paddingLeft: 28, paddingRight: search ? 28 : 10,
              height: 32, border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 12, background: 'var(--surface)', color: 'var(--text-1)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 0, display: 'flex' }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* ソースフィルター */}
        {(['all', 'company', 'personal'] as const).map(src => (
          <button
            key={src}
            onClick={() => setFilterSource(src)}
            style={{
              padding: '0 12px', height: 32, borderRadius: 8, fontSize: 11.5, fontWeight: 600,
              border: `1px solid ${filterSource === src ? 'var(--accent)' : 'var(--border)'}`,
              background: filterSource === src ? 'var(--accent-sub)' : 'var(--surface)',
              color: filterSource === src ? 'var(--accent)' : 'var(--text-2)',
              cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0,
            }}
          >
            {src === 'all' ? 'すべて' : src === 'company' ? '企業' : '個人'}
          </button>
        ))}

        {/* アクティブフィルタークリア */}
        {(filterTag || filterSource !== 'all' || search) && (
          <button
            onClick={() => { setFilterTag(''); setFilterSource('all'); setSearch(''); }}
            style={{
              padding: '0 10px', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }}
          >
            <X size={10} /> クリア
          </button>
        )}
      </div>

      {/* ── 結果なし ── */}
      {pieces.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)' }}>
          <BarChart2 size={36} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>まだ完成ピースがありません</div>
          <div style={{ fontSize: 12 }}>ピースを完了させるとここに記録されます</div>
        </div>
      )}

      {filtered.length === 0 && pieces.length > 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)', fontSize: 12 }}>
          条件に一致するピースがありません
        </div>
      )}

      {/* ── タイムライン ── */}
      {grouped.map(([yearMonth, items]) => (
        <div key={yearMonth} style={{ marginBottom: 28 }}>
          {/* 月ヘッダー */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: 'var(--text-2)',
              letterSpacing: '-0.02em', whiteSpace: 'nowrap',
            }}>
              {yearMonth}
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <div style={{ fontSize: 10, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
              {items.length}件
            </div>
          </div>

          {/* ピース一覧 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(piece => (
              <PieceCard key={piece.id} piece={piece} onTagClick={setFilterTag} />
            ))}
          </div>
        </div>
      ))}

      {/* スキル編集モーダル */}
      {skillEditOpen && (
        <SkillEditModal
          current={user?.user_skills ?? []}
          onSave={async (skills) => {
            await refreshUser();
            setSkillEditOpen(false);
            // user_skillsをuserに反映（refreshUserで更新されるが念のため）
            void skills;
          }}
          onClose={() => setSkillEditOpen(false)}
        />
      )}
    </div>
  );
}
