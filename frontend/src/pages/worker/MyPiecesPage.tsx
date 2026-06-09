/**
 * MyPiecesPage — ワーカー向けピース一覧
 *
 * 設計思想：
 * - 個人の仕事管理ツール。企業は「どこの仕事か」の文脈として表示。
 * - 全ピースをスキャンしやすい一覧で見せる（モバイルファースト）
 * - 企業ごとのフィルタータブ
 * - マーケットプレイス経由の仕事には専用マーク（将来: 広告枠）
 * - チェックリスト・作業メモ内蔵
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pieces as pieceApi, users as usersApi, subtasks as subtaskApi } from '../../services/api'
import { Plus, Calendar, Star, Clock, Tag, X, Lightbulb } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useIsMobile } from '../../hooks/useIsMobile'
import { WSEvent } from '../../types'
import SubtaskList from '../../components/worker/SubtaskList'

// ─── 型 ──────────────────────────────────────────────────────────

interface Piece {
  id: string
  title: string
  objective: string
  status: string
  progress: number
  skill_tags: string[]
  due_date: string | null
  completed_at: string | null
  business_impact: number | null
  priority: number
  project_id:       string | null
  project_name:     string | null
  company_id:       string | null
  company_name:     string | null
  worker_memo:      string | null
  source:              string | null  // 'internal' | 'marketplace' | 'personal'
  recurrence_rule:     string | null  // 'daily' | 'weekly' | 'monthly'
  is_today_focus:      boolean
  estimated_minutes:   number | null
  actual_minutes:      number | null
  personal_tags:       string[]
}

interface Connection {
  from_piece_id: string
  to_piece_id: string
}

interface Company {
  id: string
  name: string
}

// ─── 定数 ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  locked:      'ロック中',
  ready:       '着手可能',
  in_progress: '進行中',
  done:        '完了',
}

const STATUS_COLOR: Record<string, string> = {
  locked:      '#AAAAAA',
  ready:       '#555555',
  in_progress: '#B46400',
  done:        '#888888',
}

/** 企業カラーパレット（インデックス順に割り当て） */
const COMPANY_COLORS = ['#4A6FA5', '#2E7D52', '#7B5EA7', '#C0622A', '#1A7A8A', '#A05030']

function companyColor(id: string | null, companies: Company[]): string {
  if (!id) return '#888888'
  const i = companies.findIndex(c => c.id === id)
  return COMPANY_COLORS[Math.max(i, 0) % COMPANY_COLORS.length]
}

function urgencyScore(p: Piece): number {
  if (p.status === 'done' || p.status === 'locked') return 9
  if (!p.due_date) return 5
  const diff = Math.ceil((new Date(p.due_date).getTime() - Date.now()) / 86400000)
  if (diff < 0)   return 0
  if (diff === 0) return 1
  if (diff <= 3)  return 2
  if (diff <= 7)  return 3
  return 4
}

// ─── 残り日数 ──────────────────────────────────────────────────────

function DueChip({ due }: { due: string | null }) {
  if (!due) return null
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
  const past   = diff < 0
  const urgent = diff <= 3
  const label  = past ? `${Math.abs(diff)}日超過` : diff === 0 ? '今日期限' : `残${diff}日`
  const color  = past || urgent ? '#E60012' : '#888888'
  return <span style={{ fontSize: 10, color, fontWeight: 700 }}>{label}</span>
}

// ─── マーケットプレイスバッジ ──────────────────────────────────────

function MarketplaceBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: compact ? '1px 5px' : '2px 7px',
      borderRadius: 2, flexShrink: 0,
      background: 'linear-gradient(90deg, #1A3A5C, #2A5A8C)',
      color: '#E8F4FD',
      letterSpacing: '0.04em',
    }}>
      委託
    </span>
  )
}

// ─── 作業メモ ──────────────────────────────────────────────────────

function WorkerMemo({ pieceId, initialMemo }: { pieceId: string; initialMemo: string }) {
  const [memo, setMemo]   = useState(initialMemo)
  const [open, setOpen]   = useState(!!initialMemo)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    setMemo(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      subtaskApi.updateMemo(pieceId, v).catch(() => {})
    }, 800)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '0 0 6px', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em' }}>MEMO</span>
        {!open && memo && (
          <span style={{ fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {memo.slice(0, 40)}{memo.length > 40 ? '…' : ''}
          </span>
        )}
        {!open && !memo && <span style={{ fontSize: 10, color: 'var(--text-4)' }}>追加する</span>}
        <svg width={8} height={8} viewBox="0 0 8 8" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: '0.15s', marginLeft: 'auto' }}>
          <path d="M1 2.5L4 5.5L7 2.5" stroke="var(--text-3)" strokeWidth={1.5} fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <textarea
          value={memo}
          onChange={e => handleChange(e.target.value)}
          placeholder="詰まった点、明日の続き、気づきなど…"
          autoFocus={!initialMemo}
          rows={3}
          style={{
            width: '100%', fontSize: 12, padding: '8px 10px',
            border: '1px solid var(--border)', borderRadius: 3,
            background: 'var(--surface-sub)', color: 'var(--text-1)',
            outline: 'none', resize: 'vertical', lineHeight: 1.6,
            boxSizing: 'border-box', fontFamily: 'inherit',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#B46400')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      )}
    </div>
  )
}

// ─── 渡せた演出 ──────────────────────────────────────────────────

function HandoffCelebration({ pieceName, nextTitle, onDone }: { pieceName: string; nextTitle?: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '2px solid var(--text-1)',
        borderRadius: 2, padding: '44px 52px',
        textAlign: 'center', maxWidth: 380, width: '90%',
        animation: 'mpp-popup 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 32px 100px rgba(0,0,0,0.25)',
      }}>
        <div style={{ width: 40, height: 4, background: '#E60012', margin: '0 auto 28px' }} />
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em', marginBottom: 10, lineHeight: 1 }}>渡せた。</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: nextTitle ? 24 : 0 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>「{pieceName}」</span>を完了しました
        </div>
        {nextTitle && (
          <div style={{ padding: '14px 18px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 2, textAlign: 'left' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 5 }}>NEXT — 次のピースが動き始めます</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{nextTitle}</div>
          </div>
        )}
      </div>
      <style>{`@keyframes mpp-popup { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }`}</style>
    </div>
  )
}

// ─── ピースカード（展開式） ────────────────────────────────────────

function PieceCard({
  piece, companies, connections,
  allPieces, onStatusChange, onProgressChange, onDelete, onUpdate, onPropose,
}: {
  piece: Piece
  companies: Company[]
  connections: Connection[]
  allPieces: Piece[]
  onStatusChange: (id: string, status: string) => void
  onProgressChange: (id: string, progress: number) => void
  onDelete?: (id: string) => void
  onUpdate?: (id: string, patch: Partial<Piece>) => void
  onPropose?: (piece: Piece) => void
}) {
  const [expanded,     setExpanded]     = useState(false)
  const [acting,       setActing]       = useState(false)
  const [swipeX,       setSwipeX]       = useState(0)
  const [editTitle,    setEditTitle]    = useState(false)
  const [titleDraft,   setTitleDraft]   = useState(piece.title)
  const [editDue,      setEditDue]      = useState(false)
  const [dueDraft,     setDueDraft]     = useState(
    piece.due_date ? piece.due_date.slice(0, 10) : ''
  )
  const [tagInput,     setTagInput]     = useState('')
  const [timerActive,  setTimerActive]  = useState(false)
  const [timerSecs,    setTimerSecs]    = useState(0)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX   = useRef(0)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const isPersonal = piece.source === 'personal'

  // タイマー
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => setTimerSecs(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerActive])

  async function stopTimer() {
    setTimerActive(false)
    const mins = Math.round(timerSecs / 60)
    if (mins < 1) { setTimerSecs(0); return }
    const newActual = (piece.actual_minutes || 0) + mins
    setTimerSecs(0)
    try {
      await pieceApi.updatePersonal(piece.id, { actual_minutes: newActual })
      onUpdate?.(piece.id, { actual_minutes: newActual })
    } catch { /* ignore */ }
  }

  async function toggleFocus(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !piece.is_today_focus
    try {
      await pieceApi.updatePersonal(piece.id, { is_today_focus: next })
      onUpdate?.(piece.id, { is_today_focus: next })
    } catch { /* ignore */ }
  }

  async function addTag(tag: string) {
    const t = tag.trim().toLowerCase()
    if (!t || piece.personal_tags?.includes(t)) return
    const next = [...(piece.personal_tags || []), t]
    try {
      await pieceApi.updatePersonal(piece.id, { personal_tags: next })
      onUpdate?.(piece.id, { personal_tags: next })
    } catch { /* ignore */ }
  }

  async function removeTag(tag: string) {
    const next = (piece.personal_tags || []).filter(t => t !== tag)
    try {
      await pieceApi.updatePersonal(piece.id, { personal_tags: next })
      onUpdate?.(piece.id, { personal_tags: next })
    } catch { /* ignore */ }
  }

  const col   = STATUS_COLOR[piece.status] || '#888888'
  const cCol  = companyColor(piece.company_id, companies)
  const isMarketplace = piece.source === 'marketplace'
  const isFocus = piece.status === 'in_progress' || piece.status === 'ready'

  // チェーン情報
  const downstreamMap = new Map(connections.map(c => [c.from_piece_id, c.to_piece_id]))
  const upstreamMap   = new Map(connections.map(c => [c.to_piece_id,   c.from_piece_id]))
  const upPiece   = allPieces.find(p => p.id === upstreamMap.get(piece.id))
  const downPiece = allPieces.find(p => p.id === downstreamMap.get(piece.id))

  async function changeStatus(s: string) {
    if (acting) return
    setActing(true)
    try {
      if (isPersonal && s === 'done') {
        // 繰り返しタスクの完了は専用エンドポイント
        const result = await pieceApi.completePersonal(piece.id)
        onStatusChange(piece.id, 'done')
        if (result.next) onUpdate?.(piece.id, { status: 'done' })
      } else {
        await pieceApi.updateStatus(piece.id, s as any)
        onStatusChange(piece.id, s)
      }
    } catch { /* ignore */ }
    finally { setActing(false) }
  }

  async function saveTitle() {
    const t = titleDraft.trim()
    if (!t || t === piece.title) { setEditTitle(false); return }
    try {
      await pieceApi.updatePersonal(piece.id, { title: t })
      onUpdate?.(piece.id, { title: t })
    } catch { setTitleDraft(piece.title) }
    setEditTitle(false)
  }

  async function saveDue() {
    try {
      await pieceApi.updatePersonal(piece.id, { due_date: dueDraft || null })
      onUpdate?.(piece.id, { due_date: dueDraft ? new Date(dueDraft).toISOString() : null })
    } catch { /* ignore */ }
    setEditDue(false)
  }

  async function deleteSelf() {
    if (!window.confirm(`「${piece.title}」を削除しますか？`)) return
    try {
      await pieceApi.deletePersonal(piece.id)
      onDelete?.(piece.id)
    } catch { /* ignore */ }
  }

  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleProgressInput(v: number) {
    onProgressChange(piece.id, v)
    if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current)
    saveProgressTimer.current = setTimeout(async () => {
      try { await (pieceApi as any).updateWorkerProgress(piece.id, v) } catch { /* ignore */ }
    }, 600)
  }

  // スワイプ
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current
    if (dx > 0 && piece.status !== 'done') setSwipeX(Math.min(dx, 80))
  }
  function onTouchEnd() {
    if (swipeX > 55 && (piece.status === 'ready' || piece.status === 'in_progress')) {
      changeStatus('done')
    }
    setSwipeX(0)
  }

  return (
    <div
      style={{ position: 'relative', borderRadius: 3, overflow: 'hidden' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* スワイプ背景 */}
      {swipeX > 0 && (
        <div style={{
          position: 'absolute', inset: 0, background: '#2E7D52', zIndex: 0,
          display: 'flex', alignItems: 'center', paddingLeft: 16,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>完了</span>
        </div>
      )}

      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface)',
        border: isFocus ? `1.5px solid ${col}` : '1px solid var(--border)',
        borderLeft: `4px solid ${cCol}`,
        borderRadius: 3,
        transform: `translateX(${swipeX}px)`,
        transition: swipeX === 0 ? 'transform 0.25s' : 'none',
        boxShadow: isFocus ? `0 2px 12px ${col}18` : 'none',
      }}>

        {/* ── ヘッダー行（タップで展開） ── */}
        <div
          style={{ padding: '12px 14px', cursor: 'pointer' }}
          onClick={() => setExpanded(v => !v)}
        >
          {/* 1行目: 企業名 / 個人バッジ + マーケット + ステータス + 日付 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {piece.company_name ? (
              <span style={{
                fontSize: 10, fontWeight: 700, color: cCol,
                background: cCol + '15', padding: '2px 7px', borderRadius: 2,
                border: `1px solid ${cCol}30`, flexShrink: 0,
                maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{piece.company_name}</span>
            ) : piece.source === 'personal' ? (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#888888',
                background: '#88888812', padding: '2px 7px', borderRadius: 2,
                border: '1px solid #88888828', flexShrink: 0,
              }}>個人</span>
            ) : null}
            {isMarketplace && <MarketplaceBadge compact />}
            <span style={{ flex: 1 }} />
            {/* 今日フォーカス☆ボタン */}
            <button onClick={toggleFocus} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px',
              color: piece.is_today_focus ? '#B46400' : 'var(--text-4)',
              flexShrink: 0, display: 'flex', alignItems: 'center',
            }}>
              <Star size={13} fill={piece.is_today_focus ? '#B46400' : 'none'} />
            </button>
            <span style={{
              fontSize: 9, color: col, fontWeight: 700,
              background: col + '18', padding: '2px 6px', borderRadius: 2, flexShrink: 0,
            }}>{STATUS_LABEL[piece.status] || piece.status}</span>
            <DueChip due={piece.due_date} />
            <svg width={10} height={10} viewBox="0 0 10 10" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.15s' }}>
              <path d="M2 3.5L5 6.5L8 3.5" stroke="#AAAAAA" strokeWidth={1.5} fill="none" strokeLinecap="round"/>
            </svg>
          </div>

          {/* 2行目: タイトル（個人タスクはダブルタップで編集） */}
          {editTitle && isPersonal ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              autoFocus
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveTitle()
                if (e.key === 'Escape') { setTitleDraft(piece.title); setEditTitle(false) }
              }}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 14, fontWeight: 700, width: '100%',
                border: 'none', borderBottom: '1.5px solid #B46400',
                outline: 'none', background: 'transparent', color: 'var(--text-1)',
                fontFamily: 'inherit', padding: '2px 0', marginBottom: piece.project_name ? 4 : 0,
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 14, fontWeight: 700,
                color: piece.status === 'done' ? 'var(--text-3)' : 'var(--text-1)',
                textDecoration: piece.status === 'done' ? 'line-through' : 'none',
                lineHeight: 1.3, marginBottom: piece.project_name ? 4 : 0,
              }}
              onDoubleClick={e => {
                if (!isPersonal) return
                e.stopPropagation()
                setEditTitle(true)
                setTimeout(() => titleInputRef.current?.select(), 30)
              }}
            >
              {piece.title}
              {isPersonal && piece.recurrence_rule && (
                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#B46400', background: '#B4640015', padding: '1px 5px', borderRadius: 2, verticalAlign: 'middle' }}>
                  {RECURRENCE_LABELS[piece.recurrence_rule]}
                </span>
              )}
            </div>
          )}

          {/* 3行目: プロジェクト名 */}
          {piece.project_name && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {piece.project_name}
            </div>
          )}

          {/* 進捗バー（in_progress のとき） */}
          {piece.status === 'in_progress' && (
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, marginTop: 8 }}>
              <div style={{ height: '100%', width: `${piece.progress}%`, background: col, borderRadius: 1, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>

        {/* ── 展開パネル ── */}
        {expanded && (
          <div style={{ padding: '0 14px 16px', borderTop: '1px solid var(--border)' }}>

            {/* チェーン（上流→自分→下流） */}
            {(upPiece || downPiece) && (
              <div style={{ padding: '10px 0 12px', display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
                {upPiece && (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-sub)', padding: '3px 8px', borderRadius: 2, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{upPiece.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                  </>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: col, padding: '3px 10px', borderRadius: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>{piece.title}</span>
                {downPiece && (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-sub)', padding: '3px 8px', borderRadius: 2, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{downPiece.title}</span>
                  </>
                )}
              </div>
            )}

            {/* 説明 */}
            {piece.objective && (
              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 14, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                {piece.objective}
              </p>
            )}

            {/* 進捗スライダー（in_progress） */}
            {piece.status === 'in_progress' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>進捗</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{piece.progress}%</span>
                </div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                  {[0, 25, 50, 75, 100].map(pct => {
                    const active = Math.abs(piece.progress - pct) < 5
                    return (
                      <button key={pct} onClick={() => handleProgressInput(pct)} style={{
                        flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700,
                        color: active ? '#fff' : col, background: active ? col : 'var(--surface)',
                        border: `1.5px solid ${col}`, borderRadius: 2, cursor: 'pointer',
                      }}>{pct}%</button>
                    )
                  })}
                </div>
                <input type="range" min={0} max={100} value={piece.progress}
                  onChange={e => handleProgressInput(Number(e.target.value))}
                  style={{ width: '100%', accentColor: col }} />
              </div>
            )}

            {/* スキルタグ */}
            {piece.skill_tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                {piece.skill_tags.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 2, background: 'var(--surface-sub)', color: 'var(--text-2)' }}>{t}</span>
                ))}
              </div>
            )}

            {/* ビジネスインパクト */}
            {piece.business_impact != null && piece.business_impact > 0 && (
              <div style={{ fontSize: 11, color: '#E60012', marginBottom: 14, fontWeight: 700 }}>
                ★ ¥{piece.business_impact.toLocaleString()} のインパクト
              </div>
            )}

            {/* チェックリスト */}
            <div style={{ marginBottom: 14 }}>
              <SubtaskList pieceId={piece.id} onProgressChange={p => { if (p > 0) handleProgressInput(p) }} />
            </div>

            {/* 作業メモ */}
            <WorkerMemo pieceId={piece.id} initialMemo={piece.worker_memo ?? ''} />

            {/* 個人タスク：期日インライン編集 */}
            {isPersonal && (
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={13} color="var(--text-3)" />
                {editDue ? (
                  <>
                    <input
                      type="date"
                      value={dueDraft}
                      autoFocus
                      onChange={e => setDueDraft(e.target.value)}
                      onBlur={saveDue}
                      onKeyDown={e => { if (e.key === 'Enter') saveDue(); if (e.key === 'Escape') setEditDue(false) }}
                      style={{
                        fontSize: 12, padding: '3px 8px',
                        border: '1px solid #B46400', borderRadius: 2,
                        background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
                      }}
                    />
                    {dueDraft && (
                      <button onClick={() => { setDueDraft(''); saveDue() }} style={{ fontSize: 11, color: '#E60012', background: 'none', border: 'none', cursor: 'pointer' }}>期日を削除</button>
                    )}
                  </>
                ) : (
                  <button onClick={() => setEditDue(true)} style={{
                    fontSize: 11, color: piece.due_date ? 'var(--text-2)' : 'var(--text-4)',
                    background: 'none', border: '1px dashed var(--border)', borderRadius: 2,
                    padding: '2px 8px', cursor: 'pointer',
                  }}>
                    {piece.due_date ? piece.due_date.slice(0, 10) : '期日を設定'}
                  </button>
                )}
              </div>
            )}

            {/* 見積もり・実績時間（個人タスク） */}
            {isPersonal && (
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Clock size={13} color="var(--text-3)" />
                {/* 見積もり */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>見積</span>
                  <input
                    type="number" min={0} step={5}
                    value={piece.estimated_minutes ?? ''}
                    onChange={async e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      try {
                        await pieceApi.updatePersonal(piece.id, { estimated_minutes: v })
                        onUpdate?.(piece.id, { estimated_minutes: v })
                      } catch { /* ignore */ }
                    }}
                    placeholder="分"
                    style={{
                      width: 52, fontSize: 12, padding: '3px 6px', textAlign: 'right',
                      border: '1px solid var(--border)', borderRadius: 2,
                      background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>分</span>
                </div>
                {/* 実績（タイマー） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>実績</span>
                  {timerActive ? (
                    <button onClick={stopTimer} style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 2,
                      background: '#E60012', color: '#fff', border: 'none', cursor: 'pointer',
                      minWidth: 70, textAlign: 'center',
                    }}>
                      {String(Math.floor(timerSecs / 60)).padStart(2,'0')}:{String(timerSecs % 60).padStart(2,'0')} 停止
                    </button>
                  ) : (
                    <>
                      <input
                        type="number" min={0} step={5}
                        value={piece.actual_minutes ?? ''}
                        onChange={async e => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          try {
                            await pieceApi.updatePersonal(piece.id, { actual_minutes: v })
                            onUpdate?.(piece.id, { actual_minutes: v })
                          } catch { /* ignore */ }
                        }}
                        placeholder="分"
                        style={{
                          width: 52, fontSize: 12, padding: '3px 6px', textAlign: 'right',
                          border: '1px solid var(--border)', borderRadius: 2,
                          background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>分</span>
                      <button onClick={() => setTimerActive(true)} style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 2,
                        background: 'var(--surface-sub)', border: '1px solid var(--border)',
                        color: 'var(--text-3)', cursor: 'pointer',
                      }}>▶ 計測</button>
                    </>
                  )}
                </div>
                {/* 見積vs実績の差分表示 */}
                {piece.estimated_minutes && piece.actual_minutes && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: piece.actual_minutes > piece.estimated_minutes ? '#E60012' : '#2E7D52',
                  }}>
                    {piece.actual_minutes > piece.estimated_minutes
                      ? `+${piece.actual_minutes - piece.estimated_minutes}分 オーバー`
                      : `−${piece.estimated_minutes - piece.actual_minutes}分 前倒し`}
                  </span>
                )}
              </div>
            )}

            {/* タグ（個人タスク） */}
            {isPersonal && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Tag size={12} color="var(--text-3)" />
                  {(piece.personal_tags || []).map(tag => (
                    <span key={tag} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 10, padding: '2px 7px', borderRadius: 10,
                      background: 'var(--surface-sub)', border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                    }}>
                      {tag}
                      <button onClick={() => removeTag(tag)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, color: 'var(--text-3)', display: 'flex', lineHeight: 1,
                      }}><X size={9} /></button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        addTag(tagInput)
                        setTagInput('')
                      }
                    }}
                    onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput('') } }}
                    placeholder="タグを追加…"
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, width: 90,
                      border: '1px dashed var(--border)',
                      background: 'transparent', color: 'var(--text-2)', outline: 'none',
                    }}
                  />
                </div>
              </div>
            )}

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {piece.status === 'ready' && (
                <button onClick={() => changeStatus('in_progress')} disabled={acting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 2,
                  background: 'var(--text-1)', color: 'var(--bg)',
                  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: acting ? 0.6 : 1,
                }}>▶ 開始する</button>
              )}
              {piece.status === 'in_progress' && (
                <button onClick={() => changeStatus('done')} disabled={acting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 2,
                  background: col, color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: acting ? 0.6 : 1,
                }}>{piece.recurrence_rule ? `→ 完了（次回: ${RECURRENCE_LABELS[piece.recurrence_rule]}）` : '→ 渡す（完了）'}</button>
              )}
              {piece.status === 'ready' && isPersonal && (
                <button onClick={() => changeStatus('done')} disabled={acting} style={{
                  padding: '10px 14px', borderRadius: 2,
                  background: 'transparent', color: 'var(--text-3)',
                  border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
                  opacity: acting ? 0.6 : 1,
                }}>完了</button>
              )}
              {/* 企業に提案（個人タスクのみ） */}
              {isPersonal && (
                <button onClick={() => onPropose?.(piece)} style={{
                  padding: '10px 12px', borderRadius: 2, flexShrink: 0,
                  background: 'transparent', color: '#B46400',
                  border: '1px solid #B4640030', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Lightbulb size={13} /> 提案
                </button>
              )}
              {/* 削除（個人タスクのみ） */}
              {isPersonal && (
                <button onClick={deleteSelf} style={{
                  padding: '10px 12px', borderRadius: 2,
                  background: 'transparent', color: '#E60012',
                  border: '1px solid #E6001230', fontSize: 12, cursor: 'pointer',
                  flexShrink: 0,
                }}>削除</button>
              )}
            </div>

            {/* コメント */}
            {!isPersonal && <WorkerCommentSection pieceId={piece.id} />}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkerCommentSection({ pieceId }: { pieceId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ id: string; content: string; user_name: string; created_at: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    if (loaded) return;
    setLoaded(true);
    pieceApi.getComments(pieceId).then(setComments).catch(() => {});
    usersApi.workers().then((ws: { id: string; name: string }[]) => setMembers(ws)).catch(() => {});
  }

  const mentionCandidates = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart ?? val.length;
    const atMatch = val.slice(0, cursor).match(/@(\S*)$/);
    if (atMatch) { setMentionQuery(atMatch[1]); setMentionIndex(0); }
    else setMentionQuery(null);
  }

  function insertMention(name: string) {
    const cursor = inputRef.current?.selectionStart ?? newComment.length;
    const replaced = newComment.slice(0, cursor).replace(/@(\S*)$/, `@${name} `);
    setNewComment(replaced + newComment.slice(cursor));
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionIndex].name); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
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

  function renderContent(text: string) {
    return text.split(/(@\S+)/g).map((p, i) =>
      p.startsWith('@') ? <span key={i} style={{ color: '#B46400', fontWeight: 600 }}>{p}</span> : <span key={i}>{p}</span>
    );
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-sub)', paddingTop: 10 }}>
      <button onClick={() => { setOpen(v => !v); load(); }}
        style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1h10v7H7l-2 2V8H1V1z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        コメント {loaded && comments.length > 0 ? `(${comments.length})` : ''}
        <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.15s' }}><path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {comments.map(c => (
              <div key={c.id} style={{ background: 'var(--surface-sub)', borderRadius: 6, padding: '7px 9px', border: '1px solid var(--border-sub)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)' }}>{c.user_name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5 }}>{renderContent(c.content)}</div>
              </div>
            ))}
            {loaded && comments.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>まだコメントはありません</div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden' }}>
                {mentionCandidates.map((m, i) => (
                  <div key={m.id} onMouseDown={e => { e.preventDefault(); insertMention(m.name); }}
                    style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', background: i === mentionIndex ? 'var(--accent-sub)' : 'transparent', color: i === mentionIndex ? '#B46400' : 'var(--text-1)' }}>
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
                placeholder="コメント... （@名前でメンション）"
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none' }}
              />
              <button onClick={handlePost} disabled={posting || !newComment.trim()}
                style={{ padding: '6px 10px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: posting || !newComment.trim() ? 0.5 : 1 }}>
                {posting ? '...' : '送信'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 個人タスク作成バー ────────────────────────────────────────────

const RECURRENCE_LABELS: Record<string, string> = { daily: '毎日', weekly: '毎週', monthly: '毎月' }

function QuickAdd({ onAdded }: { onAdded: (piece: Piece) => void }) {
  const [title,      setTitle]      = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [showOpts,   setShowOpts]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [errMsg,     setErrMsg]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  async function submit() {
    const t = title.trim()
    if (!t || loading) return
    setLoading(true)
    setErrMsg('')
    try {
      const piece = await pieceApi.createPersonal({
        title:            t,
        due_date:         dueDate     || undefined,
        recurrence_rule:  recurrence  || undefined,
      })
      onAdded(piece)
      setTitle('')
      setDueDate('')
      setRecurrence('')
      setShowOpts(false)
      inputRef.current?.focus()
    } catch (e: any) {
      setErrMsg(e?.response?.data?.error || '作成に失敗しました')
    } finally { setLoading(false) }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
  }

  const hasOpts = !!(dueDate || recurrence)

  return (
    <div ref={wrapRef} style={{
      marginBottom: 16,
      background: 'var(--surface)',
      border: '1.5px solid var(--border)',
      borderRadius: 3,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* メイン入力行 */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 4, alignSelf: 'stretch', background: '#888888', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="今日やること… (Enterで追加)"
          style={{
            flex: 1, fontSize: 13, padding: '11px 12px',
            border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text-1)',
            fontFamily: 'inherit',
          }}
          onFocus={() => { if (wrapRef.current) wrapRef.current.style.borderColor = '#B46400' }}
          onBlur={() => { if (wrapRef.current) wrapRef.current.style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={() => setShowOpts(v => !v)}
          title="期日・繰り返しを設定"
          style={{
            padding: '8px 10px', background: 'none', border: 'none',
            cursor: 'pointer', color: hasOpts ? '#B46400' : 'var(--text-4)',
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          <Calendar size={14} />
          {hasOpts && <span style={{ fontSize: 8, fontWeight: 700, color: '#B46400' }}>●</span>}
        </button>
        <button
          onClick={submit}
          disabled={!title.trim() || loading}
          style={{
            padding: '8px 14px', background: 'none', border: 'none',
            borderLeft: '1px solid var(--border)',
            cursor: title.trim() ? 'pointer' : 'default',
            color: title.trim() ? 'var(--text-1)' : 'var(--text-4)',
            flexShrink: 0, display: 'flex', alignItems: 'center',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {errMsg && (
        <div style={{ padding: '4px 16px', fontSize: 11, color: '#E60012', background: '#E6001208' }}>
          {errMsg}
        </div>
      )}

      {/* オプション展開（期日 + 繰り返し） */}
      {showOpts && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 12px 12px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-sub)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={12} color="var(--text-3)" />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>期日</span>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                fontSize: 12, padding: '3px 8px',
                border: '1px solid var(--border)', borderRadius: 2,
                background: 'var(--surface)', color: 'var(--text-1)',
                outline: 'none', cursor: 'pointer',
              }}
            />
            {dueDate && (
              <button onClick={() => setDueDate('')} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>繰り返し</span>
            {(['', 'daily', 'weekly', 'monthly'] as const).map(r => (
              <button key={r} onClick={() => setRecurrence(r)} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                border: recurrence === r ? '1.5px solid #B46400' : '1px solid var(--border)',
                background: recurrence === r ? '#B4640015' : 'var(--surface)',
                color: recurrence === r ? '#B46400' : 'var(--text-3)',
                fontWeight: recurrence === r ? 700 : 400,
              }}>{r === '' ? 'なし' : RECURRENCE_LABELS[r]}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── スケルトン ────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div>
      {[80, 64, 64, 56].map((h, i) => (
        <div key={i} style={{ height: h, background: 'var(--surface-sub)', borderRadius: 3, marginBottom: 8, opacity: 1 - i * 0.12, animation: 'shimmer 1.4s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:0.5}50%{opacity:1}}`}</style>
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────

export default function MyPiecesPage() {
  const user     = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const [pieces,      setPieces]      = useState<Piece[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [companies,   setCompanies]   = useState<Company[]>([])
  const [loading,     setLoading]     = useState(true)
  const [celebration, setCelebration] = useState<{ name: string; nextTitle?: string } | null>(null)
  const [filterCompany,   setFilterCompany]   = useState('')
  const [filterText,      setFilterText]      = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [showPersonalOnly,setShowPersonalOnly] = useState(false)
  const [showTodayOnly,   setShowTodayOnly]   = useState(false)
  const [filterTag,       setFilterTag]       = useState('')
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [myPieces, conns, comps] = await Promise.all([
        pieceApi.list({ assignee_id: user.id }),
        pieceApi.getConnections().catch(() => []),
        usersApi.myCompanies().catch(() => []),
      ])
      setPieces(myPieces)
      setConnections(Array.isArray(conns) ? conns : (conns as any).connections ?? [])
      setCompanies(comps)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_ready' || event.type === 'piece_assigned') load()
  }, [load]))

  function updatePiece(id: string, patch: Partial<Piece>) {
    setPieces(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  const ORDER: Record<string, number> = { in_progress: 0, ready: 1, locked: 2, done: 3 }

  const filtered = useMemo(() => {
    let r = [...pieces].sort((a, b) => {
      const ua = urgencyScore(a), ub = urgencyScore(b)
      if (ua !== ub) return ua - ub
      const sd = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)
      return sd !== 0 ? sd : a.priority - b.priority
    })
    if (showTodayOnly)    r = r.filter(p => p.is_today_focus)
    else if (showPersonalOnly) r = r.filter(p => p.source === 'personal' && !p.company_id)
    else if (filterCompany)    r = r.filter(p => p.company_id === filterCompany)
    if (filterTag)   r = r.filter(p => p.personal_tags?.includes(filterTag))
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase()
      r = r.filter(p => p.title.toLowerCase().includes(q) || p.company_name?.toLowerCase().includes(q))
    }
    if (filterStatus) r = r.filter(p => p.status === filterStatus)
    return r
  }, [pieces, filterCompany, filterText, filterStatus, showPersonalOnly, showTodayOnly, filterTag])

  const active = filtered.filter(p => p.status !== 'done')

  // 完了済み：個人タスクは7日超で自動アーカイブ（表示から隠す）
  const ARCHIVE_DAYS = 7
  const now = Date.now()
  const doneVisible  = filtered.filter(p => {
    if (p.status !== 'done') return false
    if (p.source === 'personal' && p.completed_at) {
      const age = (now - new Date(p.completed_at).getTime()) / 86400000
      return age <= ARCHIVE_DAYS
    }
    return true
  })
  const doneArchived = filtered.filter(p => {
    if (p.status !== 'done' || p.source !== 'personal' || !p.completed_at) return false
    return (now - new Date(p.completed_at).getTime()) / 86400000 > ARCHIVE_DAYS
  })
  const done = doneVisible

  const downstreamMap = new Map(connections.map(c => [c.from_piece_id, c.to_piece_id]))

  const todayLabel = useMemo(() => {
    const d   = new Date()
    const dow = ['日','月','火','水','木','金','土'][d.getDay()]
    return `${d.getMonth() + 1}月${d.getDate()}日（${dow}）`
  }, [])

  const urgentCount = pieces.filter(p => urgencyScore(p) <= 1).length

  return (
    <div style={{
      maxWidth: 720, margin: '0 auto',
      padding: isMobile ? '16px 12px 96px' : '28px 20px 80px',
      fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
    }}>

      {/* ── ヘッダー ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            {user?.name} のワーク
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{todayLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-2)' }}>
          <span><strong style={{ color: '#B46400' }}>{pieces.filter(p => p.status === 'in_progress').length}</strong> 進行中</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span><strong>{pieces.filter(p => p.status === 'ready').length}</strong> 着手可能</span>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ color: 'var(--text-3)' }}>{pieces.filter(p => p.status === 'done').length} 完了</span>
        </div>
        {urgentCount > 0 && (
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 3,
            background: '#E6001208', border: '1px solid #E6001233',
            fontSize: 11, color: '#E60012', fontWeight: 600,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#E60012' }} />
            期日超過・本日期限のタスクが {urgentCount} 件あります
          </div>
        )}
        {/* 今日フォーカス中のバナー */}
        {(() => {
          const focusActive = pieces.filter(p => p.is_today_focus && p.status !== 'done')
          if (focusActive.length === 0) return null
          const totalEst = focusActive.reduce((s, p) => s + (p.estimated_minutes || 0), 0)
          return (
            <div
              onClick={() => setShowTodayOnly(v => !v)}
              style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
                background: showTodayOnly ? '#B4640020' : '#B4640010',
                border: `1px solid ${showTodayOnly ? '#B46400' : '#B4640030'}`,
                fontSize: 11, color: '#B46400', fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              <Star size={12} fill={showTodayOnly ? '#B46400' : 'none'} />
              今日フォーカス {focusActive.length}件
              {totalEst > 0 && <span style={{ fontWeight: 400 }}>— 合計 {Math.floor(totalEst / 60) > 0 ? `${Math.floor(totalEst / 60)}時間` : ''}{totalEst % 60 > 0 ? `${totalEst % 60}分` : ''}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.7 }}>{showTodayOnly ? 'フォーカス解除' : 'フォーカスのみ表示'}</span>
            </div>
          )
        })()}
      </div>

      {/* ── フィルタータブ（企業 + 個人） ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {/* すべて */}
        <button
          onClick={() => { setFilterCompany(''); setShowPersonalOnly(false); setShowTodayOnly(false); setFilterTag('') }}
          style={{
            flexShrink: 0, padding: '5px 14px', fontSize: 11, fontWeight: 700,
            borderRadius: 2, cursor: 'pointer', border: 'none',
            background: !filterCompany && !showPersonalOnly && !showTodayOnly && !filterTag ? 'var(--text-1)' : 'var(--surface-sub)',
            color:      !filterCompany && !showPersonalOnly && !showTodayOnly && !filterTag ? 'var(--bg)'     : 'var(--text-3)',
            transition: 'all 0.12s',
          }}
        >すべて</button>
        {/* 今日フォーカス */}
        <button
          onClick={() => { setShowTodayOnly(v => !v); setShowPersonalOnly(false); setFilterCompany(''); setFilterTag('') }}
          style={{
            flexShrink: 0, padding: '5px 14px', fontSize: 11, fontWeight: 700,
            borderRadius: 2, cursor: 'pointer',
            border:     showTodayOnly ? '1.5px solid #B46400' : '1px solid #B4640040',
            background: showTodayOnly ? '#B46400' : '#B4640010',
            color:      showTodayOnly ? '#fff' : '#B46400',
            transition: 'all 0.12s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Star size={10} fill={showTodayOnly ? '#fff' : 'none'} /> 今日
        </button>
        {/* 個人タスク */}
        <button
          onClick={() => { setShowPersonalOnly(v => !v); setFilterCompany(''); setShowTodayOnly(false) }}
          style={{
            flexShrink: 0, padding: '5px 14px', fontSize: 11, fontWeight: 700,
            borderRadius: 2, cursor: 'pointer',
            border:     showPersonalOnly ? '1.5px solid #888888' : '1px solid #88888840',
            background: showPersonalOnly ? '#888888' : '#88888812',
            color:      showPersonalOnly ? '#fff' : '#888888',
            transition: 'all 0.12s',
          }}
        >個人</button>
        {/* 接続企業 */}
        {companies.map((c) => {
          const cc = companyColor(c.id, companies)
          const isActive = filterCompany === c.id
          return (
            <button key={c.id}
              onClick={() => { setFilterCompany(isActive ? '' : c.id); setShowPersonalOnly(false); setShowTodayOnly(false); setFilterTag('') }}
              style={{
                flexShrink: 0, padding: '5px 14px', fontSize: 11, fontWeight: 700,
                borderRadius: 2, cursor: 'pointer',
                border:     isActive ? `1.5px solid ${cc}` : `1px solid ${cc}44`,
                background: isActive ? cc : cc + '10',
                color:      isActive ? '#fff' : cc,
                transition: 'all 0.12s',
              }}
            >{c.name}</button>
          )
        })}
      </div>

      {/* ── フィルタバー ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <input
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="ピース名・会社名を検索…"
          style={{
            flex: 1, minWidth: 0, fontSize: 12, padding: '7px 10px',
            border: '1px solid var(--border)', borderRadius: 2,
            background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
          }}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{
            fontSize: 12, padding: '7px 8px',
            border: '1px solid var(--border)', borderRadius: 2,
            background: 'var(--surface)', color: filterStatus ? 'var(--text-1)' : 'var(--text-3)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <option value="">すべてのステータス</option>
          <option value="in_progress">進行中</option>
          <option value="ready">着手可能</option>
          <option value="locked">ロック中</option>
        </select>
        {(filterText || filterStatus) && (
          <button
            onClick={() => { setFilterText(''); setFilterStatus('') }}
            style={{
              padding: '7px 10px', fontSize: 11, fontWeight: 700,
              background: 'transparent', color: 'var(--text-3)',
              border: '1px solid var(--border)', borderRadius: 2, cursor: 'pointer', flexShrink: 0,
            }}
          >クリア</button>
        )}
      </div>

      {/* ── タグクラウド（使用中のタグがあれば表示） ── */}
      {(() => {
        const allTags = [...new Set(pieces.flatMap(p => p.personal_tags || []))]
        if (allTags.length === 0) return null
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            <Tag size={11} color="var(--text-4)" style={{ marginTop: 3 }} />
            {allTags.map(tag => (
              <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)} style={{
                fontSize: 10, padding: '2px 9px', borderRadius: 10, cursor: 'pointer',
                border: filterTag === tag ? '1.5px solid #B46400' : '1px solid var(--border)',
                background: filterTag === tag ? '#B4640015' : 'var(--surface-sub)',
                color: filterTag === tag ? '#B46400' : 'var(--text-3)',
                fontWeight: filterTag === tag ? 700 : 400,
              }}>{tag}</button>
            ))}
          </div>
        )
      })()}

      {/* ── 個人タスク追加バー ── */}
      <QuickAdd onAdded={(piece) => {
        setPieces(prev => [piece, ...prev])
      }} />

      {loading ? <Skeleton /> : (
        <>
          {/* ── アクティブなピース ── */}
          {active.length === 0 ? (
            <div style={{
              padding: '40px 24px', textAlign: 'center',
              background: 'var(--surface-sub)', border: '1px dashed var(--border)', borderRadius: 3,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 6 }}>
                {showTodayOnly
                  ? '今日フォーカスのピースがありません — ☆ボタンで追加できます'
                  : filterCompany || filterText || filterStatus || showPersonalOnly || filterTag
                  ? '該当するピースがありません'
                  : '今日やることを上のバーから追加できます'}
              </div>
              {!filterCompany && !filterText && !filterStatus && !showPersonalOnly && !showTodayOnly && !filterTag && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 10 }}>
                    企業から割り当てられたピースはここに自動で表示されます
                  </div>
                  {companies.length === 0 && (
                    <div style={{
                      marginTop: 8, padding: '10px 14px',
                      background: 'rgba(74,111,165,0.06)',
                      border: '1px solid rgba(74,111,165,0.20)',
                      borderRadius: 6, fontSize: 11, color: '#4A6FA5',
                      lineHeight: 1.6,
                    }}>
                      <span style={{ fontWeight: 700 }}>企業と接続するには？</span><br />
                      担当者から招待リンクを受け取り、リンクを開いて承諾してください。<br />
                      接続後、割り当てられたピースがここに表示されます。
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {active.map(p => (
                <PieceCard
                  key={p.id}
                  piece={p}
                  companies={companies}
                  connections={connections}
                  allPieces={pieces}
                  onStatusChange={(id, status) => {
                    if (status === 'done') {
                      const nextId    = downstreamMap.get(id)
                      const nextPiece = nextId ? pieces.find(x => x.id === nextId) : undefined
                      setCelebration({ name: p.title, nextTitle: nextPiece?.title })
                    }
                    updatePiece(id, { status })
                  }}
                  onProgressChange={(id, progress) => updatePiece(id, { progress })}
                  onDelete={(id) => setPieces(prev => prev.filter(x => x.id !== id))}
                  onUpdate={(id, patch) => updatePiece(id, patch)}
                  onPropose={(piece) => {
                    const params = new URLSearchParams({
                      title: piece.title,
                      ...(piece.objective ? { objective: piece.objective } : {}),
                      ...(piece.personal_tags?.length ? { tags: piece.personal_tags.join(',') } : {}),
                    })
                    navigate(`/work/proposals?${params.toString()}`)
                  }}
                />
              ))}
            </div>
          )}

          {/* ── 完了済み（折りたたみ）── */}
          {done.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                letterSpacing: '0.07em', cursor: 'pointer', userSelect: 'none',
                listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
              }}>
                <span>▸</span> 完了済み {done.length}件
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {done.map(p => (
                  <PieceCard
                    key={p.id}
                    piece={p}
                    companies={companies}
                    connections={connections}
                    allPieces={pieces}
                    onStatusChange={(id, status) => updatePiece(id, { status })}
                    onProgressChange={(id, progress) => updatePiece(id, { progress })}
                    onDelete={(id) => setPieces(prev => prev.filter(x => x.id !== id))}
                    onUpdate={(id, patch) => updatePiece(id, patch)}
                  />
                ))}
              </div>
            </details>
          )}

          {/* ── アーカイブ（7日超の個人完了タスク）── */}
          {doneArchived.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-4)',
                letterSpacing: '0.07em', cursor: 'pointer', userSelect: 'none',
                listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
              }}>
                <span>▸</span> アーカイブ（{ARCHIVE_DAYS}日以上前の完了） {doneArchived.length}件
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, opacity: 0.7 }}>
                {doneArchived.map(p => (
                  <PieceCard
                    key={p.id}
                    piece={p}
                    companies={companies}
                    connections={connections}
                    allPieces={pieces}
                    onStatusChange={(id, status) => updatePiece(id, { status })}
                    onProgressChange={(id, progress) => updatePiece(id, { progress })}
                    onDelete={(id) => setPieces(prev => prev.filter(x => x.id !== id))}
                    onUpdate={(id, patch) => updatePiece(id, patch)}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {celebration && (
        <HandoffCelebration
          pieceName={celebration.name}
          nextTitle={celebration.nextTitle}
          onDone={() => { setCelebration(null); load() }}
        />
      )}
    </div>
  )
}
