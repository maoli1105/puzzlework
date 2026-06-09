/**
 * HandoffSection — L6 Handoff composition を WorkshopPage から分離。
 * visibility gating は WorkshopPage 側で行う。
 *
 * L6: Next Handoff（次に誰へ渡すか）
 * CollapseWrapper + peripheralOpacity による Flow + Cognitive 二重制御。
 */

import { useState } from 'react';
import { pieces as pieceApi } from '../../services/api';
import type { NextHandoff } from '../../projections/workshop/types';
import type { CognitivePressure } from '../../projections/cognitive/types';
import type { FlowUIDirective } from '../../projections/flowstate/index';
import { CollapseWrapper } from './CollapseWrapper';

// ── ローカルデザイントークン ──────────────────────────────────────
const C = {
  ink1:    'var(--text-1)',
  ink2:    'var(--text-2)',
  ink3:    'var(--text-3)',
  ink4:    'var(--text-4)',
  surface: 'var(--surface)',
  sub:     'var(--surface-sub)',
  border:  'var(--border)',
  ready:   '#555555',
  stale:   '#B46400',
  accent:  '#E60012',
  locked:  '#AAAAAA',
} as const;

const STATUS_LABEL: Record<string, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};
const STATUS_COLOR: Record<string, string> = {
  locked: C.locked, ready: C.ready, in_progress: C.accent, done: C.ink4,
};

// HandoffSection-internal residue type options
const RESIDUE_TYPE_OPTS: { value: string; label: string }[] = [
  { value: 'handoff',     label: '引継' },
  { value: 'blocker',     label: '障壁' },
  { value: 'insight',     label: '気づき' },
  { value: 'caution',     label: '注意' },
  { value: 'uncertainty', label: '不明' },
  { value: 'decision',    label: '決断' },
];

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

// HandoffSection-internal card contract
function NextHandoffCard({ handoff, workerName, onHandoff }: {
  handoff:    NextHandoff;
  workerName: string | null;
  onHandoff:  () => void;
}) {
  const { downstreamPiece, isMissingContext, residueCount } = handoff;
  const col = STATUS_COLOR[downstreamPiece.status] ?? C.ink4;
  const [contextOpen, setContextOpen] = useState(false);
  const [ctxType, setCtxType]         = useState('handoff');
  const [ctxBody, setCtxBody]         = useState('');
  const [ctxPosting, setCtxPosting]   = useState(false);
  const [ctxSaved, setCtxSaved]       = useState(false);

  async function handleContextSave(pieceId: string) {
    const body = ctxBody.trim();
    if (!body || body.length > 140 || ctxPosting) return;
    setCtxPosting(true);
    try {
      await pieceApi.addResidue(pieceId, { type: ctxType, body });
      setCtxBody('');
      setContextOpen(false);
      setCtxSaved(true);
      setTimeout(() => setCtxSaved(false), 3000);
    } catch { /* ignore */ }
    finally { setCtxPosting(false); }
  }

  return (
    <section>
      <SectionLabel text="次の渡し先" />
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.ink4, letterSpacing: '0.08em', marginBottom: 6 }}>
            DOWNSTREAM
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink1, marginBottom: 8 }}>
            {downstreamPiece.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 9, padding: '2px 8px', background: col + '22', color: col, borderRadius: 2, fontWeight: 600 }}>
              {STATUS_LABEL[downstreamPiece.status]}
            </span>
            {workerName && (
              <span style={{ fontSize: 10, color: C.ink3 }}>→ {workerName}</span>
            )}
            {!handoff.assigneeId && (
              <span style={{ fontSize: 10, color: C.stale }}>担当者未設定</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setContextOpen(v => !v)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 600,
                background: ctxSaved ? C.ready + '22' : C.sub,
                color: ctxSaved ? C.ready : C.ink2,
                border: `1px solid ${ctxSaved ? C.ready + '44' : C.border}`,
                borderRadius: 2, cursor: 'pointer',
              }}
            >
              {ctxSaved ? '✓ 文脈を残した' : contextOpen ? '閉じる' : '文脈を残す'}
            </button>
            <button
              onClick={onHandoff}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 700,
                background: C.ink1, color: C.surface,
                border: 'none', borderRadius: 2, cursor: 'pointer',
              }}
            >
              このピースを渡す
            </button>
          </div>
        </div>
        {contextOpen && (
          <div style={{
            borderTop: `1px solid ${C.border}`, padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 7, background: C.sub,
          }}>
            {isMissingContext && (
              <div style={{ fontSize: 10, color: C.stale, marginBottom: 2 }}>
                目的が未記入です。引き継ぎ前にひと言残しておくとスムーズです。
              </div>
            )}
            {residueCount > 0 && (
              <div style={{ fontSize: 10, color: C.ink3, marginBottom: 2 }}>
                他の上流 {residueCount}件 がまだ完了していません。
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={ctxType}
                onChange={e => setCtxType(e.target.value)}
                style={{ fontSize: 10, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 2, background: C.surface, color: C.ink2 }}
              >
                {RESIDUE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 9, color: C.ink4, marginLeft: 'auto' }}>{ctxBody.length}/140</span>
            </div>
            <textarea
              value={ctxBody}
              onChange={e => setCtxBody(e.target.value)}
              placeholder="次の担当者が10秒で始められるよう、今の状況を一言で"
              maxLength={140}
              rows={2}
              style={{
                width: '100%', fontSize: 11, color: C.ink1, border: `1px solid ${C.border}`,
                borderRadius: 2, padding: '7px 8px', resize: 'none',
                background: C.surface, lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => handleContextSave(downstreamPiece.id)}
              disabled={!ctxBody.trim() || ctxPosting}
              style={{
                padding: '7px 0', fontSize: 11, fontWeight: 700,
                background: ctxBody.trim() ? C.ink1 : C.sub,
                color: ctxBody.trim() ? C.surface : C.ink4,
                border: 'none', borderRadius: 2, cursor: 'pointer',
              }}
            >
              {ctxPosting ? '保存中…' : '残す'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// HandoffSection composition contract
// ── HandoffSection — L6 の composition ───────────────────────────
export function HandoffSection({
  handoff,
  workerName,
  cognitive,
  flow,
  onHandoff,
}: {
  handoff:    NextHandoff | null;
  workerName: string | null;
  cognitive:  CognitivePressure;
  flow:       FlowUIDirective;
  onHandoff:  () => void;
}) {
  return (
    <CollapseWrapper
      state={cognitive.collapseState.handoff}
      tier={cognitive.attentionTier.handoff}
      collapsedLabel="渡し先 — 確認を推奨"
      peripheralOpacity={flow.peripheralOpacity}
    >
      {handoff && (
        <NextHandoffCard
          handoff={handoff}
          workerName={workerName}
          onHandoff={onHandoff}
        />
      )}
    </CollapseWrapper>
  );
}
