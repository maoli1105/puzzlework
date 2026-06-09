/**
 * OverviewPage — 工房
 * ──────────────────────────────────
 * 毎朝開いて「今日の状態」が分かる場所。
 * 数値（Stats strip）＋ 要注意リスト（Attention panel）＋ 生態系の球（Ecosystem orbs）
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { projects as projectApi, pieces as piecesApi, auth as authApi } from '../../services/api';
import { ProjectOrb, OrbProject } from '../../components/board/ProjectOrb';
import { RefreshCw, LayoutGrid, Wrench, ChevronDown, ChevronUp, ArrowRight, AlertTriangle, Users, ShieldAlert, X, Copy, Check } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WSEvent } from '../../types';
import { useAuthStore } from '../../store/authStore';

// ─── Types ───────────────────────────────────────────────────────────────────
export type DemoType = 'saas' | 'web' | 'ec' | 'manufacturing' | 'small';

interface WorkspaceProfile {
  type:     DemoType;
  name:     string;
  industry: string;
  spatial:  string;
  state:    string;
  warmth:   number;
}

interface AtRiskPiece {
  id:               string;
  title:            string;
  status:           string;
  due_date:         string | null;
  business_impact:  number;
  assignee_name:    string | null;
  risk_type:        'overdue' | 'stale' | 'unassigned';
}

interface SpofUser {
  id:                    string;
  name:                  string;
  critical_piece_count:  number;
  total_business_impact: number;
}

interface BlockerPiece {
  id:            string;
  title:         string;
  blocker_reason: string;
  reporter_name: string | null;
}

interface OrgHealthData {
  score:                         number;
  at_risk_pieces:                AtRiskPiece[];
  spof_users:                    SpofUser[];
  blocker_pieces:                BlockerPiece[];
  total_business_impact_at_risk: number;
  pieces_on_time_pct:            number;
  overloaded_count:              number;
  stale_count:                   number;
  in_progress_count:             number;
  done_this_week:                number;
}

interface ApiProjectRow {
  id:                  string;
  name:                string;
  status:              string;
  total_pieces:        number;
  done_pieces:         number;
  in_progress_pieces:  number;
  overdue_pieces:      number;
  avg_progress:        number;
  next_due?:           string | null;
  total_impact?:       number;
  members?:            { name: string; pieces_done: number }[];
}

// ─── Demo workspace definitions ──────────────────────────────────────────────
const WORKSPACES: WorkspaceProfile[] = [
  { type: 'saas',          name: 'SaaS開発会社',    industry: 'ソフトウェア開発',   spatial: 'スプリントが交差する密な工房。複数の部屋が同時に動いています。',         state: '機能開発とバグ修正が並行し、インフラの部屋が静かに滞留しています。',        warmth: 0.75 },
  { type: 'web',           name: 'Web制作会社',     industry: 'Webデザイン・制作',  spatial: '案件ごとに独立した部屋。納期が近い部屋ほど温度が高くなっています。',       state: '4件の案件が並行しています。1件の部屋は納期を過ぎています。',                warmth: 0.55 },
  { type: 'ec',            name: 'EC運営会社',      industry: 'EC・通販運営',       spatial: '季節によって中心が変わる工房。セールが始まると全員が同じ方向を向きます。',   state: '夏季セールに向けて5本の流れが同時に走っています。',                        warmth: 0.85 },
  { type: 'manufacturing', name: '製造業',          industry: 'ものづくり・製造',   spatial: '設計→製造→品質が直線的に連なる工房。工程の重さが空間に出ます。',         state: '試作品が動き始め、設備更新の部屋でひとつの流れが止まっています。',          warmth: 0.45 },
  { type: 'small',         name: '小規模チーム（5人）', industry: '少人数スタジオ', spatial: '全員がすべての部屋に関わる工房。部屋の境界が曖昧に見えます。',             state: '主力案件が全員を引き寄せ、後回しの部屋がぼんやり待っています。',            warmth: 0.60 },
];

// ─── CSS keyframes ───────────────────────────────────────────────────────────
const ECOSYSTEM_CSS = `
  @keyframes orb-breathe {
    0%, 100% { opacity: 0.55; }
    50%       { opacity: 0.90; }
  }
  @keyframes spof-pulse {
    0%, 100% { r: 3.5px; opacity: 0.9; }
    50%       { r: 6px;   opacity: 1;   }
  }
  @keyframes stuck-flicker {
    0%, 90%, 100% { opacity: 0.15; }
    92%, 98%       { opacity: 0.45; }
  }
  @keyframes orb-popup-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes ecosystem-entry {
    from { opacity: 0; transform: scale(0.85); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes attention-slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toOrbProject(p: ApiProjectRow): OrbProject {
  return {
    id:             p.id,
    name:           p.name,
    total_pieces:   p.total_pieces ?? 0,
    done_pieces:    p.done_pieces ?? 0,
    in_progress:    p.in_progress_pieces ?? 0,
    overdue_pieces: p.overdue_pieces ?? 0,
    members:        p.members,
    next_due:       p.next_due,
  };
}

function seededOffset(id: string, scale: number): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h * 31 + id.charCodeAt(i), 1);
  const x = (((h & 0xFF) / 255) - 0.5) * scale * 2;
  const y = ((((h >>> 8) & 0xFF) / 255) - 0.5) * scale * 2;
  return { x, y };
}

function riskLabel(p: AtRiskPiece): string {
  if (p.risk_type === 'overdue' && p.due_date) {
    const days = Math.round((Date.now() - new Date(p.due_date).getTime()) / 86400000);
    return `${days}日遅延`;
  }
  if (p.risk_type === 'stale') return '停滞中';
  return '未割当';
}

function riskColor(type: AtRiskPiece['risk_type']): string {
  if (type === 'overdue')    return '#F87171';
  if (type === 'stale')      return '#FBBF24';
  return '#94A3B8';
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [report,   setReport]   = useState<{ projects: ApiProjectRow[] } | null>(null);
  const [health,   setHealth]   = useState<OrgHealthData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [viewMode, setViewMode] = useState<'ecosystem' | 'grid'>('ecosystem');
  const [demoOpen,      setDemoOpen]      = useState(false);
  const [currentDemo,   setCurrentDemo]   = useState<DemoType | null>(null);
  const [switchingDemo, setSwitchingDemo] = useState<DemoType | null>(null);

  // 初回ガイドバナー（localStorageで管理、1回だけ表示）
  const guideKey = `pw_guide_dismissed_${user?.company_id ?? ''}`;
  const [guideDismissed, setGuideDismissed] = useState(() => localStorage.getItem(guideKey) === '1');
  const [inviteLink,  setInviteLink]  = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  function dismissGuide() {
    localStorage.setItem(guideKey, '1');
    setGuideDismissed(true);
  }

  async function generateInvite() {
    if (inviteLoading) return;
    setInviteLoading(true);
    try {
      const { token } = await authApi.invite('worker');
      setInviteLink(`${window.location.origin}/join/${token}`);
    } catch { /* ignore */ }
    finally { setInviteLoading(false); }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportData, healthData] = await Promise.all([
        projectApi.report(),
        piecesApi.getOrgHealth().catch(() => null),
      ]);
      setReport(reportData);
      setHealth(healthData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ワーカーのステータス変更をリアルタイム反映
  useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_status_changed' || event.type === 'piece_done' || event.type === 'auto_promoted') {
      load();
    }
  }, [load]));

  useEffect(() => {
    axios.get('/api/demo/current')
      .then(r => setCurrentDemo(r.data.type ?? null))
      .catch(() => {});
  }, []);

  async function handleDemoSwitch(type: DemoType) {
    if (switchingDemo) return;
    setSwitchingDemo(type);
    try {
      await axios.post('/api/demo/switch', { type });
      setCurrentDemo(type);
      setDemoOpen(false);
      await load();
    } catch { /* ignore */ }
    finally { setSwitchingDemo(null); }
  }

  const allProjects = report?.projects ?? [];
  const active      = allProjects.filter(p => p.status !== 'completed');
  const completed   = allProjects.filter(p => p.status === 'completed');
  const orbProjects = active.map(toOrbProject);


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <style>{ECOSYSTEM_CSS}</style>

      {/* ── Header ── */}
      <div className="page-toolbar" style={{
        height: 52, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', flexShrink: 0, gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>工房</span>
          {!loading && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>
              {active.length}件 進行中
            </span>
          )}
        </div>
        <button
          onClick={() => setDemoOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: demoOpen ? 'rgba(194,154,108,0.08)' : 'transparent', border: `1px solid ${demoOpen ? 'rgba(194,154,108,0.30)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', fontSize: 10, color: demoOpen ? 'rgba(194,154,108,1)' : 'var(--text-3)', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          工房を見学する
        </button>
        <button
          onClick={() => setViewMode(v => v === 'ecosystem' ? 'grid' : 'ecosystem')}
          title={viewMode === 'ecosystem' ? 'グリッドビュー' : '工房ビュー'}
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-3)' }}
        >
          <LayoutGrid size={12} />
        </button>
        <button
          onClick={load}
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-3)' }}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* ── 初回ガイドバナー ── */}
      {!guideDismissed && !loading && (
        <div style={{
          flexShrink: 0, background: 'var(--accent-sub)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 20px', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
              PuzzleWork へようこそ — まずこの3つを済ませましょう
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Step 1 */}
              <button onClick={() => navigate('/board')} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-1)',
              }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                プロジェクトを作成
              </button>
              {/* Step 2 */}
              <button onClick={() => navigate('/settings?tab=members')} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-1)',
              }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                メンバーを招待
              </button>
              {/* Step 3 - 招待リンクをインラインで発行 */}
              {!inviteLink ? (
                <button onClick={generateInvite} disabled={inviteLoading} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', fontSize: 11, fontWeight: 600,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', cursor: inviteLoading ? 'not-allowed' : 'pointer',
                  color: 'var(--text-1)', opacity: inviteLoading ? 0.6 : 1,
                }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                  {inviteLoading ? '生成中…' : '招待リンクを発行'}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteLink}</span>
                  <button onClick={copyInvite} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600, background: inviteCopied ? 'var(--accent)' : 'var(--surface-sub)', color: inviteCopied ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', cursor: 'pointer' }}>
                    {inviteCopied ? <><Check size={10} /> コピー済み</> : <><Copy size={10} /> コピー</>}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button onClick={dismissGuide} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, flexShrink: 0 }} title="閉じる">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Stats strip ── */}
      {!loading && health && (
        <StatsStrip health={health} onRepairClick={() => navigate('/repair')} />
      )}

      {/* ── Focus bar ── */}
      {!loading && health && (health.at_risk_pieces.length > 0 || (health.blocker_pieces ?? []).length > 0) && (
        <FocusBar
          atRisk={health.at_risk_pieces}
          blockers={health.blocker_pieces ?? []}
          onItemClick={(id) => navigate(`/board?piece=${id}`)}
          onRepairClick={() => navigate('/repair')}
        />
      )}

      {/* ── Demo Selector Overlay ── */}
      {demoOpen && (
        <DemoSelector
          workspaces={WORKSPACES}
          currentDemo={currentDemo}
          switchingDemo={switchingDemo}
          onSelect={handleDemoSwitch}
          onClose={() => setDemoOpen(false)}
        />
      )}

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflow: 'auto',
        background: active.length === 0 ? 'var(--bg)' : viewMode === 'ecosystem' ? '#0c0c10' : 'var(--bg)',
        transition: 'background 0.8s ease',
        position: 'relative',
      }}>
        {loading ? (
          <EcosystemSkeleton />
        ) : active.length === 0 ? (
          <EmptyState onAction={() => navigate('/board')} />
        ) : viewMode === 'ecosystem' ? (
          <EcosystemCanvas
            projects={orbProjects}
            onOrbClick={(id) => navigate(id ? `/board?project=${id}` : '/board')}
            completed={completed}
            atRisk={health?.at_risk_pieces ?? []}
            spofUsers={health?.spof_users ?? []}
          />
        ) : (
          <GridFallback
            projects={orbProjects}
            onOrbClick={(id) => navigate(id ? `/board?project=${id}` : '/board')}
          />
        )}
      </div>
    </div>
  );
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────
function StatsStrip({ health, onRepairClick }: { health: OrgHealthData; onRepairClick: () => void }) {
  const atRiskCount   = health.at_risk_pieces.length;
  const urgentCount   = health.at_risk_pieces.filter(p => p.risk_type === 'overdue').length;
  const blockerCount  = (health.blocker_pieces ?? []).length;

  const stats = [
    {
      label: '進行中',
      value: health.in_progress_count,
      color: 'var(--text-1)',
      bg: 'transparent',
      note: null as string | null,
      Icon: null as React.ElementType | null,
    },
    {
      label: '期限切れ',
      value: urgentCount,
      color: urgentCount > 0 ? '#E60012' : 'var(--text-2)',
      bg: 'transparent',
      note: urgentCount > 0 ? '要対応' : null,
      Icon: null,
    },
    {
      label: '停滞',
      value: health.stale_count,
      color: health.stale_count > 0 ? '#B46400' : 'var(--text-2)',
      bg: 'transparent',
      note: null,
      Icon: null,
    },
    {
      label: '過負荷',
      value: health.overloaded_count,
      color: health.overloaded_count > 0 ? '#B46400' : 'var(--text-2)',
      bg: 'transparent',
      note: null,
      Icon: health.overloaded_count > 0 ? Users as React.ElementType : null,
    },
    {
      label: '今週完了',
      value: health.done_this_week,
      color: 'var(--text-1)',
      bg: 'transparent',
      note: null,
      Icon: null,
    },
    {
      label: 'オンタイム率',
      value: `${health.pieces_on_time_pct}%`,
      color: health.pieces_on_time_pct >= 80 ? 'var(--text-1)' : health.pieces_on_time_pct >= 60 ? '#B46400' : '#E60012',
      bg: 'transparent',
      note: null,
      Icon: null,
    },
  ];

  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            flex: '1 0 auto',
            minWidth: 90,
            padding: '9px 16px',
            borderRight: i < stats.length - 1 ? '1px solid var(--border-sub)' : 'none',
            background: s.bg,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.03em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            {s.Icon && <s.Icon size={9} style={{ color: s.color }} />}
            {s.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {s.value}
            </span>
            {s.note && (
              <span style={{ fontSize: 9, color: s.color, fontWeight: 700, padding: '1px 5px', border: `1px solid ${s.color}50`, borderRadius: 3 }}>
                {s.note}
              </span>
            )}
          </div>
        </div>
      ))}
      {/* ブロッカー導線 */}
      {blockerCount > 0 && (
        <button
          onClick={onRepairClick}
          style={{ flexShrink: 0, padding: '9px 16px', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border-sub)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(180,100,0,0.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.02em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={9} /> ブロッカー
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#B46400', lineHeight: 1, letterSpacing: '-0.03em' }}>{blockerCount}</span>
            <ArrowRight size={12} style={{ color: 'var(--text-3)', marginTop: 2 }} />
          </div>
        </button>
      )}
      {/* 修復への導線（要注意がある時だけ） */}
      {atRiskCount > 0 && (
        <button
          onClick={onRepairClick}
          style={{
            flexShrink: 0,
            padding: '9px 16px',
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid var(--border-sub)',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(230,0,18,0.04)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.02em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={9} /> 要注意
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#E60012', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {atRiskCount}
            </span>
            <ArrowRight size={12} style={{ color: 'var(--text-3)', marginTop: 2 }} />
          </div>
        </button>
      )}
    </div>
  );
}

// ─── EcosystemCanvas ─────────────────────────────────────────────────────────
function EcosystemCanvas({
  projects, onOrbClick, completed, atRisk, spofUsers,
}: {
  projects:   OrbProject[];
  onOrbClick: (id: string) => void;
  completed:  ApiProjectRow[];
  atRisk:     AtRiskPiece[];
  spofUsers:  SpofUser[];
}) {
  const hasRight = atRisk.length > 0 || spofUsers.length > 0;
  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'flex-start' }}>

      {/* ── 左: Orb エリア ── */}
      <div style={{ flex: 1, minWidth: 0, padding: '64px 48px 100px', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '80px 64px', justifyContent: 'center', alignItems: 'center' }}>
          {projects.map((p, i) => {
            const offset = seededOffset(p.id, 22);
            return (
              <div
                key={p.id}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                  animation: `ecosystem-entry 400ms ease-out ${i * 60}ms both`,
                  overflow: 'visible',
                }}
              >
                <ProjectOrb project={p} onClick={() => onOrbClick(p.id)} />
              </div>
            );
          })}
        </div>

        {/* 完了プロジェクト */}
        {completed.length > 0 && (
          <div style={{ marginTop: 48, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 14 }}>
              完了 ({completed.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {completed.map(p => (
                <div key={p.id}
                  style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', padding: '3px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, letterSpacing: '0.02em', cursor: 'pointer', transition: 'color 0.2s' }}
                  onMouseEnter={e => ((e.target as HTMLDivElement).style.color = 'rgba(255,255,255,0.5)')}
                  onMouseLeave={e => ((e.target as HTMLDivElement).style.color = 'rgba(255,255,255,0.22)')}
                >
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 右: 要注意パネル ── */}
      {hasRight && (
        <div style={{
          width: 256, flexShrink: 0,
          padding: '16px 12px 16px 0',
          position: 'sticky', top: 0,
          maxHeight: '100vh', overflowY: 'auto',
        }}>
          <AttentionPanel items={atRisk} spofUsers={spofUsers} />
        </div>
      )}

      {/* 凡例（右下固定） */}
      <Legend />
    </div>
  );
}

// ─── Attention Panel ─────────────────────────────────────────────────────────
function AttentionPanel({ items, spofUsers }: { items: AtRiskPiece[]; spofUsers: SpofUser[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const urgentCount = items.filter(p => p.risk_type === 'overdue').length;

  return (
    <div style={{
      width: '100%',
      animation: 'attention-slide-in 300ms ease-out both',
    }}>
      {/* ヘッダー */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.65)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={11} style={{ color: '#E60012' }} />
          <span>要注意 <span style={{ color: '#E60012' }}>{items.length}件</span>{urgentCount > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · 期限切れ {urgentCount}</span>}</span>
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div style={{
          background: 'rgba(12,12,16,0.90)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          overflow: 'hidden',
        }}>
          {items.slice(0, 8).map((item, i) => (
            <div
              key={item.id}
              onClick={() => navigate(`/board?piece=${item.id}`)}
              style={{
                padding: '8px 12px',
                borderBottom: i < Math.min(items.length, 8) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                display: 'flex', flexDirection: 'column', gap: 3,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              {/* タイトル行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: riskColor(item.risk_type),
                  boxShadow: `0 0 4px ${riskColor(item.risk_type)}`,
                }} />
                <span style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {item.title}
                </span>
              </div>
              {/* サブ行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                  color: riskColor(item.risk_type),
                  background: `${riskColor(item.risk_type)}18`,
                  padding: '1px 5px', borderRadius: 3,
                }}>
                  {riskLabel(item)}
                </span>
                {item.assignee_name && (
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                    {item.assignee_name}
                  </span>
                )}
              </div>
            </div>
          ))}

          {items.length > 8 && (
            <div style={{ padding: '7px 12px', fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
              他 {items.length - 8} 件
            </div>
          )}

          {/* SPOF警告 */}
          {spofUsers.length > 0 && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                過負荷メンバー
              </div>
              {spofUsers.slice(0, 3).map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'rgba(255,255,255,0.7)', fontWeight: 700, flexShrink: 0 }}>
                    {u.name[0]}
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{u.name}</span>
                  <span style={{ fontSize: 9, color: '#B46400', marginLeft: 'auto' }}>{u.critical_piece_count}件</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Focus Bar ───────────────────────────────────────────────────────────────
const RISK_COLOR: Record<AtRiskPiece['risk_type'], string> = {
  overdue:    '#F87171',
  stale:      '#FBBF24',
  unassigned: '#94A3B8',
};

function FocusBar({ atRisk, blockers, onItemClick, onRepairClick }: {
  atRisk:        AtRiskPiece[];
  blockers:      BlockerPiece[];
  onItemClick:   (id: string) => void;
  onRepairClick: () => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = atRisk
    .filter(p => !dismissed.has(p.id))
    .sort((a, b) => {
      const order: Record<AtRiskPiece['risk_type'], number> = { overdue: 0, stale: 1, unassigned: 2 };
      return order[a.risk_type] - order[b.risk_type];
    })
    .slice(0, 7);

  const blockerVisible = blockers.filter(b => !dismissed.has(b.id)).slice(0, 3);

  if (visible.length === 0 && blockerVisible.length === 0) return null;

  return (
    <div style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '6px 20px',
      display: 'flex', alignItems: 'center', gap: 6,
      flexShrink: 0, overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', whiteSpace: 'nowrap', flexShrink: 0 }}>
        フォーカス
      </span>
      <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

      {/* ブロッカーチップ */}
      {blockerVisible.map(b => (
        <div key={b.id}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: '1px solid rgba(180,100,0,0.35)', background: 'rgba(180,100,0,0.06)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
          onClick={() => onItemClick(b.id)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(180,100,0,0.12)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(180,100,0,0.06)'; }}
        >
          <ShieldAlert size={9} style={{ color: '#B46400', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: '#B46400', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
          <button onClick={e => { e.stopPropagation(); setDismissed(p => new Set([...p, b.id])); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'rgba(180,100,0,0.4)', lineHeight: 1 }}>
            <X size={9} />
          </button>
        </div>
      ))}

      {/* リスクチップ */}
      {visible.map(p => (
        <div key={p.id}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: `1px solid ${RISK_COLOR[p.risk_type]}50`, background: `${RISK_COLOR[p.risk_type]}0e`, cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
          onClick={() => onItemClick(p.id)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${RISK_COLOR[p.risk_type]}1c`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${RISK_COLOR[p.risk_type]}0e`; }}
        >
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: RISK_COLOR[p.risk_type], flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-1)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
          <span style={{ fontSize: 9, color: RISK_COLOR[p.risk_type], fontWeight: 700, whiteSpace: 'nowrap' }}>{riskLabel(p)}</span>
          <button onClick={e => { e.stopPropagation(); setDismissed(prev => new Set([...prev, p.id])); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-3)', lineHeight: 1 }}>
            <X size={9} />
          </button>
        </div>
      ))}

      <div style={{ flex: 1, minWidth: 8 }} />
      <button onClick={onRepairClick}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'none', border: '1px solid var(--border)', borderRadius: 20, fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'color 0.12s, border-color 0.12s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        <Wrench size={9} /> 修復へ <ArrowRight size={9} />
      </button>
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  const [open, setOpen] = React.useState(false);

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50 }}>
      {/* 展開パネル */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 36, right: 0,
          width: 220,
          background: 'rgba(12,12,18,0.96)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '14px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          color: 'rgba(255,255,255,0.75)',
          fontFamily: 'system-ui,-apple-system,sans-serif',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
            球の読み方
          </div>

          {/* 色 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 6, letterSpacing: '0.04em' }}>色 — 活発さ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 48, height: 8, borderRadius: 4, background: 'linear-gradient(to right, hsl(210,8%,20%), hsl(260,78%,58%))' }} />
              <span style={{ fontSize: 9 }}>暗い灰青 → 明るいインジゴ</span>
            </div>
            <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
              明るく青紫 = 進行中ピースが多い・遅延少ない<br />
              暗いグレー = 停滞中・進捗なし
            </div>
          </div>

          {/* 形 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '0.04em' }}>形 — 完成度</div>
            <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
              真円に近い = ピース完了率が高い<br />
              輪郭がガタガタ = 未完了ピースが多い
            </div>
          </div>

          {/* サイズ */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '0.04em' }}>大きさ — 規模</div>
            <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
              球が大きいほどピース数が多い
            </div>
          </div>

          {/* 点 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '0.04em' }}>内部の点 — 進行中タスク数</div>
            <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5 }}>
              点が多い = 現在進行中のピースが多い
            </div>
          </div>

          {/* バッジ */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { color: '#fbbf24', label: '属人化', desc: '1人が60%以上担当' },
              { color: '#f87171', label: '期限超過', desc: 'overdue ピースが40%以上' },
            ].map(it => (
              <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{it.label}</span>
                <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.28)' }}>{it.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ？ボタン */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 26, height: 26, borderRadius: '50%',
          background: open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title="球の読み方"
      >
        ?
      </button>
    </div>
  );
}

// ─── GridFallback ────────────────────────────────────────────────────────────
function GridFallback({ projects, onOrbClick }: { projects: OrbProject[]; onOrbClick: (id: string) => void }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 32, justifyItems: 'center', paddingBottom: 40 }}>
        {projects.map(p => (
          <ProjectOrb key={p.id} project={p} onClick={() => onOrbClick(p.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function EcosystemSkeleton() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px 36px', justifyContent: 'center', alignItems: 'center', padding: '60px 40px' }}>
      {[110, 85, 130, 90, 100, 75, 120].map((size, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', animation: 'pulse 2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// ─── DemoSelector ────────────────────────────────────────────────────────────
function DemoSelector({ workspaces, currentDemo, switchingDemo, onSelect, onClose }: {
  workspaces:    WorkspaceProfile[];
  currentDemo:   DemoType | null;
  switchingDemo: DemoType | null;
  onSelect:      (type: DemoType) => void;
  onClose:       () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'absolute', top: 56, left: 16, width: 340, zIndex: 41, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden', animation: 'panel-slide-in 0.18s ease-out both' }}>
        <style>{`@keyframes panel-slide-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>工房を見学する</div>
          <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>別会社の仕事空間に入ります。現在のデータは上書きされます。</div>
        </div>
        <div style={{ padding: '6px 0 6px' }}>
          {workspaces.map(ws => (
            <WorkspaceCard
              key={ws.type}
              ws={ws}
              isActive={currentDemo === ws.type}
              isSwitching={switchingDemo === ws.type}
              disabled={switchingDemo !== null}
              onSelect={onSelect}
            />
          ))}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 9, color: 'var(--text-4, rgba(0,0,0,0.28))', lineHeight: 1.5 }}>
          デモ用サンプルデータ。実際の業務データとは無関係です。
        </div>
      </div>
    </>
  );
}

// ─── WorkspaceCard ───────────────────────────────────────────────────────────
function WorkspaceCard({ ws, isActive, isSwitching, disabled, onSelect }: {
  ws:          WorkspaceProfile;
  isActive:    boolean;
  isSwitching: boolean;
  disabled:    boolean;
  onSelect:    (type: DemoType) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const dotCount   = 5;
  const filledDots = Math.round(ws.warmth * dotCount);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !disabled && onSelect(ws.type)}
      style={{ padding: '10px 16px', cursor: disabled ? 'default' : 'pointer', borderLeft: `2px solid ${isActive ? 'rgba(194,154,108,0.60)' : 'transparent'}`, background: isSwitching ? 'rgba(194,154,108,0.06)' : hovered && !disabled ? 'rgba(194,154,108,0.04)' : 'transparent', transition: 'background 0.15s', opacity: disabled && !isSwitching ? 0.5 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--text-1)' : 'var(--text-2, rgba(0,0,0,0.7))', letterSpacing: '-0.01em', transition: 'color 0.15s' }}>
          {isSwitching ? '入室中…' : ws.name}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{ws.industry}</span>
        {isActive && !isSwitching && (
          <span style={{ fontSize: 8.5, color: 'rgba(194,154,108,0.8)', marginLeft: 'auto', flexShrink: 0, letterSpacing: '0.02em' }}>現在の工房</span>
        )}
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', lineHeight: 1.55, marginBottom: 5 }}>{ws.spatial}</div>
      <div style={{ fontSize: 9, color: hovered ? 'var(--text-2, rgba(0,0,0,0.65))' : 'var(--text-4, rgba(0,0,0,0.35))', lineHeight: 1.5, marginBottom: 5, transition: 'color 0.15s' }}>{ws.state}</div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: i < filledDots ? 'rgba(194,154,108,0.65)' : 'rgba(0,0,0,0.12)', transition: 'background 0.15s' }} />
        ))}
        <span style={{ fontSize: 8.5, color: 'var(--text-4, rgba(0,0,0,0.28))', marginLeft: 4 }}>活動強度</span>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onAction }: { onAction: () => void }) {
  const navigate = useNavigate();

  const STEPS = [
    { num: '1', title: 'プロジェクトを作る', body: '仕事の「器」を用意します。部署・案件・目標など、まとめたい単位でどうぞ。',     cta: 'ボードで作成する',   action: onAction },
    { num: '2', title: 'ピースを追加する',   body: 'プロジェクトの中にタスク（ピース）を追加します。依存関係も設定できます。',     cta: 'ボードを開く',       action: () => navigate('/board') },
    { num: '3', title: 'チームを招待する',   body: '設定画面からメンバーを招待してください。リンクを共有するだけで参加できます。', cta: 'メンバー設定を開く',  action: () => navigate('/settings?tab=members') },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '48px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>ようこそ</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', marginBottom: 10 }}>工房はまだ空です</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, maxWidth: 340 }}>
          PuzzleWork は仕事の流れを「ピース」として管理します。<br />
          まずは3ステップで最初の工房を立ち上げましょう。
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 680, marginBottom: 36 }}>
        {STEPS.map(step => (
          <div key={step.num} style={{ width: 196, padding: '18px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 8 }}>STEP {step.num}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, letterSpacing: '-0.01em' }}>{step.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>{step.body}</div>
            <button onClick={step.action} style={{ width: '100%', padding: '7px 0', background: step.num === '1' ? 'var(--accent)' : 'var(--surface-sub)', color: step.num === '1' ? '#fff' : 'var(--text-2)', border: `1px solid ${step.num === '1' ? 'transparent' : 'var(--border)'}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {step.cta}
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
        デモデータを試したい場合は「工房を見学する」をお使いください
      </div>
    </div>
  );
}
