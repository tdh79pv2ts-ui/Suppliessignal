import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { supabase } from './lib/auth';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading secure session…</div>;
  const authenticated = Boolean(session);
  return <Routes><Route path="/login" element={<LoginPage authenticated={authenticated} />} /><Route element={authenticated ? <AppShell /> : <Navigate to="/login" replace />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/supply-chain" element={<PlaceholderPage title="Supply chain" phase={2} />} /><Route path="/sources" element={<PlaceholderPage title="Source explorer" phase={3} />} /><Route path="/review" element={<PlaceholderPage title="Review queue" phase={8} />} /><Route path="/settings" element={<PlaceholderPage title="Customer settings" phase={9} />} /></Route><Route path="*" element={<Navigate to={authenticated ? '/dashboard' : '/login'} replace />} /></Routes>;
}
