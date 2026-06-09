import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { Plus, ChevronDown, ChevronRight, CheckCircle2, Zap, Lock, CircleCheck, X, Flame, Search, Trash2 } from 'lucide-react';

interface Sprint {
  id: string;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: 'planning' | 'active' | 'completed';
  total_pieces: number;
  done_pieces: number;
  total_impact: number;
}

interface SprintPiece {
  id: string;
  title: string;
  status: string;
  priority: number;
  progress: number;
  assignee_name: string | null;
  due_date: string | null;
}

interface Candidate {
  id: string;
  title: string;
  status: string;
  priority: number;
  business_impact: number;
  assignee_name: string | null;
  project_name: string | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  locked:      { label: 'ロック',   color: '#A8A8A4', Icon: Lock },
  ready:       { label: '着手可',   color: '#4A9B6F', Icon: CheckCircle2 },
  in_progress: { label: '進行中',   color: '#1A56DB', Icon: Zap },
  done:        { label: '完了',     color: '#8C8C88', Icon: CircleCheck },
};

const SPRINT_STATUS: Record<string, { label: string; color: string }> = {
  planning:  { label: '計画中', color: '#B46400' },
  active:    { label: '進行中', color: '#1A56DB' },
  completed: { label: '完了',   color: 'var(--text-2)' },
};

const inputSt: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  padding: '6px 10px', fontSize: 12, background: 'var(--surface)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
};
const labelSt: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

// ── ピース追加パネル ─────────────────────────────────────────────────────────
function AddPiecesPanel({ sprintId, onAdd, onClose }: {
  sprintId: string;
  onAdd: (piece: SprintPiece) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchCandidates = useCallback(async (q: string) => {
    const r = await api.get(`/sprints/${sprintId}/candidates`, { params: q ? { q } : {} }).catch(() => ({ data: [] }));
    setCandidates(r.data);
  }, [sprintId]);

  useEffect(() => {
    fetchCandidates('');
  }, [fetchCandidates]);

  function handleSearch(v: string) {
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCandidates(v), 250);
  }

  async function handleAdd(c: Candidate) {
    setAdding(c.id);
    try {
      await api.post(`/sprints/${sprintId}/pieces`, { piece_id: c.id });
      onAdd({
        id: c.id, title: c.title, status: c.status,
        priority: c.priority, progress: 0,
        assignee_name: c.assignee_name, due_date: null,
      });
      setCandidates(prev => prev.filter(x => x.id !== c.id));
    } catch { /* ignore */ } finally { setAdding(null); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>ピースを追加</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
          <X size={13} />
        </button>
      </div>
      {/* 検索 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 8px', marginBottom: 8 }}>
        <Search size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="タイトルで絞り込み…"
          style={{ border: 'none', outline: 'none', fontSize: 11, background: 'transparent', color: 'var(--text-1)', flex: 1 }}
        />
      </div>
      {/* 候補一覧 */}
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {candidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, color: 'var(--text-3)' }}>
            追加できるピースがありません
          </div>
        ) : candidates.map(c => {
          const si = STATUS_INFO[c.status];
          const SI = si?.Icon ?? Lock;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <SI size={11} color={si?.color ?? '#A8A8A4'} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                {c.project_name && <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{c.project_name}</div>}
              </div>
              {c.assignee_name && <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{c.assignee_name}</span>}
              <button
                onClick={() => handleAdd(c)}
                disabled={adding === c.id}
                style={{ padding: '2px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
              >
                {adding === c.id ? '...' : '追加'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SprintCard ───────────────────────────────────────────────────────────────
function SprintCard({ sprint, expanded, pieces, loadingPieces, onToggle, onStatusChange, onDelete, onPiecesChange }: {
  sprint: Sprint;
  expanded: boolean;
  pieces?: SprintPiece[];
  loadingPieces: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onPiecesChange: (id: string, pieces: SprintPiece[]) => void;
}) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const doneRate = sprint.total_pieces > 0 ? Math.round((sprint.done_pieces / sprint.total_pieces) * 100) : 0;
  const sInfo = SPRINT_STATUS[sprint.status];
  const today = new Date();
  const end = new Date(sprint.end_date);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  const isOverdue = sprint.status !== 'completed' && daysLeft < 0;

  const remaining = sprint.total_pieces - sprint.done_pieces;
  const totalDays = Math.max(1, Math.ceil((end.getTime() - new Date(sprint.start_date).getTime()) / 86400000));
  const elapsed = Math.max(0, Math.ceil((today.getTime() - new Date(sprint.start_date).getTime()) / 86400000));
  const idealRemaining = Math.max(0, sprint.total_pieces - (sprint.total_pieces * elapsed / totalDays));

  async function handleRemovePiece(pieceId: string) {
    setRemoving(pieceId);
    try {
      await api.delete(`/sprints/${sprint.id}/pieces/${pieceId}`);
      const next = (pieces ?? []).filter(p => p.id !== pieceId);
      onPiecesChange(sprint.id, next);
    } catch { /* ignore */ } finally { setRemoving(null); }
  }

  function handlePieceAdded(piece: SprintPiece) {
    onPiecesChange(sprint.id, [...(pieces ?? []), piece]);
  }

  const accentColor = sprint.status === 'completed' ? 'var(--text-2)' : 'var(--accent)';

  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${expanded ? accentColor : 'var(--border)'}`, borderRadius: 'var(--r-lg)', marginBottom: 8, overflow: 'hidden', transition: 'border-color 0.12s' }}>
      {/* Header row */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={onToggle}>
        {expanded ? <ChevronDown size={13} color="var(--text-3)" /> : <ChevronRight size={13} color="var(--text-3)" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{sprint.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: `${sInfo.color}18`, color: sInfo.color, flexShrink: 0 }}>{sInfo.label}</span>
            {isOverdue && <span style={{ fontSize: 10, fontWeight: 600, color: '#E60012', background: 'rgba(230,0,18,0.05)', padding: '1px 7px', borderRadius: 99, flexShrink: 0 }}>期限超過</span>}
          </div>
          {sprint.goal && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sprint.goal}</div>}
        </div>

        {/* Progress bar */}
        <div style={{ width: 100, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{sprint.done_pieces}/{sprint.total_pieces}件</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: accentColor }}>{doneRate}%</span>
          </div>
          <div style={{ background: 'var(--surface-sub)', borderRadius: 99, height: 5, border: '1px solid var(--border-sub)' }}>
            <div style={{ background: accentColor, borderRadius: 99, height: '100%', width: `${doneRate}%`, transition: 'width 0.3s' }} />
          </div>
        </div>

        <div style={{ fontSize: 10, color: isOverdue ? '#E60012' : 'var(--text-3)', textAlign: 'right', flexShrink: 0 }}>
          <div>{new Date(sprint.start_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} 〜</div>
          <div>{new Date(sprint.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</div>
          {sprint.status === 'active' && <div style={{ marginTop: 2, fontWeight: 600 }}>{daysLeft >= 0 ? `残${daysLeft}日` : `${-daysLeft}日超過`}</div>}
        </div>

        <select
          value={sprint.status}
          onChange={e => { e.stopPropagation(); onStatusChange(sprint.id, e.target.value); }}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 6px', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="planning">計画中</option>
          <option value="active">進行中</option>
          <option value="completed">完了</option>
        </select>

        <button onClick={e => { e.stopPropagation(); onDelete(sprint.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}>
          <X size={12} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          <div style={{ borderTop: '1px solid var(--border-sub)', padding: '14px 16px' }}>
            {/* Burndown stats */}
            {sprint.total_pieces > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>バーンダウン</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <StatBox label="残りピース" value={remaining} color={remaining > idealRemaining ? '#E60012' : undefined} />
                  <StatBox label="理想残数" value={Math.round(idealRemaining)} />
                  <StatBox label="ビジネス価値" value={`¥${(sprint.total_impact / 10000).toFixed(0)}万`} />
                  <StatBox label="完了率" value={`${doneRate}%`} color={doneRate >= 80 ? 'var(--text-2)' : doneRate >= 50 ? '#B46400' : '#E60012'} />
                </div>

                {/* Status breakdown bars */}
                <div>
                  {Object.entries(STATUS_INFO).map(([st, info]) => {
                    const count = (pieces ?? []).filter(p => p.status === st).length;
                    const pct = sprint.total_pieces > 0 ? (count / sprint.total_pieces) * 100 : 0;
                    const SI = info.Icon;
                    return (
                      <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <SI size={10} color={info.color} style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: 10, color: 'var(--text-3)', width: 52, flexShrink: 0 }}>{info.label}</div>
                        <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height: 5, border: '1px solid var(--border-sub)', overflow: 'hidden' }}>
                          <div style={{ background: info.color, borderRadius: 99, height: '100%', width: `${pct}%`, transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: info.color, width: 20, textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Piece list */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>ピース一覧</div>
              {sprint.status !== 'completed' && (
                <button
                  onClick={() => setShowAddPanel(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: showAddPanel ? 'var(--surface-sub)' : 'var(--text-1)', color: showAddPanel ? 'var(--text-2)' : '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Plus size={10} /> ピースを追加
                </button>
              )}
            </div>

            {loadingPieces ? (
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>読み込み中...</div>
            ) : !pieces || pieces.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                このスプリントにピースがありません
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {pieces.map(p => {
                  const si = STATUS_INFO[p.status];
                  const SI = si?.Icon ?? Lock;
                  const isDone = p.status === 'done';
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: isDone ? 'transparent' : 'var(--surface-sub)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sub)', opacity: isDone ? 0.55 : 1 }}>
                      <SI size={11} color={si?.color ?? '#A8A8A4'} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 11, color: isDone ? 'var(--text-3)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDone ? 'line-through' : 'none' }}>
                        {p.title}
                      </div>
                      {p.progress > 0 && !isDone && <div style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{p.progress}%</div>}
                      {p.assignee_name && <div style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{p.assignee_name}</div>}
                      {p.due_date && <div style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{new Date(p.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</div>}
                      {sprint.status !== 'completed' && (
                        <button
                          onClick={() => handleRemovePiece(p.id)}
                          disabled={removing === p.id}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, flexShrink: 0, opacity: removing === p.id ? 0.4 : 1 }}
                          title="スプリントから外す"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add pieces panel */}
          {showAddPanel && (
            <AddPiecesPanel
              sprintId={sprint.id}
              onAdd={handlePieceAdded}
              onClose={() => setShowAddPanel(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 12px', textAlign: 'center', flex: '1 1 80px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: color ?? 'var(--text-1)' }}>{value}</div>
    </div>
  );
}

// ── SprintPage ───────────────────────────────────────────────────────────────
export default function SprintPage() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Record<string, SprintPiece[]>>({});
  const [loadingPieces, setLoadingPieces] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.get('/sprints').catch(() => ({ data: [] }));
    setSprints(r.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadPieces(sprintId: string) {
    if (pieces[sprintId] !== undefined) return; // already loaded
    setLoadingPieces(prev => ({ ...prev, [sprintId]: true }));
    const r = await api.get(`/sprints/${sprintId}/pieces`).catch(() => ({ data: [] }));
    setPieces(prev => ({ ...prev, [sprintId]: r.data }));
    setLoadingPieces(prev => ({ ...prev, [sprintId]: false }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadPieces(id);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) return;
    setCreating(true);
    try {
      const r = await api.post('/sprints', form);
      setSprints(prev => [r.data, ...prev]);
      setShowCreate(false);
      setForm({ name: '', goal: '', start_date: '', end_date: '' });
    } catch { /* ignore */ } finally { setCreating(false); }
  }

  async function handleStatusChange(id: string, status: string) {
    await api.patch(`/sprints/${id}`, { status }).catch(() => {});
    setSprints(prev => prev.map(s => s.id === id ? { ...s, status: status as Sprint['status'] } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('このスプリントを削除しますか？ピースのスプリント割当は解除されます。')) return;
    await api.delete(`/sprints/${id}`).catch(() => {});
    setSprints(prev => prev.filter(s => s.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function handlePiecesChange(sprintId: string, next: SprintPiece[]) {
    setPieces(prev => ({ ...prev, [sprintId]: next }));
    // ピース数も更新
    setSprints(prev => prev.map(s => {
      if (s.id !== sprintId) return s;
      const done = next.filter(p => p.status === 'done').length;
      return { ...s, total_pieces: next.length, done_pieces: done };
    }));
  }

  const activeSprints = sprints.filter(s => s.status === 'active');
  const planningSprints = sprints.filter(s => s.status === 'planning');
  const completedSprints = sprints.filter(s => s.status === 'completed');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>スプリント管理</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>ピースをスプリントにまとめてバーンダウンを確認</div>
        </div>
        {!loading && sprints.length > 0 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {activeSprints.length > 0 && <Chip label={`進行中 ${activeSprints.length}`} color="#1A56DB" />}
            {planningSprints.length > 0 && <Chip label={`計画中 ${planningSprints.length}`} color="#B46400" />}
            {completedSprints.length > 0 && <Chip label={`完了 ${completedSprints.length}`} color="#8C8C88" />}
          </div>
        )}
        <button
          onClick={() => setShowCreate(v => !v)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> 新規スプリント
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: '14px 24px', background: 'var(--accent-sub)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 160px' }}>
              <div style={labelSt}>スプリント名 *</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sprint 1" required style={inputSt} />
            </div>
            <div style={{ flex: '3 1 200px' }}>
              <div style={labelSt}>ゴール</div>
              <input value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="このスプリントで達成したいこと" style={inputSt} />
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <div style={labelSt}>開始日 *</div>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required style={inputSt} />
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <div style={labelSt}>終了日 *</div>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required style={inputSt} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" disabled={creating} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {creating ? '作成中...' : '作成'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '7px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
                <X size={12} />
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>読み込み中...</div>
        ) : sprints.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
            <Flame size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: 13 }}>スプリントがありません</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>「新規スプリント」から作成してください</div>
          </div>
        ) : (
          <>
            {activeSprints.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <SectionLabel>進行中のスプリント</SectionLabel>
                {activeSprints.map(s => (
                  <SprintCard
                    key={s.id} sprint={s}
                    expanded={expanded === s.id}
                    pieces={pieces[s.id]}
                    loadingPieces={!!loadingPieces[s.id]}
                    onToggle={() => toggleExpand(s.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onPiecesChange={handlePiecesChange}
                  />
                ))}
              </section>
            )}
            {planningSprints.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <SectionLabel>計画中のスプリント</SectionLabel>
                {planningSprints.map(s => (
                  <SprintCard
                    key={s.id} sprint={s}
                    expanded={expanded === s.id}
                    pieces={pieces[s.id]}
                    loadingPieces={!!loadingPieces[s.id]}
                    onToggle={() => toggleExpand(s.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onPiecesChange={handlePiecesChange}
                  />
                ))}
              </section>
            )}
            {completedSprints.length > 0 && (
              <section>
                <SectionLabel>完了済み</SectionLabel>
                {completedSprints.map(s => (
                  <SprintCard
                    key={s.id} sprint={s}
                    expanded={expanded === s.id}
                    pieces={pieces[s.id]}
                    loadingPieces={!!loadingPieces[s.id]}
                    onToggle={() => toggleExpand(s.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onPiecesChange={handlePiecesChange}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${color}14`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}
