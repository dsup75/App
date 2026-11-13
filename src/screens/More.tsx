import { useNavigate } from 'react-router-dom';
import {
  ListTodo, Receipt, HandCoins, Users, PiggyBank, TrendingUp, Bot, Settings, Trash2, CalendarDays, QrCode, Flame, StickyNote,
  ShoppingCart, CalendarCheck, Link2, Timer, Megaphone, FolderKanban, Target, Wand2, Gauge, CalendarClock, Search, Sparkles, Wrench, HeartPulse, Briefcase, RotateCcw, Watch, Scale, MonitorSmartphone, CreditCard, AlarmClock, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconBubble, Page, SectionTitle, type Tone } from '../components/ui';
import { Glyph, type GlyphName } from '../components/Glyph';

/** big tiles at the top — the places people open most */
const FEATURED: { title: string; sub: string; to: string; glyph: GlyphName }[] = [
  { title: 'Life', sub: 'Habits, Events', to: '/habits', glyph: 'flame' },
  { title: 'Credit & Loans', sub: 'Cards, EMI', to: '/credit', glyph: 'card' },
  { title: 'Health', sub: 'Fitness & Sleep', to: '/health', glyph: 'heart' },
  { title: 'Gadgets', sub: 'Devices', to: '/gadgets', glyph: 'phone' },
  { title: 'Reports', sub: 'Insights', to: '/reports', glyph: 'barchart' },
  { title: 'Backup', sub: 'Export Data', to: '/money-tools/backup', glyph: 'cloud' },
  { title: 'App Lock', sub: 'Biometrics', to: '/settings', glyph: 'lock' },
  { title: 'Reminders', sub: 'Alerts', to: '/settings', glyph: 'bell' },
  { title: 'Settings', sub: 'Customize', to: '/settings', glyph: 'gear' },
];

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
      { label: 'Clock', to: '/clock', icon: AlarmClock, tone: 'amber' },
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
      { label: 'Credit & Loans', to: '/credit', icon: CreditCard, tone: 'blue' },
      { label: 'Smart add', to: '/smart', icon: Wand2, tone: 'primary' },
      { label: 'Invoices', to: '/invoices', icon: Receipt, tone: 'blue' },
      { label: 'Requests', to: '/requests', icon: QrCode, tone: 'teal' },
      { label: 'Udhaar', to: '/loans', icon: HandCoins, tone: 'amber' },
      { label: 'Split', to: '/groups', icon: Users, tone: 'violet' },
      { label: 'Goals', to: '/goals', icon: Target, tone: 'pink' },
      { label: 'Budgets', to: '/budgets', icon: Gauge, tone: 'amber' },
      { label: 'Money Tools', to: '/money-tools', icon: Wrench, tone: 'primary' },
      { label: 'Subscriptions', to: '/recurring', icon: CalendarClock, tone: 'teal' },
      { label: 'Allocate', to: '/allocations', icon: Link2, tone: 'blue' },
    ],
  },
  {
    title: 'Work & study',
    items: [
      { label: 'Work', to: '/clients', icon: Briefcase, tone: 'primary' },
      { label: 'Projects', to: '/projects', icon: FolderKanban, tone: 'blue' },
      { label: 'Campaigns', to: '/campaigns', icon: Megaphone, tone: 'pink' },
      { label: 'Pomodoro', to: '/pomodoro', icon: Timer, tone: 'primary' },
      { label: 'Revisions', to: '/revisions', icon: RotateCcw, tone: 'violet' },
    ],
  },
  {
    title: 'Health & gadgets',
    items: [
      { label: 'Gadgets', to: '/gadgets', icon: Watch, tone: 'blue' },
      { label: 'Health', to: '/health', icon: HeartPulse, tone: 'pink' },
      { label: 'Weight', to: '/weight', icon: Scale, tone: 'teal' },
      { label: 'Screen time', to: '/screen-time', icon: MonitorSmartphone, tone: 'amber' },
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
    <Page title="More" subtitle="Everything in one place" glyph="grid">
      <div className="grid grid-cols-3 gap-2.5">
        {FEATURED.map((f) => (
          <button key={f.title} type="button" onClick={() => nav(f.to)} className="glass press flex flex-col items-center gap-1 rounded-[18px] px-1.5 py-3.5 text-center">
            <Glyph name={f.glyph} size={40} />
            <span className="mt-0.5 text-[13px] font-semibold leading-tight">{f.title}</span>
            <span className="text-[10.5px] leading-tight text-muted">{f.sub}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => nav('/setup')} className="hero press flex w-full items-center gap-3 rounded-[20px] p-4 text-left">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
          <Glyph name="sparkle" size={34} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold">DeepBoost Life</span>
          <span className="block text-[12.5px] opacity-85">Your personal life OS · Version {import.meta.env.VITE_APP_VERSION ?? 'dev'}</span>
        </span>
        <ChevronRight size={18} className="opacity-80" />
      </button>
      <SectionTitle>All features</SectionTitle>
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
