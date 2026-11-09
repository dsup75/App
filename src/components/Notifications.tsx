// In-app notifications (bell on Home): built from real things that need you. They stay until the
// underlying item is done — opening the list only marks them as read.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RotateCcw, ListTodo, HandCoins, QrCode, CalendarClock, Gauge } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { todayISO, relativeDay } from '../lib/dates';
import { formatINR } from '../lib/money';
import { Badge, Empty, IconBubble, List, ListRow, Sheet, type Tone } from './ui';

export interface Notice {
  key: string;
  title: string;
  sub: string;
  to: string;
  icon: ReactNode;
  tone: Tone;
  critical: boolean;
}

const SEEN = 'seen-notices';
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || '[]');
  } catch {
    return [];
  }
};

async function loadNotices(): Promise<Notice[]> {
  const today = todayISO();
  const out: Notice[] = [];
  const q = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>) => {
    try {
      const r = await p;
      return r.error ? [] : r.data ?? [];
    } catch {
      return [] as T[];
    }
  };
  const [tasks, revs, loans0, loanTot, reqs, rules] = await Promise.all([
    q<any>(supabase.from('tasks').select('id,title,due_date').is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']).lt('due_date', today).order('due_date').limit(20)),
    q<any>(supabase.from('revision_queue').select('id,chapter_name,due_date').eq('status', 'pending').lte('due_date', today).limit(20)),
    q<any>(supabase.from('loans').select('id,person,direction,due_date,principal_paise').is('deleted_at', null).not('due_date', 'is', null).lte('due_date', today).limit(40)),
    q<any>(supabase.from('loan_totals').select('id,principal_repaid_paise')),
    q<any>(supabase.from('payment_requests').select('id,title,client_name,due_date,amount_paise,status').is('deleted_at', null).eq('status', 'pending').not('due_date', 'is', null).lte('due_date', today).limit(20)),
    q<any>(supabase.from('recurring_rules').select('id,title,next_date,status').is('deleted_at', null).eq('status', 'active').lte('next_date', today).limit(20)),
  ]);
  for (const t of tasks) out.push({ key: `task:${t.id}:${t.due_date}`, title: t.title, sub: `Task overdue · ${relativeDay(t.due_date)}`, to: `/r/tasks/${t.id}`, icon: <ListTodo size={16} />, tone: 'expense', critical: false });
  for (const r of revs) out.push({ key: `rev:${r.id}`, title: `Revise ${r.chapter_name}`, sub: `Revision due · ${relativeDay(r.due_date)}`, to: '/revisions', icon: <RotateCcw size={16} />, tone: 'violet', critical: false });
  const repaid = new Map<string, number>(loanTot.map((x: any) => [x.id, Number(x.principal_repaid_paise) || 0]));
  const loans = loans0.map((l: any) => ({ ...l, left: l.principal_paise - (repaid.get(l.id) ?? 0) })).filter((l: any) => l.left > 0);
  for (const l of loans) out.push({ key: `loan:${l.id}:${l.due_date}`, title: `Udhaar due: ${l.person ?? ''}`, sub: `${formatINR(l.left)} left · due ${relativeDay(l.due_date)}`, to: `/r/loans/${l.id}`, icon: <HandCoins size={16} />, tone: 'amber', critical: true });
  for (const r of reqs) out.push({ key: `req:${r.id}:${r.due_date}`, title: `Payment pending: ${r.client_name || r.title || ''}`, sub: `${formatINR(r.amount_paise)} · due ${relativeDay(r.due_date)}`, to: `/r/payment_requests/${r.id}`, icon: <QrCode size={16} />, tone: 'amber', critical: true });
  for (const r of rules) out.push({ key: `rule:${r.id}:${r.next_date}`, title: `${r.title ?? 'Bill'} is due`, sub: `Recurring · ${relativeDay(r.next_date)} — approve on Home`, to: '/recurring', icon: <CalendarClock size={16} />, tone: 'teal', critical: true });
  return out;
}

export function useNotices() {
  const [items, setItems] = useState<Notice[]>([]);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const reload = useCallback(() => {
    loadNotices().then(setItems).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const unread = items.filter((i) => !seen.includes(i.key)).length;
  const markSeen = () => {
    const keys = items.map((i) => i.key);
    setSeen(keys);
    try {
      localStorage.setItem(SEEN, JSON.stringify(keys.slice(-300)));
    } catch {
      /* ignore */
    }
  };
  return { items, unread, markSeen, reload, seen };
}

export function NotificationsSheet({ open, onClose, items, seen }: { open: boolean; onClose: () => void; items: Notice[]; seen: string[] }) {
  const nav = useNavigate();
  const critical = items.filter((i) => i.critical);
  const rest = items.filter((i) => !i.critical);
  const row = (n: Notice) => (
    <ListRow
      key={n.key}
      icon={<IconBubble tone={n.tone}>{n.icon}</IconBubble>}
      title={n.title}
      subtitle={n.sub}
      right={!seen.includes(n.key) ? <Badge tone="primary">New</Badge> : undefined}
      onClick={() => {
        onClose();
        nav(n.to);
      }}
      chevron
    />
  );
  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      {items.length === 0 ? (
        <Empty title="All clear" text="Nothing needs you right now." />
      ) : (
        <div className="space-y-3">
          {critical.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <AlertTriangle size={13} /> Important — stays until done
              </p>
              <List>{critical.map(row)}</List>
            </>
          )}
          {rest.length > 0 && <List>{rest.map(row)}</List>}
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted">
        <Gauge size={12} /> Budget alerts and due bills also show on Home.
      </p>
    </Sheet>
  );
}

export const useAttentionItems = useNotices;
