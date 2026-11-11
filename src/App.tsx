import { useEffect, type ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { goBack } from './lib/nav';
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
import { StudyHub, TestsScreen, ExamsScreen, SessionsScreen } from './screens/Study';
import { Pomodoro } from './screens/Pomodoro';
import { GroupsScreen, GroupDetail } from './screens/Groups';
import { HabitsScreen } from './screens/Habits';
import { CalendarScreen } from './screens/Calendar';
import { ReportsScreen } from './screens/Reports';
import { AssistantScreen } from './screens/Assistant';
import { SmartAdd } from './screens/SmartAdd';
import { ListsScreen } from './screens/Lists';
import { BudgetsScreen, RecurringScreen } from './screens/Planning';
import { SearchScreen } from './screens/Search';
import { DuplicatesScreen, HistoryScreen, MoneyToolsHub, ReconcileScreen, SourcesScreen } from './screens/MoneyTools';
import { CalculatorsScreen } from './screens/Calculators';
import { BackupScreen } from './screens/Backup';
import { FocusModeScreen } from './screens/FocusMode';
import { HealthScreen } from './screens/Health';
import { RevisionsScreen } from './screens/Revisions';
import { GadgetDetail, GadgetsHub } from './screens/Gadgets';
import { WeightScreen } from './screens/Weight';
import { ScreenTimeScreen } from './screens/ScreenTime';
import { TimelineScreen } from './screens/Timeline';
import { CreditScreen } from './screens/Credit';
import { SetupScreen } from './screens/Setup';
import { onReminderTap, scheduleReminders } from './lib/reminders';
import { saveFinishedFocusSession } from './lib/focusGuard';
import { checkScreenGoalAlert, syncScreenTimeTotals } from './lib/screenTime';
import { syncAll } from './lib/sheets';
import { saveSettings } from './lib/db';
import { useRef } from 'react';
import {
  InvoicesScreen, LoansScreen, SavingsScreen, NotesScreen, EventsScreen, ShoppingScreen, CampaignsScreen, ProjectsScreen, AllocationsScreen,
} from './screens/Modules';

const ROOTS = ['/', '/study', '/finance', '/clients', '/more'];

function BackButton() {
  const nav = useNavigate();
  const loc = useLocation();
  // one listener for the whole app (re-adding it on every screen could fire Back twice → blank screen)
  const path = useRef(loc.pathname);
  path.current = loc.pathname;
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let busy = false;
    const h = CapApp.addListener('backButton', () => {
      if (busy) return;
      busy = true;
      setTimeout(() => (busy = false), 350);
      const p = path.current;
      if (document.querySelector('[data-sheet-open]')) {
        window.dispatchEvent(new Event('close-top-sheet'));
        return;
      }
      if (ROOTS.includes(p)) {
        if (p === '/') CapApp.exitApp();
        else navRef.current('/');
      } else goBack(navRef.current);
    });
    return () => {
      h.then((x) => x.remove());
    };
  }, []);
  return null;
}

/** Back returns to the same scroll position (after the list has loaded); new screens start at the top.
 *  A watchdog then makes sure the screen is never left blank (scrolled past the content, etc.). */
function ScrollManager() {
  const loc = useLocation();
  const type = useNavigationType();
  const saved = useRef(new Map<string, number>());
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);
  useEffect(() => {
    const key = loc.key;
    let cancelled = false;
    const timers: number[] = [];
    // Back = show the old screen instantly (no entry animation)
    document.documentElement.dataset.nav = type === 'POP' ? 'pop' : 'push';
    const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (type === 'POP' && saved.current.has(key)) {
      const y = saved.current.get(key)!;
      const start = Date.now();
      const tryRestore = () => {
        if (cancelled) return;
        const max = maxScroll();
        if (max >= y - 4 || Date.now() - start > 1200) window.scrollTo(0, Math.min(y, max));
        else requestAnimationFrame(tryRestore);
      };
      requestAnimationFrame(tryRestore);
    } else {
      window.scrollTo(0, 0);
    }
    // Watchdog: if the screen's content is not on screen, bring it back.
    const check = () => {
      if (cancelled) return;
      const page = document.querySelector('.page-wrap');
      if (!page) return;
      const r = page.getBoundingClientRect();
      if (r.bottom < 40 || r.top > window.innerHeight - 40) window.scrollTo(0, r.bottom < 40 ? maxScroll() : 0);
      if (window.scrollY > maxScroll() + 2) window.scrollTo(0, maxScroll());
    };
    timers.push(window.setTimeout(check, 400), window.setTimeout(check, 1400));
    const onScroll = () => saved.current.set(key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener('scroll', onScroll);
    };
  }, [loc.key, type]);
  return null;
}

/** A crash on one screen shows a message with "Go Home" instead of a blank page. */
function RouteBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <ErrorBoundary resetKey={loc.key} onHome={() => nav('/', { replace: true })}>
      {children}
    </ErrorBoundary>
  );
}

/** Quietly copies data to the user's Google Sheet when the last sync is older than 6 hours. */
function AutoSync() {
  const { user, settings, reloadSettings } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !user || !settings?.apps_script_url || !settings.sheet_verified_at) return;
    const last = settings.last_synced_at ? new Date(settings.last_synced_at).getTime() : 0;
    if (Date.now() - last < 6 * 3600 * 1000) return;
    done.current = true;
    const t = setTimeout(() => {
      syncAll(settings.apps_script_url!, settings.sync_key ?? '')
        .then(() => saveSettings(user.id, { last_synced_at: new Date().toISOString() }))
        .then(reloadSettings)
        .catch(() => {
          /* silent — manual "Sync now" shows errors */
        });
    }, 8000);
    return () => clearTimeout(t);
  }, [user, settings, reloadSettings]);
  return null;
}

function ReminderSync() {
  const { user } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!user) return;
    const run = () => {
      scheduleReminders(user.id).catch(() => {});
      saveFinishedFocusSession().catch(() => {});
      syncScreenTimeTotals().catch(() => {});
      checkScreenGoalAlert().catch(() => {});
    };
    const t = setTimeout(run, 4000);
    const off = onReminderTap((url) => nav(url));
    let sub: { remove: () => void } | null = null;
    CapApp.addListener('resume', run).then((h) => (sub = h)).catch(() => {});
    return () => {
      clearTimeout(t);
      off();
      sub?.remove();
    };
  }, [user, nav]);
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
      <ScrollManager />
      <AutoSync />
      <ReminderSync />
      <Shell>
        <RouteBoundary>
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
          <Route path="/budgets" element={<BudgetsScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/money-tools" element={<MoneyToolsHub />} />
          <Route path="/money-tools/sources" element={<SourcesScreen />} />
          <Route path="/money-tools/reconcile" element={<ReconcileScreen />} />
          <Route path="/money-tools/history" element={<HistoryScreen />} />
          <Route path="/money-tools/duplicates" element={<DuplicatesScreen />} />
          <Route path="/money-tools/calculators" element={<CalculatorsScreen />} />
          <Route path="/money-tools/backup" element={<BackupScreen />} />
          <Route path="/focus-mode" element={<FocusModeScreen />} />
          <Route path="/health" element={<HealthScreen />} />
          <Route path="/revisions" element={<RevisionsScreen />} />
          <Route path="/gadgets" element={<GadgetsHub />} />
          <Route path="/gadgets/:id" element={<GadgetDetail />} />
          <Route path="/weight" element={<WeightScreen />} />
          <Route path="/screen-time" element={<ScreenTimeScreen />} />
          <Route path="/timeline" element={<TimelineScreen />} />
          <Route path="/credit" element={<CreditScreen />} />
          <Route path="/setup" element={<SetupScreen />} />
          <Route path="/recurring" element={<RecurringScreen />} />
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
        </RouteBoundary>
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
    <ErrorBoundary>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <LockProvider>
            <Gate />
          </LockProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
