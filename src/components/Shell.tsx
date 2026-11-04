import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  House, BookOpen, Wallet, Briefcase, LayoutGrid, Plus, ListTodo, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Landmark,
} from 'lucide-react';
import { Sheet, cx } from './ui';

const TABS = [
  { to: '/', label: 'Home', icon: House },
  { to: '/study', label: 'Study', icon: BookOpen },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/clients', label: 'Clients', icon: Briefcase },
  { to: '/more', label: 'More', icon: LayoutGrid },
];

const TAB_PATHS = ['/', '/study', '/finance', '/clients', '/more', '/tasks', '/recycle'];

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
            className="liquid liquid-primary fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
          <nav
            className="glass-strong fixed inset-x-3 z-40 mx-auto flex max-w-md items-center justify-around rounded-[28px] px-1 py-1.5"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-[22px] py-1.5 text-[10px] font-semibold transition-all duration-300',
                    isActive ? 'liquid text-primary' : 'text-muted',
                  )
                }
                style={{ boxShadow: 'none' }}
              >
                <Icon size={22} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </nav>
        </>
      )}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}

const ACTIONS = [
  { label: 'Task', to: '/r/tasks/new', icon: ListTodo, tone: 'linear-gradient(180deg,#60A5FA,#2563EB)' },
  { label: 'Income', to: '/r/incomes/new', icon: ArrowDownLeft, tone: 'linear-gradient(180deg,#34D399,#059669)' },
  { label: 'Expense', to: '/r/expenses/new', icon: ArrowUpRight, tone: 'linear-gradient(180deg,#FB7185,#E11D48)' },
  { label: 'Transfer', to: '/r/transfers/new', icon: ArrowLeftRight, tone: 'linear-gradient(180deg,#A78BFA,#7C3AED)' },
  { label: 'Account', to: '/r/accounts/new', icon: Landmark, tone: 'linear-gradient(180deg,#FBBF24,#D97706)' },
];

function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title="Quick Add">
      <div className="grid grid-cols-3 gap-3">
        {ACTIONS.map(({ label, to, icon: Icon, tone }) => (
          <button
            key={to}
            onClick={() => {
              onClose();
              nav(to);
            }}
            className="liquid flex flex-col items-center gap-2 rounded-[22px] py-4"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
              style={{ background: tone, boxShadow: 'inset 0 1px 1px rgba(255,255,255,.5)' }}
            >
              <Icon size={22} />
            </span>
            <span className="text-[13px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] text-muted">
        Invoices, loans, study sessions and client tasks arrive in the next phases.
      </p>
    </Sheet>
  );
}
