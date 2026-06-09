/**
 * HeroSection — Hero 周辺の composition を WorkshopPage から分離。
 * visibility gating は WorkshopPage 側で行う。
 *
 * L1: HeroPieceCard（今触るべき1枚）
 * L2: ContextRail（流れのどこにいるか）
 * L3: RepairShelf（自分が解除できる詰まり）
 */

import React, { useState, useRef } from 'react';
import { pieces as pieceApi } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { Piece } from '../../types/index';
import type { FlowEcologyProjection } from '../../projections/flowecology/types';
import type { HeroPresentation } from './presentation';
import type { CognitivePressure } from '../../projections/cognitive/types';
import type { FlowUIDirective } from '../../projections/flowstate/index';
import type { ContextRailItem, RepairShelfItem } from '../../projections/workshop/types';
import { CollapseWrapper } from './CollapseWrapper';

// ── ローカルデザイントークン ──────────────────────────────────────
const C = {
  ink1:    'var(--text-1)',
  ink2:    'var(--text-2)',
  ink3:    'var(--text-3)',
  ink4:    'var(--text-4)',
  ink5:    'var(--border)',
  surface: 'var(--surface)',
  sub:     'var(--surface-sub)',
  accent:  '#E60012',
  border:  'var(--border)',
  ready:   '#555555',
  locked:  '#AAAAAA',
  stale:   '#B46400',
} as const;

const STATUS_LABEL: Record<string, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};
const STATUS_COLOR: Record<string, string> = {
  locked: C.locked, ready: C.ready, in_progress: C.accent, done: C.ink4,
};

function dueLabel(due: string | null): { text: string; urgent: boolean } | undefined {
  if (!due) return undefined;
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (diff < 0)  return { text: `${Math.abs(diff)}日超過`, urgent: true };
  if (diff === 0) return { text: '今日期限',               urgent: true };
  if (diff <= 5)  return { text: `残${diff}日`,            urgent: true };
  return         { text: `残${diff}日`,                    urgent: false };
}

// ── ObjectiveRow — 折り畳み可能な目的テキスト ────────────────────
// startCollapsed は ENV_PRESENTATION.objectiveCollapsed から渡される。
// ObjectiveRow は environmentMode / reentryMode を直接知らない。
function ObjectiveRow({ text, startCollapsed = false }: { text: string; startCollapsed?: boolean }) {
  const [expanded, setExpanded] = useState(!startCollapsed);
  const overLength  = text.length > 80;
  // quick mode: 常にトグル可能。normal mode: 長文のみ
  const collapsible = startCollapsed || overLength;
  const displayText = (!expanded && collapsible)
    ? text.slice(0, 78) + (text.length > 78 ? '…' : '')
    : text;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12, color: C.ink3, lineHeight: 1.65,
          borderLeft: `2px solid ${C.border}`, paddingLeft: 12,
        }}
      >
        {displayText}
        {collapsible && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 10, color: C.ink5, padding: '0 0 0 6px', verticalAlign: 'baseline',
            }}
          >
            {expanded ? '折りたたむ' : '続き'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 今日の到達点 — milestone definitions ─────────────────────────
const TODAY_MILESTONES = [
  '原因特定', '再現確認', '調査完了', '文脈整理', '引き継ぎ準備', 'レビュー依頼',
] as const;

const RESIDUE_TYPE_OPTS: { value: string; label: string }[] = [
  { value: 'handoff',     label: '引継' },
  { value: 'blocker',     label: '障壁' },
  { value: 'insight',     label: '気づき' },
  { value: 'caution',     label: '注意' },
  { value: 'uncertainty', label: '不明' },
  { value: 'decision',    label: '決断' },
];

// ── Layer 1: Hero Piece Card ──────────────────────────────────────
function HeroPieceCard({
  piece, reason, ecology, presentation,
  onStart, onDone, onProgress,
}: {
  piece: Piece; reason: string;
  ecology: FlowEcologyProjection;
  /** ENV_PRESENTATION.hero 経由で渡す。HeroPieceCard は environmentMode / reentryMode を直接見ない */
  presentation: HeroPresentation;
  onStart: () => void; onDone: () => void; onProgress: (p: number) => void;
}) {
  const isMobile = useIsMobile();
  const [acting, setActing]           = useState(false);
  const [progDraft, setProgDraft]     = useState(piece.progress);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 文脈を残す
  const [residueOpen, setResidueOpen] = useState(false);
  const [residueType, setResidueType] = useState('handoff');
  const [residueBody, setResidueBody] = useState('');
  const [residuePosting, setResiduePosting] = useState(false);
  const [residueDone, setResidueDone] = useState(false);

  // 今日の到達点
  const todayKey = `pw_goal_${piece.id}_${new Date().toISOString().slice(0, 10)}`;
  const [milestones, setMilestones]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(todayKey) ?? '[]'); } catch { return []; }
  });
  // milestone picker state は Hero 内に閉じる
  const [showMilestoneOptions, setShowMilestoneOptions] = useState(false);

  const col      = STATUS_COLOR[piece.status] ?? C.ink3;
  const isActive = piece.status === 'in_progress';
  const isReady  = piece.status === 'ready';
  const due      = dueLabel(piece.due_date);

  const REASON_LABEL: Record<string, string> = {
    deadline:    '期限が近い',
    downstream:  '下流への影響が大きい',
    in_progress: '着手中・最優先',
    ready:       '着手可能・最有望',
  };

  const URGENCY_COLOR: Record<string, string> = {
    high: '#E60012', medium: '#B46400', low: C.ink4,
  };

  function handleProgress(v: number) {
    setProgDraft(v);
    onProgress(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await (pieceApi as unknown as { updateWorkerProgress: (id: string, p: number) => Promise<void> }).updateWorkerProgress(piece.id, v); }
      catch { /* ignore */ }
    }, 600);
  }

  async function handleStart() {
    if (acting) return;
    setActing(true);
    try { await pieceApi.updateStatus(piece.id, 'in_progress' as never); onStart(); }
    catch { /* ignore */ }
    finally { setActing(false); }
  }

  async function handleDone() {
    if (acting) return;
    setActing(true);
    try { await pieceApi.updateStatus(piece.id, 'done' as never); onDone(); }
    catch { /* ignore */ }
    finally { setActing(false); }
  }

  async function handleAddResidue() {
    const body = residueBody.trim();
    if (!body || body.length > 140 || residuePosting) return;
    setResiduePosting(true);
    try {
      await pieceApi.addResidue(piece.id, { type: residueType, body });
      setResidueBody('');
      setResidueOpen(false);
      setResidueDone(true);
      setTimeout(() => setResidueDone(false), 3000);
    } catch { /* ignore */ }
    finally { setResiduePosting(false); }
  }

  function toggleMilestone(m: string) {
    setMilestones(prev => {
      const next = prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m];
      try { localStorage.setItem(todayKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // 再開点 — 「スコープと担当を確認してから着手」などの default は表示しない
  const DEFAULT_RESTART = 'スコープと担当を確認してから着手';
  const showRestartPoint = ecology.restartPoint && ecology.restartPoint !== DEFAULT_RESTART;

  return (
    <div style={{
      background: C.surface, border: `2px solid ${col}`,
      borderRadius: 2, padding: isMobile ? '18px 16px 16px' : '28px 28px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: col }} />

      {/* header: status + title + due */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: col, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {STATUS_LABEL[piece.status]}
            </span>
            <span style={{ fontSize: 9, color: C.ink4 }}>·</span>
            <span style={{ fontSize: 9, color: C.ink3 }}>{REASON_LABEL[reason] ?? ''}</span>
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.ink1, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            {piece.title}
          </div>
        </div>
        {due && (
          <span style={{ fontSize: 10, color: due.urgent ? C.accent : C.ink3, fontWeight: 700, flexShrink: 0 }}>
            {due.text}
          </span>
        )}
      </div>

      {/* ── 再開点 — 最初に読む場所。recovery/shelter 時は強調 ── */}
      {showRestartPoint && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14,
          paddingBottom: 14, borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: col, letterSpacing: '0.06em', flexShrink: 0 }}>
            再開
          </span>
          <span style={{
            fontSize: presentation.restartEmphasized ? 15 : 13,
            color: C.ink1,
            fontStyle: 'italic',
            lineHeight: 1.5,
            fontWeight: presentation.restartEmphasized ? 700 : 500,
          }}>
            {ecology.restartPoint}
          </span>
        </div>
      )}

      {/* ── 未解決スレッド ── */}
      {ecology.unresolvedThreads.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {ecology.unresolvedThreads.map((t, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: C.ink3,
              background: C.sub, border: `1px solid ${C.border}`,
              borderRadius: 2, padding: '3px 8px',
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: URGENCY_COLOR[t.urgency] ?? C.ink4,
                flexShrink: 0,
              }} />
              {t.body}
            </span>
          ))}
        </div>
      )}

      {/* objective — ENV_PRESENTATION 経由で collapsed/expanded を決定 */}
      {piece.objective && (
        <ObjectiveRow
          text={piece.objective}
          startCollapsed={presentation.objectiveCollapsed}
        />
      )}

      {/* progress (in_progress only) */}
      {isActive && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[0, 25, 50, 75, 100].map(pct => {
              const active = Math.abs(progDraft - pct) < 5;
              return (
                <button key={pct} onClick={() => handleProgress(pct)} style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 700,
                  color: active ? C.surface : col, background: active ? col : C.surface,
                  border: `1.5px solid ${col}`, borderRadius: 2, cursor: 'pointer',
                }}>
                  {pct}%
                </button>
              );
            })}
          </div>
          <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${progDraft}%`, background: col, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* ── 今日の到達点 — mark済みだけ表示。前進の痕跡のみ。── */}
      {isActive && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* mark済み: 常時表示 */}
            {milestones.map(m => (
              <button key={m} onClick={() => toggleMilestone(m)} style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
                border: `1px solid ${C.ink4}`,
                background: C.sub, color: C.ink2,
              }}>
                · {m}
              </button>
            ))}
            {/* 未mark候補: ピッカー展開時のみ表示 */}
            {showMilestoneOptions && TODAY_MILESTONES
              .filter(m => !milestones.includes(m))
              .map(m => (
                <button key={m} onClick={() => toggleMilestone(m)} style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
                  border: `1px dashed ${C.ink5}`,
                  background: 'transparent', color: C.ink5,
                }}>
                  {m}
                </button>
              ))
            }
            {/* + / 閉じる トグル — 未mark が残っている間だけ表示 */}
            {TODAY_MILESTONES.some(m => !milestones.includes(m)) && (
              <button
                onClick={() => setShowMilestoneOptions(v => !v)}
                style={{
                  fontSize: 10, padding: '3px 7px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${C.ink5}`,
                  background: 'transparent', color: C.ink5,
                  lineHeight: 1,
                }}
              >
                {showMilestoneOptions ? '閉じる' : '+'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 文脈を残す ── */}
      <div style={{ marginBottom: 18 }}>
        {!residueOpen ? (
          <button
            onClick={() => setResidueOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 2,
              padding: '7px 12px', cursor: 'pointer', width: '100%',
              fontSize: 11, color: residueDone ? C.ready : C.ink3,
              fontWeight: residueDone ? 600 : 400,
            }}
          >
            {residueDone ? '✓ 文脈を残しました' : '文脈を残す…'}
          </button>
        ) : (
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 2,
            padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
            background: C.sub,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={residueType}
                onChange={e => setResidueType(e.target.value)}
                style={{
                  fontSize: 10, padding: '4px 6px', border: `1px solid ${C.border}`,
                  borderRadius: 2, background: C.surface, color: C.ink2, cursor: 'pointer',
                }}
              >
                {RESIDUE_TYPE_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span style={{ fontSize: 9, color: C.ink4, marginLeft: 'auto' }}>
                {residueBody.length}/140
              </span>
            </div>
            <textarea
              value={residueBody}
              onChange={e => setResidueBody(e.target.value)}
              placeholder="次の担当者が10秒で再開できるよう、今の状況を一言で"
              maxLength={140}
              rows={2}
              style={{
                width: '100%', fontSize: 11, color: C.ink1,
                border: `1px solid ${C.border}`, borderRadius: 2,
                padding: '7px 8px', resize: 'none', background: C.surface,
                lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleAddResidue}
                disabled={!residueBody.trim() || residuePosting}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700,
                  background: residueBody.trim() ? C.ink1 : C.sub,
                  color: residueBody.trim() ? C.surface : C.ink4,
                  border: 'none', borderRadius: 2, cursor: 'pointer',
                }}
              >
                {residuePosting ? '保存中…' : '残す'}
              </button>
              <button
                onClick={() => { setResidueOpen(false); setResidueBody(''); }}
                style={{
                  padding: '7px 14px', fontSize: 11,
                  background: 'none', border: `1px solid ${C.border}`,
                  borderRadius: 2, cursor: 'pointer', color: C.ink3,
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isReady && (
          <button onClick={handleStart} disabled={acting} style={{
            flex: 1, padding: isMobile ? '16px 0' : '12px 0',
            fontSize: isMobile ? 15 : 13, fontWeight: 700,
            background: col, color: C.surface, border: 'none', borderRadius: 2, cursor: 'pointer',
          }}>
            着手する
          </button>
        )}
        {isActive && (
          <button onClick={handleDone} disabled={acting} style={{
            flex: 1, padding: isMobile ? '16px 0' : '12px 0',
            fontSize: isMobile ? 15 : 13, fontWeight: 700,
            background: col, color: C.surface, border: 'none', borderRadius: 2, cursor: 'pointer',
          }}>
            渡す
          </button>
        )}
      </div>
    </div>
  );
}

// ── Layer 2: Context Rail ─────────────────────────────────────────
function ContextRail({ items }: { items: ContextRailItem[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <style>{`.ctx-rail::-webkit-scrollbar{display:none}`}</style>
      <div className="ctx-rail" style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0, paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' as const, WebkitOverflowScrolling: 'touch' as unknown as undefined }}>
        {items.map((item, i) => {
          const isSelf = item.role === 'self';
          const col    = STATUS_COLOR[item.piece.status] ?? C.ink4;
          return (
            <React.Fragment key={item.piece.id}>
              {i > 0 && (
                <div style={{ flexShrink: 0, color: C.ink5, fontSize: 11, padding: '0 4px' }}>→</div>
              )}
              <div style={{
                flexShrink: 0, padding: '5px 12px',
                background: isSelf ? col : C.sub,
                color: isSelf ? C.surface : C.ink3,
                fontSize: isSelf ? 11 : 10,
                fontWeight: isSelf ? 700 : 500,
                maxWidth: isSelf ? 160 : 120,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={item.piece.title}>
                {item.piece.title}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Layer 3: Repair Shelf ─────────────────────────────────────────
const ISSUE_LABEL: Record<string, { label: string; color: string }> = {
  stale:            { label: '停滞中',   color: C.stale  },
  locked:           { label: '解除待ち', color: C.locked },
  upstream_blocked: { label: '上流待ち', color: C.ink4   },
};

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: C.ink4,
      letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase',
    }}>
      {text}
    </div>
  );
}

function RepairShelf({ items }: { items: RepairShelfItem[] }) {
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [repairType, setRepairType]       = useState('handoff');
  const [repairBody, setRepairBody]       = useState('');
  const [repairPosting, setRepairPosting] = useState(false);
  const [savedId, setSavedId]             = useState<string | null>(null);

  async function handleRepairResidue(pieceId: string) {
    const body = repairBody.trim();
    if (!body || body.length > 140 || repairPosting) return;
    setRepairPosting(true);
    try {
      await pieceApi.addResidue(pieceId, { type: repairType, body });
      setRepairBody('');
      setExpandedId(null);
      setSavedId(pieceId);
      setTimeout(() => setSavedId(null), 3000);
    } catch { /* ignore */ }
    finally { setRepairPosting(false); }
  }

  return (
    <section>
      <SectionLabel text="修復棚 — 自分が解除できる詰まり" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ piece, issue, staleDays }) => {
          const { label, color } = ISSUE_LABEL[issue] ?? { label: issue, color: C.ink3 };
          const isExpanded = expandedId === piece.id;
          const isSaved    = savedId === piece.id;
          return (
            <div key={piece.id} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <div style={{ width: 3, height: 28, background: color, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {piece.title}
                  </div>
                  <div style={{ fontSize: 10, color }}>
                    {label}{issue === 'stale' && staleDays > 0 ? ` · ${staleDays}日` : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isExpanded) { setExpandedId(null); setRepairBody(''); }
                    else { setExpandedId(piece.id); }
                  }}
                  style={{
                    fontSize: 10, padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'none',
                    color: isSaved ? C.ready : C.ink3,
                    fontWeight: isSaved ? 600 : 400,
                    flexShrink: 0,
                  }}
                >
                  {isSaved ? '✓ 残した' : isExpanded ? '閉じる' : '文脈を残す'}
                </button>
              </div>
              {isExpanded && (
                <div style={{
                  borderTop: `1px solid ${C.border}`, padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', gap: 7, background: C.sub,
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={repairType}
                      onChange={e => setRepairType(e.target.value)}
                      style={{ fontSize: 10, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 2, background: C.surface, color: C.ink2 }}
                    >
                      {RESIDUE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span style={{ fontSize: 9, color: C.ink4, marginLeft: 'auto' }}>{repairBody.length}/140</span>
                  </div>
                  <textarea
                    value={repairBody}
                    onChange={e => setRepairBody(e.target.value)}
                    placeholder="詰まった理由・次に試すこと・待ち相手"
                    maxLength={140}
                    rows={2}
                    style={{
                      width: '100%', fontSize: 11, color: C.ink1, border: `1px solid ${C.border}`,
                      borderRadius: 2, padding: '7px 8px', resize: 'none',
                      background: C.surface, lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={() => handleRepairResidue(piece.id)}
                    disabled={!repairBody.trim() || repairPosting}
                    style={{
                      padding: '7px 0', fontSize: 11, fontWeight: 700,
                      background: repairBody.trim() ? C.ink1 : C.sub,
                      color: repairBody.trim() ? C.surface : C.ink4,
                      border: 'none', borderRadius: 2, cursor: 'pointer',
                    }}
                  >
                    {repairPosting ? '保存中…' : '残す'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── HeroSection — L1 + L2 + L3 の composition ────────────────────
// HeroSection-internal visibility contract
type HeroVisibility = {
  repairShelf: boolean;
};

export function HeroSection({
  piece, reason, ecology,
  repairQueue, contextRail,
  presentation,
  visibility,
  cognitive, flow,
  onStart, onDone, onProgress,
  onRepairInteract,
}: {
  // data props
  piece:       Piece;
  reason:      string;
  ecology:     FlowEcologyProjection;
  repairQueue: RepairShelfItem[];
  contextRail: ContextRailItem[];
  // presentation — environmentMode 由来の静的 UI 方針
  /** ENV_PRESENTATION 経由で渡す。environmentMode の直接比較を HeroSection に持ち込まない */
  presentation: { repairDefaultCollapsed: boolean; hero: HeroPresentation };
  // visibility — data presence 由来の動的 mount 条件
  visibility: HeroVisibility;
  // cognitive / flow
  cognitive: CognitivePressure;
  flow:      FlowUIDirective;
  // handlers
  onStart:          () => void;
  onDone:           () => void;
  onProgress:       (p: number) => void;
  onRepairInteract: () => void;
}) {
  return (
    <>
      {/* ── L1 + L2: Hero + Context Rail ── */}
      <section>
        <div style={{
          outlineOffset: 2,
          outline: flow.heroEmphasis > 0
            ? `${flow.heroEmphasis}px solid ${STATUS_COLOR[piece.status] ?? C.ink3}22`
            : 'none',
          borderRadius: 3,
        }}>
          <HeroPieceCard
            piece={piece}
            reason={reason}
            ecology={ecology}
            presentation={presentation.hero}
            onStart={onStart}
            onDone={onDone}
            onProgress={onProgress}
          />
        </div>
        {contextRail.length > 1 && cognitive.collapseState.contextRail !== 'hidden' && (
          <div style={{ opacity: flow.peripheralOpacity }}>
            <ContextRail items={contextRail} />
          </div>
        )}
      </section>

      {/* ── L3: Repair Shelf ── */}
      {/* shelter でも完全非表示にしない。collapsed に引き下げるのみ */}
      {visibility.repairShelf && (!flow.tertiaryHidden || cognitive.attentionTier.repair !== 'tertiary') && (
        // onClick は onRepairInteract 用。opacity 制御は CollapseWrapper に委譲。
        <div onClick={onRepairInteract}>
          <CollapseWrapper
            state={
              presentation.repairDefaultCollapsed &&
              cognitive.collapseState.repair === 'visible'
                ? 'collapsed'
                : cognitive.collapseState.repair
            }
            tier={cognitive.attentionTier.repair}
            collapsedLabel={`修復棚 — ${repairQueue.length}件`}
            peripheralOpacity={flow.peripheralOpacity}
          >
            <RepairShelf items={repairQueue} />
          </CollapseWrapper>
        </div>
      )}
    </>
  );
}
