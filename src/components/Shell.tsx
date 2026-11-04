import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  House, BookOpen, Wallet, Briefcase, LayoutGrid, Plus, ListTodo, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Timer,
  FileText, HandCoins, Users, StickyNote, CalendarDays, QrCode, ClipboardList, Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconBubble, Sheet, cx, type Tone } from './ui';

const TABS = [
  { to: '/', label: 'Home', icon: House },
  { to: '/study', label: 'Study', icon: BookOpen },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/clients', label: 'Clients', icon: Briefcase },
  { to: '/more', label: 'More', icon: LayoutGrid },
];

const TAB_PATHS = ['/', '/study', '/finance', '/clients', '/more'];

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const showBar = TAB_PATHS.includes(pathname);
  const [quick, setQuick] = useState(false);

  return (
    <div className="relative min-h-screen">
      <div className="app-bg" />
      {children}
      {showBar && (
        <>
          <button
            aria-label="Quick add"
            onClick={() => setQuick(true)}
            className="liquid liquid-primary fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
          <nav
            className="glass-strong fixed inset-x-3 z-40 mx-auto flex max-w-md items-center justify-around rounded-[24px] px-1 py-1"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
          >
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx('flex flex-1 flex-col items-center gap-0.5 rounded-[18px] py-1.5 text-[10px] font-semibold transition-colors duration-200', isActive ? 'text-primary' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-[var(--primary-soft)]')}>
                      <Icon size={20} strokeWidth={isActive ? 2.3 : 1.9} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </>
      )}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

const ACTIONS: { label: string; to: string; icon: LucideIcon; tone: Tone }[] = [
  { label: 'Smart add', to: '/smart', icon: Wand2, tone: 'primary' },
  { label: 'Task', to: '/r/tasks/new', icon: ListTodo, tone: 'blue' },
  { label: 'Income', to: '/r/incomes/new', icon: ArrowDownLeft, tone: 'income' },
  { label: 'Expense', to: '/r/expenses/new', icon: ArrowUpRight, tone: 'expense' },
  { label: 'Study session', to: '/r/study_sessions/new', icon: Timer, tone: 'primary' },
  { label: 'Client task', to: '/r/tasks/new?area=business&task_type=follow_up', icon: ClipboardList, tone: 'teal' },
  { label: 'Invoice', to: '/r/invoices/new', icon: FileText, tone: 'primary' },
  { label: 'Payment', to: '/r/incomes/new?area=business&payment_method=upi&payer_type=client', icon: ArrowDownLeft, tone: 'teal' },
  { label: 'Payment request', to: '/r/payment_requests/new', icon: QrCode, tone: 'teal' },
  { label: 'Loan / Udhaar', to: '/r/loans/new', icon: HandCoins, tone: 'amber' },
  { label: 'Group expense', to: '/groups', icon: Users, tone: 'violet' },
  { label: 'Transfer', to: '/r/transfers/new', icon: ArrowLeftRight, tone: 'violet' },
  { label: 'Note', to: '/r/notes/new', icon: StickyNote, tone: 'amber' },
  { label: 'Event', to: '/r/events/new', icon: CalendarDays, tone: 'pink' },
];

function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map(({ label, to, icon: Icon, tone }) => (
          <button
            key={label}
            onClick={() => {
              onClose();
              nav(to);
            }}
            className="flex flex-col items-center gap-1.5 rounded-[16px] bg-[var(--card-2)] py-3 transition-transform active:scale-95"
          >
            <IconBubble tone={tone} size={38}>
              <Icon size={19} />
            </IconBubble>
            <span className="text-[12px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
