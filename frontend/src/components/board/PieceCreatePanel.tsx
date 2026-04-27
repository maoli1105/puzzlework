import React, { useState, useEffect } from 'react';
import { pieces as pieceApi, users as userApi, projects as projectApi } from '../../services/api';
import { User, Project, Piece } from '../../types';
import { X, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultParentId?: string | null;   // 子タスク作成時に親を事前選択
  allPieces?: Piece[];               // 親候補リスト
}

const SKILL_OPTIONS = [
  { value: 'ec',         label: 'EC・販売'       },
  { value: 'it',         label: 'IT・開発'       },
  { value: 'creative',   label: 'クリエイティブ' },
  { value: 'marketing',  label: 'マーケティング' },
  { value: 'sales',      label: '営業・BizDev'   },
  { value: 'ops',        label: 'オペレーション' },
  { value: 'mgmt',       label: 'マネジメント'   },
];

const EMPTY_FORM = {
  title: '', objective: '', value_metric: '', expected_impact: '',
  assignee_id: '', priority: 3, skill_tags: [] as string[],
  project_id: '', due_date: '', parent_id: '',
};

interface SkillVelocity { skill: string; avg_days: number | null; pieces_done: number; }

export default function PieceCreatePanel({ open, onClose, onCreated, defaultParentId, allPieces = [] }: Props) {
  const [workers, setWorkers]   = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm]         = useState({ ...EMPTY_FORM, parent_id: defaultParentId ?? '' });
  const [saving, setSaving]     = useState(false);
  const [skillVelocity, setSkillVelocity] = useState<SkillVelocity[]>([]);

  // defaultParentId が変わったらフォームに反映
  useEffect(() => {
    setForm(f => ({ ...f, parent_id: defaultParentId ?? '' }));
  }, [defaultParentId]);

  // 親候補: parent_id が null のルートピースのみ（孫以上の深さは作らない）
  const parentCandidates = allPieces.filter(p => !p.parent_id);

  useEffect(() => {
    userApi.workers().then(setWorkers).catch(() => {});
    projectApi.list().then((ps) => setProjects(ps.filter((p: Project) => p.status === 'active'))).catch(() => {});
    pieceApi.getVelocityInsights().then((d: { by_skill: SkillVelocity[] }) => setSkillVelocity(d.by_skill)).catch(() => {});
  }, []);

  function suggestDueDate(tags: string[]): { dateStr: string; avgDays: number } | null {
    if (tags.length === 0) return null;
    const matched = skillVelocity.filter(s => tags.includes(s.skill) && s.avg_days != null);
    if (matched.length === 0) return null;
    const avgDays = Math.round(matched.reduce((sum, s) => sum + (s.avg_days ?? 0), 0) / matched.length);
    const d = new Date();
    d.setDate(d.getDate() + avgDays);
    return { dateStr: d.toISOString().slice(0, 10), avgDays };
  }

  function set(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function toggleTag(tag: string) {
    setForm((f) => ({
      ...f,
      skill_tags: f.skill_tags.includes(tag)
        ? f.skill_tags.filter((t) => t !== tag)
        : [...f.skill_tags, tag],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await pieceApi.create({
        ...form,
        assignee_id: form.assignee_id || null,
        project_id:  form.project_id  || null,
        due_date:    form.due_date    || null,
        parent_id:   form.parent_id   || null,
      });
      onCreated();
      setForm(EMPTY_FORM);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 100 }} />}

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 101,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s ease',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          height: 56, padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>ピースを追加</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="タイトル *">
            <input style={inputStyle} placeholder="例：商品ページ作成" value={form.title}
              onChange={(e) => set('title', e.target.value)} required />
          </Field>

          <Field label="目的">
            <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} placeholder="何を達成したいか"
              value={form.objective} onChange={(e) => set('objective', e.target.value)} />
          </Field>

          <Field label="評価指標">
            <input style={inputStyle} placeholder="例：完了率・個数" value={form.value_metric}
              onChange={(e) => set('value_metric', e.target.value)} />
          </Field>

          <Field label="期待成果">
            <input style={inputStyle} placeholder="例：売上10%増" value={form.expected_impact}
              onChange={(e) => set('expected_impact', e.target.value)} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="担当者">
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.assignee_id}
                onChange={(e) => set('assignee_id', e.target.value)}>
                <option value="">未割り当て</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}（{(w as unknown as Record<string, number>).active_pieces ?? 0}件）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="プロジェクト">
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.project_id}
                onChange={(e) => set('project_id', e.target.value)}>
                <option value="">なし</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {parentCandidates.length > 0 && (
              <Field label="親ピース（サブタスク化）">
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.parent_id}
                  onChange={(e) => set('parent_id', e.target.value)}>
                  <option value="">なし（ルートピース）</option>
                  {parentCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="期限">
            <input type="date" style={inputStyle} value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)} />
            {(() => {
              const suggestion = suggestDueDate(form.skill_tags);
              if (!suggestion || form.due_date) return null;
              return (
                <button type="button"
                  onClick={() => set('due_date', suggestion.dateStr)}
                  style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', borderRadius: 'var(--r-sm)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Sparkles size={9} />
                  過去実績から提案: {suggestion.dateStr}（平均{suggestion.avgDays}日）
                </button>
              );
            })()}
          </Field>

          <Field label="優先度">
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => set('priority', n)} style={{
                  flex: 1, padding: '7px 0',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: form.priority === n ? 'var(--text-1)' : 'var(--surface-sub)',
                  color: form.priority === n ? '#FAFAF8' : 'var(--text-2)',
                  fontWeight: form.priority === n ? 600 : 400,
                  fontSize: 12, cursor: 'pointer',
                }}>{n}</button>
              ))}
            </div>
          </Field>

          <Field label="スキルタグ">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {SKILL_OPTIONS.map((opt) => {
                const active = form.skill_tags.includes(opt.value);
                return (
                  <button key={opt.value} type="button" onClick={() => toggleTag(opt.value)} style={{
                    padding: '3px 10px',
                    borderRadius: 99,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-sub)' : 'var(--surface-sub)',
                    color: active ? 'var(--accent)' : 'var(--text-3)',
                    fontSize: 11, cursor: 'pointer',
                    letterSpacing: '-0.01em',
                  }}>{opt.label}</button>
                );
              })}
            </div>
          </Field>

          <button type="submit" disabled={saving || !form.title.trim()} style={{
            marginTop: 4, width: '100%', padding: '11px 0',
            background: saving || !form.title.trim() ? 'var(--text-3)' : 'var(--text-1)',
            color: '#FAFAF8', border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 13, fontWeight: 600,
            cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em',
          }}>
            {saving ? '追加中...' : 'ピースを追加する'}
          </button>
        </form>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '7px 10px',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none',
  color: 'var(--text-1)',
  background: 'var(--surface)',
};
