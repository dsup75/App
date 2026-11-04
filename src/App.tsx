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
import { More } from './screens/More';
import { Requests } from './screens/Requests';
import { ClientsHub } from './screens/Clients';
import { StudyHub, Pomodoro, TestsScreen, ExamsScreen, SessionsScreen } from './screens/Study';
import { GroupsScreen, GroupDetail } from './screens/Groups';
import { HabitsScreen } from './screens/Habits';
import { CalendarScreen } from './screens/Calendar';
import { ReportsScreen } from './screens/Reports';
import { AssistantScreen } from './screens/Assistant';
import { SmartAdd } from './screens/SmartAdd';
import { ListsScreen } from './screens/Lists';
import {
  InvoicesScreen, LoansScreen, SavingsScreen, NotesScreen, EventsScreen, ShoppingScreen, CampaignsScreen, ProjectsScreen, AllocationsScreen,
} from './screens/Modules';

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
          <Route path="/study" element={<StudyHub />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/clients" element={<ClientsHub />} />
          <Route path="/more" element={<More />} />

          <Route path="/tasks" element={<Tasks />} />
          <Route path="/habits" element={<HabitsScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/events" element={<EventsScreen />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/shopping" element={<ShoppingScreen />} />

          <Route path="/requests" element={<Requests />} />
          <Route path="/invoices" element={<InvoicesScreen />} />
          <Route path="/loans" element={<LoansScreen />} />
          <Route path="/goals" element={<SavingsScreen />} />
          <Route path="/savings" element={<Navigate to="/goals" replace />} />
          <Route path="/smart" element={<SmartAdd />} />
          <Route path="/lists" element={<ListsScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/allocations" element={<AllocationsScreen />} />

          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/campaigns" element={<CampaignsScreen />} />

          <Route path="/pomodoro" element={<Pomodoro />} />
          <Route path="/tests" element={<TestsScreen />} />
          <Route path="/exams" element={<ExamsScreen />} />
          <Route path="/sessions" element={<SessionsScreen />} />

          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/assistant" element={<AssistantScreen />} />
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
      <div className="relative z-10 max-w-sm">
        <Logo />
        <h1 className="mt-4 text-[22px] font-bold">Setup needed</h1>
        <p className="mt-2 text-[15px] text-muted">
          Supabase URL and key are missing. Add them in <b>src/config.ts</b> and build again.
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
