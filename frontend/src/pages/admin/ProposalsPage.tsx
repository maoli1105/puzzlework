/**
 * /proposals — 管理者：ワーカーからのピース提案レビュー
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Lightbulb, User, Tag, CalendarDays, Timer, FolderOpen, AlertCircle,
} from 'lucide-react';
import { proposals as proposalsApi, Proposal, users as usersApi } from '../../services/api';

type Tab = 'pending' | 'all';

const AMBER  = '#B46400';
const DANGER = '#E60012';
const GREEN  = '#1a9e4a';

const PRIORITY_LABEL: Record<number, string> = { 1: '最高', 2: '高', 3: '中', 4: '低', 5: '最低' };
const PRIORITY_COLOR: Record<number, string> = {
  1: DANGER, 2: '#f97316', 3: AMBER, 4: GREEN, 5: 'var(--text-4)',
};

const STATUS_MAP = {
  pending:  { label: '審査待ち', color: AMBER,  dimBg: 'rgba(180,100,0,0.07)',  Icon: Clock },
  approved: { label: '承認済み', color: GREEN,  dimBg: 'rgba(26,158,74,0.07)',  Icon: CheckCircle2 },
  rejected: { label: '却下',     color: DANGER, dimBg: 'rgba(230,0,18,0.07)',   Icon: XCircle },
};

export default function ProposalsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [list, setList] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [approveTarget, setApproveTarget] = useState<Proposal | null>(null);
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = tab === 'pending' ? await proposalsApi.pending() : await proposalsApi.all();
      setList(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    usersApi.workers().then((ws: { id: string; name: string }[]) => setWorkers(ws)).catch(() => {});
  }, []);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await proposalsApi.approve(approveTarget.id, assigneeId || undefined);
      setApproveTarget(null);
      load();
    } catch { /* ignore */ } finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await proposalsApi.reject(rejectTarget.id, rejectReason);
      setRejectTarget(null);
      load();
    } catch { /* ignore */ } finally { setRejecting(false); }
  };

  const pendingCount = list.filter((p) => p.status === 'pending').length;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-1)',
    fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Lightbulb size={17} color={AMBER} />
        <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          提案レビュー
        </h1>
        {tab === 'pending' && pendingCount > 0 && (
          <span style={{
            background: DANGER, color: '#fff',
            borderRadius: 'var(--r-sm)', padding: '1px 7px',
            fontSize: 11, fontWeight: 700,
          }}>
            {pendingCount}
          </span>
        )}
      </div>

      {/* tabs */}
      <div style={{
        display: 'flex', gap: 1, marginBottom: 18,
        background: 'var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden',
        width: 'fit-content', padding: 1,
      }}>
        {(['pending', 'all'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 16px', border: 'none', cursor: 'pointer',
            borderRadius: 'var(--r-sm)',
            background: tab === t ? 'var(--surface)' : 'transparent',
            color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
            fontWeight: tab === t ? 700 : 400,
            fontSize: 12, transition: 'all 0.12s',
            boxShadow: tab === t ? 'var(--shadow-xs)' : 'none',
          }}>
            {t === 'pending' ? '審査待ち' : '全履歴'}
          </button>
        ))}
      </div>

      {/* list */}
      {loading ? (
        <div style={{ color: 'var(--text-4)', padding: 40, textAlign: 'center', fontSize: 13 }}>読み込み中…</div>
      ) : list.length === 0 ? (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)',
          padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        }}>
          {tab === 'pending' ? '審査待ちの提案はありません' : '提案履歴がありません'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((p) => {
            const s = STATUS_MAP[p.status];
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                borderLeft: `3px solid ${s.color}`,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* status badge */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 'var(--r-sm)', flexShrink: 0, marginTop: 1,
                      background: s.dimBg, color: s.color,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      <s.Icon size={11} />{s.label}
                    </span>

                    {/* content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 13, letterSpacing: '-0.01em' }}>
                          {p.title}
                        </span>
                        <span style={{ fontSize: 11, color: PRIORITY_COLOR[p.priority], fontWeight: 700 }}>
                          P{p.priority} {PRIORITY_LABEL[p.priority]}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)', alignItems: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <User size={10} />{p.proposer_name ?? '提案者'}
                        </span>
                        {p.project_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <FolderOpen size={10} />{p.project_name}
                          </span>
                        )}
                        {p.estimated_days && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Timer size={10} />{p.estimated_days}日
                          </span>
                        )}
                        {p.due_date && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CalendarDays size={10} />{p.due_date.slice(0, 10)}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-4)' }}>
                          {new Date(p.created_at).toLocaleDateString('ja-JP')}
                        </span>
                      </div>

                      {p.skill_tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                          {p.skill_tags.map((t) => (
                            <span key={t} style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-xs)',
                              background: 'rgba(180,100,0,0.07)', color: AMBER,
                              display: 'inline-flex', alignItems: 'center', gap: 2,
                            }}>
                              <Tag size={8} />{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 1 }}>
                      {p.status === 'pending' && (
                        <>
                          <button onClick={() => { setApproveTarget(p); setAssigneeId(p.proposed_by); }} style={{
                            padding: '5px 12px', borderRadius: 'var(--r-md)',
                            background: GREEN, color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          }}>承認</button>
                          <button onClick={() => { setRejectTarget(p); setRejectReason(''); }} style={{
                            padding: '5px 12px', borderRadius: 'var(--r-md)',
                            background: 'transparent', color: DANGER,
                            border: `1px solid rgba(230,0,18,0.3)`,
                            cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          }}>却下</button>
                        </>
                      )}
                      <button onClick={() => setExpandedId(expanded ? null : p.id)} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-4)', padding: 3, display: 'flex', alignItems: 'center',
                      }}>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* expanded */}
                {expanded && (
                  <div style={{
                    padding: '10px 14px 12px',
                    background: 'var(--surface-sub)',
                    borderTop: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-2)',
                  }}>
                    {p.objective && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>目的: </span>
                        {p.objective}
                      </div>
                    )}
                    {p.reason && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>提案理由: </span>
                        {p.reason}
                      </div>
                    )}
                    {p.status === 'rejected' && p.reject_reason && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                        marginTop: 4, padding: '7px 10px',
                        background: 'rgba(230,0,18,0.05)',
                        border: '1px solid rgba(230,0,18,0.15)',
                        borderRadius: 'var(--r-md)', color: DANGER,
                      }}>
                        <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span><strong>却下理由: </strong>{p.reject_reason}</span>
                      </div>
                    )}
                    {p.status === 'approved' && p.reviewer_name && (
                      <div style={{ color: 'var(--text-4)', fontSize: 11 }}>
                        承認者: {p.reviewer_name}
                        {p.reviewed_at && ` — ${new Date(p.reviewed_at).toLocaleDateString('ja-JP')}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 承認モーダル ──────────────────────────────────────────────────────── */}
      {approveTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={(e) => { if (e.target === e.currentTarget) setApproveTarget(null); }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 24,
            width: 400, boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4, letterSpacing: '-0.02em' }}>
              提案を承認する
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 16 }}>
              承認するとピースが自動作成されます
            </div>

            <div style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 13, marginBottom: 4 }}>
              {approveTarget.title}
            </div>
            {approveTarget.skill_tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
                {approveTarget.skill_tags.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-xs)',
                    background: 'rgba(180,100,0,0.07)', color: AMBER,
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}><Tag size={8} />{t}</span>
                ))}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
              担当者（デフォルト: 提案者）
            </label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setApproveTarget(null)} style={{
                padding: '7px 16px', borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13,
              }}>キャンセル</button>
              <button onClick={handleApprove} disabled={approving} style={{
                padding: '7px 16px', borderRadius: 'var(--r-md)', border: 'none',
                background: GREEN, color: '#fff', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, opacity: approving ? 0.6 : 1,
              }}>
                {approving ? '処理中…' : '承認してピース作成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 却下モーダル ──────────────────────────────────────────────────────── */}
      {rejectTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={(e) => { if (e.target === e.currentTarget) setRejectTarget(null); }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 24,
            width: 380, boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4, letterSpacing: '-0.02em' }}>
              提案を却下する
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, fontWeight: 600 }}>
              「{rejectTarget.title}」
            </div>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
              却下理由（任意）
            </label>
            <textarea
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例: 現在のスプリントには含められません"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 20 }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectTarget(null)} style={{
                padding: '7px 16px', borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13,
              }}>キャンセル</button>
              <button onClick={handleReject} disabled={rejecting} style={{
                padding: '7px 16px', borderRadius: 'var(--r-md)', border: 'none',
                background: DANGER, color: '#fff', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, opacity: rejecting ? 0.6 : 1,
              }}>
                {rejecting ? '処理中…' : '却下する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
