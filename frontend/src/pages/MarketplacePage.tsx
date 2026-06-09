/**
 * MarketplacePage — 企業間ピース受注
 *
 * 他社が外部公開したピース（is_external=true, status=ready）を
 * Worker が受注して自分の工房に引き込む。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketplace as marketplaceApi } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { Search, X, Check, Zap, Clock, TrendingUp } from 'lucide-react';

interface MarketplacePiece {
  id:               string;
  title:            string;
  objective:        string;
  value_metric:     string;
  expected_impact:  string;
  skill_tags:       string[];
  reward:           number;
  company_name:     string;
  status:           string;
  business_impact:  number;
  estimated_days:   number | null;
  priority:         number;
  due_date:         string | null;
  created_at:       string;
}

const MARKETPLACE_CSS = `
  @keyframes mp-shimmer { 0%,100%{opacity:.4} 50%{opacity:.8} }
  @keyframes mp-accept-pop { 0%{transform:scale(1)} 40%{transform:scale(1.04)} 100%{transform:scale(1)} }
  .mp-card { transition: box-shadow 0.15s, border-color 0.15s; }
  .mp-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .mp-tag { cursor: pointer; transition: background 0.1s, color 0.1s; }
`;

function impactLevel(n: number): { label: string; color: string } {
  if (n >= 8) return { label: '高', color: '#E60012' };
  if (n >= 5) return { label: '中', color: '#B46400' };
  return { label: '低', color: 'var(--text-3)' };
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);
}

// ── MarketplacePieceCard ──────────────────────────────────────────────────────
function MarketplacePieceCard({ piece, isAccepting, isAccepted, onAccept, onTagClick, activeTag }: {
  piece:       MarketplacePiece;
  isAccepting: boolean;
  isAccepted:  boolean;
  onAccept:    () => void;
  onTagClick:  (tag: string) => void;
  activeTag:   string | null;
}) {
  const impact   = impactLevel(piece.business_impact ?? 0);
  const daysLeft = piece.due_date ? daysUntil(piece.due_date) : null;
  const urgent   = daysLeft !== null && daysLeft <= 7;

  return (
    <div className="mp-card" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* 上段: 会社名 + インパクト + 報酬 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
            {piece.company_name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1.35 }}>
            {piece.title}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {piece.reward > 0 && (
            <div style={{
              fontSize: 13, fontWeight: 800, color: 'var(--text-1)',
              background: 'var(--surface-sub)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', padding: '3px 10px',
              letterSpacing: '-0.01em',
            }}>
              ¥{piece.reward.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* 目的文 */}
      {piece.objective && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65 }}>
          {piece.objective}
        </div>
      )}

      {/* メタ情報バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(piece.business_impact ?? 0) > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: impact.color }}>
            <TrendingUp size={10} /> インパクト {impact.label}
          </span>
        )}
        {piece.estimated_days && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-3)' }}>
            <Clock size={10} /> 約{piece.estimated_days}日
          </span>
        )}
        {daysLeft !== null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: urgent ? '#E60012' : 'var(--text-3)', fontWeight: urgent ? 700 : 400 }}>
            <Zap size={10} />
            {daysLeft < 0 ? `${Math.abs(daysLeft)}日超過` : daysLeft === 0 ? '今日が期限' : `残${daysLeft}日`}
          </span>
        )}
      </div>

      {/* スキルタグ */}
      {piece.skill_tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {piece.skill_tags.map(tag => (
            <span
              key={tag}
              className="mp-tag"
              onClick={() => onTagClick(tag)}
              style={{
                fontSize: 10, padding: '2px 8px',
                background: activeTag === tag ? 'var(--accent)' : 'var(--surface-sub)',
                color: activeTag === tag ? '#fff' : 'var(--text-2)',
                border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 99,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 受注ボタン */}
      <button
        onClick={onAccept}
        disabled={isAccepting || isAccepted}
        style={{
          width: '100%', padding: '10px 0',
          fontSize: 12, fontWeight: 700,
          background: isAccepted ? 'var(--text-2)' : isAccepting ? 'var(--border)' : 'var(--accent)',
          color: isAccepting ? 'var(--text-3)' : '#fff',
          border: 'none', borderRadius: 'var(--r-sm)',
          cursor: isAccepting || isAccepted ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'background 0.15s',
          animation: isAccepted ? 'mp-accept-pop 0.25s ease' : undefined,
        }}
      >
        {isAccepted ? <><Check size={13} /> 受注しました</> : isAccepting ? '受注中…' : '受注する'}
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div style={{
      padding: '60px 28px', textAlign: 'center',
      background: 'var(--surface)', border: '1px dashed var(--border)',
      borderRadius: 'var(--r-lg)',
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 6 }}>
        {filtered ? '条件に合うピースがありません' : '現在、受注可能なピースはありません'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', opacity: 0.6 }}>
        {filtered ? 'フィルタを変更してみてください' : '他社が外部公開したピースがここに表示されます'}
      </div>
    </div>
  );
}

// ── MarketplacePage ────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const navigate   = useNavigate();
  const isMobile   = useIsMobile();
  const [pieces,    setPieces]    = useState<MarketplacePiece[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [accepted,  setAccepted]  = useState<Set<string>>(new Set());
  const [query,     setQuery]     = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, tag: string | null) => {
    setLoading(true);
    try {
      const params: { q?: string; tags?: string } = {};
      if (q.trim()) params.q = q.trim();
      if (tag) params.tags = tag;
      const data = await marketplaceApi.list(params);
      setPieces(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回ロード
  useEffect(() => { load('', null); }, [load]);

  // クエリ変更時デバウンス
  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val, activeTag), 280);
  }

  function handleTagClick(tag: string) {
    const next = activeTag === tag ? null : tag;
    setActiveTag(next);
    load(query, next);
  }

  function clearFilters() {
    setQuery('');
    setActiveTag(null);
    load('', null);
  }

  async function handleAccept(id: string) {
    if (accepting) return;
    setAccepting(id);
    try {
      await marketplaceApi.accept(id);
      setAccepted(prev => new Set(prev).add(id));
      setTimeout(() => {
        setPieces(prev => prev.filter(p => p.id !== id));
        setAccepted(prev => { const s = new Set(prev); s.delete(id); return s; });
        setAccepting(null);
      }, 1800);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '受注に失敗しました');
      setAccepting(null);
    }
  }

  // 全タグ（現在表示中のピースから収集）
  const allTags = Array.from(new Set(pieces.flatMap(p => p.skill_tags ?? []))).sort();
  const isFiltered = !!query.trim() || !!activeTag;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '16px 12px 80px' : '24px 20px 80px' }}>
      <style>{MARKETPLACE_CSS}</style>

      {/* ── ページヘッダー ── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 3 }}
        >
          ← 工房へ
        </button>
        <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            Marketplace
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
            外部から受注できるピース
            {!loading && <span style={{ marginLeft: 6 }}>{pieces.length}件</span>}
          </div>
        </div>
      </div>

      {/* ── 検索バー ── */}
      <div style={{ marginBottom: 12, position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="タイトル・目的で検索…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 32px 8px 30px',
            fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)', background: 'var(--surface)',
            color: 'var(--text-1)', outline: 'none',
          }}
        />
        {query && (
          <button onClick={() => handleQueryChange('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── スキルタグフィルタ ── */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 20 }}>
          {allTags.map(tag => (
            <span
              key={tag}
              className="mp-tag"
              onClick={() => handleTagClick(tag)}
              style={{
                fontSize: 10, padding: '3px 10px',
                background: activeTag === tag ? 'var(--accent)' : 'var(--surface)',
                color: activeTag === tag ? '#fff' : 'var(--text-2)',
                border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 99,
                fontWeight: activeTag === tag ? 600 : 400,
              }}
            >
              {tag}
            </span>
          ))}
          {isFiltered && (
            <span
              className="mp-tag"
              onClick={clearFilters}
              style={{ fontSize: 10, padding: '3px 10px', background: 'none', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 3 }}
            >
              <X size={9} /> クリア
            </span>
          )}
        </div>
      )}

      {/* ── コンテンツ ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 140, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', opacity: 1 - i * 0.2, animation: 'mp-shimmer 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ) : pieces.length === 0 ? (
        <EmptyState filtered={isFiltered} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pieces.map(piece => (
            <MarketplacePieceCard
              key={piece.id}
              piece={piece}
              isAccepting={accepting === piece.id}
              isAccepted={accepted.has(piece.id)}
              onAccept={() => handleAccept(piece.id)}
              onTagClick={handleTagClick}
              activeTag={activeTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
