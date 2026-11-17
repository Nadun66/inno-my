import React, { useCallback, useEffect, useState } from 'react';
import { CyberBackground } from './components/CyberBackground';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { portalApi } from './services/portalApi';
import { soundFx } from './utils/soundFx';
import type { EventStatus, SessionInfo, TeamLeaderSnapshot } from './types/portal';

type RouteView = 'login' | 'dashboard' | 'admin';

function resolveInitialRoute(): RouteView {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/admin')) return 'admin';
  const existingTeam = portalApi.getTeamSession();
  if (existingTeam) return 'dashboard';
  if (path.startsWith('/dashboard')) return 'login';
  return 'login';
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<RouteView>(() => resolveInitialRoute());
  const [initialTeamSnapshot, setInitialTeamSnapshot] = useState<TeamLeaderSnapshot | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [navMeta, setNavMeta] = useState<{
    teamLabel: string | null;
    studentId: string | null;
    isAdmin: boolean;
    eventStatus: EventStatus;
    queuePaused: boolean;
    connected: boolean;
  }>({
    teamLabel: portalApi.getTeamSession()?.teamId ?? null,
    studentId: portalApi.getTeamSession()?.studentId ?? null,
    isAdmin: Boolean(portalApi.getAdminSession()),
    eventStatus: 'LIVE',
    queuePaused: false,
    connected: true,
  });

  const navigate = useCallback((next: RouteView) => {
    setRoute(next);
    const targetPath = next === 'admin' ? '/admin' : next === 'dashboard' ? '/dashboard' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveInitialRoute());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Ensure URL matches resolved initial route on refresh
  useEffect(() => {
    const desired = route === 'admin' ? '/admin' : route === 'dashboard' ? '/dashboard' : '/';
    if (window.location.pathname !== desired) {
      window.history.replaceState({}, '', desired);
    }
  }, [route]);

  const handleTeamLoginSuccess = useCallback(
    (session: SessionInfo, snapshot?: TeamLeaderSnapshot) => {
      setInitialTeamSnapshot(snapshot ?? null);
      setNavMeta((prev) => ({
        ...prev,
        teamLabel: session.teamId ?? null,
        studentId: session.studentId ?? null,
        eventStatus: snapshot?.eventSettings.eventStatus ?? prev.eventStatus,
        queuePaused: snapshot?.eventSettings.queuePaused ?? prev.queuePaused,
      }));
      navigate('dashboard');
    },
    [navigate]
  );

  const handleLogout = useCallback(() => {
    if (route === 'admin') {
      portalApi.clearAdminSession();
      setNavMeta((prev) => ({ ...prev, isAdmin: false }));
      navigate('login');
      return;
    }
    portalApi.clearTeamSession();
    setInitialTeamSnapshot(null);
    setNavMeta((prev) => ({ ...prev, teamLabel: null, studentId: null }));
    navigate('login');
  }, [route, navigate]);

  const handleSessionExpired = useCallback(() => {
    portalApi.clearTeamSession();
    setInitialTeamSnapshot(null);
    setNavMeta((prev) => ({ ...prev, teamLabel: null, studentId: null }));
    navigate('login');
  }, [navigate]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundFx.enabled = next;
      return next;
    });
  }, []);

  const handleDashboardMeta = useCallback(
    (meta: {
      teamLabel: string;
      studentId: string;
      eventStatus: EventStatus;
      queuePaused: boolean;
      connected: boolean;
    }) => {
      setNavMeta((prev) => ({ ...prev, ...meta }));
    },
    []
  );

  const handleAdminMeta = useCallback(
    (meta: {
      isAdmin: boolean;
      eventStatus?: EventStatus;
      queuePaused?: boolean;
      connected?: boolean;
    }) => {
      setNavMeta((prev) => ({
        ...prev,
        isAdmin: meta.isAdmin,
        eventStatus: meta.eventStatus ?? prev.eventStatus,
        queuePaused: meta.queuePaused ?? prev.queuePaused,
        connected: meta.connected ?? prev.connected,
      }));
    },
    []
  );

  return (
    <div className="relative flex min-h-screen flex-col text-[#F4F8FF]">
      <CyberBackground />

      <Navbar
        route={route}
        onNavigate={navigate}
        teamLabel={navMeta.teamLabel}
        studentId={navMeta.studentId}
        isAdmin={navMeta.isAdmin}
        eventStatus={navMeta.eventStatus}
        queuePaused={navMeta.queuePaused}
        connected={navMeta.connected}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {route === 'login' && <LoginPage onLoginSuccess={handleTeamLoginSuccess} />}

        {route === 'dashboard' && (
          <DashboardPage
            initialSnapshot={initialTeamSnapshot}
            onSessionExpired={handleSessionExpired}
            onSnapshotMeta={handleDashboardMeta}
          />
        )}

        {route === 'admin' && <AdminPage onAdminAuthChange={handleAdminMeta} />}
      </main>

      <Footer
        onOpenAdmin={() => navigate('admin')}
        onOpenTeamLogin={() => navigate(portalApi.getTeamSession() ? 'dashboard' : 'login')}
      />
    </div>
  );
};

export default App;
