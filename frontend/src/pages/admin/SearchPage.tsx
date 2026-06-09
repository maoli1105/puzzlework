import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { pieces as pieceApi } from '../../services/api';
import { Search, FolderOpen, Square, ArrowRight, X } from 'lucide-react';

interface SearchResult {
  type: 'piece' | 'project';
  id: string;
  name: string;
  status: string;
  project_id: string | null;
}

const PIECE_STATUS_LABEL: Record<string, string> = {
  locked: 'ロック', ready: '着手可', in_progress: '進行中', done: '完了',
};
const PIECE_STATUS_COLOR: Record<string, string> = {
  locked: '#A8A8A4', ready: '#4A9B6F', in_progress: '#1A56DB', done: '#A8A8A4',
};
const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: '進行中', completed: '完了', archived: 'アーカイブ',
};
const PROJECT_STATUS_COLOR: Record<string, string> = {
  active: '#1A56DB', completed: '#4A9B6F', archived: '#A8A8A4',
};

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'piece' | 'project'>('all');
  const [filterStatus, setFilterStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setQuery(q);
    if (q.length >= 2) {
      setLoading(true);
      pieceApi.search(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    } else {
      setResults([]);
    }
  }, [searchParams]);

  function handleInput(value: string) {
    setQuery(value);
    if (value.length >= 2) {
      setSearchParams({ q: value });
    } else if (!value) {
      setSearchParams({});
    }
  }

  function handleResultClick(r: SearchResult) {
    if (r.type === 'piece') {
      navigate(`/board?piece=${r.id}`);
    } else {
      navigate('/projects');
    }
  }

  const filtered = results.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const pieceResults = results.filter(r => r.type === 'piece');
  const projectResults = results.filter(r => r.type === 'project');

  const allStatuses = [...new Set(results.map(r => r.status))];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search header */}
      <div style={{
        padding: '16px 24px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder="ピース・プロジェクトを検索..."
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '10px 36px 10px 36px',
              fontSize: 14,
              color: 'var(--text-1)',
              background: 'var(--surface)',
              outline: 'none',
              boxSizing: 'border-box',
              letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSearchParams({}); setResults([]); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter row */}
        {results.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center' }}>
            {/* Type filter */}
            {(['all', 'piece', 'project'] as const).map(t => {
              const labels = { all: `すべて (${results.length})`, piece: `ピース (${pieceResults.length})`, project: `プロジェクト (${projectResults.length})` };
              return (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: '4px 12px',
                    border: `1px solid ${filterType === t ? 'var(--text-1)' : 'var(--border)'}`,
                    borderRadius: 99,
                    background: filterType === t ? 'var(--text-1)' : 'var(--surface)',
                    color: filterType === t ? '#FAFAF8' : 'var(--text-2)',
                    fontSize: 11, fontWeight: filterType === t ? 600 : 400,
                    cursor: 'pointer',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {labels[t]}
                </button>
              );
            })}

            {/* Status filter */}
            {allStatuses.length > 1 && (
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ marginLeft: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}
              >
                <option value="">全ステータス</option>
                {allStatuses.map(s => <option key={s} value={s}>{PIECE_STATUS_LABEL[s] ?? PROJECT_STATUS_LABEL[s] ?? s}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Empty state */}
        {!query && (
          <div style={{ textAlign: 'center', paddingTop: 64 }}>
            <Search size={32} style={{ color: 'var(--border)', marginBottom: 14 }} />
            <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>ピースやプロジェクトを検索</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>タイトル・目標・スキルタグで検索できます</div>
            <div style={{ fontSize: 10, color: 'var(--border)', marginTop: 12 }}>⌘K で検索バーにフォーカス</div>
          </div>
        )}

        {query && query.length < 2 && (
          <div style={{ textAlign: 'center', paddingTop: 48, fontSize: 12, color: 'var(--text-3)' }}>2文字以上入力してください</div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 48, fontSize: 12, color: 'var(--text-3)' }}>検索中...</div>
        )}

        {!loading && query.length >= 2 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 48 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>「{query}」の結果は0件</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>別のキーワードか、スキルタグで検索してみてください</div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div>
            {/* Section: pieces */}
            {filtered.filter(r => r.type === 'piece').length > 0 && (
              <div style={{ marginBottom: 24 }}>
                {filterType === 'all' && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Square size={10} />
                    ピース
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filtered.filter(r => r.type === 'piece').map(r => {
                    const color = PIECE_STATUS_COLOR[r.status] ?? '#A8A8A4';
                    const label = PIECE_STATUS_LABEL[r.status] ?? r.status;
                    return (
                      <ResultRow
                        key={r.id}
                        icon={<Square size={12} style={{ color }} />}
                        name={r.name}
                        badge={{ color, label }}
                        onClick={() => handleResultClick(r)}
                        query={query}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section: projects */}
            {filtered.filter(r => r.type === 'project').length > 0 && (
              <div>
                {filterType === 'all' && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FolderOpen size={10} />
                    プロジェクト
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filtered.filter(r => r.type === 'project').map(r => {
                    const color = PROJECT_STATUS_COLOR[r.status] ?? '#A8A8A4';
                    const label = PROJECT_STATUS_LABEL[r.status] ?? r.status;
                    return (
                      <ResultRow
                        key={r.id}
                        icon={<FolderOpen size={12} style={{ color }} />}
                        name={r.name}
                        badge={{ color, label }}
                        onClick={() => handleResultClick(r)}
                        query={query}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#FEF08A', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ResultRow({
  icon, name, badge, onClick, query,
}: {
  icon: React.ReactNode;
  name: string;
  badge: { color: string; label: string };
  onClick: () => void;
  query: string;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: hover ? 'var(--surface-sub)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500, letterSpacing: '-0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {highlightMatch(name, query)}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 500,
        color: badge.color,
        border: `1px solid ${badge.color}44`,
        borderRadius: 'var(--r-sm)', padding: '2px 8px',
        flexShrink: 0, letterSpacing: '0.02em',
      }}>
        {badge.label}
      </span>
      {hover && <ArrowRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </div>
  );
}
