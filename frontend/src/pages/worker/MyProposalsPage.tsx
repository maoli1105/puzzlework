/**
 * /work/proposals — ワーカー：ピース提案
 */
import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus, Clock, CheckCircle2, XCircle, Trash2, Tag, X as XIcon,
  ChevronDown, ChevronUp, Send, Lightbulb, AlertCircle,
  FolderOpen, CalendarDays, Timer, ArrowRight,
} from 'lucide-react';
import { proposals as proposalsApi, Proposal, projects as projectsApi, users as usersApi } from '../../services/api';
import { Building2 } from 'lucide-react';

const AMBER = '#B46400';
const DANGER = '#E60012';

const STATUS_MAP = {
  pending:  { label: '審査待ち', color: AMBER,  dimBg: 'rgba(180,100,0,0.07)', Icon: Clock },
  approved: { label: '承認済み', color: '#1a9e4a', dimBg: 'rgba(26,158,74,0.07)', Icon: CheckCircle2 },
  rejected: { label: '却下',     color: DANGER, dimBg: `rgba(230,0,18,0.07)`,  Icon: XCircle },
};

const PRIORITY_LABEL: Record<number, string> = { 1: '最高', 2: '高', 3: '中', 4: '低', 5: '最低' };
const PRIORITY_COLOR: Record<number, string> = {
  1: DANGER, 2: '#f97316', 3: AMBER, 4: '#16a34a', 5: 'var(--text-4)',
};

interface Project { id: string; name: string; }

// ── 共通インプットスタイル ────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-1)',
  fontSize: 13, boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit',
};

interface Company { id: string; name: string; role: string; }

// ── 提案フォーム ─────────────────────────────────────────────────────────────
interface Prefill { title?: string; objective?: string; tags?: string[] }

function ProposalForm({ projects, companies, prefill, onDone, onCancel }: {
  projects: Project[];
  companies: Company[];
  prefill?: Prefill;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isMobile = useIsMobile();
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [objective, setObjective] = useState(prefill?.objective ?? '');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState(3);
  const [estimatedDays, setEstimatedDays] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [targetCompanyId, setTargetCompanyId] = useState(companies[0]?.id ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(prefill?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('タイトルを入力してください'); return; }
    setSubmitting(true);
    setError('');
    try {
      await proposalsApi.create({
        title: title.trim(), objective: objective.trim(),
        reason: reason.trim(), priority, skill_tags: tags,
        estimated_days: estimatedDays ? parseInt(estimatedDays) : undefined,
        due_date: dueDate || undefined, project_id: projectId || undefined,
        target_company_id: companies.length > 1 ? targetCompanyId : undefined,
      });
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err?.response?.data?.error ?? '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !submitting;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-md)',
      overflow: 'hidden',
    }}>
      {/* header strip */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lightbulb size={15} color={AMBER} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            {prefill?.title ? '個人タスクを企業に提案' : '新しいピース提案'}
          </span>
          {prefill?.title && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 2, background: '#B4640015', color: AMBER, border: '1px solid #B4640030' }}>
              個人タスクから変換
            </span>
          )}
        </div>
        <button onClick={onCancel} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', padding: 4, display: 'flex', alignItems: 'center',
          borderRadius: 'var(--r-sm)',
        }}>
          <XIcon size={15} />
        </button>
      </div>

      {/* body */}
      <div style={{ padding: '16px' }}>
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: `rgba(230,0,18,0.06)`, color: DANGER,
            border: `1px solid rgba(230,0,18,0.2)`,
            padding: '8px 12px', borderRadius: 'var(--r-md)',
            marginBottom: 14, fontSize: 12,
          }}>
            <AlertCircle size={13} />
            {error}
          </div>
        )}

        {/* タイトル */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
            タイトル <span style={{ color: DANGER }}>*</span>
          </label>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="例: ログイン画面のUX改善"
            style={{
              ...inputBase,
              borderColor: title.trim() ? 'var(--border)' : 'var(--border)',
            }}
            onFocus={(e) => (e.target.style.borderColor = AMBER)}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* 目的 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
            目的・概要
          </label>
          <textarea
            value={objective} onChange={(e) => setObjective(e.target.value)}
            placeholder="このピースで達成したいこと"
            rows={2}
            style={{ ...inputBase, resize: 'vertical' }}
            onFocus={(e) => (e.target.style.borderColor = AMBER)}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* 理由 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
            提案理由
          </label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="現場で感じていること、なぜ必要か"
            rows={3}
            style={{ ...inputBase, resize: 'vertical' }}
            onFocus={(e) => (e.target.style.borderColor = AMBER)}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* 優先度 / 日数 / 期限 */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[
            {
              label: '優先度', node: (
                <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} style={inputBase}>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>P{n} {PRIORITY_LABEL[n]}</option>)}
                </select>
              )
            },
            {
              label: '見積日数', node: (
                <input type="number" min="1" value={estimatedDays}
                  onChange={(e) => setEstimatedDays(e.target.value)}
                  placeholder="日"
                  style={inputBase}
                  onFocus={(e) => (e.target.style.borderColor = AMBER)}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              )
            },
            {
              label: '希望期限', node: (
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  style={inputBase}
                  onFocus={(e) => (e.target.style.borderColor = AMBER)}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              )
            },
          ].map(({ label, node }) => (
            <div key={label}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
                {label}
              </label>
              {node}
            </div>
          ))}
        </div>

        {/* 提案先会社（複数会社所属の場合のみ表示） */}
        {companies.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
              letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5,
            }}>
              <Building2 size={11} />
              提案先会社
            </label>
            <select value={targetCompanyId} onChange={(e) => setTargetCompanyId(e.target.value)} style={inputBase}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.role === 'admin' ? '管理者' : 'ワーカー'}）
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 関連プロジェクト */}
        {projects.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
              関連プロジェクト
            </label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputBase}>
              <option value="">指定なし</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* スキルタグ */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5 }}>
            スキルタグ
          </label>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {tags.map((t) => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)',
                  background: `rgba(180,100,0,0.08)`, color: AMBER,
                  border: `1px solid rgba(180,100,0,0.2)`,
                }}>
                  <Tag size={9} />{t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: AMBER, display: 'flex' }}>
                    <XIcon size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              placeholder="React, TypeScript … Enterで追加"
              style={{ ...inputBase, flex: 1 }}
              onFocus={(e) => (e.target.style.borderColor = AMBER)}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <button type="button" onClick={addTag} disabled={!tagInput.trim()} style={{
              padding: '8px 12px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-2)',
              cursor: tagInput.trim() ? 'pointer' : 'default',
              fontSize: 12, fontWeight: 600, opacity: tagInput.trim() ? 1 : 0.4,
            }}>追加</button>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        background: 'var(--surface-sub)',
      }}>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 16px', borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-3)',
          cursor: 'pointer', fontSize: 13,
        }}>
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 'var(--r-md)', border: 'none',
            background: canSubmit ? AMBER : 'var(--border)',
            color: canSubmit ? '#fff' : 'var(--text-3)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 13,
            transition: 'background 0.12s',
          }}>
          <Send size={13} />
          {submitting ? '送信中…' : '提案を送信する'}
        </button>
      </div>
    </div>
  );
}

// ── 承認ピースへのリンク ──────────────────────────────────────────────────────
function ApprovedPieceLink({ pieceId: _pieceId }: { pieceId: string }) {
  const nav = useNavigate()
  return (
    <button
      onClick={() => nav('/work')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 2, cursor: 'pointer',
        background: 'rgba(26,158,74,0.08)', color: '#1a9e4a',
        border: '1px solid rgba(26,158,74,0.25)',
      }}
    >
      ピース一覧で確認 <ArrowRight size={11} />
    </button>
  )
}

// ── 提案カード ────────────────────────────────────────────────────────────────
function ProposalCard({ p, onCancel }: { p: Proposal; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_MAP[p.status];

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      borderLeft: `3px solid ${s.color}`,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* status */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 'var(--r-sm)', flexShrink: 0,
            background: s.dimBg, color: s.color,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', marginTop: 1,
          }}>
            <s.Icon size={11} />{s.label}
          </span>

          {/* content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 13, marginBottom: 4, letterSpacing: '-0.01em' }}>
              {p.title}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)', alignItems: 'center' }}>
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
              <span style={{ color: PRIORITY_COLOR[p.priority], fontWeight: 700 }}>
                P{p.priority} {PRIORITY_LABEL[p.priority]}
              </span>
              <span style={{ color: 'var(--text-4)' }}>{new Date(p.created_at).toLocaleDateString('ja-JP')}</span>
            </div>
            {p.skill_tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                {p.skill_tags.map((t) => (
                  <span key={t} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r-xs)',
                    background: `rgba(180,100,0,0.07)`, color: AMBER,
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
              <button onClick={() => onCancel(p.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 9px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-3)',
                cursor: 'pointer', fontSize: 11,
              }}>
                <Trash2 size={10} />取り消し
              </button>
            )}
            <button onClick={() => setOpen(!open)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-4)', padding: 3, display: 'flex', alignItems: 'center',
            }}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* expanded detail */}
      {open && (
        <div style={{
          padding: '10px 14px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-sub)',
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
              marginTop: 6, padding: '7px 10px',
              background: `rgba(230,0,18,0.05)`,
              border: `1px solid rgba(230,0,18,0.15)`,
              borderRadius: 'var(--r-md)', color: DANGER,
            }}>
              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>却下理由: </strong>{p.reject_reason}</span>
            </div>
          )}
          {p.status === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#1a9e4a', fontSize: 12 }}>
                <CheckCircle2 size={12} />
                ピースが作成されました
                {p.reviewer_name && <span style={{ color: 'var(--text-4)' }}>— 承認: {p.reviewer_name}</span>}
              </span>
              {p.created_piece_id && (
                <ApprovedPieceLink pieceId={p.created_piece_id} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── メインページ ─────────────────────────────────────────────────────────────
export default function MyProposalsPage() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const prefillFromUrl: Prefill | undefined = searchParams.get('title') ? {
    title:     searchParams.get('title') ?? '',
    objective: searchParams.get('objective') ?? '',
    tags:      searchParams.get('tags') ? searchParams.get('tags')!.split(',').filter(Boolean) : [],
  } : undefined;

  const [list,        setList]        = useState<Proposal[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(!!prefillFromUrl);
  const [prefill,     setPrefill]     = useState<Prefill | undefined>(prefillFromUrl);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [companyList, setCompanyList] = useState<Company[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await proposalsApi.mine()); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    projectsApi.list().then((ps: Project[]) => setProjectList(ps)).catch(() => {});
    usersApi.myCompanies().then((cs) => setCompanyList(cs)).catch(() => {});
  }, []);

  const handleCancel = async (id: string) => {
    if (!confirm('この提案を取り消しますか？')) return;
    await proposalsApi.cancel(id).catch(() => {});
    load();
  };

  const counts = {
    pending:  list.filter((p) => p.status === 'pending').length,
    approved: list.filter((p) => p.status === 'approved').length,
    rejected: list.filter((p) => p.status === 'rejected').length,
  };

  return (
    <div style={{ padding: isMobile ? '16px 12px 96px' : '24px', maxWidth: 800, margin: '0 auto' }}>

      {/* ─── ヘッダー ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lightbulb size={18} color={AMBER} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              ピース提案
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              現場の課題・改善アイデアを管理者に提案する
            </div>
          </div>
        </div>

        {!showForm && (
          <button
            onClick={() => { setPrefill(undefined); setShowForm(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 'var(--r-md)',
              border: 'none', cursor: 'pointer',
              background: AMBER, color: '#fff',
              fontWeight: 700, fontSize: 13,
              boxShadow: '0 1px 4px rgba(180,100,0,0.35)',
              letterSpacing: '-0.01em',
            }}>
            <Plus size={14} />
            新しい提案
          </button>
        )}
      </div>

      {/* ─── stats ─── */}
      {list.length > 0 && !showForm && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1, marginBottom: 20,
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          overflow: 'hidden', background: 'var(--border)',
        }}>
          {[
            { label: '審査待ち', count: counts.pending,  color: AMBER },
            { label: '承認済み', count: counts.approved, color: '#1a9e4a' },
            { label: '却下',     count: counts.rejected, color: DANGER },
          ].map(({ label, count, color }) => (
            <div key={label} style={{
              background: 'var(--surface)', padding: '12px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {count}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 600 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── フォーム ─── */}
      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <ProposalForm
            projects={projectList}
            companies={companyList}
            prefill={prefill}
            onDone={() => { setShowForm(false); setPrefill(undefined); load(); }}
            onCancel={() => { setShowForm(false); setPrefill(undefined); }}
          />
        </div>
      )}

      {/* ─── リスト ─── */}
      {!showForm && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)', fontSize: 13 }}>
            読み込み中…
          </div>
        ) : list.length === 0 ? (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)',
            padding: 48, textAlign: 'center',
          }}>
            <Lightbulb size={28} color="var(--border)" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-2)', marginBottom: 6 }}>
              まだ提案がありません
            </div>
            <div style={{ color: 'var(--text-4)', fontSize: 12, marginBottom: 20, lineHeight: 1.7 }}>
              承認されると自動でピースが作成されます
            </div>
            <button
              onClick={() => setShowForm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 'var(--r-md)',
                border: 'none', cursor: 'pointer',
                background: AMBER, color: '#fff',
                fontWeight: 700, fontSize: 13,
              }}>
              <Plus size={13} />
              最初の提案をする
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((p) => (
              <ProposalCard key={p.id} p={p} onCancel={handleCancel} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
