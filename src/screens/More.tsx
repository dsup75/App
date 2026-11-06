import { useNavigate } from 'react-router-dom';
import {
  ListTodo, Receipt, HandCoins, Users, PiggyBank, TrendingUp, Bot, Settings, Trash2, CalendarDays, QrCode, Flame, StickyNote,
  ShoppingCart, CalendarCheck, Link2, Timer, Megaphone, FolderKanban, Target, Wand2, Gauge, CalendarClock, Search, Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconBubble, Page, SectionTitle, type Tone } from '../components/ui';

interface Item {
  label: string;
  to: string;
  icon: LucideIcon;
  tone: Tone;
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Daily life',
    items: [
      { label: 'Tasks', to: '/tasks', icon: ListTodo, tone: 'blue' },
      { label: 'Habits', to: '/habits', icon: Flame, tone: 'amber' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, tone: 'violet' },
      { label: 'Events', to: '/events', icon: CalendarCheck, tone: 'blue' },
      { label: 'Notes', to: '/notes', icon: StickyNote, tone: 'amber' },
      { label: 'Shopping', to: '/shopping', icon: ShoppingCart, tone: 'teal' },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Smart add', to: '/smart', icon: Wand2, tone: 'primary' },
      { label: 'Invoices', to: '/invoices', icon: Receipt, tone: 'blue' },
      { label: 'Requests', to: '/requests', icon: QrCode, tone: 'teal' },
      { label: 'Udhaar', to: '/loans', icon: HandCoins, tone: 'amber' },
      { label: 'Split', to: '/groups', icon: Users, tone: 'violet' },
      { label: 'Goals', to: '/goals', icon: Target, tone: 'pink' },
      { label: 'Budgets', to: '/budgets', icon: Gauge, tone: 'amber' },
      { label: 'Subscriptions', to: '/recurring', icon: CalendarClock, tone: 'teal' },
      { label: 'Allocate', to: '/allocations', icon: Link2, tone: 'blue' },
    ],
  },
  {
    title: 'Work & study',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderKanban, tone: 'blue' },
      { label: 'Campaigns', to: '/campaigns', icon: Megaphone, tone: 'pink' },
      { label: 'Focus timer', to: '/pomodoro', icon: Timer, tone: 'primary' },
    ],
  },
  {
    title: 'Insights & app',
    items: [
      { label: 'Reports', to: '/reports', icon: TrendingUp, tone: 'primary' },
      { label: 'Assistant', to: '/assistant', icon: Bot, tone: 'violet' },
      { label: 'Search', to: '/search', icon: Search, tone: 'blue' },
      { label: 'Setup guide', to: '/setup', icon: Sparkles, tone: 'primary' },
      { label: 'Manage lists', to: '/lists', icon: ListTodo, tone: 'teal' },
      { label: 'Recycle Bin', to: '/recycle', icon: Trash2, tone: 'expense' },
      { label: 'Settings', to: '/settings', icon: Settings, tone: 'muted' },
    ],
  },
];

export function More() {
  const nav = useNavigate();
  return (
    <Page title="More">
      {SECTIONS.map((s) => (
        <div key={s.title} className="space-y-2">
          <SectionTitle>{s.title}</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {s.items.map(({ label, to, icon: Icon, tone }) => (
              <button key={to} onClick={() => nav(to)} className="glass flex flex-col items-center gap-1.5 rounded-[16px] py-3.5 transition-transform active:scale-95">
                <IconBubble tone={tone} size={36}>
                  <Icon size={18} />
                </IconBubble>
                <span className="text-[12px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}
