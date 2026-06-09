import { useEffect, useState, useCallback } from 'react';
import { retros as retroApi } from '../../services/api';
import { MessageSquare, Plus, ThumbsUp, Trash2, Check, X, Lock, BarChart2 } from 'lucide-react';

interface RetroItem {
  id: string;
  retro_id: string;
  category: 'good' | 'bad' | 'action';
  content: string;
  votes: number;
  author_name: string | null;
  created_at: string;
}

interface Retro {
  id: string;
  title: string;
  sprint_label: string;
  date: string;
  status: 'open' | 'closed';
  items: RetroItem[];
  item_count?: number;
  action_count?: number;
  total_votes?: number;
}

const CAT_CONFIG = {
  good:   { label: 'よかったこと',     color: 'var(--text-2)', bg: 'var(--surface-sub)', border: '#86EFAC', dot: '#22C55E' },
  bad:    { label: '改善したいこと',   color: '#E60012', bg: 'rgba(230,0,18,0.05)', border: 'rgba(230,0,18,0.20)', dot: '#E60012' },
  action: { label: 'アクションアイテム', color: '#B46400', bg: 'rgba(180,100,0,0.05)', border: 'rgba(180,100,0,0.20)', dot: '#B46400' },
} as const;

const RETRO_CSS = `
  @keyframes vote-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.35); }
    100% { transform: scale(1); }
  }
  .vote-pop { animation: vote-pop 0.22s ease; }
`;

/** カテゴリのカラードット */
function CatDot({ category }: { category: keyof typeof CAT_CONFIG }) {
  const { dot } = CAT_CONFIG[category];
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />;
}

function ItemCard({ item, onVote, onDelete, disabled }: {
  item: RetroItem;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}) {
  const cfg = CAT_CONFIG[item.category];
  const [popping, setPopping] = useState(false);

  function handleVote() {
    if (disabled) return;
    setPopping(true);
    onVote(item.id);
    setTimeout(() => setPopping(false), 250);
  }

  return (
    <div style={{
      border: `1px solid ${cfg.border}`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      background: 'var(--surface)',
      transition: 'box-shadow 0.12s',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.55 }}>{item.content}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.author_name && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', flex: 1 }}>{item.author_name}</span>
        )}
        <button
          onClick={handleVote}
          disabled={disabled}
          className={popping ? 'vote-pop' : ''}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', fontSize: 10,
            background: item.votes > 0 ? cfg.bg : 'var(--surface-sub)',
            border: `1px solid ${item.votes > 0 ? cfg.border : 'var(--border)'}`,
            borderRadius: 99, cursor: disabled ? 'default' : 'pointer',
            color: item.votes > 0 ? cfg.color : 'var(--text-3)',
            fontWeight: item.votes > 0 ? 700 : 400,
            transition: 'background 0.1s, color 0.1s',
          }}
        >
          <ThumbsUp size={9} /> {item.votes}
        </button>
        {!disabled && (
          <button
            onClick={() => onDelete(item.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, opacity: 0.45, lineHeight: 1 }}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function AddItemForm({ retroId, category, onAdd }: {
  retroId: string;
  category: 'good' | 'bad' | 'action';
  onAdd: (item: RetroItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const cfg = CAT_CONFIG[category];

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const item = await retroApi.addItem(retroId, category, text.trim());
      onAdd(item);
      setText(''); setOpen(false);
    } finally { setSaving(false); }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 10px', fontSize: 11,
        color: cfg.color, background: 'none',
        border: `1px dashed ${cfg.border}`,
        borderRadius: 6, cursor: 'pointer', width: '100%',
      }}
    >
      <Plus size={10} /> 追加
    </button>
  );

  return (
    <div style={{ border: `1px solid ${cfg.border}`, borderRadius: 6, padding: 10, background: cfg.bg, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="⌘+Enter で保存"
        rows={2}
        autoFocus
        style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${cfg.border}`, borderRadius: 4, background: 'var(--surface)', color: 'var(--text-1)', resize: 'none' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={saving || !text.trim()} style={{ padding: '3px 12px', fontSize: 11, background: cfg.color, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>追加</button>
        <button onClick={() => setOpen(false)} style={{ padding: '3px 10px', fontSize: 11, background: 'none', border: `1px solid ${cfg.border}`, borderRadius: 4, cursor: 'pointer', color: cfg.color }}>キャンセル</button>
      </div>
    </div>
  );
}

function RetroBoard({ retro, onUpdate }: { retro: Retro; onUpdate: (r: Retro) => void }) {
  const closed = retro.status === 'closed';

  async function handleVote(itemId: string) {
    const updated = await retroApi.vote(itemId);
    onUpdate({ ...retro, items: retro.items.map(i => i.id === itemId ? updated : i) });
  }

  async function handleDelete(itemId: string) {
    await retroApi.deleteItem(itemId);
    onUpdate({ ...retro, items: retro.items.filter(i => i.id !== itemId) });
  }

  function handleAdd(item: RetroItem) {
    onUpdate({ ...retro, items: [...retro.items, item] });
  }

  async function handleClose() {
    const updated = await retroApi.close(retro.id);
    onUpdate({ ...retro, ...updated });
  }

  const totalVotes = retro.items.reduce((s, i) => s + i.votes, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Board sub-header */}
      <div style={{ padding: '8px 20px', background: 'var(--surface-sub)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{retro.sprint_label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
            {new Date(retro.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          {totalVotes > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>
              <BarChart2 size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
              {totalVotes} 票
            </span>
          )}
        </div>
        {closed ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Lock size={8} /> クローズ済み
          </span>
        ) : (
          <button
            onClick={handleClose}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', fontSize: 11, background: 'var(--surface-sub)', color: 'var(--text-2)', border: '1px solid #86EFAC', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }}
          >
            <Check size={11} /> 振り返りを完了
          </button>
        )}
      </div>

      {/* 3-column board */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, overflow: 'hidden' }}>
        {(['good', 'bad', 'action'] as const).map((cat, ci) => {
          const cfg = CAT_CONFIG[cat];
          const items = retro.items
            .filter(i => i.category === cat)
            .sort((a, b) => b.votes - a.votes);
          const colVotes = items.reduce((s, i) => s + i.votes, 0);

          return (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column', borderRight: ci < 2 ? '1px solid var(--border)' : undefined, overflow: 'hidden' }}>
              {/* Column header */}
              <div style={{ padding: '10px 14px', background: cfg.bg, borderBottom: `2px solid ${cfg.color}33`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CatDot category={cat} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, flex: 1 }}>{cfg.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.color + '18', borderRadius: 99, padding: '1px 6px' }}>
                    {items.length}
                  </span>
                </div>
                {/* 得票ミニバー */}
                {totalVotes > 0 && colVotes > 0 && (
                  <div style={{ marginTop: 6, height: 3, background: 'var(--surface-sub)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((colVotes / totalVotes) * 100)}%`, height: '100%', background: cfg.color + '55', borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                )}
                {colVotes > 0 && (
                  <div style={{ marginTop: 4, fontSize: 9, color: cfg.color + 'AA' }}>{colVotes} 票</div>
                )}
              </div>
              {/* Items */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                  <ItemCard key={item.id} item={item} onVote={handleVote} onDelete={handleDelete} disabled={closed} />
                ))}
                {!closed && <AddItemForm retroId={retro.id} category={cat} onAdd={handleAdd} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RetroPage() {
  const [retros, setRetros] = useState<Retro[]>([]);
  const [selected, setSelected] = useState<Retro | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSprint, setNewSprint] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await retroApi.list();
      setRetros(list);
      if (list.length > 0 && !selected) {
        const full = await retroApi.get(list[0].id);
        setSelected(full);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function selectRetro(id: string) {
    const full = await retroApi.get(id);
    setSelected(full);
  }

  async function createRetro() {
    if (!newTitle.trim() || !newSprint.trim()) return;
    setCreating(true);
    try {
      const retro = await retroApi.create({ title: newTitle, sprint_label: newSprint, date: newDate });
      setRetros(r => [retro, ...r]);
      setSelected(retro);
      setNewTitle(''); setNewSprint(''); setShowNew(false);
    } finally { setCreating(false); }
  }

  async function deleteRetro(id: string) {
    await retroApi.delete(id);
    const next = retros.filter(r => r.id !== id);
    setRetros(next);
    if (selected?.id === id) {
      if (next.length > 0) {
        const full = await retroApi.get(next[0].id);
        setSelected(full);
      } else {
        setSelected(null);
      }
    }
  }

  function handleUpdate(updated: Retro) {
    setSelected(updated);
    setRetros(rs => rs.map(r => r.id === updated.id ? { ...r, status: updated.status } : r));
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{RETRO_CSS}</style>

      {/* ── ヘッダー ── */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <MessageSquare size={15} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>スプリント振り返り</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Retrospective — よかったこと・改善・アクション</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowNew(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={12} /> 新しい振り返り
          </button>
        </div>
      </div>

      {/* 新規作成フォーム */}
      {showNew && (
        <div style={{ padding: '10px 20px', background: 'var(--surface-sub)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <input
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="タイトル（例: Sprint 14 振り返り）"
            style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)', flex: 2 }}
            autoFocus
          />
          <input
            value={newSprint} onChange={e => setNewSprint(e.target.value)}
            placeholder="スプリント名"
            style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)', flex: 1 }}
          />
          <input
            type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }}
          />
          <button
            onClick={createRetro}
            disabled={creating || !newTitle.trim() || !newSprint.trim()}
            style={{ padding: '5px 14px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }}
          >
            作成
          </button>
          <button
            onClick={() => setShowNew(false)}
            style={{ padding: '5px 10px', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* サイドバー */}
        <div style={{ width: 220, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading...</div>
            ) : retros.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>振り返りがありません</div>
            ) : retros.map(r => (
              <div
                key={r.id}
                onClick={() => selectRetro(r.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: selected?.id === r.id ? 'var(--accent-sub)' : 'transparent',
                  borderLeft: `3px solid ${selected?.id === r.id ? 'var(--accent)' : 'transparent'}`,
                  borderBottom: '1px solid var(--border-sub)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sprint_label}</span>
                  {r.status === 'closed' && <Lock size={8} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {new Date(r.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </div>
                {/* カテゴリ別ドット + 件数 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(['good', 'bad', 'action'] as const).map(cat => (
                    <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <CatDot category={cat} />
                    </span>
                  ))}
                  {r.item_count !== undefined && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 2 }}>{r.item_count}件</span>
                  )}
                  {(r.total_votes ?? 0) > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>
                      <ThumbsUp size={7} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 1 }} />
                      {r.total_votes}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* サイドバー下: 削除ボタン */}
          {selected && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', flexShrink: 0 }}>
              <button
                onClick={() => deleteRetro(selected.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}
              >
                <Trash2 size={10} /> この振り返りを削除
              </button>
            </div>
          )}
        </div>

        {/* ボードエリア */}
        {selected ? (
          <RetroBoard key={selected.id} retro={selected} onUpdate={handleUpdate} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            振り返りを選択するか、新しく作成してください
          </div>
        )}
      </div>
    </div>
  );
}
