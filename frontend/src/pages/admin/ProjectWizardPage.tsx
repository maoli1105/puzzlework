/**
 * ProjectWizardPage — AIプロジェクト自動生成ウィザード
 *
 * ① プロジェクト名と概要を入力
 * ② AI（または過去テンプレート）がタスク構成を提案
 * ③ タスクを編集（タイトル・スキル・日数・依存関係）
 * ④ 確定 → プロジェクト + タスク + 接続を一括作成
 *
 * スコアリング根拠:
 *  - velocity_log の自社スキル別平均日数を Claude に渡して現実的な見積もりを生成
 *  - ANTHROPIC_API_KEY 未設定時はテンプレートマッチ → 汎用フォールバックに降格
 */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ai as aiApi, projects as projectsApi, pieces as piecesApi, SuggestedProjectPiece } from '../../services/api';
import {
  Sparkles, ChevronRight, Plus, Trash2, ArrowRight,
  Check, Loader2, GitBranch, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { PALETTE_CLASSIC, PALETTE_COLOR } from '../../constants/projectColors';

// ─── 型 ─────────────────────────────────────────────────────────────────────

interface EditablePiece extends SuggestedProjectPiece {
  _key: number; // UI管理用
}

// ─── 定数 ───────────────────────────────────────────────────────────────────

const SKILL_OPTIONS = [
  'ec', 'it', 'creative', 'marketing', 'sales', 'ops', 'mgmt',
  'TypeScript', 'SQL', 'データ分析', 'インフラ', 'デザイン', 'QA', 'finance',
];

// ─── カラーピッカー（クラシック / カラー 2タブ）──────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [tab, setTab] = useState<'classic' | 'color'>(() =>
    PALETTE_COLOR.includes(value) ? 'color' : 'classic'
  );
  const palette = tab === 'classic' ? PALETTE_CLASSIC : PALETTE_COLOR;

  return (
    <div>
      <div style={{ display: 'flex', gap: 1, marginBottom: 8 }}>
        {(['classic', 'color'] as const).map(t => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
              borderRadius: t === 'classic' ? '3px 0 0 3px' : '0 3px 3px 0',
              background: tab === t ? 'var(--text-1)' : 'var(--border)',
              color: tab === t ? '#fff' : 'var(--text-3)',
              letterSpacing: '0.04em',
            }}
          >
            {t === 'classic' ? 'クラシック' : 'カラー'}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {palette.map(c => (
          <button
            key={c} type="button" onClick={() => onChange(c)}
            style={{
              width: 20, height: 20, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer', outline: 'none',
              border: value === c ? '2px solid var(--text-1)' : '2px solid transparent',
              boxShadow: value === c ? `0 0 0 1px ${c}` : 'none',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.25)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

// const PROJECT_COLORS = PALETTE_CLASSIC; // 後方互換エイリアス（ランダム選択で使用）

// ─── PieceEditor ─────────────────────────────────────────────────────────────

function PieceEditor({
  piece, index, allPieces,
  onChange, onDelete,
}: {
  piece: EditablePiece;
  index: number;
  allPieces: EditablePiece[];
  onChange: (updated: EditablePiece) => void;
  onDelete: () => void;
}) {
  const [tagInput, setTagInput] = useState('');

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || piece.skill_tags.includes(t)) return;
    onChange({ ...piece, skill_tags: [...piece.skill_tags, t] });
    setTagInput('');
  }
  function removeTag(t: string) {
    onChange({ ...piece, skill_tags: piece.skill_tags.filter(x => x !== t) });
  }
  function toggleDep(depIndex: number) {
    const current = piece.depends_on.includes(depIndex);
    onChange({ ...piece, depends_on: current ? piece.depends_on.filter(d => d !== depIndex) : [...piece.depends_on, depIndex] });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '5px 8px', fontSize: 12,
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 5, color: 'var(--text-1)', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: '#B46400', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <input
          value={piece.title}
          onChange={e => onChange({ ...piece, title: e.target.value })}
          placeholder="タスクタイトル"
          style={{ ...inputStyle, fontWeight: 600, fontSize: 13 }}
        />
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 4, flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      </div>

      <input
        value={piece.objective}
        onChange={e => onChange({ ...piece, objective: e.target.value })}
        placeholder="目的・完了条件（任意）"
        style={{ ...inputStyle, marginBottom: 8, fontSize: 11 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {/* 期間 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 3 }}>推定日数</div>
          <input
            type="number" min={1} max={99}
            value={piece.estimated_days}
            onChange={e => onChange({ ...piece, estimated_days: Math.max(1, parseInt(e.target.value) || 1) })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        {/* 優先度 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 3 }}>優先度</div>
          <select
            value={piece.priority}
            onChange={e => onChange({ ...piece, priority: parseInt(e.target.value) })}
            style={{ ...inputStyle, width: '100%' }}
          >
            {[5, 4, 3, 2, 1].map(v => <option key={v} value={v}>{v}{v === 5 ? '（最高）' : v === 1 ? '（低）' : ''}</option>)}
          </select>
        </div>
      </div>

      {/* スキルタグ */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 4 }}>スキルタグ</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {piece.skill_tags.map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 7px', background: '#B4640022', color: '#B46400', borderRadius: 4, border: '1px solid #B4640044', display: 'flex', alignItems: 'center', gap: 3 }}>
              {t}
              <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#B46400', lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
            placeholder="スキルを追加..."
            style={{ ...inputStyle, flex: 1 }}
            list={`tag-opts-${piece._key}`}
          />
          <datalist id={`tag-opts-${piece._key}`}>
            {SKILL_OPTIONS.map(s => <option key={s} value={s} />)}
          </datalist>
          <button onClick={() => addTag(tagInput)} style={{ fontSize: 11, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-2)' }}>
            <Plus size={11} />
          </button>
        </div>
      </div>

      {/* 依存関係 */}
      {allPieces.length > 1 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitBranch size={10} />先行タスク（このタスクが始まるには完了が必要）
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {allPieces.map((p, i) => {
              if (i === index) return null;
              const active = piece.depends_on.includes(i);
              return (
                <button key={p._key} onClick={() => toggleDep(i)} style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  background: active ? '#6366F122' : 'transparent',
                  color: active ? '#6366F1' : 'var(--text-4)',
                  border: `1px solid ${active ? '#6366F1' : 'var(--border)'}`,
                }}>
                  {active ? '✓ ' : ''}{i + 1}. {p.title.slice(0, 10)}{p.title.length > 10 ? '…' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 依存グラフプレビュー ─────────────────────────────────────────────────────

function DepsPreview({ pieces }: { pieces: EditablePiece[] }) {
  if (pieces.length === 0) return null;
  // 各ピースの最大 EF を計算してクリティカルパスを推定
  const ef: number[] = Array(pieces.length).fill(0);
  for (let i = 0; i < pieces.length; i++) {
    const maxPredEF = pieces[i].depends_on.length > 0
      ? Math.max(...pieces[i].depends_on.map(d => ef[d] ?? 0))
      : 0;
    ef[i] = maxPredEF + (pieces[i].estimated_days ?? 1);
  }
  const totalDays = Math.max(...ef);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>依存グラフ（クリティカルパス推定）</span>
        <span style={{ color: '#B46400' }}>最短期間: <strong>{totalDays}日</strong></span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 'max-content' }}>
          {pieces.map((p, i) => (
            <React.Fragment key={p._key}>
              {i > 0 && <ArrowRight size={12} style={{ color: 'var(--text-4)', flexShrink: 0 }} />}
              <div style={{
                fontSize: 10, padding: '4px 8px', borderRadius: 5,
                background: ef[i] === totalDays ? '#E6001211' : 'var(--surface)',
                border: `1px solid ${ef[i] === totalDays ? '#E60012' : 'var(--border)'}`,
                color: ef[i] === totalDays ? '#E60012' : 'var(--text-2)',
                whiteSpace: 'nowrap',
              }}>
                {i + 1}. {p.title.slice(0, 12)}{p.title.length > 12 ? '…' : ''} <span style={{ opacity: .6 }}>{p.estimated_days}d</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── メイン ──────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2; // 0=入力, 1=編集, 2=完了

export default function ProjectWizardPage() {
  const navigate = useNavigate();

  const [step, setStep]                 = useState<Step>(0);
  const [projectName, setProjectName]   = useState('');
  const [description, setDescription]  = useState('');
  const [color, setColor]               = useState('#B46400');
  const [pieces, setPieces]             = useState<EditablePiece[]>([]);
  const [generating, setGenerating]     = useState(false);
  const [creating, setCreating]         = useState(false);
  const [source, setSource]             = useState<'ai' | 'template' | 'fallback'>('ai');
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [keyCounter, setKeyCounter]     = useState(100);

  const generate = useCallback(async () => {
    if (!projectName.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await aiApi.suggestProjectStructure(projectName, description);
      const withKeys = (result.pieces as SuggestedProjectPiece[]).map((p, i) => ({ ...p, index: i, _key: i }));
      setPieces(withKeys);
      setSource(result.source);
      setTemplateName(result.template_name ?? null);
      setKeyCounter(withKeys.length);
      setStep(1);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? '生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  }, [projectName, description]);

  const regenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await aiApi.suggestProjectStructure(projectName, description);
      const withKeys = (result.pieces as SuggestedProjectPiece[]).map((p, i) => ({ ...p, index: i, _key: i }));
      setPieces(withKeys);
      setSource(result.source);
      setTemplateName(result.template_name ?? null);
      setKeyCounter(withKeys.length);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? '再生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  }, [projectName, description]);

  function addPiece() {
    const newKey = keyCounter;
    setKeyCounter(k => k + 1);
    setPieces(prev => [...prev, {
      _key: newKey, index: prev.length,
      title: '新しいタスク', objective: '',
      skill_tags: [], estimated_days: 3, priority: 3, depends_on: [],
    }]);
  }

  function updatePiece(key: number, updated: EditablePiece) {
    setPieces(prev => prev.map(p => p._key === key ? updated : p));
  }

  function deletePiece(key: number) {
    setPieces(prev => {
      const removed = prev.findIndex(p => p._key === key);
      return prev
        .filter(p => p._key !== key)
        .map(p => ({
          ...p,
          depends_on: p.depends_on
            .filter(d => d !== removed)
            .map(d => d > removed ? d - 1 : d),
        }));
    });
  }

  async function handleCreate() {
    if (!projectName.trim() || pieces.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      // プロジェクト作成
      const proj = await projectsApi.create({ name: projectName.trim(), description, color });

      // ピース一括作成（順番保証のため直列）
      const createdIds: string[] = [];
      for (const p of pieces) {
        const created = await piecesApi.create({
          title:          p.title,
          objective:      p.objective,
          skill_tags:     p.skill_tags,
          estimated_days: p.estimated_days,
          priority:       p.priority,
          project_id:     proj.id,
          status:         'locked',
        });
        createdIds.push(created.id);
      }

      // 依存関係（接続）を作成
      for (let i = 0; i < pieces.length; i++) {
        for (const depIdx of pieces[i].depends_on) {
          if (createdIds[depIdx] && createdIds[i]) {
            await piecesApi.connect(createdIds[depIdx], {
              to_piece_id: createdIds[i],
              type: 'sequential',
            });
          }
        }
      }

      setStep(2);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }

  // ─── Step 0: 入力フォーム ──────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div style={{ padding: '40px 28px', maxWidth: 560 }}>
        <button onClick={() => navigate('/projects')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 20, padding: 0 }}>
          <ArrowLeft size={13} />プロジェクト一覧に戻る
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Sparkles size={20} style={{ color: '#B46400' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>AIプロジェクト生成</h1>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28 }}>
          プロジェクト名を入力するだけで、タスク構成・期間・依存関係をAIが自動提案します。<br />
          自社の過去実績データを参考にした現実的な見積もりを生成します。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* プロジェクト名 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              プロジェクト名 <span style={{ color: '#E60012' }}>*</span>
            </label>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && projectName.trim()) generate(); }}
              placeholder="例: ECサイトリニューアル、Q3マーケティング施策..."
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 600,
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                borderRadius: 8, color: 'var(--text-1)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 概要 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              概要（任意）
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="プロジェクトの目的・スコープを簡単に記述すると精度が上がります"
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', fontSize: 12,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-1)', outline: 'none',
                resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
          </div>

          {/* カラー */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              プロジェクトカラー
            </label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '8px 12px', background: '#E6001211', border: '1px solid #E6001244', borderRadius: 6, fontSize: 12, color: '#E60012' }}>
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={!projectName.trim() || generating}
          style={{
            marginTop: 20, width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 700,
            background: projectName.trim() && !generating ? '#B46400' : 'var(--border)',
            color: projectName.trim() && !generating ? '#fff' : 'var(--text-4)',
            border: 'none', borderRadius: 8, cursor: projectName.trim() && !generating ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background .15s',
          }}
        >
          {generating
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />AIが構成を考えています…</>
            : <><Sparkles size={16} />AIでタスク構成を生成する<ChevronRight size={16} /></>
          }
        </button>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-4)', textAlign: 'center' }}>
          自社の過去実績（velocity_log）をもとに、現実的な期間を提案します
        </div>
      </div>
    );
  }

  // ─── Step 1: 編集 ─────────────────────────────────────────────────────────

  if (step === 1) {
    const totalDays = pieces.reduce((max, p) => {
      // 簡易的に: 直列の合計
      return max + (p.estimated_days ?? 1);
    }, 0);
    return (
      <div style={{ padding: '24px 28px', maxWidth: 700 }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{projectName}</h2>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>
              {source === 'ai'       ? '✨ AI生成' :
               source === 'template' ? `📋 テンプレート参考（${templateName}）` :
                                       '📝 汎用フォールバック'}
               ・{pieces.length}件のタスク・合計約{totalDays}日
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={generating}
            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {generating ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
            再生成
          </button>
        </div>

        {/* 依存グラフ */}
        <DepsPreview pieces={pieces} />

        {/* ピース一覧 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
          {pieces.map((p, i) => (
            <PieceEditor
              key={p._key}
              piece={p}
              index={i}
              allPieces={pieces}
              onChange={updated => updatePiece(p._key, updated)}
              onDelete={() => deletePiece(p._key)}
            />
          ))}
        </div>

        {/* タスク追加 */}
        <button onClick={addPiece} style={{
          width: '100%', padding: '8px 0', fontSize: 12, color: 'var(--text-3)',
          background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginBottom: 16,
        }}>
          <Plus size={13} />タスクを追加
        </button>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#E6001211', border: '1px solid #E6001244', borderRadius: 6, fontSize: 12, color: '#E60012' }}>
            {error}
          </div>
        )}

        {/* アクション */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep(0)} style={{ fontSize: 12, padding: '10px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={13} />戻る
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || pieces.length === 0 || !projectName.trim()}
            style={{
              flex: 1, fontSize: 14, fontWeight: 700, padding: '10px 0',
              background: creating || pieces.length === 0 ? 'var(--border)' : '#B46400',
              color: creating || pieces.length === 0 ? 'var(--text-4)' : '#fff',
              border: 'none', borderRadius: 8, cursor: creating || pieces.length === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {creating
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />プロジェクトを作成中…</>
              : <><Check size={16} />このプロジェクトを作成する（{pieces.length}件のタスク）</>
            }
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 2: 完了 ─────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '60px 28px', maxWidth: 500, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#22c55e22', border: '3px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Check size={28} style={{ color: '#22c55e' }} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>プロジェクトを作成しました！</h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.6 }}>
        「{projectName}」に {pieces.length}件のタスクと依存関係を設定しました。<br />
        ボードやガントで確認できます。
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => navigate('/board')} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, background: '#B46400', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          ボードで確認 →
        </button>
        <button onClick={() => navigate('/projects')} style={{ padding: '10px 20px', fontSize: 13, background: 'none', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          プロジェクト一覧
        </button>
      </div>
    </div>
  );
}
