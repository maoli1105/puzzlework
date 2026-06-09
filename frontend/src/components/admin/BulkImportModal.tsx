import React, { useRef, useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { pieces as pieceApi } from '../../services/api';

interface ParsedRow {
  title: string;
  objective: string;
  skill_tags: string[];
  due_date: string;
  priority: number;
  _error?: string;
}

interface Props {
  onClose: () => void;
  onImported: (count: number) => void;
}

const TEMPLATE_CSV = `title,objective,skill_tags,due_date,priority
ランディングページ作成,新規顧客獲得のためのLP制作,design;frontend,2026-05-30,2
APIドキュメント整備,開発者向けドキュメントの充実,backend;writing,2026-06-15,1
パフォーマンス改善,ページ読み込み速度を50%短縮,frontend;performance,2026-05-20,3
`;

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (key: string) => header.indexOf(key);

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const get = (key: string) => cols[idx(key)] ?? '';
    const title = get('title');
    const skillRaw = get('skill_tags');
    const skill_tags = skillRaw ? skillRaw.split(/[;|]/).map(s => s.trim()).filter(Boolean) : [];
    const priorityRaw = parseInt(get('priority') || '0');
    const row: ParsedRow = {
      title,
      objective: get('objective'),
      skill_tags,
      due_date: get('due_date'),
      priority: isNaN(priorityRaw) ? 0 : priorityRaw,
    };
    if (!title) row._error = 'titleは必須です';
    return row;
  }).filter(r => r.title || r._error);
}

export default function BulkImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    const valid = rows.filter(r => !r._error);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await pieceApi.bulkCreate(valid.map(r => ({
        title: r.title,
        objective: r.objective || undefined,
        skill_tags: r.skill_tags,
        due_date: r.due_date || undefined,
        priority: r.priority,
      })));
      setResult(res);
      setStep('done');
      onImported(res.created);
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pieces_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const validCount = rows.filter(r => !r._error).length;
  const errorCount = rows.filter(r => r._error).length;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        width: 640,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>CSVからピースを一括作成</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>title, objective, skill_tags, due_date, priority の列に対応</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {step === 'upload' && (
            <div>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--text-1)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? 'var(--surface-sub)' : 'transparent',
                  transition: 'all 0.15s',
                  marginBottom: 16,
                }}
              >
                <Upload size={24} style={{ color: 'var(--text-3)', marginBottom: 12 }} />
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 4 }}>CSVファイルをドロップ</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>またはクリックして選択</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>

              <button
                onClick={downloadTemplate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px',
                  background: 'var(--surface-sub)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <Download size={12} />
                テンプレートをダウンロード
              </button>

              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface-sub)', borderRadius: 'var(--r-md)', fontSize: 11, color: 'var(--text-3)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>CSVフォーマット</div>
                <code style={{ fontFamily: 'monospace', fontSize: 10 }}>title,objective,skill_tags,due_date,priority</code>
                <div style={{ marginTop: 4 }}>skill_tags は <code>;</code> 区切りで複数指定可。due_date は <code>YYYY-MM-DD</code> 形式。</div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4A9B6F' }}>
                  <CheckCircle size={13} />
                  <span>{validCount}件インポート可能</span>
                </div>
                {errorCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#DC2626' }}>
                    <AlertCircle size={13} />
                    <span>{errorCount}件エラー（スキップされます）</span>
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 60px', background: 'var(--surface-sub)', borderBottom: '1px solid var(--border)' }}>
                  {['タイトル', '目標', 'スキル', '期日', '優先'].map(h => (
                    <div key={h} style={{ padding: '7px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</div>
                  ))}
                </div>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 60px',
                      borderBottom: i < rows.length - 1 ? '1px solid var(--border-sub)' : 'none',
                      background: r._error ? '#FEF2F2' : 'transparent',
                    }}>
                      <div style={{ padding: '8px 10px', fontSize: 11, color: r._error ? '#DC2626' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r._error ? `⚠ ${r._error}` : r.title}
                      </div>
                      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.objective || '—'}</div>
                      <div style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-2)' }}>{r.skill_tags.join(', ') || '—'}</div>
                      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>{r.due_date || '—'}</div>
                      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{r.priority}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div style={{ textAlign: 'center', paddingTop: 32 }}>
              <CheckCircle size={40} style={{ color: '#4A9B6F', marginBottom: 16 }} />
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
                {result.created}件のピースを作成しました
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>ボードに反映されました</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('upload'); setRows([]); }}
                style={{ padding: '7px 14px', background: 'var(--surface-sub)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
              >
                戻る
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                style={{
                  padding: '7px 18px',
                  background: validCount > 0 ? 'var(--text-1)' : 'var(--border)',
                  color: validCount > 0 ? '#FAFAF8' : 'var(--text-3)',
                  border: 'none', borderRadius: 'var(--r-sm)',
                  fontSize: 12, fontWeight: 500, cursor: validCount > 0 ? 'pointer' : 'default',
                }}
              >
                {importing ? 'インポート中...' : `${validCount}件をインポート`}
              </button>
            </>
          )}
          {(step === 'upload' || step === 'done') && (
            <button
              onClick={onClose}
              style={{ padding: '7px 18px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {step === 'done' ? '閉じる' : 'キャンセル'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
