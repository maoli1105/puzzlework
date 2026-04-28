import React, { useState, useEffect } from 'react';
import { projects as projectApi } from '../../services/api';
import { Project } from '../../types';
import { X, Copy, Layers, Clock, ArrowRight } from 'lucide-react';

interface Template {
  id: string; name: string; source_project_name: string | null;
  avg_duration_days: number | null; created_at: string;
  structure: {
    pieces: { ref_id: string; title: string; skill_tags: string[] }[];
    connections: { from: string; to: string; type: string }[];
  };
}

interface Props {
  open:       boolean;
  onClose:    () => void;
  onCreated:  () => void;
  projects:   Project[];
}

export default function TemplatePanel({ open, onClose, onCreated, projects }: Props) {
  const [templates,  setTemplates]  = useState<Template[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [creating,   setCreating]   = useState<string | null>(null); // template id being instantiated
  const [newName,    setNewName]    = useState('');
  const [saving,     setSaving]     = useState<string | null>(null); // project id being saved
  const [savedMsg,   setSavedMsg]   = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    projectApi.listTemplates()
      .then((ts) => setTemplates(ts as Template[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function handleCreate(templateId: string) {
    if (!newName.trim()) return;
    try {
      await projectApi.createFromTemplate(templateId, newName.trim());
      setCreating(null);
      setNewName('');
      onCreated();
    } catch { /* ignore */ }
  }

  async function handleSaveTemplate(projectId: string) {
    setSaving(projectId);
    try {
      await projectApi.saveTemplate(projectId);
      // Reload templates
      const ts = await projectApi.listTemplates();
      setTemplates(ts as Template[]);
      setSavedMsg('テンプレートに保存しました');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        zIndex: 201,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s ease',
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Inter","Outfit",sans-serif',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                テンプレート
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                プロジェクトテンプレート
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
              <X size={15} />
            </button>
          </div>
          {savedMsg && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#059669', background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 6, padding: '4px 10px' }}>
              {savedMsg}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── 現在のプロジェクトを保存 ── */}
          {projects.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                テンプレートに保存
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {projects.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    background: 'var(--surface-sub)', borderRadius: 8, border: '1px solid var(--border-sub)',
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: p.color || '#6366f1', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <button
                      disabled={saving === p.id}
                      onClick={() => handleSaveTemplate(p.id)}
                      style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 700,
                        background: 'var(--text-1)', color: '#FAFAF8',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        opacity: saving === p.id ? 0.4 : 1, whiteSpace: 'nowrap',
                      }}>
                      {saving === p.id ? '保存中…' : '保存'}
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
            </div>
          )}

          {/* ── テンプレート一覧 ── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            保存済みテンプレート ({templates.length})
          </div>

          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>読み込み中…</div>
          )}
          {!loading && templates.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0', lineHeight: 1.7 }}>
              まだテンプレートがありません。<br />
              プロジェクトを「保存」してテンプレートを作成できます。
            </div>
          )}

          {templates.map(tmpl => {
            const pieceCount = tmpl.structure.pieces.length;
            const connCount  = tmpl.structure.connections.length;
            const preview    = tmpl.structure.pieces.slice(0, 4).map(p => p.title.replace(/^【.+?】/, ''));
            const isCreating = creating === tmpl.id;

            return (
              <div key={tmpl.id} style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                {/* Card header */}
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-sub)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tmpl.name}
                      </div>
                      {tmpl.source_project_name && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                          from {tmpl.source_project_name}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <Stat icon={<Layers size={9} />} value={`${pieceCount}タスク`} />
                      {connCount > 0 && <Stat icon={<ArrowRight size={9} />} value={`${connCount}依存`} />}
                      {tmpl.avg_duration_days != null && (
                        <Stat icon={<Clock size={9} />} value={`≈${tmpl.avg_duration_days}日`} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Piece preview */}
                <div style={{ padding: '8px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {preview.map((t, i) => (
                      <span key={i} style={{
                        fontSize: 9.5, color: 'var(--text-2)',
                        background: 'var(--surface-sub)', border: '1px solid var(--border-sub)',
                        borderRadius: 5, padding: '1px 6px', maxWidth: 120,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t}</span>
                    ))}
                    {pieceCount > 4 && (
                      <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>+{pieceCount - 4}件</span>
                    )}
                  </div>

                  {/* Create form */}
                  {isCreating ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreate(tmpl.id);
                          if (e.key === 'Escape') { setCreating(null); setNewName(''); }
                        }}
                        placeholder="プロジェクト名を入力..."
                        style={{
                          flex: 1, fontSize: 11, padding: '5px 9px',
                          border: '1px solid var(--accent)', borderRadius: 7,
                          background: 'var(--bg)', outline: 'none', color: 'var(--text-1)',
                        }}
                      />
                      <button
                        onClick={() => handleCreate(tmpl.id)}
                        disabled={!newName.trim()}
                        style={{
                          padding: '5px 12px', background: 'var(--accent)', color: '#fff',
                          border: 'none', borderRadius: 7, cursor: 'pointer',
                          fontSize: 11, fontWeight: 700,
                          opacity: newName.trim() ? 1 : 0.4,
                        }}>
                        作成
                      </button>
                      <button
                        onClick={() => { setCreating(null); setNewName(''); }}
                        style={{ padding: '5px 8px', background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 11 }}>
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreating(tmpl.id); setNewName(tmpl.name); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 14px', fontSize: 11, fontWeight: 700,
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', borderRadius: 8, cursor: 'pointer',
                        width: '100%', justifyContent: 'center',
                        transition: 'opacity 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                      <Copy size={11} /> このテンプレートを使う
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 3,
      fontSize: 9.5, color: 'var(--text-3)',
      background: 'var(--surface-sub)', border: '1px solid var(--border-sub)',
      borderRadius: 5, padding: '1px 5px',
    }}>
      {icon}{value}
    </span>
  );
}
