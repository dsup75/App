// Unified activity timeline: money, study, focus, health, devices, tasks, habits, business — newest first
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, ArrowRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Link2, Timer, RotateCcw, ShieldBan, Scale, Footprints, Watch, CircleCheck, Flame, Briefcase, FolderKanban, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatINR } from '../lib/money';
import { Button, Chips, IconBubble, Spinner, TONES, type Tone } from './ui';

type Kind = 'money' | 'study' | 'health' | 'tasks' | 'business';
export interface TimelineItem {
  key: string;
  at: string; // ISO
  kind: Kind;
  title: string;
  sub: string;
  icon: ReactNode;
  tone: Tone;
  to?: string;
}

const iso = (d: Date) => d.toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);
const safe = async <T,>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
  try {
    const r = await p;
    return r.error ? [] : r.data ?? [];
  } catch {
    return [];
  }
};

async function fetchTimeline(days: number): Promise<TimelineItem[]> {
  const from = new Date(Date.now() - days * 86400000);
  const f = iso(from);
  const fd = day(from);
  const L = 120;
  const [inc, exp, tr, links, study, revs, focus, body, act, gadgets, tasks, habits, clients, projects, timers] = await Promise.all([
    safe<any>(supabase.from('incomes').select('id,title,amount_paise,txn_date,created_at').is('deleted_at', null).gte('txn_date', fd).order('txn_date', { ascending: false }).limit(L)),
    safe<any>(supabase.from('expenses').select('id,title,amount_paise,txn_date,created_at').is('deleted_at', null).gte('txn_date', fd).order('txn_date', { ascending: false }).limit(L)),
    safe<any>(supabase.from('transfers').select('id,title,amount_paise,txn_date,created_at').is('deleted_at', null).gte('txn_date', fd).order('txn_date', { ascending: false }).limit(L)),
    safe<any>(supabase.from('all_money_links').select('source_table,source_id,target_table,target_id,amount_paise,created_at').gte('created_at', f).order('created_at', { ascending: false }).limit(L)),
    safe<any>(supabase.from('study_sessions').select('id,title,minutes,session_date,created_at').is('deleted_at', null).gte('session_date', fd).order('session_date', { ascending: false }).limit(L)),
    safe<any>(supabase.from('revision_queue').select('id,chapter_id,chapter_name,step,feedback,done_at').eq('status', 'done').gte('done_at', f).limit(L)),
    safe<any>(supabase.from('focus_sessions').select('started_at,focused_minutes,blocked_attempts,end_reason').is('deleted_at', null).gte('started_at', f).limit(L)),
    safe<any>(supabase.from('body_measurements').select('id,measured_at,weight_kg,source').is('deleted_at', null).gte('measured_at', f).limit(L)),
    safe<any>(supabase.from('activity_daily').select('day,source,steps,updated_at').gte('day', fd).limit(L)),
    safe<any>(supabase.from('gadgets').select('id,name,last_sync_at,last_status').is('deleted_at', null).gte('last_sync_at', f)),
    safe<any>(supabase.from('tasks').select('id,title,completed_at').is('deleted_at', null).eq('status', 'completed').gte('completed_at', f).limit(L)),
    safe<any>(supabase.from('habit_logs').select('id,habit_id,log_date,created_at').gte('log_date', fd).limit(L)),
    safe<any>(supabase.from('clients').select('id,name,created_at').is('deleted_at', null).gte('created_at', f).limit(L)),
    safe<any>(supabase.from('projects').select('id,name,created_at').is('deleted_at', null).gte('created_at', f).limit(L)),
    safe<any>(supabase.from('timer_sessions').select('id,purpose,title,minutes,label,session_date,created_at').is('deleted_at', null).gte('session_date', fd).limit(L)),
  ]);
  // created_at gives the time of day; the txn date decides the day
  const when = (date: string, created: string) => (created && created.slice(0, 10) === date ? created : `${date}T12:00:00`);
  const out: TimelineItem[] = [];
  for (const r of inc) out.push({ key: `i${r.id}`, at: when(r.txn_date, r.created_at), kind: 'money', title: r.title || 'Income', sub: `+${formatINR(r.amount_paise)} · income`, icon: <ArrowDownLeft size={15} />, tone: 'income', to: `/r/incomes/${r.id}` });
  for (const r of exp) out.push({ key: `e${r.id}`, at: when(r.txn_date, r.created_at), kind: 'money', title: r.title || 'Expense', sub: `−${formatINR(r.amount_paise)} · expense`, icon: <ArrowUpRight size={15} />, tone: 'expense', to: `/r/expenses/${r.id}` });
  for (const r of tr) out.push({ key: `t${r.id}`, at: when(r.txn_date, r.created_at), kind: 'money', title: r.title || 'Transfer', sub: `${formatINR(r.amount_paise)} moved between accounts`, icon: <ArrowLeftRight size={15} />, tone: 'violet', to: `/r/transfers/${r.id}` });
  for (const r of links) out.push({ key: `l${r.source_id}${r.target_id}${r.created_at}`, at: r.created_at, kind: 'money', title: 'Money source linked', sub: `${formatINR(r.amount_paise)} · ${String(r.source_table).replace(/s$/, '')} → ${String(r.target_table).replace(/s$/, '')}`, icon: <Link2 size={15} />, tone: 'blue', to: `/r/${r.target_table}/${r.target_id}` });
  for (const r of study) out.push({ key: `s${r.id}`, at: when(r.session_date, r.created_at), kind: 'study', title: r.title || 'Study session', sub: `${r.minutes} min studied`, icon: <Timer size={15} />, tone: 'primary', to: `/r/study_sessions/${r.id}` });
  for (const r of revs) out.push({ key: `r${r.id}`, at: r.done_at, kind: 'study', title: `Revised ${r.chapter_name}`, sub: `Revision ${r.step} · ${r.feedback ?? ''}`, icon: <RotateCcw size={15} />, tone: 'violet', to: `/r/chapters/${r.chapter_id}` });
  for (const r of focus) out.push({ key: `f${r.started_at}`, at: r.started_at, kind: 'study', title: 'Focus session', sub: `${r.focused_minutes} min · blocked ${r.blocked_attempts}× · ${String(r.end_reason).replace('_', ' ')}`, icon: <ShieldBan size={15} />, tone: 'teal', to: '/focus-mode' });
  for (const r of body) out.push({ key: `b${r.id}`, at: r.measured_at, kind: 'health', title: `Weight ${Number(r.weight_kg).toFixed(1)} kg`, sub: r.source === 'manual' ? 'Added manually' : 'Synced', icon: <Scale size={15} />, tone: 'teal', to: '/weight' });
  for (const r of act) if (r.steps != null) out.push({ key: `a${r.day}${r.source}`, at: r.updated_at, kind: 'health', title: `${Number(r.steps).toLocaleString('en-IN')} steps`, sub: `${r.day} · ${r.source === 'watch_ble' ? 'watch' : 'Health Connect'}`, icon: <Footprints size={15} />, tone: 'pink', to: '/health' });
  for (const r of gadgets) out.push({ key: `g${r.id}`, at: r.last_sync_at, kind: 'health', title: `${r.name} synced`, sub: r.last_status ?? 'Device check', icon: <Watch size={15} />, tone: 'blue', to: `/gadgets/${r.id}` });
  for (const r of tasks) out.push({ key: `k${r.id}`, at: r.completed_at, kind: 'tasks', title: r.title, sub: 'Task completed', icon: <CircleCheck size={15} />, tone: 'primary', to: `/r/tasks/${r.id}` });
  for (const r of habits) out.push({ key: `h${r.id}`, at: when(r.log_date, r.created_at), kind: 'tasks', title: 'Habit done', sub: r.log_date, icon: <Flame size={15} />, tone: 'amber', to: '/habits' });
  for (const r of clients) out.push({ key: `c${r.id}`, at: r.created_at, kind: 'business', title: `New client: ${r.name}`, sub: 'Client added', icon: <Briefcase size={15} />, tone: 'teal', to: `/r/clients/${r.id}` });
  for (const r of projects) out.push({ key: `p${r.id}`, at: r.created_at, kind: 'business', title: `New project: ${r.name}`, sub: 'Project added', icon: <FolderKanban size={15} />, tone: 'blue', to: `/r/projects/${r.id}` });
  for (const r of timers)
    out.push({
      key: `ts${r.id}`, at: r.created_at, kind: r.purpose === 'business' ? 'business' : 'tasks',
      title: `${r.purpose === 'business' ? 'Work' : 'Personal'} focus · ${r.title}`, sub: `${r.minutes} min${r.label ? ` · ${r.label}` : ''}`,
      icon: <Timer size={15} />, tone: r.purpose === 'business' ? 'teal' : 'pink', to: '/pomodoro',
    });
  return out.filter((x) => x.at).sort((a, b) => b.at.localeCompare(a.at));
}

const FILTERS: { value: 'all' | Kind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'money', label: 'Money' },
  { value: 'study', label: 'Study' },
  { value: 'health', label: 'Health' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'business', label: 'Business' },
];

export function ActivityTimeline({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate();
  const [days, setDays] = useState(compact ? 7 : 14);
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(compact ? 6 : 40);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setItems(await fetchTimeline(d));
    setLoading(false);
  }, []);
  useEffect(() => {
    load(days);
  }, [days, load]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((x) => (filter === 'all' || x.kind === filter) && (!s || `${x.title} ${x.sub}`.toLowerCase().includes(s)));
  }, [items, filter, q]);

  if (items === null) return <Spinner />;

  if (compact) {
    const KIND_LABEL: Record<Kind, string> = { money: 'Money', study: 'Study', health: 'Health', tasks: 'Tasks', business: 'Business' };
    const top = list.slice(0, 5);
    return (
      <div className="glass rounded-[24px] p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <History size={20} className="text-primary" />
          <p className="min-w-0 flex-1 text-[17px] font-bold">Activity Timeline</p>
          <button type="button" onClick={() => nav('/timeline')} className="glass press flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
            See All <ArrowRight size={13} />
          </button>
        </div>
        {top.length === 0 ? (
          <p className="py-2 text-[13px] text-muted">Nothing in the last {days} days.</p>
        ) : (
          <div className="relative">
            <span className="absolute bottom-3 left-[7px] top-3 w-[2px] rounded-full" style={{ background: 'linear-gradient(var(--tone-income), var(--tone-violet), var(--tone-expense))', opacity: 0.6 }} />
            {top.map((x) => {
              const c = TONES[x.tone].solid;
              const d = new Date(x.at);
              const sameDay = d.toDateString() === new Date().toDateString();
              return (
                <button key={x.key} type="button" onClick={() => x.to && nav(x.to)} className="relative flex w-full items-center gap-3 py-2 text-left">
                  <span className="relative z-10 ml-[2px] h-3 w-3 shrink-0 rounded-full ring-2 ring-[var(--bg)]" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                  <IconBubble tone={x.tone} size={34}>{x.icon}</IconBubble>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{x.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {sameDay ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: TONES[x.tone].bg, color: TONES[x.tone].fg }}>
                    {KIND_LABEL[x.kind]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  let lastDay = '';
  return (
    <div className="space-y-2.5">
      {!compact && (
        <>
          <div className="glass flex items-center gap-2 rounded-[14px] px-3">
            <Search size={16} className="text-muted" />
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Chips value={filter} onChange={setFilter} options={FILTERS} />
        </>
      )}
      {list.length === 0 ? (
        <p className="px-1 text-[13px] text-muted">No activity in the last {days} days{filter !== 'all' ? ' for this filter' : ''}.</p>
      ) : (
        <div className="glass rounded-[20px] px-3.5 py-2">
          {list.slice(0, shown).map((x) => {
            const d = new Date(x.at);
            const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
            const head = label !== lastDay;
            lastDay = label;
            return (
              <div key={x.key}>
                {head && !compact && <p className="pb-1 pt-2 text-[11.5px] font-semibold text-muted">{label}</p>}
                <button type="button" onClick={() => x.to && nav(x.to)} className="flex w-full items-center gap-3 py-2 text-left">
                  <IconBubble tone={x.tone} size={32}>
                    {x.icon}
                  </IconBubble>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{x.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">{x.sub}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {compact ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {compact ? (
        <Button full size="sm" onClick={() => nav('/timeline')}>
          See full timeline
        </Button>
      ) : list.length > shown ? (
        <Button full onClick={() => setShown((n) => n + 40)}>
          Show more
        </Button>
      ) : (
        <Button full loading={loading} onClick={() => setDays((d) => d + 30)}>
          Load older (before {new Date(Date.now() - days * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
        </Button>
      )}
    </div>
  );
}
