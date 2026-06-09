import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { useAuthStore } from './store/authStore';
import { users as userApi } from './services/api';
import AdminShell  from './components/admin/AdminShell';
import WorkerShell from './components/worker/WorkerShell';

import { ErrorBoundary } from './components/shared/ErrorBoundary';

// ── Auth pages ───────────────────────────────────────────────────────────────
const LoginPage            = lazy(() => import('./pages/LoginPage'));
const RegisterPage         = lazy(() => import('./pages/RegisterPage'));
const WorkerRegisterPage   = lazy(() => import('./pages/WorkerRegisterPage'));
const JoinPage             = lazy(() => import('./pages/JoinPage'));

// ── Admin pages ──────────────────────────────────────────────────────────────
const PuzzleBoard     = lazy(() => import('./components/board/PuzzleBoard'));
const DashboardPage   = lazy(() => import('./pages/admin/DashboardPage'));
const KanbanPage      = lazy(() => import('./pages/admin/KanbanPage'));
const GanttPage       = lazy(() => import('./pages/admin/GanttPage'));
const TeamPage        = lazy(() => import('./pages/admin/TeamPage'));
const CalendarPage    = lazy(() => import('./pages/admin/CalendarPage'));
const VelocityPage    = lazy(() => import('./pages/admin/VelocityPage'));
const SettingsPage    = lazy(() => import('./pages/admin/SettingsPage'));
const SearchPage      = lazy(() => import('./pages/admin/SearchPage'));
const OkrPage         = lazy(() => import('./pages/admin/OkrPage'));
const RoadmapPage     = lazy(() => import('./pages/admin/RoadmapPage'));
const RetroPage       = lazy(() => import('./pages/admin/RetroPage'));
const SprintPage      = lazy(() => import('./pages/admin/SprintPage'));
const OverviewPage    = lazy(() => import('./pages/admin/OverviewPage'));
const ProjectsPage    = lazy(() => import('./pages/admin/ProjectsPage'));
const RepairPage      = lazy(() => import('./pages/admin/RepairPage'));
const ArchivePage          = lazy(() => import('./pages/admin/ArchivePage'));
const ProjectReportPage    = lazy(() => import('./pages/admin/ProjectReportPage'));
const CompanySkillsPage    = lazy(() => import('./pages/admin/CompanySkillsPage'));

// ── Worker pages ─────────────────────────────────────────────────────────────
const MyPiecesPage    = lazy(() => import('./pages/worker/MyPiecesPage'));
const WorkerStatsPage = lazy(() => import('./pages/worker/WorkerStatsPage'));
const SkillTreePage   = lazy(() => import('./pages/SkillTreePage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const MarketAdminPage = lazy(() => import('./pages/admin/MarketAdminPage'));
const PhysicsPage     = lazy(() => import('./pages/admin/PhysicsPage'));
const ZoomPage        = lazy(() => import('./pages/admin/ZoomPage'));
const CriticalPage    = lazy(() => import('./pages/admin/CriticalPage'));
const AssignPage         = lazy(() => import('./pages/admin/AssignPage'));
const ProjectWizardPage  = lazy(() => import('./pages/admin/ProjectWizardPage'));
const ProposalsPage      = lazy(() => import('./pages/admin/ProposalsPage'));
const MyProposalsPage    = lazy(() => import('./pages/worker/MyProposalsPage'));
const PortfolioPage       = lazy(() => import('./pages/worker/PortfolioPage'));
const PublicPortfolioPage = lazy(() => import('./pages/PublicPortfolioPage'));
const OnboardingPage      = lazy(() => import('./pages/worker/OnboardingPage'));

// ── Shared pages ─────────────────────────────────────────────────────────────
const ShareViewPage   = lazy(() => import('./pages/ShareViewPage'));
const SinglePieceUI   = lazy(() => import('./components/piece/SinglePieceUI'));

// ── Auth wrapper ──────────────────────────────────────────────────────────────
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === 'worker') return <Navigate to="/work" replace />;
  return <>{children}</>;
}

function WorkerRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  // 未オンボード（onboarded が false/未設定）のワーカーはオンボーディングへ
  if (user && user.role === 'worker' && user.onboarded === false) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  const { token, user, setAuth, logout } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    if (user)   { setReady(true); return; }
    const timer = setTimeout(() => { logout(); setReady(true); }, 5000);
    userApi.me()
      .then((u) => { setAuth(u, token, ''); setReady(true); clearTimeout(timer); })
      .catch(() => { logout(); setReady(true); clearTimeout(timer); });
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#888', fontSize: 12, fontFamily: '-apple-system, sans-serif',
    }}>Loading...</div>
  );

  return (
    <BrowserRouter>
      <ErrorBoundary>
      <Suspense fallback={
        <div style={{
          height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#888', fontSize: 12, fontFamily: '-apple-system, sans-serif',
        }}>Loading...</div>
      }>
        <Routes>
          {/* ── Public ── */}
          <Route path="/login"             element={<LoginPage />} />
          <Route path="/register"          element={<RegisterPage />} />
          <Route path="/register-worker"   element={<WorkerRegisterPage />} />
          <Route path="/join/:token"       element={<JoinPage />} />
          <Route path="/share/:token" element={<ShareViewPage />} />
          <Route path="/u/:userId"    element={<PublicPortfolioPage />} />
          <Route path="/onboarding"  element={<WorkerRoute><OnboardingPage /></WorkerRoute>} />

          {/* ── Admin ── */}
          <Route path="/dashboard" element={<AdminRoute><AdminShell><DashboardPage /></AdminShell></AdminRoute>} />
          <Route path="/board"     element={<AdminRoute><AdminShell><PuzzleBoard /></AdminShell></AdminRoute>} />
          <Route path="/kanban"    element={<AdminRoute><AdminShell><KanbanPage /></AdminShell></AdminRoute>} />
          <Route path="/team"      element={<AdminRoute><AdminShell><TeamPage /></AdminShell></AdminRoute>} />
          <Route path="/gantt"     element={<AdminRoute><AdminShell><GanttPage /></AdminShell></AdminRoute>} />
          <Route path="/calendar"  element={<AdminRoute><AdminShell><CalendarPage /></AdminShell></AdminRoute>} />
          <Route path="/velocity"  element={<AdminRoute><AdminShell><VelocityPage /></AdminShell></AdminRoute>} />
          <Route path="/settings"  element={<AdminRoute><AdminShell><SettingsPage /></AdminShell></AdminRoute>} />
          <Route path="/search"    element={<AdminRoute><AdminShell><SearchPage /></AdminShell></AdminRoute>} />
          <Route path="/okr"       element={<AdminRoute><AdminShell><OkrPage /></AdminShell></AdminRoute>} />
          <Route path="/roadmap"   element={<AdminRoute><AdminShell><RoadmapPage /></AdminShell></AdminRoute>} />
          <Route path="/retro"     element={<AdminRoute><AdminShell><RetroPage /></AdminShell></AdminRoute>} />
          <Route path="/sprints"   element={<AdminRoute><AdminShell><SprintPage /></AdminShell></AdminRoute>} />
          <Route path="/overview"  element={<AdminRoute><AdminShell><OverviewPage /></AdminShell></AdminRoute>} />
          <Route path="/projects"  element={<AdminRoute><AdminShell><ProjectsPage /></AdminShell></AdminRoute>} />
          <Route path="/repair"    element={<AdminRoute><AdminShell><RepairPage /></AdminShell></AdminRoute>} />
          <Route path="/archive"        element={<AdminRoute><AdminShell><ArchivePage /></AdminShell></AdminRoute>} />
          <Route path="/report"         element={<AdminRoute><AdminShell><ProjectReportPage /></AdminShell></AdminRoute>} />
          <Route path="/company-skills" element={<AdminRoute><AdminShell><CompanySkillsPage /></AdminShell></AdminRoute>} />
          <Route path="/market-admin"   element={<AdminRoute><AdminShell><MarketAdminPage /></AdminShell></AdminRoute>} />
          <Route path="/physics"        element={<AdminRoute><AdminShell><PhysicsPage /></AdminShell></AdminRoute>} />
          <Route path="/zoom"           element={<AdminRoute><AdminShell><ZoomPage /></AdminShell></AdminRoute>} />
          <Route path="/critical"       element={<AdminRoute><AdminShell><CriticalPage /></AdminShell></AdminRoute>} />
          <Route path="/assign"         element={<AdminRoute><AdminShell><AssignPage /></AdminShell></AdminRoute>} />
          <Route path="/projects/wizard" element={<AdminRoute><AdminShell><ProjectWizardPage /></AdminShell></AdminRoute>} />
          <Route path="/proposals"      element={<AdminRoute><AdminShell><ProposalsPage /></AdminShell></AdminRoute>} />

          {/* ── Worker ── */}
          <Route path="/work"            element={<WorkerRoute><WorkerShell><MyPiecesPage /></WorkerShell></WorkerRoute>} />
          <Route path="/work/pieces"     element={<WorkerRoute><WorkerShell><MyPiecesPage /></WorkerShell></WorkerRoute>} />
          <Route path="/work/stats"      element={<WorkerRoute><WorkerShell><WorkerStatsPage /></WorkerShell></WorkerRoute>} />
          <Route path="/work/proposals"  element={<WorkerRoute><WorkerShell><MyProposalsPage /></WorkerShell></WorkerRoute>} />
          <Route path="/work/portfolio"  element={<WorkerRoute><WorkerShell><PortfolioPage /></WorkerShell></WorkerRoute>} />
          <Route path="/skills"     element={<WorkerRoute><WorkerShell><SkillTreePage /></WorkerShell></WorkerRoute>} />
          <Route path="/marketplace" element={<WorkerRoute><WorkerShell><MarketplacePage /></WorkerShell></WorkerRoute>} />
          <Route path="/piece/:id"  element={<WorkerRoute><SinglePieceUI /></WorkerRoute>} />

          {/* ── Redirects ── */}
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
