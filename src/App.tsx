import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LockProvider, useLock } from './context/LockContext';
import { ToastProvider } from './context/ToastContext';
import { isConfigured } from './lib/supabase';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { AuthScreen, Logo } from './screens/Auth';
import { LockScreen } from './screens/LockScreen';
import { Home } from './screens/Home';
import { Finance } from './screens/Finance';
import { Tasks } from './screens/Tasks';
import { RecordDetail } from './screens/RecordDetail';
import { RecordEdit } from './screens/RecordEdit';
import { RecycleBin } from './screens/RecycleBin';
import { SettingsScreen } from './screens/Settings';
import { More, ComingSoon } from './screens/More';

const ROOTS = ['/', '/study', '/finance', '/clients', '/more'];

function BackButton() {
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      if (ROOTS.includes(loc.pathname)) {
        if (loc.pathname === '/') CapApp.exitApp();
        else nav('/');
      } else nav(-1);
    });
    return () => {
      h.then((x) => x.remove());
    };
  }, [nav, loc.pathname]);
  return null;
}

function Gate() {
  const { session, loading } = useAuth();
  const { ready, locked } = useLock();

  if (!isConfigured) return <ConfigMissing />;
  if (loading || (session && !ready))
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="app-bg" />
        <Spinner />
      </div>
    );
  if (!session) return <AuthScreen />;

  return (
    <>
      <BackButton />
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/study"
            element={
              <ComingSoon
                title="Study"
                phase={3}
                items={['Subjects, chapters & revision status', 'Pomodoro timer with real session history', 'Mock tests with JEE marking', 'Weak topics, backlog & exam countdown']}
              />
            }
          />
          <Route path="/finance" element={<Finance />} />
          <Route
            path="/clients"
            element={
              <ComingSoon
                title="Clients"
                phase={3}
                items={['Clients, projects & campaigns', 'Client tasks, follow-ups & approvals', 'Links to invoices (Phase 2)']}
              />
            }
          />
          <Route path="/more" element={<More />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/recycle" element={<RecycleBin />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/r/:table/new" element={<RecordEdit />} />
          <Route path="/r/:table/:id/edit" element={<RecordEdit />} />
          <Route path="/r/:table/:id" element={<RecordDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      {locked && <LockScreen />}
    </>
  );
}

function ConfigMissing() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 text-center">
      <div className="app-bg" />
      <div className="relative z-10 max-w-sm">
        <Logo />
        <h1 className="mt-4 text-[22px] font-bold">Setup needed</h1>
        <p className="mt-2 text-[15px] text-muted">
          Supabase URL and key are missing. Add them in <b>src/config.ts</b> (or GitHub secrets) and build again.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <LockProvider>
            <Gate />
          </LockProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
