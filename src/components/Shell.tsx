import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Sheet, cx } from './ui';
import { Glyph, type GlyphName } from './Glyph';

// Floating dock: Home · Finance · (+) · Study · More. The open tab grows into a glowing pill with
// its realistic icon + name; the others show the icon only. Same screens as before, nothing removed.
const TABS: { to: string; label: string; glyph: GlyphName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Home', glyph: 'house', match: (p) => p === '/' },
  { to: '/finance', label: 'Finance', glyph: 'wallet', match: (p) => p.startsWith('/finance') },
  { to: '/study', label: 'Study', glyph: 'cap', match: (p) => p.startsWith('/study') },
  { to: '/more', label: 'More', glyph: 'grid', match: (p) => p.startsWith('/more') || p.startsWith('/clients') },
];

const TAB_PATHS = ['/', '/study', '/finance', '/clients', '/more'];

const tap = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* no vibration */
  }
};

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const showBar = TAB_PATHS.includes(pathname);
  const [quick, setQuick] = useState(false);

  const tab = (t: (typeof TABS)[number]) => {
    const on = t.match(pathname);
    return (
      <button
        key={t.to}
        type="button"
        aria-label={t.label}
        aria-current={on ? 'page' : undefined}
        onClick={() => {
          tap();
          if (on) window.scrollTo({ top: 0, behavior: 'smooth' });
          else nav(t.to);
        }}
        className={cx('dock-tab press flex h-12 items-center justify-center gap-1.5 rounded-full', on ? 'dock-tab-on' : '')}
        style={{ flex: on ? 2.1 : 1 }}
      >
        <span className={cx('flex shrink-0 transition-transform duration-300', on ? 'scale-100' : 'scale-90 opacity-70 dock-dim')}>
          <Glyph name={t.glyph} size={on ? 26 : 24} />
        </span>
        <span className={cx('overflow-hidden whitespace-nowrap text-[12.5px] font-bold transition-all duration-300', on ? 'max-w-[80px] opacity-100' : 'max-w-0 opacity-0')}>{t.label}</span>
      </button>
    );
  };

  return (
    <div className="relative min-h-screen">
      <div className="app-bg" />
      {children}
      {showBar && (
        <nav className="dock fixed inset-x-3 z-40 mx-auto flex max-w-md items-center gap-1 rounded-[30px] p-1.5" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          {tab(TABS[0])}
          {tab(TABS[1])}
          <button
            type="button"
            aria-label="Quick add"
            onClick={() => {
              tap();
              setQuick(true);
            }}
            className="dock-fab press relative mx-0.5 flex h-[58px] w-[58px] shrink-0 -translate-y-4 items-center justify-center rounded-full text-white"
          >
            <span className="dock-fab-ring" />
            <Plus size={28} strokeWidth={2.8} className="relative" />
          </button>
          {tab(TABS[2])}
          {tab(TABS[3])}
        </nav>
      )}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

const GROUPS: { title: string; items: { label: string; to: string; glyph: GlyphName }[] }[] = [
  {
    title: 'Money',
    items: [
      { label: 'Expense', to: '/r/expenses/new', glyph: 'receipt' },
      { label: 'Income', to: '/r/incomes/new', glyph: 'money' },
      { label: 'Transfer', to: '/r/transfers/new', glyph: 'bank' },
      { label: 'Smart add', to: '/smart', glyph: 'sparkle' },
      { label: 'Udhaar', to: '/r/loans/new', glyph: 'handshake' },
      { label: 'Split', to: '/groups', glyph: 'people' },
      { label: 'Card bill / EMI', to: '/credit', glyph: 'card' },
      { label: 'Request', to: '/r/payment_requests/new', glyph: 'wallet' },
    ],
  },
  {
    title: 'Work & study',
    items: [
      { label: 'Task', to: '/r/tasks/new', glyph: 'check' },
      { label: 'Client task', to: '/r/tasks/new?area=business&task_type=follow_up', glyph: 'briefcase' },
      { label: 'Invoice', to: '/r/invoices/new', glyph: 'receipt' },
      { label: 'Client payment', to: '/r/incomes/new?area=business&payment_method=upi&payer_type=client', glyph: 'money' },
      { label: 'Study session', to: '/r/study_sessions/new', glyph: 'book' },
      { label: 'Mock test', to: '/r/mock_tests/new', glyph: 'chart' },
      { label: 'Pomodoro', to: '/pomodoro', glyph: 'target' },
      { label: 'Revision', to: '/revisions', glyph: 'cap' },
    ],
  },
  {
    title: 'Life & clock',
    items: [
      { label: 'Timer', to: '/clock?tab=timer', glyph: 'stopwatch' },
      { label: 'Alarm', to: '/clock?tab=alarm', glyph: 'bell' },
      { label: 'Event', to: '/r/events/new', glyph: 'calendar' },
      { label: 'Note', to: '/r/notes/new', glyph: 'book' },
      { label: 'Weight', to: '/weight', glyph: 'scale' },
      { label: 'Habit', to: '/habits', glyph: 'flame' },
      { label: 'Goal', to: '/goals', glyph: 'target' },
      { label: 'Gift / birthday', to: '/r/events/new', glyph: 'gift' },
    ],
  },
];

function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>
            <div className="grid grid-cols-4 gap-2">
              {g.items.map(({ label, to, glyph }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    tap();
                    onClose();
                    nav(to);
                  }}
                  className="press flex flex-col items-center gap-1 rounded-[16px] bg-[var(--card-2)] px-1 py-2.5"
                >
                  <Glyph name={glyph} size={34} />
                  <span className="w-full truncate text-center text-[11px] font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
