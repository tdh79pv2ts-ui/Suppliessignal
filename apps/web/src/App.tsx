import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AuthenticatedUser } from '@suppliesignal/shared';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { supabase } from './lib/auth';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import {
  EntityDetailPage,
  EntityListPage,
  PortsPage,
  SupplyChainOverview,
  type EntityKind,
} from './pages/SupplyChainPages';
import { apiRequest } from './lib/api';
import { WorkspaceContext } from './lib/workspace';
import {
  ArticleDetailPage,
  ArticlesPage,
  SourceDetailPage,
  SourcesPage,
} from './pages/SourcePages';
import { PocArticlesPage, PocDailyBriefPage, PocMonitoringProfilePage, PocSourcesPage } from './pages/PocPages';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [customerId, setCustomerId] = useState('');
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) {
      setUser(null);
      setWorkspaces([]);
      setCustomerId('');
      return;
    }
    void Promise.all([
      apiRequest<AuthenticatedUser>('/me'),
      apiRequest<{ id: string; name: string }[]>('/workspaces'),
    ]).then(([profile, available]) => {
      setUser(profile);
      setWorkspaces(available);
      setCustomerId((current) =>
        available.some((workspace) => workspace.id === current)
          ? current
          : (available.find((workspace) => workspace.name === 'BSK Fashion')?.id ??
            available[0]?.id ??
            ''),
      );
    });
  }, [session]);
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading secure session…
      </div>
    );
  const authenticated = Boolean(session);
  if (authenticated && !user)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading customer memberships…
      </div>
    );
  const shell =
    authenticated && user && customerId ? (
      <WorkspaceContext.Provider
        value={{ user, customerId, workspaces, setCustomerId }}
      >
        <AppShell />
      </WorkspaceContext.Provider>
    ) : authenticated ? (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="font-semibold">No customer workspace available</h1>
          <p className="mt-2 text-sm text-muted">
            A membership is required, unless an administrator first creates a
            customer workspace.
          </p>
        </div>
      </div>
    ) : (
      <Navigate to="/login" replace />
    );
  const entityKinds: EntityKind[] = [
    'companies',
    'suppliers',
    'factories',
    'products',
    'materials',
    'routes',
  ];
  const globalIntelligenceAllowed =
    user?.role === 'ADMIN' || user?.role === 'REVIEWER';
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage authenticated={authenticated} />}
      />
      <Route element={shell}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/news-radar" element={<Navigate to="/dashboard" replace />} />
        <Route path="/news-radar/exposures/:id" element={<Navigate to="/articles" replace />} />
        <Route path="/daily-brief" element={<PocDailyBriefPage />} />
        <Route path="/monitoring-profile" element={<PocMonitoringProfilePage />} />
        <Route path="/supply-chain" element={<SupplyChainOverview />} />
        {entityKinds.flatMap((kind) => [
          <Route
            key={kind}
            path={`/supply-chain/${kind}`}
            element={<EntityListPage kind={kind} />}
          />,
          <Route
            key={`${kind}-detail`}
            path={`/supply-chain/${kind}/:id`}
            element={<EntityDetailPage kind={kind} />}
          />,
        ])}
        <Route path="/supply-chain/ports" element={<PortsPage />} />
        <Route path="/sources" element={<PocSourcesPage />} />
        <Route path="/articles" element={<PocArticlesPage />} />
        <Route
          path="/source-admin"
          element={
            globalIntelligenceAllowed ? (
              <SourcesPage />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/sources/:id"
          element={
            globalIntelligenceAllowed ? (
              <SourceDetailPage />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/source-articles"
          element={
            globalIntelligenceAllowed ? (
              <ArticlesPage />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/source-articles/:id"
          element={
            globalIntelligenceAllowed ? (
              <ArticleDetailPage />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route
        path="*"
        element={
          <Navigate to={authenticated ? '/dashboard' : '/login'} replace />
        }
      />
    </Routes>
  );
}
