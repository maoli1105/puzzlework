/**
 * SubtaskList — ピース内チェックリスト
 * FocusHero と QueueItem(展開時) で共用
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { subtasks as subtaskApi, Subtask } from '../../services/api'
import { Check, Plus, Trash2 } from 'lucide-react'

interface Props {
  pieceId: string
  /** compact=true のとき入力欄を非表示 */
  compact?: boolean
  /** 完了率変化時にコールバック */
  onProgressChange?: (pct: number) => void
}

export default function SubtaskList({ pieceId, compact = false, onProgressChange }: Props) {
  const [list, setList]       = useState<Subtask[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await subtaskApi.list(pieceId)
      setList(data)
      if (onProgressChange) {
        const pct = data.length === 0 ? 0 : Math.round((data.filter(s => s.done).length / data.length) * 100)
        onProgressChange(pct)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [pieceId, onProgressChange])

  useEffect(() => { load() }, [load])

  async function toggleDone(s: Subtask) {
    const updated = { ...s, done: !s.done }
    setList(prev => prev.map(x => x.id === s.id ? updated : x))
    try {
      await subtaskApi.update(s.id, { done: updated.done })
      if (onProgressChange) {
        const next = list.map(x => x.id === s.id ? updated : x)
        const pct = Math.round((next.filter(x => x.done).length / next.length) * 100)
        onProgressChange(pct)
      }
    } catch {
      setList(prev => prev.map(x => x.id === s.id ? s : x))
    }
  }

  async function addSubtask() {
    const title = input.trim()
    if (!title || adding) return
    setAdding(true)
    setInput('')
    try {
      const created = await subtaskApi.create(pieceId, title)
      setList(prev => [...prev, created])
    } catch { setInput(title) }
    finally { setAdding(false) }
  }

  async function remove(id: string) {
    setList(prev => prev.filter(s => s.id !== id))
    try { await subtaskApi.remove(id) }
    catch { load() }
  }

  if (loading) return null

  const doneCount = list.filter(s => s.done).length
  const pct = list.length === 0 ? 0 : Math.round((doneCount / list.length) * 100)

  return (
    <div>
      {/* ヘッダー（常に表示） */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em' }}>
          CHECKLIST
        </span>
        {list.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: pct === 100 ? '#2E7D52' : 'var(--text-3)' }}>
              {doneCount}/{list.length}
            </span>
            <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 1 }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: pct === 100 ? '#2E7D52' : '#B46400',
                borderRadius: 1, transition: 'width 0.3s',
              }} />
            </div>
          </>
        )}
      </div>

      {/* リスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: list.length > 0 ? 10 : 0 }}>
        {list.map(s => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 4px', borderRadius: 3,
              background: 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* チェックボックス */}
            <button
              onClick={() => toggleDone(s)}
              style={{
                flexShrink: 0, width: 18, height: 18,
                border: `1.5px solid ${s.done ? '#2E7D52' : 'var(--border)'}`,
                borderRadius: 3,
                background: s.done ? '#2E7D52' : 'transparent',
                cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              {s.done && <Check size={11} color="#fff" strokeWidth={2.5} />}
            </button>

            {/* タイトル */}
            <span style={{
              flex: 1, fontSize: 12.5,
              color: s.done ? 'var(--text-3)' : 'var(--text-1)',
              textDecoration: s.done ? 'line-through' : 'none',
              lineHeight: 1.4,
            }}>
              {s.title}
            </span>

            {/* 削除（コンパクト時は非表示） */}
            {!compact && (
              <button
                onClick={() => remove(s.id)}
                style={{
                  flexShrink: 0, padding: '2px 4px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-4)', borderRadius: 3,
                  display: 'flex', alignItems: 'center',
                  opacity: 0, transition: 'opacity 0.1s',
                }}
                className="subtask-del"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 入力欄（コンパクトでないとき） */}
      {!compact && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
            placeholder="ステップを追加…"
            style={{
              flex: 1, fontSize: 12, padding: '6px 9px',
              border: '1px solid var(--border)', borderRadius: 3,
              background: 'var(--surface)', color: 'var(--text-1)',
              outline: 'none',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#B46400')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={addSubtask}
            disabled={!input.trim() || adding}
            style={{
              width: 30, height: 30, flexShrink: 0,
              background: input.trim() ? 'var(--text-1)' : 'var(--surface-sub)',
              border: '1px solid var(--border)', borderRadius: 3,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <Plus size={13} color={input.trim() ? 'var(--bg)' : 'var(--text-3)'} />
          </button>
        </div>
      )}

      {/* 削除ボタンのホバー表示 */}
      <style>{`
        div:hover .subtask-del { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
