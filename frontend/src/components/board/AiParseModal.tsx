/**
 * AiParseModal — 自然言語テキスト→ピース一括作成（Pro限定）
 * Slack・議事録・メモを貼り付けてピースを自動抽出する
 */
import React, { useState, useRef, useEffect } from 'react';
import { ai as aiApi, pieces as piecesApi, ParsedPiece } from '../../services/api';
import { Sparkles, X, ChevronRight, AlertCircle, Lock } from 'lucide-react';

interface Worker  { id: string; name: string; }
interface Project { id: string; name: string; color?: string; }

interface DraftPiece extends ParsedPiece {
  _key:        string;
  assignee_id: string;
  project_id:  string;
}

interface Props {
  workers:   Worker[];
  projects:  Project[];
  isPro:     boolean;
  onClose:   () => void;
  onCreated: (count: number) => void;
}

const PLACEHOLDER = `例:
田中さん、ランディングページのデザイン修正お願いします。来週金曜日まで。

アクションアイテム:
- 佐藤: レポート作成（6/15まで）
- 山田: API連携実装
- 伊藤: ユーザーインタビュー調整（今週中）`;

export default function AiParseModal({ workers, projects, isPro, onClose, onCreated }: Props) {
  const [step,      setStep]      = useState<'input' | 'preview' | 'done'>('input');
  const [text,      setText]      = useState('');
  const [drafts,    setDrafts]    = useState<DraftPiece[]>([]);
  const [parsing,   setParsing]   = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === 'input') setTimeout(() => textRef.current?.focus(), 60);
  }, [step]);

  // ── Parse ──────────────────────────────────────────────────
  async function handleParse() {
    if (!text.trim() || parsing) return;
    setParsing(true);
    setError(null);
    try {
      const { pieces } = await aiApi.parseText(
        text.trim(),
        projects.map(p => p.name),
      );
      if (!pieces.length) {
        setError('タスクが見つかりませんでした。テキストを確認してください。');
        return;
      }
      const resolved: DraftPiece[] = pieces.map((p, i) => ({
        ...p,
        _key:        `draft-${i}`,
        assignee_id: resolveAssignee(p.assignee_hint, workers),
        project_id:  resolveProject(p.project_name, projects),
      }));
      setDrafts(resolved);
      setStep('preview');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '解析に失敗しました';
      if (msg.includes('402') || msg.includes('pro')) {
        setError('この機能はProプラン以上が必要です。');
      } else {
        setError(msg);
      }
    } finally {
      setParsing(false);
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async function handleCreate() {
    if (creating || !drafts.length) return;
    setCreating(true);
    setError(null);
    try {
      const payload = drafts.map(d => ({
        title:       d.title,
        objective:   d.objective || undefined,
        status:      (d.status || 'ready') as string,
        due_date:    d.due_date   || undefined,
        assignee_id: d.assignee_id || undefined,
        project_id:  d.project_id  || undefined,
        priority:    d.priority    ?? undefined,
        skill_tags:  d.skill_tags  ?? [],
      }));
      await piecesApi.bulkCreate(payload);
      setStep('done');
      onCreated(drafts.length);
    } catch {
      setError('作成に失敗しました。もう一度お試しください。');
    } finally {
      setCreating(false);
    }
  }

  // ── Lock screen (free plan) ─────────────────────────────────
  if (!isPro) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ width: 400, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(180,100,0,0.1)', border: '1px solid rgba(180,100,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Lock size={20} color="#B46400" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
            Proプラン限定機能
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 20 }}>
            Slack・議事録などのテキストからピースを<br />
            自動作成する機能はProプラン以上でご利用いただけます。
          </div>
          <button
            onClick={() => window.location.href = '/settings?tab=plan'}
            style={{
              padding: '9px 24px', borderRadius: 'var(--r-sm)',
              background: '#B46400', border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            プランをアップグレード
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--r-sm)',
            background: 'rgba(180,100,0,0.1)', border: '1px solid rgba(180,100,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={13} color="#B46400" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
              テキストからピースを作成
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              Slack・議事録・メモを貼り付けると自動でタスクを抽出します
            </div>
          </div>
          <span style={{
            marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            color: '#B46400', background: 'rgba(180,100,0,0.08)',
            border: '1px solid rgba(180,100,0,0.25)', borderRadius: 3, padding: '2px 6px',
          }}>PRO</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {(['input', 'preview'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <span style={{ fontSize: 10, fontWeight: step === s ? 700 : 400, color: step === s ? 'var(--text-1)' : 'var(--text-3)' }}>
                {i + 1}. {s === 'input' ? 'テキスト入力' : 'プレビュー・編集'}
              </span>
              {i < 1 && <ChevronRight size={10} style={{ color: 'var(--text-4)' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
              background: 'rgba(230,0,18,0.04)', border: '1px solid rgba(230,0,18,0.2)',
              borderRadius: 'var(--r-sm)', marginBottom: 14,
              fontSize: 11, color: '#E60012',
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* ── Step: input ── */}
          {step === 'input' && (
            <div>
              <textarea
                ref={textRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
                placeholder={PLACEHOLDER}
                rows={12}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', fontSize: 12, lineHeight: 1.7,
                  background: 'var(--surface-sub, #F8F8F7)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  color: 'var(--text-1)', resize: 'vertical', outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6, textAlign: 'right' }}>
                {text.length} / 8000文字　⌘Enter で解析
              </div>
            </div>
          )}

          {/* ── Step: preview ── */}
          {step === 'preview' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
                {drafts.length}件のピースが抽出されました。内容を確認・編集してから作成してください。
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drafts.map((d, i) => (
                  <DraftRow
                    key={d._key}
                    draft={d}
                    workers={workers}
                    projects={projects}
                    onUpdate={updated => setDrafts(prev => prev.map((p, j) => j === i ? updated : p))}
                    onRemove={() => setDrafts(prev => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
              <button
                onClick={() => setDrafts(prev => [...prev, {
                  _key: `draft-extra-${Date.now()}`,
                  title: '', status: 'ready', assignee_id: '', project_id: '',
                  due_date: null, priority: 3,
                }])}
                style={{
                  marginTop: 10, width: '100%', padding: '7px 0',
                  background: 'none', border: '1px dashed var(--border)',
                  borderRadius: 'var(--r-sm)', color: 'var(--text-3)',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                + 手動で追加
              </button>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
                {drafts.length}件のピースを作成しました
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>カンバンに反映されました</div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
          }}>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('input'); setError(null); }}
                style={{ padding: '7px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}
              >
                戻る
              </button>
            )}
            <button onClick={onClose}
              style={{ padding: '7px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
              キャンセル
            </button>

            {step === 'input' && (
              <button
                onClick={handleParse}
                disabled={!text.trim() || text.length > 8000 || parsing}
                style={{
                  padding: '7px 20px', borderRadius: 'var(--r-sm)',
                  background: (!text.trim() || parsing) ? 'var(--border)' : '#B46400',
                  border: 'none', color: '#fff', fontSize: 11, fontWeight: 700,
                  cursor: (!text.trim() || parsing) ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: (!text.trim() || text.length > 8000) ? 0.5 : 1,
                  transition: 'background 0.15s',
                }}
              >
                <Sparkles size={11} />
                {parsing ? '解析中…' : '解析する'}
              </button>
            )}

            {step === 'preview' && (
              <button
                onClick={handleCreate}
                disabled={!drafts.length || creating || drafts.some(d => !d.title.trim())}
                style={{
                  padding: '7px 20px', borderRadius: 'var(--r-sm)',
                  background: creating || !drafts.length ? 'var(--border)' : 'var(--text-1)',
                  border: 'none', color: '#FAFAF8', fontSize: 11, fontWeight: 700,
                  cursor: creating ? 'default' : 'pointer',
                  opacity: !drafts.length || drafts.some(d => !d.title.trim()) ? 0.6 : 1,
                }}
              >
                {creating ? '作成中…' : `${drafts.length}件を作成する`}
              </button>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ── DraftRow ──────────────────────────────────────────────────────────────────
function DraftRow({
  draft, workers, projects, onUpdate, onRemove,
}: {
  draft:    DraftPiece;
  workers:  Worker[];
  projects: Project[];
  onUpdate: (d: DraftPiece) => void;
  onRemove: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    padding: '4px 7px', fontSize: 11, border: '1px solid var(--border)',
    borderRadius: 4, background: 'var(--surface)', color: 'var(--text-1)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 100px 100px 100px 24px',
      gap: 6, alignItems: 'center',
      padding: '8px 10px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
    }}>
      {/* タイトル */}
      <input
        value={draft.title}
        onChange={e => onUpdate({ ...draft, title: e.target.value })}
        placeholder="タイトル（必須）"
        style={{ ...inputStyle, fontWeight: 500, borderColor: !draft.title.trim() ? '#E60012' : 'var(--border)' }}
      />
      {/* 担当者 */}
      <select
        value={draft.assignee_id}
        onChange={e => onUpdate({ ...draft, assignee_id: e.target.value })}
        style={{ ...inputStyle }}
      >
        <option value="">未割当</option>
        {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {/* プロジェクト */}
      <select
        value={draft.project_id}
        onChange={e => onUpdate({ ...draft, project_id: e.target.value })}
        style={{ ...inputStyle }}
      >
        <option value="">PJ未設定</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {/* 期限 */}
      <input
        type="date"
        value={draft.due_date ?? ''}
        onChange={e => onUpdate({ ...draft, due_date: e.target.value || null })}
        style={{ ...inputStyle }}
      />
      {/* 削除 */}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', display: 'flex', padding: 0 }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          animation: 'slide-up 0.18s ease-out both',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        {children}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveAssignee(hint: string | undefined, workers: Worker[]): string {
  if (!hint) return '';
  const h = hint.trim().toLowerCase();
  const match = workers.find(w =>
    w.name.toLowerCase().includes(h) || h.includes(w.name.toLowerCase())
  );
  return match?.id ?? '';
}

function resolveProject(hint: string | undefined, projects: Project[]): string {
  if (!hint) return '';
  const h = hint.trim().toLowerCase();
  const match = projects.find(p =>
    p.name.toLowerCase().includes(h) || h.includes(p.name.toLowerCase())
  );
  return match?.id ?? '';
}
