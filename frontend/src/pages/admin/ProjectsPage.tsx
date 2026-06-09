/**
 * ProjectsPage — プロジェクト一覧 + 詳細（右ペイン）
 * /projects
 *
 * 左: プロジェクトカード一覧（進捗バー・遅延バッジ付き）
 * 右: 選択プロジェクトのピース一覧
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projects as projectApi, pieces as pieceApi } from '../../services/api';
import { Project, Piece, PieceStatus } from '../../types';
import { Plus, FolderOpen, Grid2X2, ArrowRight, Pencil, Trash2, Check, X, AlertTriangle, BookCopy, Save, Sparkles } from 'lucide-react';
import { PALETTE_CLASSIC, PALETTE_COLOR } from '../../constants/projectColors';

// ── ステータス表示 ────────────────────────────────────────────────────────────
const STATUS_ORDER: PieceStatus[] = ['in_progress', 'ready', 'locked', 'done'];
const STATUS_LABEL: Record<PieceStatus, string> = {
  locked: 'ロック中', ready: '着手可', in_progress: '進行中', done: '完了',
};
const STATUS_COLOR: Record<PieceStatus, string> = {
  locked: '#888', ready: '#555555', in_progress: '#B46400', done: 'var(--text-2)',
};

// ── Project color dot ────────────────────────────────────────────────────────
function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

// ── ミニ進捗バー ──────────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s' }} />
    </div>
  );
}

// ── カラーピッカー（クラシック / カラー 2タブ）──────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [tab, setTab] = useState<'classic' | 'color'>(() =>
    PALETTE_COLOR.includes(value) ? 'color' : 'classic'
  );
  const palette = tab === 'classic' ? PALETTE_CLASSIC : PALETTE_COLOR;
  const cols = tab === 'classic' ? 5 : 5; // 2行×5 or 3行×5

  return (
    <div>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 8 }}>
        {(['classic', 'color'] as const).map(t => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
              borderRadius: t === 'classic' ? '3px 0 0 3px' : '0 3px 3px 0',
              background: tab === t ? 'var(--text-1)' : 'var(--border)',
              color: tab === t ? '#fff' : 'var(--text-3)',
              letterSpacing: '0.04em',
            }}
          >
            {t === 'classic' ? 'クラシック' : 'カラー'}
          </button>
        ))}
      </div>
      {/* スウォッチ */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 5 }}>
        {palette.map(c => (
          <button
            key={c} type="button" onClick={() => onChange(c)}
            style={{
              width: 20, height: 20, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer', outline: 'none',
              border: value === c ? '2px solid var(--text-1)' : '2px solid transparent',
              boxShadow: value === c ? `0 0 0 1px ${c}` : 'none',
              flexShrink: 0, transition: 'transform 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.25)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

// ── 新規プロジェクト作成フォーム ─────────────────────────────────────────────
const COLORS = PALETTE_CLASSIC; // 後方互換エイリアス

function CreateProjectForm({ onCreated, onCancel }: { onCreated: (p: Project) => void; onCancel: () => void }) {
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const p = await projectApi.create({ name: name.trim(), description: desc.trim(), color });
      onCreated(p);
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>新規プロジェクト</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="プロジェクト名" required
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
        />
        <input
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="概要（任意）"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}>
            キャンセル
          </button>
          <button type="submit" disabled={saving || !name.trim()} style={{ padding: '6px 14px', background: 'var(--text-1)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '作成中...' : '作成'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── テンプレートモーダル ──────────────────────────────────────────────────────
interface ProjectTemplate {
  id: string; name: string; avg_duration_days: number | null;
  source_project_name: string | null; created_at: string;
  structure: { pieces: unknown[]; connections: unknown[] };
}

function TemplateModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [templates, setTemplates]       = useState<ProjectTemplate[]>([]);
  const [loading,   setLoading]         = useState(true);
  const [selected,  setSelected]        = useState<ProjectTemplate | null>(null);
  const [newName,   setNewName]         = useState('');
  const [newColor,  setNewColor]        = useState(COLORS[1]);
  const [creating,  setCreating]        = useState(false);

  useEffect(() => {
    projectApi.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!selected || !newName.trim()) return;
    setCreating(true);
    try {
      const { project } = await projectApi.createFromTemplate(selected.id, newName.trim(), newColor);
      onCreated(project);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    await projectApi.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 401, width: 'min(520px, 94vw)',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 12px 48px rgba(0,0,0,0.16)',
      }}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookCopy size={14} color="#B46400" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>テンプレートから作成</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={14} /></button>
        </div>

        <div style={{ padding: '16px 18px', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0' }}>読み込み中…</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '24px 0', lineHeight: 1.8 }}>
              テンプレートがありません<br />
              <span style={{ fontSize: 10 }}>プロジェクト詳細の「テンプレートとして保存」から作成できます</span>
            </div>
          ) : (
            <>
              {/* テンプレート選択 */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>テンプレートを選択</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => { setSelected(t); setNewName(t.name); }}
                    style={{
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      background: selected?.id === t.id ? 'rgba(180,100,0,0.06)' : 'var(--bg)',
                      border: `1px solid ${selected?.id === t.id ? 'rgba(180,100,0,0.35)' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <BookCopy size={13} color={selected?.id === t.id ? '#B46400' : 'var(--text-3)'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                        {(t.structure?.pieces?.length ?? 0)}件のピース
                        {t.avg_duration_days ? ` ・ 平均${t.avg_duration_days}日` : ''}
                        {t.source_project_name ? ` ・ ${t.source_project_name}より` : ''}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, opacity: 0.5, borderRadius: 4 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>

              {/* 新規プロジェクト設定 */}
              {selected && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 10 }}>新規プロジェクト設定</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="プロジェクト名"
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <ColorPicker value={newColor} onChange={setNewColor} />
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || creating}
                      style={{ padding: '9px 0', background: '#B46400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: creating ? 0.6 : 1 }}
                    >
                      {creating ? '作成中…' : `「${newName}」を作成`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── テンプレート保存モーダル ───────────────────────────────────────────────────
function SaveTemplateModal({
  project, onClose, onSaved,
}: {
  project: Project; onClose: () => void; onSaved: () => void;
}) {
  const [name,   setName]   = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await projectApi.saveTemplate(project.id, name.trim());
      setDone(true);
      setTimeout(onSaved, 1200);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 401, width: 'min(360px, 92vw)',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '22px 24px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.16)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Save size={14} color="#B46400" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>テンプレートとして保存</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={14} /></button>
        </div>
        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
            ✓ テンプレートを保存しました
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6 }}>
              ピース構成・依存関係をスナップショットとして保存します。
              次回の同種プロジェクトで再利用できます。
            </div>
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="テンプレート名"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>キャンセル</button>
              <button onClick={handleSave} disabled={!name.trim() || saving}
                style={{ padding: '7px 16px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1 }}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [projectList, setProjectList] = useState<Project[]>([]);
  const [allPieces,   setAllPieces]   = useState<Piece[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [templateModalOpen,  setTemplateModalOpen]  = useState(false);
  const [saveTemplateTarget, setSaveTemplateTarget] = useState<Project | null>(null);

  // 詳細ペイン
  const selectedId = searchParams.get('id') ?? null;
  const selected   = projectList.find(p => p.id === selectedId) ?? null;
  const [pieces,        setPieces]        = useState<Piece[]>([]);
  const [piecesLoading, setPiecesLoading] = useState(false);

  // プロジェクト名・カラー編集
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editingName,  setEditingName]  = useState('');
  const [editingColor, setEditingColor] = useState(PALETTE_CLASSIC[0]);

  // ── データ取得 ────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([projectApi.list(), pieceApi.list()])
      .then(([pjs, ps]) => { setProjectList(pjs); setAllPieces(ps); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setPieces([]); return; }
    setPiecesLoading(true);
    projectApi.pieces(selectedId)
      .then(data => setPieces(data))
      .catch(() => setPieces([]))
      .finally(() => setPiecesLoading(false));
  }, [selectedId]);

  // ── プロジェクト別統計 ────────────────────────────────────────────────────
  const projectStats = useMemo(() => {
    const map = new Map<string, { total: number; done: number; overdue: number }>();
    for (const p of allPieces) {
      if (!p.project_id) continue;
      if (!map.has(p.project_id)) map.set(p.project_id, { total: 0, done: 0, overdue: 0 });
      const s = map.get(p.project_id)!;
      s.total++;
      if (p.status === 'done') s.done++;
      if (p.due_date && new Date(p.due_date) < today && p.status !== 'done') s.overdue++;
    }
    return map;
  }, [allPieces, today]);

  // ── ハンドラ ──────────────────────────────────────────────────────────────
  function selectProject(id: string) { setSearchParams({ id }); }

  function handleCreated(p: Project) {
    setProjectList(prev => [p, ...prev]);
    setCreating(false);
    setSearchParams({ id: p.id });
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？\nピースは削除されません。`)) return;
    await projectApi.delete(id);
    setProjectList(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSearchParams({});
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    await projectApi.update(id, { name: editingName.trim(), color: editingColor });
    setProjectList(prev => prev.map(p => p.id === id ? { ...p, name: editingName.trim(), color: editingColor } : p));
    setEditingId(null);
  }

  const piecesByStatus = useCallback(() => {
    const groups: Partial<Record<PieceStatus, Piece[]>> = {};
    for (const p of pieces) {
      if (!groups[p.status]) groups[p.status] = [];
      groups[p.status]!.push(p);
    }
    return groups;
  }, [pieces]);

  const donePieces  = pieces.filter(p => p.status === 'done').length;
  const totalPieces = pieces.length;
  const overduePieces = pieces.filter(p => p.due_date && new Date(p.due_date) < today && p.status !== 'done').length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── 左ペイン: プロジェクト一覧 ── */}
      <div style={{
        width: 288, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--surface)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
              プロジェクト
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setTemplateModalOpen(true)}
                title="テンプレートから作成"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
              >
                <BookCopy size={11} /> テンプレート
              </button>
              <button
                onClick={() => navigate('/projects/wizard')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <Sparkles size={11} /> AI生成
              </button>
              <button
                onClick={() => setCreating(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--text-1)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={11} /> 新規
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {creating && (
            <CreateProjectForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
          )}

          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '20px 8px', textAlign: 'center' }}>読み込み中...</div>
          ) : projectList.length === 0 && !creating ? (
            <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '20px 8px', textAlign: 'center', lineHeight: 1.8 }}>
              プロジェクトがありません<br />
              <button onClick={() => setCreating(true)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                最初のプロジェクトを作成 →
              </button>
            </div>
          ) : (
            projectList.map(p => {
              const isSelected = p.id === selectedId;
              const stats = projectStats.get(p.id);
              const pct = stats && stats.total > 0 ? Math.round(stats.done / stats.total * 100) : null;
              const barColor = pct === 100 ? 'var(--text-2)' : 'var(--accent)';

              if (editingId === p.id) {
                return (
                  <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r-lg)', padding: '10px 10px 8px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      <input
                        autoFocus value={editingName} onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                        style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '6px 8px', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}
                      />
                      <button onClick={() => handleRename(p.id)} style={{ padding: '4px 8px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', cursor: 'pointer' }}><Check size={11} /></button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '4px 7px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer', color: 'var(--text-3)' }}><X size={11} /></button>
                    </div>
                    <ColorPicker value={editingColor} onChange={setEditingColor} />
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  onClick={() => selectProject(p.id)}
                  style={{
                    padding: '9px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                    background: isSelected ? 'var(--accent-sub)' : 'none',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-sub)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none'; }}
                >
                  {/* 上段: カラードット + 名前 + 遅延バッジ + アクション */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: pct !== null ? 7 : 0 }}>
                    <ColorDot color={p.color} size={8} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: isSelected ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    {stats && stats.overdue > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 99, padding: '1px 5px', flexShrink: 0 }}>
                        <AlertTriangle size={8} strokeWidth={2.5} />{stats.overdue}
                      </span>
                    )}
                    {p.status === 'completed' && (
                      <span style={{ fontSize: 9, color: 'var(--text-2)', fontWeight: 600, flexShrink: 0 }}>完了</span>
                    )}
                    <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditingId(p.id); setEditingName(p.name); setEditingColor(p.color || PALETTE_CLASSIC[0]); }} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderRadius: 3 }} title="名前・カラーを変更"><Pencil size={10} /></button>
                      <button onClick={() => handleDelete(p.id, p.name)} style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderRadius: 3 }} title="削除"><Trash2 size={10} /></button>
                    </div>
                  </div>

                  {/* 下段: ミニ進捗バー */}
                  {pct !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 15 }}>
                      <MiniBar pct={pct} color={barColor} />
                      <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, letterSpacing: '-0.01em' }}>
                        {stats!.done}/{stats!.total}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── テンプレートモーダル ── */}
      {templateModalOpen && (
        <TemplateModal
          onClose={() => setTemplateModalOpen(false)}
          onCreated={p => {
            setProjectList(prev => [p, ...prev]);
            setTemplateModalOpen(false);
            setSearchParams({ id: p.id });
          }}
        />
      )}

      {/* ── テンプレート保存モーダル ── */}
      {saveTemplateTarget && (
        <SaveTemplateModal
          project={saveTemplateTarget}
          onClose={() => setSaveTemplateTarget(null)}
          onSaved={() => setSaveTemplateTarget(null)}
        />
      )}

      {/* ── 右ペイン: プロジェクト詳細 ── */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        {!selected ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
            <FolderOpen size={32} strokeWidth={1} />
            <div style={{ fontSize: 12 }}>プロジェクトを選択してください</div>
          </div>
        ) : (
          <div style={{ padding: '24px 28px', maxWidth: 800 }}>

            {/* Project header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <ColorDot color={selected.color} size={11} />
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>{selected.name}</div>
                </div>
                {selected.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 21 }}>{selected.description}</div>
                )}
                {selected.due_date && (
                  <div style={{ marginLeft: 21, marginTop: 4, fontSize: 10, color: new Date(selected.due_date) < today ? '#E60012' : 'var(--text-3)' }}>
                    期限 {new Date(selected.due_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setSaveTemplateTarget(selected)}
                  title="テンプレートとして保存"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  <Save size={11} /> 保存
                </button>
                <button
                  onClick={() => navigate(`/board?project=${selected.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'var(--text-1)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  ボードで開く <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {/* 進捗サマリ */}
            {totalPieces > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 24 }}>
                {/* 進捗バー */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>進捗</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${totalPieces === 0 ? 0 : Math.round(donePieces/totalPieces*100)}%`, background: donePieces === totalPieces ? 'var(--text-2)' : 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: donePieces === totalPieces ? 'var(--text-2)' : 'var(--accent)', flexShrink: 0 }}>
                      {Math.round(donePieces / totalPieces * 100)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{donePieces}/{totalPieces} 件完了</div>
                </div>
                {/* 遅延 */}
                {overduePieces > 0 && (
                  <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>遅延</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={13} color="#B45309" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#B45309' }}>{overduePieces}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>件</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ピース一覧 */}
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              ピース（{totalPieces}件）
            </div>

            {piecesLoading ? (
              <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '20px 0' }}>読み込み中...</div>
            ) : totalPieces === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                このプロジェクトにピースはありません<br />
                <button
                  onClick={() => navigate(`/board?project=${selected.id}`)}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  ボードでピースを追加 →
                </button>
              </div>
            ) : (
              STATUS_ORDER.map(status => {
                const group = piecesByStatus()[status];
                if (!group || group.length === 0) return null;
                return (
                  <div key={status} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                      <div style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status], letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {STATUS_LABEL[status]}（{group.length}）
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {group.map(piece => {
                        const isOverdue = !!piece.due_date && new Date(piece.due_date) < today && piece.status !== 'done';
                        const prog = piece.status === 'in_progress' ? (piece.progress ?? 0) : 0;
                        return (
                          <div
                            key={piece.id}
                            onClick={() => navigate(`/board?piece=${piece.id}`)}
                            style={{
                              padding: '10px 14px', background: 'var(--surface)',
                              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {piece.title}
                                </div>
                                {piece.assignee_name && (
                                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{piece.assignee_name}</div>
                                )}
                              </div>
                              {piece.due_date && (
                                <div style={{ fontSize: 10, color: isOverdue ? '#E60012' : 'var(--text-3)', flexShrink: 0, fontWeight: isOverdue ? 700 : 400 }}>
                                  {new Date(piece.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                                  {isOverdue && <AlertTriangle size={9} style={{ marginLeft: 3, verticalAlign: 'middle' }} />}
                                </div>
                              )}
                              <Grid2X2 size={10} color="var(--text-3)" style={{ flexShrink: 0 }} />
                            </div>

                            {/* in_progress のとき進捗バー */}
                            {prog > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${prog}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{prog}%</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
