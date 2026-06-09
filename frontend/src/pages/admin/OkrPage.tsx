import { useEffect, useState, useCallback } from 'react';
import { okrs as okrApi } from '../../services/api';
import { Target, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';

interface KeyResult {
  id: string;
  okr_id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
}

interface OKR {
  id: string;
  title: string;
  description: string;
  owner_name: string | null;
  quarter: string;
  status: 'active' | 'completed' | 'cancelled';
  key_results: KeyResult[];
  created_at: string;
}

function krProgress(kr: KeyResult): number {
  if (kr.target_value === 0) return 0;
  const raw = (kr.current_value / kr.target_value) * 100;
  return Math.min(100, Math.max(0, raw));
}

function okrProgress(okr: OKR): number {
  if (okr.key_results.length === 0) return 0;
  const sum = okr.key_results.reduce((s, kr) => s + krProgress(kr), 0);
  return sum / okr.key_results.length;
}

function progressColor(pct: number): string {
  if (pct >= 70) return 'var(--text-2)';
  if (pct >= 40) return '#B46400';
  return '#E60012';
}

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ background: 'var(--surface-sub)', borderRadius: 99, height, border: '1px solid var(--border-sub)', overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
    </div>
  );
}

/** SVG ドーナツグラフ */
function DonutChart({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-sub)" strokeWidth={10} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

function KRRow({ kr, onUpdate, onDelete }: { kr: KeyResult; onUpdate: (id: string, d: Partial<KeyResult>) => void; onDelete: (id: string) => void }) {
  const [editingVal, setEditingVal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [val, setVal] = useState(String(kr.current_value));
  const [titleDraft, setTitleDraft] = useState(kr.title);
  const pct = krProgress(kr);
  const color = progressColor(pct);

  function saveVal() {
    const n = parseFloat(val);
    if (!isNaN(n)) onUpdate(kr.id, { current_value: n });
    setEditingVal(false);
  }

  function saveTitle() {
    const t = titleDraft.trim();
    if (t && t !== kr.title) onUpdate(kr.id, { title: t });
    setEditingTitle(false);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-sub)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingTitle ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(kr.title); setEditingTitle(false); } }}
              style={{ flex: 1, padding: '2px 6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }}
              autoFocus
            />
            <button onClick={saveTitle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}><Check size={11} /></button>
            <button onClick={() => { setTitleDraft(kr.title); setEditingTitle(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}><X size={11} /></button>
          </div>
        ) : (
          <div
            onClick={() => setEditingTitle(true)}
            style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
            title="クリックでタイトルを編集"
          >
            {kr.title}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProgressBar pct={pct} color={color} height={5} />
          <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        {editingVal ? (
          <>
            <input
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveVal(); if (e.key === 'Escape') setEditingVal(false); }}
              style={{ width: 60, padding: '2px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }}
              autoFocus
            />
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>/ {kr.target_value} {kr.unit}</span>
            <button onClick={saveVal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}><Check size={12} /></button>
            <button onClick={() => setEditingVal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}><X size={12} /></button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{kr.current_value}</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>/ {kr.target_value} {kr.unit}</span>
            <button onClick={() => setEditingVal(true)} title="進捗値を編集" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, opacity: 0.6 }}><Pencil size={10} /></button>
            <button onClick={() => onDelete(kr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E60012', padding: 2, opacity: 0.5 }}><Trash2 size={10} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function AddKRForm({ okrId, onAdd }: { okrId: string; onAdd: (kr: KeyResult) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('100');
  const [unit, setUnit] = useState('%');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const kr = await okrApi.createKR(okrId, { title, target_value: parseFloat(target) || 100, current_value: 0, unit });
      onAdd(kr);
      setTitle(''); setTarget('100'); setUnit('%'); setOpen(false);
    } finally { setSaving(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-sm)', padding: '4px 10px', cursor: 'pointer', marginTop: 8 }}>
      <Plus size={10} /> KR を追加
    </button>
  );

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Key Result のタイトル" style={{ padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} autoFocus />
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={target} onChange={e => setTarget(e.target.value)} type="number" placeholder="目標値" style={{ width: 80, padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} />
        <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="単位" style={{ width: 64, padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={saving || !title.trim()} style={{ padding: '4px 12px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>追加</button>
        <button onClick={() => setOpen(false)} style={{ padding: '4px 12px', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)' }}>キャンセル</button>
      </div>
    </div>
  );
}

function OKRCard({ okr, onUpdate, onDelete, onKRAdd, onKRUpdate, onKRDelete }: {
  okr: OKR;
  onUpdate: (id: string, d: Partial<OKR>) => void;
  onDelete: (id: string) => void;
  onKRAdd: (okrId: string, kr: KeyResult) => void;
  onKRUpdate: (okrId: string, krId: string, d: Partial<KeyResult>) => void;
  onKRDelete: (okrId: string, krId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(okr.title);
  const pct = Math.round(okrProgress(okr));
  const color = progressColor(pct);

  function saveTitle() {
    const t = titleDraft.trim();
    if (t && t !== okr.title) onUpdate(okr.id, { title: t });
    setEditingTitle(false);
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
      >
        <div style={{ marginTop: 2, color: 'var(--text-3)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {editingTitle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }} onClick={e => e.stopPropagation()}>
                <input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(okr.title); setEditingTitle(false); } }}
                  style={{ flex: 1, padding: '3px 8px', fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--text-1)' }}
                  autoFocus
                />
                <button onClick={saveTitle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}><Check size={12} /></button>
                <button onClick={() => { setTitleDraft(okr.title); setEditingTitle(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}><X size={12} /></button>
              </div>
            ) : (
              <span
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}
                onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true); }}
                title="ダブルクリックでタイトルを編集"
              >
                {okr.title}
              </span>
            )}
            {!editingTitle && (
              <span style={{ fontSize: 9, fontWeight: 600, color: okr.status === 'completed' ? 'var(--text-2)' : okr.status === 'cancelled' ? 'var(--text-3)' : '#1A56DB', background: okr.status === 'completed' ? '#DCFCE7' : okr.status === 'cancelled' ? 'var(--surface-sub)' : '#EFF6FF', border: `1px solid ${okr.status === 'completed' ? '#86EFAC' : okr.status === 'cancelled' ? 'var(--border)' : '#BFDBFE'}`, borderRadius: 3, padding: '1px 6px', letterSpacing: '0.03em', flexShrink: 0 }}>
                {okr.status === 'completed' ? '完了' : okr.status === 'cancelled' ? '中止' : '進行中'}
              </span>
            )}
          </div>
          {okr.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{okr.description}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProgressBar pct={pct} color={color} height={6} />
            <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{pct}%</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{okr.key_results.length} KR</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setEditingTitle(true)}
            title="タイトルを編集"
            style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-3)', opacity: 0.6 }}
          >
            <Pencil size={10} />
          </button>
          {okr.status !== 'completed' && (
            <button
              onClick={() => onUpdate(okr.id, { status: 'completed' })}
              title="完了にする"
              style={{ padding: '4px 6px', fontSize: 10, background: '#DCFCE7', color: 'var(--text-2)', border: '1px solid #86EFAC', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
            >
              <Check size={10} />
            </button>
          )}
          <button onClick={() => onDelete(okr.id)} style={{ padding: '4px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: '#E60012', opacity: 0.6 }}>
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border-sub)' }}>
          <div style={{ paddingTop: 8 }}>
            {okr.key_results.map(kr => (
              <KRRow
                key={kr.id}
                kr={kr}
                onUpdate={(id, d) => onKRUpdate(okr.id, id, d)}
                onDelete={(id) => onKRDelete(okr.id, id)}
              />
            ))}
          </div>
          <AddKRForm okrId={okr.id} onAdd={(kr) => onKRAdd(okr.id, kr)} />
        </div>
      )}
    </div>
  );
}

function AddOKRForm({ quarter, onAdd }: { quarter: string; onAdd: (okr: OKR) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const okr = await okrApi.create({ title, description, quarter });
      onAdd(okr);
      setTitle(''); setDescription(''); setOpen(false);
    } finally { setSaving(false); }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, width: '100%' }}
    >
      <Plus size={13} /> Objective を追加
    </button>
  );

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Objective のタイトル（例: 売上150%成長を達成する）" style={{ padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--text-1)' }} autoFocus />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="説明（任意）" rows={2} style={{ padding: '7px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--text-1)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={saving || !title.trim()} style={{ padding: '6px 16px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }}>追加</button>
        <button onClick={() => setOpen(false)} style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)' }}>キャンセル</button>
      </div>
    </div>
  );
}

export default function OkrPage() {
  const [okrList, setOkrList] = useState<OKR[]>([]);
  const [quarters, setQuarters] = useState<string[]>([]);
  const [selectedQ, setSelectedQ] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const currentQuarter = (() => {
    const d = new Date();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `${d.getFullYear()}Q${q}`;
  })();

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const [list, qs] = await Promise.all([okrApi.list(q || undefined), okrApi.quarters()]);
      setOkrList(list);
      const allQ: string[] = qs;
      if (!allQ.includes(currentQuarter)) allQ.unshift(currentQuarter);
      setQuarters(allQ);
      if (!q && allQ.length > 0) setSelectedQ(allQ[0]);
    } finally { setLoading(false); }
  }, [currentQuarter]);

  useEffect(() => { load(selectedQ); }, []);

  function handleQChange(q: string) {
    setSelectedQ(q);
    load(q);
  }

  async function handleDelete(id: string) {
    await okrApi.delete(id);
    setOkrList(l => l.filter(o => o.id !== id));
  }

  async function handleUpdate(id: string, d: Partial<OKR>) {
    const updated = await okrApi.update(id, d as Record<string, unknown>);
    setOkrList(l => l.map(o => o.id === id ? { ...o, ...updated } : o));
  }

  function handleKRAdd(okrId: string, kr: KeyResult) {
    setOkrList(l => l.map(o => o.id === okrId ? { ...o, key_results: [...o.key_results, kr] } : o));
  }

  async function handleKRUpdate(okrId: string, krId: string, d: Partial<KeyResult>) {
    const updated = await okrApi.updateKR(krId, d as Record<string, unknown>);
    setOkrList(l => l.map(o => o.id === okrId ? { ...o, key_results: o.key_results.map(kr => kr.id === krId ? { ...kr, ...updated } : kr) } : o));
  }

  async function handleKRDelete(okrId: string, krId: string) {
    await okrApi.deleteKR(krId);
    setOkrList(l => l.map(o => o.id === okrId ? { ...o, key_results: o.key_results.filter(kr => kr.id !== krId) } : o));
  }

  const totalPct = okrList.length > 0
    ? Math.round(okrList.reduce((s, o) => s + okrProgress(o), 0) / okrList.length)
    : 0;

  const completedCount = okrList.filter(o => okrProgress(o) >= 100 || o.status === 'completed').length;
  const totalColor = progressColor(totalPct);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Target size={15} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>OKR管理</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>Objectives & Key Results</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {quarters.map(q => (
              <button
                key={q}
                onClick={() => handleQChange(q)}
                style={{ padding: '4px 12px', fontSize: 11, fontWeight: selectedQ === q ? 700 : 400, background: selectedQ === q ? 'var(--accent)' : 'none', color: selectedQ === q ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Main column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
          ) : (
            <>
              {okrList.map(okr => (
                <OKRCard
                  key={okr.id}
                  okr={okr}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onKRAdd={handleKRAdd}
                  onKRUpdate={handleKRUpdate}
                  onKRDelete={handleKRDelete}
                />
              ))}
              <AddOKRForm quarter={selectedQ || currentQuarter} onAdd={o => setOkrList(l => [...l, o])} />
            </>
          )}
        </div>

        {/* Summary sidebar */}
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Overall score with donut */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>四半期スコア</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <DonutChart pct={totalPct} color={totalColor} size={72} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: totalColor, letterSpacing: '-0.03em' }}>{totalPct}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
                  {completedCount} / {okrList.length} 完了
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: totalColor }}>
                  {totalPct >= 70 ? 'オントラック' : totalPct >= 40 ? '改善中' : '要注意'}
                </div>
              </div>
            </div>
          </div>

          {/* Per-OKR mini scores */}
          {okrList.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={10} /> 内訳
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {okrList.map(okr => {
                  const p = Math.round(okrProgress(okr));
                  const c = progressColor(p);
                  return (
                    <div key={okr.id}>
                      <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={okr.title}>{okr.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ProgressBar pct={p} color={c} height={4} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: c, flexShrink: 0 }}>{p}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>進捗ガイド</div>
            {([['#E60012', '0–39%', '要注意'], ['#B46400', '40–69%', '改善中'], ['var(--text-2)', '70–100%', 'オントラック']] as const).map(([c, r, l]) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r} {l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
