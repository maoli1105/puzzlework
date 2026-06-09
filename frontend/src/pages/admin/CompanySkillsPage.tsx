/**
 * CompanySkillsPage — 企業スキルツリー
 * ─────────────────────────────────────────────────────────────
 * 会社全体のスキル強度を可視化。
 * どのスキルに強みがあり、どこにギャップがあるかを把握する。
 */

import { useEffect, useState } from 'react';
import { users as userApi } from '../../services/api';
import { TrendingUp, Users } from 'lucide-react';

const SKILL_META: Record<string, { label: string; abbr: string }> = {
  marketing:            { label: 'マーケティング', abbr: 'MK' },
  ec:                   { label: 'EC・販売',       abbr: 'EC' },
  sns:                  { label: 'SNS運用',        abbr: 'SN' },
  creative:             { label: 'クリエイティブ', abbr: 'CR' },
  sales:                { label: '営業・BizDev',   abbr: 'SA' },
  design:               { label: 'デザイン',       abbr: 'DS' },
  engineering:          { label: 'エンジニアリング', abbr: 'EN' },
  data:                 { label: 'データ分析',     abbr: 'DA' },
  ops:                  { label: 'オペレーション', abbr: 'OP' },
  hr:                   { label: '人事',           abbr: 'HR' },
  legal:                { label: '法務',           abbr: 'LG' },
  finance:              { label: '財務',           abbr: 'FN' },
  product_registration: { label: '商品登録',       abbr: 'PR' },
  inventory_management: { label: '在庫管理',       abbr: 'IV' },
  customer_support:     { label: 'CS対応',         abbr: 'CS' },
  photography:          { label: '撮影',           abbr: 'PH' },
  mgmt:                 { label: 'マネジメント',   abbr: 'MG' },
  it:                   { label: 'IT・開発',       abbr: 'IT' },
};

// const LEVEL_NAMES = ['入門', 'Starter', 'Practitioner', 'Specialist', 'Expert', 'Master'];
const LEVEL_THRESHOLDS = [5, 20, 50, 100, 200];

interface SkillEntry {
  tag:          string;
  total_done:   number;
  total_impact: number;
  level:        number;
  workers:      { id: string; name: string; count: number }[];
}

function levelLabel(total: number): number {
  const idx = LEVEL_THRESHOLDS.findIndex(t => total < t);
  return idx === -1 ? 5 : idx;
}

export default function CompanySkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [summary, setSummary] = useState({ worker_count: 0, total_done: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    userApi.companySkills()
      .then(d => {
        setSkills(d.skills as SkillEntry[]);
        setSummary({ worker_count: d.worker_count, total_done: d.total_done });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxDone = Math.max(...skills.map(s => s.total_done), 1);
  void skills.find(s => s.tag === selected); // selectedSkill reserved for detail panel

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ヘッダー */}
      <div style={{
        height: 48, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <TrendingUp size={14} style={{ color: '#B46400' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
          企業スキルツリー
        </span>
        {!loading && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              <strong style={{ color: 'var(--text-1)' }}>{summary.worker_count}</strong> 名が
              <strong style={{ color: 'var(--text-1)', marginLeft: 4 }}>{summary.total_done}</strong> 件完了
            </span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 0 }}>

        {/* スキル一覧 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 11 }}>読み込み中…</div>
          ) : skills.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 240, gap: 12,
            }}>
              <TrendingUp size={32} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                まだスキルデータがありません
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                ワーカーがピースを完了するとスキルが蓄積されます
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 6 }}>

              {/* サマリカード */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
              }}>
                {[
                  { label: 'スキル種類', value: skills.length, sub: '習得済み' },
                  { label: 'Lv.4以上',   value: skills.filter(s => s.level >= 4).length, sub: '高熟練スキル' },
                  { label: 'SPOF',       value: skills.filter(s => s.workers.length === 1).length, sub: '1人依存スキル' },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)', padding: '12px 14px',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* スキルバー一覧 */}
              {skills.map(skill => {
                const meta = SKILL_META[skill.tag];
                const label = meta?.label ?? skill.tag;
                const abbr  = meta?.abbr ?? skill.tag.slice(0, 2).toUpperCase();
                const pct   = Math.round((skill.total_done / maxDone) * 100);
                const lvl   = levelLabel(skill.total_done);
                const isSelected = selected === skill.tag;

                return (
                  <div
                    key={skill.tag}
                    onClick={() => setSelected(isSelected ? null : skill.tag)}
                    style={{
                      background: isSelected ? 'rgba(180,100,0,0.04)' : 'var(--surface)',
                      border: `1px solid ${isSelected ? 'rgba(180,100,0,0.25)' : 'var(--border)'}`,
                      borderRadius: 'var(--r-lg)', padding: '10px 14px',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >
                    {/* 行ヘッダー */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      {/* スキルアバター */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 'var(--r-sm)',
                        background: 'var(--surface-sub)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0,
                      }}>
                        {abbr}
                      </div>

                      {/* スキル名 + レベル */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-3)' }}>
                          {skill.total_done}件完了
                          {skill.total_impact > 0 && (
                            <span style={{ marginLeft: 6, color: '#B46400', fontWeight: 600 }}>
                              ¥{skill.total_impact.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* レベルバッジ */}
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                        padding: '2px 8px', borderRadius: 4,
                        background: lvl >= 4 ? 'rgba(180,100,0,0.10)' : 'var(--surface-sub)',
                        color: lvl >= 4 ? '#B46400' : 'var(--text-3)',
                        border: `1px solid ${lvl >= 4 ? 'rgba(180,100,0,0.25)' : 'var(--border)'}`,
                        flexShrink: 0,
                      }}>
                        Lv.{lvl}
                      </div>

                      {/* 担当者数 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-3)', flexShrink: 0 }}>
                        <Users size={10} />
                        <span style={{ fontSize: 9 }}>{skill.workers.length}</span>
                      </div>
                    </div>

                    {/* プログレスバー */}
                    <div style={{ height: 4, background: 'var(--surface-sub)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: lvl >= 4 ? '#B46400' : 'var(--text-3)',
                        borderRadius: 2, transition: 'width 0.5s ease',
                      }} />
                    </div>

                    {/* 展開: 担当者詳細 */}
                    {isSelected && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-sub)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
                          担当ワーカー
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {skill.workers.map(w => (
                            <div key={w.id} style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '4px 10px', background: 'var(--surface-sub)',
                              border: '1px solid var(--border)', borderRadius: 4,
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)' }}>{w.name}</span>
                              <span style={{ fontSize: 9, color: '#B46400', fontWeight: 700 }}>{w.count}件</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右サイドパネル: SPOF（1人依存スキル） */}
        <div style={{
          width: 220, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--surface)', padding: '20px 16px',
          overflow: 'auto',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', marginBottom: 4 }}>
            SPOF スキル
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.6 }}>
            担当が1人のみのスキル。<br />その人が抜けるとスキルが消える。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {skills.filter(s => s.workers.length === 1).length === 0 ? (
              <div style={{ fontSize: 10, color: '#B46400', fontWeight: 600, textAlign: 'center', padding: '12px 0' }}>
                SPOFなし ✓
              </div>
            ) : (
              skills
                .filter(s => s.workers.length === 1)
                .map(s => (
                  <div key={s.tag} style={{
                    padding: '7px 10px',
                    background: 'rgba(230,0,18,0.04)',
                    border: '1px solid rgba(230,0,18,0.15)',
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>
                      {s.tag}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)' }}>
                      {s.workers[0].name} のみ · {s.total_done}件
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* 上位スキル保持者 */}
          {skills.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', margin: '20px 0 8px' }}>
                トップ貢献者
              </div>
              {(() => {
                const counter: Record<string, { name: string; total: number }> = {};
                skills.forEach(s => s.workers.forEach(w => {
                  if (!counter[w.id]) counter[w.id] = { name: w.name, total: 0 };
                  counter[w.id].total += w.count;
                }));
                return Object.values(counter)
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 5)
                  .map((w, i) => (
                    <div key={w.name} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', width: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.name}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#B46400' }}>{w.total}件</span>
                    </div>
                  ));
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
