import React, { useState, useEffect, useRef } from 'react';
import { Piece, PieceStatus, Project } from '../../types';
import { pieces as pieceApi, users as userApi, projects as projectApi } from '../../services/api';
import { X, Sparkles, Clock, MessageCircle, History, Pencil, Check, Trash2 } from 'lucide-react';

interface Worker { id: string; name: string; active_pieces: number; }
interface SuggestedWorker { id: string; name: string; score: number; active_pieces: number; avg_days: number | null; skill_match_count: number; }
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
  done:        [],
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
        .then((d: { affected: unknown[] }) => setCascadeCount(d.affected.length))
        .catch(() => setCascadeCount(0));
    }
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

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />}

      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 360,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 101,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s ease',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {piece && (
          <>
            {/* Header */}
            <div style={{
              padding: '14px 18px 12px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                    ピース詳細
                  </div>
                  <InlineTextEdit
                    value={piece.title}
                    onSave={async (v) => { await pieceApi.update(piece.id, { title: v }); onUpdated(); }}
                    multiline={false}
                    textStyle={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.35, letterSpacing: '-0.01em' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {onDelete && (
                    <button
                      onClick={() => {
                        if (window.confirm(`「${piece.title}」を削除しますか？\n依存関係も一緒に削除されます。`)) {
                          onDelete(piece.id);
                        }
                      }}
                      title="ピースを削除"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', padding: 4, opacity: 0.7 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* ステータスバッジ */}
              <div style={{ marginTop: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: STATUS_ACCENT[piece.status],
                  border: `1px solid ${STATUS_ACCENT[piece.status]}44`,
                  borderRadius: 'var(--r-sm)', padding: '2px 8px',
                  background: STATUS_ACCENT[piece.status] + '0E',
                  letterSpacing: '0.02em',
                }}>
                  {STATUS_LABELS[piece.status]}
                </span>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* 詳細情報（インライン編集対応） */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InlineEditRow
                  label="目的"
                  value={piece.objective ?? ''}
                  placeholder="目的を入力..."
                  onSave={async (v) => { await pieceApi.update(piece.id, { objective: v }); onUpdated(); }}
                  multiline
                />
                <InlineEditRow
                  label="評価指標"
                  value={piece.value_metric ?? ''}
                  placeholder="評価指標を入力..."
                  onSave={async (v) => { await pieceApi.update(piece.id, { value_metric: v }); onUpdated(); }}
                  multiline
                />
                <InlineEditRow
                  label="期待成果"
                  value={piece.expected_impact ?? ''}
                  placeholder="期待成果を入力..."
                  onSave={async (v) => { await pieceApi.update(piece.id, { expected_impact: v }); onUpdated(); }}
                  multiline
                />
                <InlineTagsEdit
                  label="スキルタグ"
                  tags={piece.skill_tags}
                  onSave={async (tags) => { await pieceApi.update(piece.id, { skill_tags: tags }); onUpdated(); }}
                />
                <DetailRow label="優先度" value={`P${piece.priority}`} />
                {piece.started_at   && <DetailRow label="開始日時" value={new Date(piece.started_at).toLocaleString('ja-JP')} />}
                {piece.completed_at && <DetailRow label="完了日時" value={new Date(piece.completed_at).toLocaleString('ja-JP')} />}
              </div>

              <Divider />

              {/* プロジェクト・期限 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <PanelField label="プロジェクト">
                  <select value={projectId} onChange={handleProjectChange} style={selectStyle}>
                    <option value="">なし</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </PanelField>
                <PanelField label="期限">
                  <input type="date" value={dueDate} onChange={handleDueDateChange} style={selectStyle} />
                </PanelField>
              </div>

              {/* 進捗 */}
              <PanelField label="進捗">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={progress}
                    onChange={e => handleProgressChange(Number(e.target.value))}
                    onMouseUp={e => handleProgressCommit(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={e => handleProgressCommit(Number((e.target as HTMLInputElement).value))}
                    style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', minWidth: 36, textAlign: 'right', letterSpacing: '-0.01em' }}>
                    {progress}%
                  </span>
                </div>
                <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.15s' }} />
                </div>
              </PanelField>

              {/* ビジネスインパクト */}
              <PanelField label="ビジネスインパクト（円）">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>¥</span>
                  <input
                    type="number" placeholder="推定売上影響額"
                    value={bizImpact}
                    onChange={e => setBizImpact(e.target.value)}
                    onBlur={handleBizImpactBlur}
                    style={{ ...selectStyle, flex: 1 }}
                  />
                </div>
              </PanelField>

              {/* 担当者 */}
              <PanelField label="担当者">
                <select value={assigneeId} onChange={handleAssign} disabled={updating} style={selectStyle}>
                  <option value="">未割り当て</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}（{w.active_pieces}件）</option>
                  ))}
                </select>
                {suggestions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => setShowSuggest(!showSuggest)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', fontSize: 10, fontWeight: 600,
                        background: showSuggest ? '#EEF2FF' : 'var(--surface-sub)',
                        color: showSuggest ? '#4338CA' : 'var(--text-3)',
                        border: `1px solid ${showSuggest ? '#C7D2FE' : 'var(--border)'}`,
                        borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      }}
                    >
                      <Sparkles size={10} />
                      スマートアサイン提案
                    </button>
                    {showSuggest && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {suggestions.slice(0, 5).map((s, i) => (
                          <button
                            key={s.id}
                            onClick={async () => {
                              setAssigneeId(s.id);
                              setUpdating(true);
                              try { await pieceApi.assign(piece!.id, s.id); onUpdated(); }
                              finally { setUpdating(false); setShowSuggest(false); }
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 10px',
                              background: i === 0 ? '#EEF2FF' : 'var(--surface-sub)',
                              border: `1px solid ${i === 0 ? '#C7D2FE' : 'var(--border)'}`,
                              borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: i === 0 ? '#4F46E5' : 'var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 700,
                              color: i === 0 ? '#fff' : 'var(--text-3)', flexShrink: 0,
                            }}>{s.name[0]}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? '#4338CA' : 'var(--text-1)' }}>{s.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                                {s.skill_match_count > 0 && <span style={{ color: '#059669' }}>スキル一致{s.skill_match_count}回</span>}
                                <span>{s.active_pieces}件進行中</span>
                                {s.avg_days && <span>avg {s.avg_days}日</span>}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 10, fontWeight: 700,
                              color: s.score >= 50 ? '#059669' : s.score >= 25 ? '#D97706' : 'var(--text-3)',
                            }}>
                              {s.score}pt
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </PanelField>

              <Divider />

              {/* 外部公開 */}
              <PanelField label="外部公開">
                {piece.is_external ? (
                  <div>
                    <div style={{ fontSize: 11, color: '#4A9B6F', fontWeight: 500, marginBottom: 8 }}>
                      マーケットプレイス公開中（報酬: ¥{(piece.reward || 0).toLocaleString()}）
                    </div>
                    <button onClick={handlePublishToggle} disabled={publishing} style={{
                      padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: '#FEF2F2', color: '#DC2626',
                      border: '1px solid #FECACA', borderRadius: 'var(--r-sm)',
                    }}>
                      {publishing ? '...' : '公開を取り消す'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" placeholder="報酬額（円・任意）" value={publishReward}
                      onChange={(e) => setPublishReward(e.target.value)}
                      style={{ ...selectStyle, flex: 1 }} />
                    <button onClick={handlePublishToggle} disabled={publishing} style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: 'var(--text-1)', color: '#FAFAF8',
                      border: 'none', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
                    }}>
                      {publishing ? '...' : '外部公開'}
                    </button>
                  </div>
                )}
              </PanelField>

              {/* カスケード情報 */}
              {cascadeCount > 0 && (
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 'var(--r-sm)', padding: '8px 12px', fontSize: 11, color: '#5B21B6', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>⟶</span>
                  このピースが完了すると、<strong>{cascadeCount}</strong>件のピースが動き出します
                </div>
              )}

              {/* 子ピース一覧 */}
              <ChildTaskSection
                parentId={piece.id}
                allPieces={allPieces}
                onUpdated={onUpdated}
              />

              {/* ステータス変更 */}
              {ADMIN_TRANSITIONS[piece.status].length > 0 && (
                <>
                  <Divider />
                  <PanelField label="ステータス変更">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {ADMIN_TRANSITIONS[piece.status].map((s) => (
                        <button key={s} onClick={() => changeStatus(s)} disabled={updating} style={{
                          padding: '6px 14px',
                          background: 'var(--surface-sub)',
                          border: `1px solid ${STATUS_ACCENT[s]}44`,
                          color: STATUS_ACCENT[s],
                          borderRadius: 'var(--r-sm)', cursor: 'pointer',
                          fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em',
                        }}>
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </PanelField>
                </>
              )}

              <Divider />
              <PanelTabs pieceId={piece.id} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PanelTabs({ pieceId }: { pieceId: string }) {
  const [tab, setTab] = useState<'comments' | 'timelog' | 'history'>('comments');
  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: active ? 700 : 400,
    color: active ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer', marginBottom: -1,
  });
  return (
    <div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <button style={tabStyle(tab === 'comments')} onClick={() => setTab('comments')}>
          <MessageCircle size={11} /> コメント
        </button>
        <button style={tabStyle(tab === 'timelog')} onClick={() => setTab('timelog')}>
          <Clock size={11} /> 時間記録
        </button>
        <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>
          <History size={11} /> 変更履歴
        </button>
      </div>
      {tab === 'comments' && <CommentsSection pieceId={pieceId} />}
      {tab === 'timelog'  && <TimeLogSection  pieceId={pieceId} />}
      {tab === 'history'  && <HistorySection  pieceId={pieceId} />}
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

function CommentsSection({ pieceId }: { pieceId: string }) {
  const [comments, setComments] = useState<{ id: string; content: string; user_name: string; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    pieceApi.getComments(pieceId).then(setComments).catch(() => {});
  }, [pieceId]);

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
            <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5 }}>{c.content}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
          placeholder="コメントを追加..."
          style={{ ...selectStyle, flex: 1, fontSize: 11 }}
        />
        <button onClick={handlePost} disabled={posting || !newComment.trim()} style={{ padding: '6px 12px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {posting ? '...' : '投稿'}
        </button>
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
    locked: '#9CA3AF', ready: '#059669', in_progress: '#2563EB', done: '#A0A096',
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
                background: '#ECFDF5', color: '#059669', border: '1px solid #6EE7B7',
                borderRadius: 6, opacity: updating === 'bulk' ? 0.4 : 1,
              }}>
              全→着手可
            </button>
            <button
              disabled={updating === 'bulk' || children.every(p => p.status === 'done')}
              onClick={() => bulkUpdate('done')}
              style={{
                padding: '3px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                background: '#F5F3FF', color: '#7C3AED', border: '1px solid #C4B5FD',
                borderRadius: 6, opacity: updating === 'bulk' ? 0.4 : 1,
              }}>
              全完了
            </button>
          </div>
        </div>

        {/* Progress mini-bar */}
        <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#7C3AED', borderRadius: 2, transition: 'width 0.3s' }} />
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
  'status_changed':       { label: 'ステータス変更', color: '#2563EB' },
  'assigned':             { label: '担当者変更',     color: '#7C3AED' },
  'connected':            { label: '接続追加',       color: '#059669' },
  'published':            { label: '外部公開',       color: '#D97706' },
  'marketplace_accepted': { label: '受注',           color: '#DC2626' },
  'auto_promoted':        { label: '自動着手可',     color: '#10B981' },
};
function eventLabel(type: string) {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  if (type.startsWith('field_updated:')) {
    return { label: type.replace('field_updated:', '') + 'を編集', color: '#6366F1' };
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
      {children}
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
