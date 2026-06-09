import React, { useState, useEffect, useRef } from 'react';
import { Piece, PieceStatus, Project } from '../../types';
import { pieces as pieceApi, users as userApi, projects as projectApi } from '../../services/api';
import { X, Sparkles, Clock, MessageCircle, History, Pencil, Check, Trash2, ScrollText, Layers, Link2, GitBranch, ArrowUpCircle, ArrowDownCircle, CheckCircle2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useNarrativeProjection } from '../../projections/narrative/useNarrativeProjection';
import { useFlowEcology } from '../../projections/flowecology/useFlowEcology';
import type { FlowEcologyProjection } from '../../projections/flowecology/types';

import type { SmartSuggestResult } from '../../services/api';
interface Worker { id: string; name: string; active_pieces: number; }
type SuggestedWorker = SmartSuggestResult;
interface Props { piece: Piece | null; onClose: () => void; onUpdated: () => void; allPieces?: Piece[]; onDelete?: (id: string) => void; }

const STATUS_ACCENT: Record<PieceStatus, string> = {
  locked:      'var(--text-3)',
  ready:       '#4A9B6F',
  in_progress: 'var(--accent)',
  done:        'var(--text-3)',
};
const STATUS_LABELS: Record<PieceStatus, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};
const ADMIN_TRANSITIONS: Record<PieceStatus, PieceStatus[]> = {
  locked:      ['ready'],
  ready:       ['locked', 'in_progress'],
  in_progress: ['ready', 'done'],
  done:        ['in_progress', 'ready'],
};

export default function PieceDetailPanel({ piece, onClose, onUpdated, allPieces = [], onDelete }: Props) {
  const [updating, setUpdating]       = useState(false);
  const [workers, setWorkers]         = useState<Worker[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [assigneeId, setAssigneeId]   = useState('');
  const [projectId, setProjectId]     = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [progress, setProgress]       = useState(0);
  const [bizImpact, setBizImpact]     = useState('');
  const [publishReward, setPublishReward] = useState('');
  const [publishing, setPublishing]   = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedWorker[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [cascadeCount, setCascadeCount] = useState(0);
  const [cascadeAffected, setCascadeAffected] = useState<{ id: string; title: string }[]>([]);
  const [cascadeExpanded, setCascadeExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    userApi.workers().then(setWorkers).catch(() => {});
    projectApi.list().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (piece?.skill_tags && piece.skill_tags.length > 0) {
      userApi.smartSuggest(piece.skill_tags).then(setSuggestions).catch(() => {});
    } else {
      setSuggestions([]);
    }
    setShowSuggest(false);
    if (piece?.id) {
      pieceApi.cascadeImpact(piece.id, 0)
        .then((d: { affected: { id: string; title: string }[] }) => {
          setCascadeCount(d.affected.length);
          setCascadeAffected(d.affected.map(a => ({ id: a.id, title: a.title })));
        })
        .catch(() => { setCascadeCount(0); setCascadeAffected([]); });
    }
    setCascadeExpanded(false);
  }, [piece?.id]);

  useEffect(() => {
    setAssigneeId(piece?.assignee_id ?? '');
    setProjectId(piece?.project_id ?? '');
    setDueDate(piece?.due_date ? piece.due_date.slice(0, 10) : '');
    setProgress(piece?.progress ?? 0);
    setBizImpact(piece?.business_impact ? String(piece.business_impact) : '');
  }, [piece?.id]);

  async function changeStatus(status: PieceStatus) {
    if (!piece) return;
    setUpdating(true);
    try { await pieceApi.updateStatus(piece.id, status); onUpdated(); }
    finally { setUpdating(false); }
  }
  async function handlePublishToggle() {
    if (!piece) return;
    setPublishing(true);
    try {
      if (piece.is_external) await pieceApi.unpublish(piece.id);
      else await pieceApi.publish(piece.id, parseFloat(publishReward) || 0);
      onUpdated();
    } finally { setPublishing(false); }
  }
  async function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!piece) return;
    setProjectId(e.target.value);
    await pieceApi.update(piece.id, { project_id: e.target.value || null });
    onUpdated();
  }
  async function handleDueDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!piece) return;
    setDueDate(e.target.value);
    await pieceApi.update(piece.id, { due_date: e.target.value || null });
    onUpdated();
  }
  async function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!piece) return;
    setAssigneeId(e.target.value);
    setUpdating(true);
    try { await pieceApi.assign(piece.id, e.target.value || null); onUpdated(); }
    finally { setUpdating(false); }
  }
  function handleProgressChange(val: number) {
    setProgress(val); // local state only — no API call yet
  }
  async function handleProgressCommit(val: number) {
    if (!piece) return;
    await pieceApi.update(piece.id, { progress: val });
    onUpdated();
  }
  async function handleBizImpactBlur() {
    if (!piece) return;
    const n = parseInt(bizImpact) || 0;
    await pieceApi.update(piece.id, { business_impact: n });
    onUpdated();
  }

  const open = piece !== null;

  // Priority pill colors
  const P_PILL_BG   = ['', '#D1FAE5', '#BAE6FD', '#FDE68A', '#FDBA74', '#FCA5A5'];
  const P_PILL_TEXT = ['', '#065F46', '#0369A1', '#92400E', '#C2410C', '#B91C1C'];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.10)' }} />
      )}

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-6px 0 32px rgba(0,0,0,0.10)',
        zIndex: 101,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s ease',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {piece && (
          <>
            {/* ── HEADER ── */}
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineTextEdit
                    value={piece.title}
                    onSave={async (v) => { await pieceApi.update(piece.id, { title: v }); onUpdated(); }}
                    multiline={false}
                    textStyle={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, letterSpacing: '-0.02em' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, marginTop: 2 }}>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/board?piece=${piece.id}`;
                      navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
                    }}
                    title="リンクをコピー"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#16a34a' : 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 5, transition: 'color 0.15s' }}
                  >
                    {copied ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => { if (window.confirm(`「${piece.title}」を削除しますか？`)) onDelete(piece.id); }}
                      title="削除"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 5, opacity: 0.55 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.55')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 5 }}>
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Status + transitions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                  color: STATUS_ACCENT[piece.status],
                  background: STATUS_ACCENT[piece.status] + '14',
                  border: `1px solid ${STATUS_ACCENT[piece.status]}44`,
                  borderRadius: 99, padding: '3px 10px',
                }}>
                  {STATUS_LABELS[piece.status]}
                </span>
                {ADMIN_TRANSITIONS[piece.status].map(s => (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    disabled={updating}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 10px', fontSize: 10, fontWeight: 600,
                      background: 'var(--surface-sub)',
                      border: `1px solid ${STATUS_ACCENT[s]}44`,
                      color: STATUS_ACCENT[s], borderRadius: 99,
                      cursor: updating ? 'not-allowed' : 'pointer',
                      opacity: updating ? 0.5 : 1, transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!updating) e.currentTarget.style.background = STATUS_ACCENT[s] + '14'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-sub)'; }}
                  >
                    → {STATUS_LABELS[s]}
                  </button>
                ))}
                {cascadeCount > 0 && (
                  <span style={{ fontSize: 9.5, color: '#B46400', background: 'rgba(180,100,0,0.08)', border: '1px solid rgba(180,100,0,0.25)', borderRadius: 99, padding: '2px 9px', marginLeft: 'auto', fontWeight: 600 }}>
                    完了で {cascadeCount}件↗
                  </span>
                )}
              </div>
            </div>

            {/* ── SCROLLABLE BODY ── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* 目的 */}
              <div style={{ padding: '16px 20px 4px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                  目的 <Pencil size={8} style={{ opacity: 0.4 }} />
                </div>
                <InlineTextEdit
                  value={piece.objective ?? ''}
                  onSave={async (v) => { await pieceApi.update(piece.id, { objective: v }); onUpdated(); }}
                  multiline
                  textStyle={{ fontSize: 13, color: piece.objective ? 'var(--text-1)' : 'var(--text-3)', lineHeight: 1.65 }}
                />
              </div>

              {/* ── Properties (Notion-style) ── */}
              <div style={{ margin: '14px 0 0', borderTop: '1px solid var(--border-sub)', borderBottom: '1px solid var(--border-sub)' }}>
                <PropRow label="担当者">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {assigneeId && (() => {
                      const w = workers.find(x => x.id === assigneeId);
                      return w ? (
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {w.name[0]}
                        </div>
                      ) : null;
                    })()}
                    <select value={assigneeId} onChange={handleAssign} disabled={updating} style={{ ...propSelectStyle, flex: 1 }}>
                      <option value="">未割り当て</option>
                      {workers.map(w => <option key={w.id} value={w.id}>{w.name}（{w.active_pieces}件）</option>)}
                    </select>
                    {suggestions.length > 0 && (
                      <button
                        onClick={() => setShowSuggest(!showSuggest)}
                        style={{ flexShrink: 0, padding: '2px 7px', fontSize: 9, fontWeight: 600, background: showSuggest ? '#EEF2FF' : 'var(--surface-sub)', color: showSuggest ? '#4338CA' : 'var(--text-3)', border: `1px solid ${showSuggest ? '#C7D2FE' : 'var(--border)'}`, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        <Sparkles size={9} /> AI
                      </button>
                    )}
                  </div>
                  {showSuggest && suggestions.length > 0 && (
                    <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 2 }}>
                      {suggestions.slice(0, 4).map((s, i) => {
                        const scoreCol = s.score >= 80 ? '#22c55e' : s.score >= 60 ? '#B46400' : '#94a3b8';
                        return (
                          <button
                            key={s.id}
                            onClick={async () => { setAssigneeId(s.id); setUpdating(true); try { await pieceApi.assign(piece.id, s.id); onUpdated(); } finally { setUpdating(false); setShowSuggest(false); } }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: i === 0 ? 'rgba(180,100,0,0.05)' : 'var(--surface-sub)', border: `1px solid ${i === 0 ? 'rgba(180,100,0,0.25)' : 'var(--border)'}`, borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${scoreCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: scoreCol, flexShrink: 0 }}>{s.score}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? '#B46400' : 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {i === 0 && <Sparkles size={9} style={{ color: '#B46400' }} />}{s.name}
                                {s.on_leave && <span style={{ fontSize: 8, color: '#E67000', border: '1px solid #E67000', borderRadius: 2, padding: '0 3px' }}>休暇</span>}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>{s.reason}</div>
                              {s.matched_tags.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                                  {s.matched_tags.map(t => (
                                    <span key={t} style={{ fontSize: 8, padding: '0 4px', background: '#B4640022', color: '#B46400', borderRadius: 3 }}>✓{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </PropRow>

                <PropRow label="プロジェクト">
                  <select value={projectId} onChange={handleProjectChange} style={propSelectStyle}>
                    <option value="">なし</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </PropRow>

                <PropRow label="期限">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="date" value={dueDate} onChange={handleDueDateChange} style={{ ...propSelectStyle, flex: 1 }} />
                    {dueDate && piece.status !== 'done' && (() => {
                      const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
                      const t = new Date(); t.setHours(0, 0, 0, 0);
                      const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
                      if (diff < 0) return <span style={{ fontSize: 9, color: '#DC2626', fontWeight: 700, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>{Math.abs(diff)}日超過</span>;
                      if (diff === 0) return <span style={{ fontSize: 9, color: '#DC2626', fontWeight: 700, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>今日</span>;
                      if (diff <= 3) return <span style={{ fontSize: 9, color: '#D97706', fontWeight: 600, flexShrink: 0 }}>{diff}日後</span>;
                      return null;
                    })()}
                  </div>
                </PropRow>

                <PropRow label="優先度">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={async () => { await pieceApi.update(piece.id, { priority: n }); onUpdated(); }}
                        style={{
                          padding: '2px 9px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', borderRadius: 4,
                          background: piece.priority === n ? P_PILL_BG[n] : 'var(--surface-sub)',
                          color: piece.priority === n ? P_PILL_TEXT[n] : 'var(--text-3)',
                          border: `1px solid ${piece.priority === n ? P_PILL_BG[n] : 'var(--border)'}`,
                          transition: 'all 0.1s',
                        }}
                      >P{n}</button>
                    ))}
                  </div>
                </PropRow>

                <PropRow label="進捗">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range" min={0} max={100} step={5} value={progress}
                      onChange={e => handleProgressChange(Number(e.target.value))}
                      onMouseUp={e => handleProgressCommit(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => handleProgressCommit(Number((e.target as HTMLInputElement).value))}
                      style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 36, textAlign: 'right' }}>{progress}%</span>
                  </div>
                </PropRow>

                <PropRow label="スキルタグ">
                  <InlineTagsEdit
                    label=""
                    tags={piece.skill_tags}
                    onSave={async (tags) => { await pieceApi.update(piece.id, { skill_tags: tags }); onUpdated(); }}
                  />
                </PropRow>

                <PropRow label="インパクト">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>¥</span>
                    <input type="number" placeholder="推定売上影響額" value={bizImpact} onChange={e => setBizImpact(e.target.value)} onBlur={handleBizImpactBlur} style={{ ...propSelectStyle, flex: 1 }} />
                  </div>
                </PropRow>

                {piece.started_at && (
                  <PropRow label="開始日時">
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(piece.started_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </PropRow>
                )}
                {piece.completed_at && (
                  <PropRow label="完了日時">
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(piece.completed_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </PropRow>
                )}
              </div>

              {/* 評価指標・期待成果（折りたたみ） */}
              <SubFields piece={piece} onUpdated={onUpdated} />

              {/* Cascade */}
              {cascadeCount > 0 && (
                <div style={{ margin: '12px 20px 0', background: 'rgba(180,100,0,0.05)', border: '1px solid rgba(180,100,0,0.20)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => setCascadeExpanded(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#B46400' }}
                  >
                    <ArrowDownCircle size={13} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>完了で <strong>{cascadeCount}</strong> 件が動き出します</span>
                    {cascadeExpanded ? <ChevronUp size={11} style={{ color: '#B46400' }} /> : <ChevronDown size={11} style={{ color: '#B46400' }} />}
                  </button>
                  {cascadeExpanded && (
                    <div style={{ borderTop: '1px solid rgba(180,100,0,0.15)', padding: '6px 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {cascadeAffected.slice(0, 8).map(a => (
                        <div key={a.id} style={{ fontSize: 10.5, color: '#B46400', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#B46400', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                        </div>
                      ))}
                      {cascadeAffected.length > 8 && <div style={{ fontSize: 10, color: '#B46400', paddingLeft: 9 }}>他 {cascadeAffected.length - 8} 件</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Child tasks */}
              <div style={{ padding: '0 20px' }}>
                <ChildTaskSection parentId={piece.id} allPieces={allPieces} onUpdated={onUpdated} />
              </div>

              {/* 外部公開 */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-sub)', marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>外部公開</div>
                {piece.is_external ? (
                  <div>
                    <div style={{ fontSize: 11, color: '#4A9B6F', fontWeight: 500, marginBottom: 8 }}>公開中（報酬: ¥{(piece.reward || 0).toLocaleString()}）</div>
                    <button onClick={handlePublishToggle} disabled={publishing} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6 }}>
                      {publishing ? '...' : '公開を取り消す'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" placeholder="報酬額（任意）" value={publishReward} onChange={e => setPublishReward(e.target.value)} style={{ ...propSelectStyle, flex: 1 }} />
                    <button onClick={handlePublishToggle} disabled={publishing} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      {publishing ? '...' : '外部公開'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ padding: '0 20px 32px', borderTop: '1px solid var(--border-sub)' }}>
                <div style={{ paddingTop: 14 }}>
                  <PanelTabs pieceId={piece.id} />
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── PropRow ────────────────────────────────────────────────────────────────────
function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: 36, padding: '0 20px', borderBottom: '1px solid var(--border-sub)' }}>
      <div style={{
        width: 88, flexShrink: 0, fontSize: 10, fontWeight: 600,
        color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em',
        paddingTop: 9, paddingBottom: 9,
      }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 8, paddingTop: 6, paddingBottom: 6, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

// ── SubFields (評価指標・期待成果 collapsible) ─────────────────────────────────
function SubFields({ piece, onUpdated }: { piece: Piece; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const hasContent = !!(piece.value_metric || piece.expected_impact);

  return (
    <div style={{ margin: '0', borderTop: '1px solid var(--border-sub)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 20px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 600, color: hasContent ? 'var(--text-2)' : 'var(--text-3)',
          textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}
      >
        {open ? <ChevronDown size={10} style={{ flexShrink: 0 }} /> : <ChevronRight size={10} style={{ flexShrink: 0 }} />}
        評価指標・期待成果
        {hasContent && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', marginLeft: 4 }} />}
      </button>
      {open && (
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <InlineEditRow label="評価指標" value={piece.value_metric ?? ''} placeholder="KPI・測定方法..." onSave={async (v) => { await pieceApi.update(piece.id, { value_metric: v }); onUpdated(); }} multiline />
          <InlineEditRow label="期待成果" value={piece.expected_impact ?? ''} placeholder="完了後に期待される状態..." onSave={async (v) => { await pieceApi.update(piece.id, { expected_impact: v }); onUpdated(); }} multiline />
        </div>
      )}
    </div>
  );
}

function PanelTabs({ pieceId }: { pieceId: string }) {
  const [tab, setTab] = useState<'comments' | 'timelog' | 'history' | 'deps' | 'narrative' | 'residue'>('comments');
  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', fontSize: 10, fontWeight: active ? 700 : 400,
    color: active ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
  });
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12, overflowX: 'auto' }}>
        <button style={tabStyle(tab === 'comments')} onClick={() => setTab('comments')}>
          <MessageCircle size={10} /> コメント
        </button>
        <button style={tabStyle(tab === 'timelog')} onClick={() => setTab('timelog')}>
          <Clock size={10} /> 時間記録
        </button>
        <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>
          <History size={10} /> 変更履歴
        </button>
        <button style={tabStyle(tab === 'deps')} onClick={() => setTab('deps')}>
          <GitBranch size={10} /> 依存
        </button>
        <button style={tabStyle(tab === 'narrative')} onClick={() => setTab('narrative')}>
          <ScrollText size={10} /> なぜ
        </button>
        <button style={tabStyle(tab === 'residue')} onClick={() => setTab('residue')}>
          <Layers size={10} /> 文脈
        </button>
      </div>
      {tab === 'comments'  && <CommentsSection  pieceId={pieceId} />}
      {tab === 'timelog'   && <TimeLogSection   pieceId={pieceId} />}
      {tab === 'history'   && <HistorySection   pieceId={pieceId} />}
      {tab === 'deps'      && <DepsSection      pieceId={pieceId} />}
      {tab === 'narrative' && <NarrativeSection pieceId={pieceId} />}
      {tab === 'residue'   && <ResidueSection   pieceId={pieceId} />}
    </div>
  );
}

interface TimeLogEntry { id: string; logged_minutes: number; note: string; logged_date: string; user_name: string | null; }

function TimeLogSection({ pieceId }: { pieceId: string }) {
  const [logs, setLogs] = useState<TimeLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [minutes, setMinutes] = useState('60');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    pieceApi.getTimeLogs(pieceId).then((d: { logs: TimeLogEntry[]; total_minutes: number }) => {
      setLogs(d.logs); setTotal(d.total_minutes);
    }).catch(() => {});
  }, [pieceId]);

  async function handleAdd() {
    const m = parseInt(minutes);
    if (isNaN(m) || m <= 0) return;
    setPosting(true);
    try {
      const entry = await pieceApi.addTimeLog(pieceId, { logged_minutes: m, note, logged_date: date });
      setLogs(prev => [entry, ...prev]);
      setTotal(t => t + m);
      setMinutes('60'); setNote('');
    } finally { setPosting(false); }
  }

  async function handleDelete(logId: string, logMins: number) {
    await pieceApi.deleteTimeLog(logId);
    setLogs(prev => prev.filter(l => l.id !== logId));
    setTotal(t => t - logMins);
  }

  const hrs = Math.floor(total / 60);
  const mins = total % 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sub)' }}>
        <Clock size={12} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>合計工数</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{hrs}h {mins}m</span>
      </div>

      {/* Log form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="分" min="1"
            style={{ width: 72, padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="メモ（任意）"
          style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-1)' }} />
        <button onClick={handleAdd} disabled={posting || !minutes}
          style={{ padding: '5px 12px', fontSize: 11, background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontWeight: 600 }}>
          {posting ? '記録中...' : '時間を記録'}
        </button>
      </div>

      {/* Log list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {logs.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>まだ記録がありません</div>}
        {logs.map(log => (
          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sub)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{Math.floor(log.logged_minutes / 60)}h {log.logged_minutes % 60}m</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{log.logged_date}</span>
                {log.user_name && <span style={{ fontSize: 9, color: 'var(--text-3)' }}>· {log.user_name}</span>}
              </div>
              {log.note && <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{log.note}</div>}
            </div>
            <button onClick={() => handleDelete(log.id, log.logged_minutes)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, opacity: 0.5, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderCommentContent(content: string) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  );
}

function CommentsSection({ pieceId }: { pieceId: string }) {
  const [comments, setComments] = useState<{ id: string; content: string; user_name: string; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pieceApi.getComments(pieceId).then(setComments).catch(() => {});
    userApi.workers().then((ws: { id: string; name: string }[]) => setMembers(ws)).catch(() => {});
  }, [pieceId]);

  const mentionCandidates = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(name: string) {
    const cursor = inputRef.current?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, cursor);
    const after = newComment.slice(cursor);
    const replaced = before.replace(/@(\S*)$/, `@${name} `);
    setNewComment(replaced + after);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionIndex].name); return; }
      if (e.key === 'Escape')    { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) { e.preventDefault(); handlePost(); }
  }

  async function handlePost() {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const c = await pieceApi.addComment(pieceId, newComment.trim());
      setComments(prev => [...prev, c]);
      setNewComment('');
    } finally { setPosting(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>コメント</div>
      {comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>まだコメントはありません</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {comments.map(c => (
          <div key={c.id} style={{ background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', padding: '8px 10px', border: '1px solid var(--border-sub)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)' }}>{c.user_name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5 }}>{renderCommentContent(c.content)}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100, overflow: 'hidden',
          }}>
            {mentionCandidates.map((m, i) => (
              <div
                key={m.id}
                onMouseDown={e => { e.preventDefault(); insertMention(m.name); }}
                style={{
                  padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                  background: i === mentionIndex ? 'var(--accent-sub)' : 'transparent',
                  color: i === mentionIndex ? 'var(--accent)' : 'var(--text-1)',
                  fontWeight: i === mentionIndex ? 600 : 400,
                }}
              >
                @{m.name}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={inputRef}
            value={newComment}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="コメントを追加... （@名前でメンション）"
            style={{ ...selectStyle, flex: 1, fontSize: 11 }}
          />
          <button onClick={handlePost} disabled={posting || !newComment.trim()} style={{ padding: '6px 12px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {posting ? '...' : '投稿'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Child Task Section ─────────────────────────────────────────────────────
function ChildTaskSection({
  parentId, allPieces, onUpdated,
}: { parentId: string; allPieces: Piece[]; onUpdated: () => void }) {
  const children = allPieces.filter(p => p.parent_id === parentId);
  const [updating, setUpdating] = useState<string | null>(null);

  if (children.length === 0) return null;

  const done  = children.filter(p => p.status === 'done').length;
  const total = children.length;
  const pct   = total > 0 ? (done / total) * 100 : 0;

  const STATUS_BG: Record<string, string> = {
    locked: '#AAAAAA', ready: '#555555', in_progress: '#B46400', done: '#AAAAAA',
  };
  const STATUS_LBL: Record<string, string> = {
    locked: '待', ready: '可', in_progress: '進', done: '完',
  };

  async function bulkUpdate(status: PieceStatus) {
    const targets = children.filter(p => p.status !== status);
    setUpdating('bulk');
    try { await Promise.all(targets.map(p => pieceApi.updateStatus(p.id, status))); onUpdated(); }
    finally { setUpdating(null); }
  }

  async function toggleStatus(child: Piece) {
    const next: Record<string, PieceStatus> = {
      locked: 'ready', ready: 'in_progress', in_progress: 'done', done: 'locked',
    };
    const nextStatus = next[child.status] as PieceStatus;
    setUpdating(child.id);
    try { await pieceApi.updateStatus(child.id, nextStatus); onUpdated(); }
    finally { setUpdating(null); }
  }

  return (
    <>
      <Divider />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            サブタスク ({done}/{total})
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              disabled={updating === 'bulk' || children.every(p => p.status !== 'locked')}
              onClick={() => bulkUpdate('ready')}
              style={{
                padding: '3px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                background: 'var(--surface-sub)', color: 'var(--text-2)', border: '1px solid var(--border)',
                borderRadius: 6, opacity: updating === 'bulk' ? 0.4 : 1,
              }}>
              全→着手可
            </button>
            <button
              disabled={updating === 'bulk' || children.every(p => p.status === 'done')}
              onClick={() => bulkUpdate('done')}
              style={{
                padding: '3px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                background: 'var(--text-1)', color: 'var(--bg)', border: 'none',
                borderRadius: 6, opacity: updating === 'bulk' ? 0.4 : 1,
              }}>
              全完了
            </button>
          </div>
        </div>

        {/* Progress mini-bar */}
        <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#B46400', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>

        {/* Task list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {children.map(child => {
            const col = STATUS_BG[child.status] ?? '#ccc';
            const lbl = STATUS_LBL[child.status] ?? '-';
            return (
              <div
                key={child.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px',
                  background: 'var(--surface-sub)',
                  border: '1px solid var(--border-sub)',
                  borderRadius: 'var(--r-sm)',
                  opacity: child.status === 'done' ? 0.55 : 1,
                  transition: 'opacity 0.15s',
                }}>
                {/* Status dot — click to cycle */}
                <button
                  disabled={updating === child.id}
                  onClick={() => toggleStatus(child)}
                  title="クリックでステータスを進める"
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: col + '22', border: `2px solid ${col}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 7, fontWeight: 800, color: col,
                    cursor: 'pointer', flexShrink: 0, padding: 0,
                    opacity: updating === child.id ? 0.4 : 1,
                  }}>
                  {lbl}
                </button>
                <span style={{
                  flex: 1, fontSize: 11, color: 'var(--text-1)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: child.status === 'done' ? 'line-through' : 'none',
                }}>
                  {child.title.replace(/^【.+?】/, '')}
                </span>
                {child.assignee_id && (
                  <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>
                    {/* just show assignee_id initial hint — no worker list in this scope */}
                    ●
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── InlineTextEdit ─────────────────────────────────────────────────────────
// クリックで editing モード、blur/Enter で保存
function InlineTextEdit({
  value, onSave, multiline = false, textStyle = {},
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    if (draft.trim() === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft.trim()); } finally { setSaving(false); setEditing(false); }
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="クリックして編集"
        style={{
          ...textStyle,
          cursor: 'text',
          minHeight: 20,
          borderRadius: 4,
          padding: '1px 4px',
          marginLeft: -4,
          transition: 'background 0.12s',
          color: value ? textStyle.color : 'var(--text-3)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {value || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>クリックして編集</span>}
      </div>
    );
  }

  const sharedStyle: React.CSSProperties = {
    ...textStyle,
    width: '100%', boxSizing: 'border-box',
    border: '1px solid var(--accent)',
    borderRadius: 6, padding: '3px 6px',
    background: 'var(--bg)',
    outline: 'none', resize: 'vertical',
    opacity: saving ? 0.6 : 1,
  };

  return multiline ? (
    <textarea
      ref={inputRef as React.Ref<HTMLTextAreaElement>}
      value={draft}
      rows={3}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
      style={sharedStyle}
    />
  ) : (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      }}
      style={sharedStyle}
    />
  );
}

// ── InlineEditRow ───────────────────────────────────────────────────────────
function InlineEditRow({
  label, value, placeholder, onSave, multiline = false,
}: {
  label: string; value: string; placeholder?: string;
  onSave: (v: string) => Promise<void>; multiline?: boolean;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {label}
        <Pencil size={8} style={{ opacity: 0.4 }} />
      </div>
      <InlineTextEdit
        value={value}
        onSave={onSave}
        multiline={multiline}
        textStyle={{ fontSize: 12, color: value ? 'var(--text-1)' : 'var(--text-3)', lineHeight: 1.5 }}
      />
      {!value && placeholder && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1, fontStyle: 'italic' }}>{placeholder}</div>
      )}
    </div>
  );
}

// ── InlineTagsEdit ──────────────────────────────────────────────────────────
function InlineTagsEdit({
  label, tags, onSave,
}: {
  label: string; tags: string[]; onSave: (tags: string[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(tags.join(', '));
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setDraft(tags.join(', ')); }, [tags]);

  async function commit() {
    const next = draft.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); setEditing(false); }
  }

  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {label}
        <Pencil size={8} style={{ opacity: 0.4 }} />
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 5 }}>
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setEditing(false); setDraft(tags.join(', ')); }
            }}
            placeholder="カンマ区切りで入力..."
            disabled={saving}
            style={{
              flex: 1, fontSize: 11, padding: '4px 7px',
              border: '1px solid var(--accent)', borderRadius: 6,
              background: 'var(--bg)', outline: 'none', color: 'var(--text-1)',
            }}
          />
          <button
            onClick={commit} disabled={saving}
            style={{ padding: '4px 8px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            <Check size={11} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="クリックして編集"
          style={{ cursor: 'text', minHeight: 22 }}
        >
          {tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.map(t => (
                <span key={t} style={{
                  background: 'var(--accent)1A', color: 'var(--accent)',
                  border: '1px solid var(--accent)33',
                  borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 600,
                }}>{t}</span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic', opacity: 0.7 }}>
              クリックしてタグを追加
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── HistorySection ──────────────────────────────────────────────────────────
interface LogEntry {
  id: string; event_type: string;
  old_value: string | null; new_value: string | null;
  created_at: string; user_name: string | null;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  'status_changed':       { label: 'ステータス変更', color: '#555555' },
  'assigned':             { label: '担当者変更',     color: '#888888' },
  'connected':            { label: '接続追加',       color: '#888888' },
  'published':            { label: '外部公開',       color: '#B46400' },
  'marketplace_accepted': { label: '受注',           color: '#B46400' },
  'auto_promoted':        { label: '自動着手可',     color: '#B46400' },
};
function eventLabel(type: string) {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  if (type.startsWith('field_updated:')) {
    return { label: type.replace('field_updated:', '') + 'を編集', color: '#888888' };
  }
  return { label: type, color: 'var(--text-3)' };
}
function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

function HistorySection({ pieceId }: { pieceId: string }) {
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    pieceApi.getLogs(pieceId)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pieceId]);

  if (loading) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>読み込み中…</div>
  );
  if (logs.length === 0) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>変更履歴はありません</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {logs.map((log, i) => {
        const { label, color } = eventLabel(log.event_type);
        const isLast = i === logs.length - 1;
        return (
          <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 12, position: 'relative' }}>
            {/* Timeline line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 7, top: 18, bottom: 0,
                width: 1.5, background: 'var(--border)',
              }} />
            )}
            {/* Dot */}
            <div style={{
              width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
              background: color + '22', border: `2px solid ${color}`,
              marginTop: 2,
            }} />
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                {log.user_name && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>by {log.user_name}</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  {relativeTime(log.created_at)}
                </span>
              </div>
              {(log.old_value || log.new_value) && (
                <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {log.old_value && (
                    <span style={{
                      background: '#FEF2F2', border: '1px solid #FECACA',
                      borderRadius: 4, padding: '0 5px', color: '#DC2626',
                      textDecoration: 'line-through', maxWidth: 120,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{log.old_value}</span>
                  )}
                  {log.old_value && log.new_value && <span style={{ color: 'var(--text-3)' }}>→</span>}
                  {log.new_value && (
                    <span style={{
                      background: '#F0FDF4', border: '1px solid #BBF7D0',
                      borderRadius: 4, padding: '0 5px', color: '#16A34A',
                      maxWidth: 140,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{log.new_value}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ReentryPanel ────────────────────────────────────────────────────────────

const UNRESOLVED_KIND_LABELS = {
  blocker:     '障壁',
  uncertainty: '不明',
  caution:     '注意',
  open_issue:  '課題',
} as const;

const URGENCY_DOT: Record<string, string> = {
  high:   '#DC2626',
  medium: '#D97706',
  low:    'var(--text-3)',
};

function ReentryPanel({ ecology }: { ecology: FlowEcologyProjection }) {
  return (
    <div style={{
      padding: '12px 13px',
      background: 'var(--surface-sub)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* 再開点 */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          再開点
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45, letterSpacing: '-0.01em' }}>
          {ecology.restartPoint}
        </div>
      </div>

      {/* 次の一歩 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
          次の一歩
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
          {ecology.nextLikelyAction}
        </span>
      </div>

      {/* Unresolved threads — ある時だけ */}
      {ecology.unresolvedThreads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, borderTop: '1px solid var(--border-sub)' }}>
          {ecology.unresolvedThreads.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{
                flexShrink: 0, marginTop: 3,
                width: 5, height: 5, borderRadius: '50%',
                background: URGENCY_DOT[t.urgency],
              }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0, paddingTop: 1 }}>
                {UNRESOLVED_KIND_LABELS[t.kind]}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.45 }}>
                {t.body}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── NarrativeSection ────────────────────────────────────────────────────────
const NARRATIVE_KIND_LABELS: Record<string, { label: string; dot: string }> = {
  status_changed:       { label: 'ステータス変更', dot: '#555555' },
  assigned:             { label: '担当者変更',     dot: '#888888' },
  connected:            { label: '接続追加',       dot: '#888888' },
  blocker_reported:     { label: 'ブロック報告',   dot: '#E60012' },
  field_updated:        { label: 'フィールド編集', dot: '#888888' },
  auto_promoted:        { label: '自動着手可',     dot: '#B46400' },
  published:            { label: '外部公開',       dot: '#B46400' },
  marketplace_accepted: { label: '受注',           dot: '#B46400' },
};

const DEFAULT_FLOW_PROJECTION = {
  state: 'entering' as const,
  interruptionRisk: 0.2,
  contextSwitchLoad: 0,
  focusIntegrity: 0.5,
};

const DEFAULT_PRESSURE = { quietMode: false };

function NarrativeSection({ pieceId }: { pieceId: string }) {
  const narrative   = useNarrativeProjection(pieceId);
  const { events, summary, loading, error } = narrative;
  const ecology     = useFlowEcology({
    narrative,
    flowProjection: DEFAULT_FLOW_PROJECTION,
    pressure:       DEFAULT_PRESSURE,
  });

  if (loading) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>読み込み中…</div>
  );
  if (error) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>取得できませんでした</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Reentry Panel — 再開点を最上部に固定 */}
      <ReentryPanel ecology={ecology} />

      {/* Summary */}
      <div style={{ padding: '10px 12px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sub)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.5 }}>
          {summary.headline || '履歴がまだありません'}
        </div>
        {summary.openIssues.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {summary.openIssues.map((issue, i) => (
              <div key={i} style={{ fontSize: 10, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
                {issue}
              </div>
            ))}
          </div>
        )}
        {summary.patterns.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {summary.patterns.map((p, i) => (
              <div key={i} style={{ fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 }} />
                {p}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event timeline */}
      {events.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>変更履歴はありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[...events].reverse().map((ev, i, arr) => {
            const meta = NARRATIVE_KIND_LABELS[ev.kind] ?? { label: ev.kind, dot: 'var(--text-3)' };
            const isLast = i === arr.length - 1;
            const diff = (Date.now() - new Date(ev.timestamp).getTime()) / 1000;
            const when = diff < 60 ? 'たった今'
              : diff < 3600   ? `${Math.floor(diff / 60)}分前`
              : diff < 86400  ? `${Math.floor(diff / 3600)}時間前`
              : `${Math.floor(diff / 86400)}日前`;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 10, position: 'relative' }}>
                {!isLast && (
                  <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 1, background: 'var(--border-sub)' }} />
                )}
                <div style={{ width: 15, height: 15, borderRadius: '50%', background: meta.dot, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{meta.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{when}</span>
                  </div>
                  {ev.actorName && (
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{ev.actorName}</div>
                  )}
                  {(ev.from || ev.to) && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                      {ev.from && <span>{ev.from}</span>}
                      {ev.from && ev.to && <span> → </span>}
                      {ev.to && <span style={{ color: 'var(--text-2)' }}>{ev.to}</span>}
                    </div>
                  )}
                  {ev.reason && (
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontStyle: 'italic', marginTop: 2 }}>
                      "{ev.reason}"
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ResidueSection ──────────────────────────────────────────────────────────
const RESIDUE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  blocker:     { label: '障壁',   color: '#DC2626' },
  insight:     { label: '気づき', color: '#2563EB' },
  caution:     { label: '注意',   color: '#D97706' },
  handoff:     { label: '引継',   color: '#059669' },
  uncertainty: { label: '不明',   color: '#7C3AED' },
  decision:    { label: '決断',   color: '#0891B2' },
};

interface ResidueEntry {
  id: string;
  piece_id: string;
  author_id: string | null;
  author_name: string | null;
  type: string;
  body: string;
  created_at: string;
}

function ResidueSection({ pieceId }: { pieceId: string }) {
  const [notes, setNotes]     = useState<ResidueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType]       = useState<string>('insight');
  const [body, setBody]       = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    pieceApi.getResidues(pieceId)
      .then(setNotes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pieceId]);

  async function handleAdd() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > 140) { setError('140文字以内で入力してください'); return; }
    setError('');
    setPosting(true);
    try {
      const note = await pieceApi.addResidue(pieceId, { type, body: trimmed });
      setNotes(prev => [{ ...note, author_name: null }, ...prev]);
      setBody('');
    } catch {
      setError('保存できませんでした');
    } finally { setPosting(false); }
  }

  if (loading) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>読み込み中…</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Input form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            style={{ ...selectStyle, flex: '0 0 auto', width: 'auto', fontSize: 10, padding: '4px 6px' }}
          >
            {Object.entries(RESIDUE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {body.length}/140
          </span>
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="文脈を140字以内で記録..."
          rows={2}
          maxLength={140}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '5px 7px', fontSize: 11, lineHeight: 1.5,
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            background: 'var(--surface)', color: 'var(--text-1)',
            outline: 'none', resize: 'none',
          }}
        />
        {error && <div style={{ fontSize: 10, color: '#DC2626' }}>{error}</div>}
        <button
          onClick={handleAdd}
          disabled={posting || !body.trim()}
          style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 600,
            background: body.trim() ? 'var(--text-1)' : 'var(--surface-sub)',
            color: body.trim() ? '#FAFAF8' : 'var(--text-3)',
            border: 'none', borderRadius: 'var(--r-sm)',
            cursor: body.trim() ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          {posting ? '記録中...' : '記録する'}
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
          文脈メモはまだありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notes.map(note => {
            const meta = RESIDUE_TYPE_LABELS[note.type] ?? { label: note.type, color: 'var(--text-3)' };
            return (
              <div key={note.id} style={{
                padding: '8px 10px',
                background: 'var(--surface-sub)',
                border: `1px solid ${meta.color}22`,
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: 'var(--r-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: meta.color,
                    background: meta.color + '18',
                    border: `1px solid ${meta.color}33`,
                    borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>
                    {relativeTime(note.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.55 }}>
                  {note.body}
                </div>
                {note.author_name && (
                  <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 3 }}>
                    {note.author_name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DepsSection ─────────────────────────────────────────────────────────────
interface DepPiece { id: string; title: string; status: string; assignee_name: string | null; conn_type: string; }

const DEP_STATUS_COLOR: Record<string, string> = {
  done:        '#10B981',
  in_progress: 'var(--accent)',
  ready:       '#4A9B6F',
  locked:      'var(--text-3)',
};
const DEP_STATUS_LABEL: Record<string, string> = {
  done: '完了', in_progress: '進行中', ready: '可', locked: 'ロック中',
};

function DepsSection({ pieceId }: { pieceId: string }) {
  const [upstream,   setUpstream]   = useState<DepPiece[]>([]);
  const [downstream, setDownstream] = useState<DepPiece[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    pieceApi.getDeps(pieceId)
      .then((d: { upstream: DepPiece[]; downstream: DepPiece[] }) => {
        setUpstream(d.upstream ?? []);
        setDownstream(d.downstream ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pieceId]);

  if (loading) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>読み込み中…</div>
  );

  if (upstream.length === 0 && downstream.length === 0) return (
    <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>依存関係はありません</div>
  );

  function renderList(items: DepPiece[], dir: 'up' | 'down') {
    return items.map(p => {
      const col = DEP_STATUS_COLOR[p.status] ?? 'var(--text-3)';
      return (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface-sub)', border: '1px solid var(--border-sub)', borderRadius: 'var(--r-sm)' }}>
          {dir === 'up'
            ? <ArrowUpCircle size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
            : <ArrowDownCircle size={12} style={{ color: '#6366F1', flexShrink: 0 }} />
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
            {p.assignee_name && <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>{p.assignee_name}</div>}
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: col, background: col + '18', border: `1px solid ${col}44`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {DEP_STATUS_LABEL[p.status] ?? p.status}
          </span>
        </div>
      );
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {upstream.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowUpCircle size={10} /> 前提ピース（{upstream.length}件）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {renderList(upstream, 'up')}
          </div>
        </div>
      )}
      {downstream.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowDownCircle size={10} /> このピースが解放する（{downstream.length}件）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {renderList(downstream, 'down')}
          </div>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-sub)' }} />;
}

const selectStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', padding: '6px 8px',
  fontSize: 11, background: 'var(--surface)',
  color: 'var(--text-1)', cursor: 'pointer', outline: 'none',
  boxSizing: 'border-box',
};

const propSelectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', padding: '5px 8px',
  fontSize: 11, background: 'var(--surface)',
  color: 'var(--text-1)', cursor: 'pointer', outline: 'none',
  boxSizing: 'border-box',
};
