import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Flame, Sunrise, Moon, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, type Row } from '../lib/db';
import { todayISO, toISODate } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { Empty, ErrorBox, HeroCard, IconButton, Page, ProgressBar, SectionTitle, Spinner, cx } from '../components/ui';

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(toISODate(d));
  }
  return out;
}

export function HabitsScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [habits, setHabits] = useState<Row[] | null>(null);
  const [logs, setLogs] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const days = lastDays(7);
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    const from = lastDays(60)[0];
    const [h, l] = await Promise.all([
      supabase.from('habits').select('*').is('deleted_at', null).order('created_at'),
      supabase.from('habit_logs').select('habit_id,log_date').gte('log_date', from),
    ]);
    if (h.error || l.error) return setError(friendlyError(h.error || l.error));
    setHabits(h.data as Row[]);
    setLogs(new Set(((l.data as any[]) ?? []).map((x) => `${x.habit_id}|${x.log_date}`)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (habitId: string, date: string) => {
    const key = `${habitId}|${date}`;
    const on = logs.has(key);
    setLogs((s) => {
      const n = new Set(s);
      if (on) n.delete(key);
      else n.add(key);
      return n;
    });
    const res = on
      ? await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', date)
      : await supabase.from('habit_logs').insert({ habit_id: habitId, log_date: date });
    if (res.error) {
      toast(friendlyError(res.error), 'error');
      load();
    }
  };

  const streak = (id: string) => {
    let n = 0;
    const d = new Date();
    if (!logs.has(`${id}|${toISODate(d)}`)) d.setDate(d.getDate() - 1);
    while (logs.has(`${id}|${toISODate(d)}`)) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };

  if (error) return <Page title="Habits" back><ErrorBox message={error} onRetry={load} /></Page>;
  if (!habits) return <Page title="Habits" back><Spinner /></Page>;

  const doneToday = habits.filter((h) => logs.has(`${h.id}|${today}`)).length;
  const groups: { slot: string; title: string; icon: ReactNode }[] = [
    { slot: 'morning', title: 'Morning routine', icon: <Sunrise size={15} /> },
    { slot: 'evening', title: 'Evening routine', icon: <Moon size={15} /> },
    { slot: 'anytime', title: 'Anytime', icon: <Sparkles size={15} /> },
  ];

  return (
    <Page
      title="Habits & Routine"
      back
      right={
        <IconButton label="Add habit" onClick={() => nav('/r/habits/new')}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <HeroCard>
        <p className="text-[13px] opacity-80">Today</p>
        <p className="mt-1 text-[28px] font-bold">
          {doneToday}/{habits.length} done
        </p>
        <div className="mt-2">
          <ProgressBar pct={habits.length ? (doneToday / habits.length) * 100 : 0} color="#7CE0B0" />
        </div>
      </HeroCard>

      {habits.length === 0 && <Empty title="No habits yet" text="Add morning and evening routine items, e.g. 'Wake up 5:30', 'Revise formulas'." />}

      {groups.map((g) => {
        const list = habits.filter((h) => h.slot === g.slot);
        if (!list.length) return null;
        return (
          <div key={g.slot} className="space-y-2">
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                {g.icon} {g.title}
              </span>
            </SectionTitle>
            {list.map((h) => {
              const weekDone = days.filter((d) => logs.has(`${h.id}|${d}`)).length;
              const st = streak(h.id);
              const todayOn = logs.has(`${h.id}|${today}`);
              return (
                <div key={h.id} className="glass rounded-[18px] p-3.5">
                  <div className="flex items-center gap-3">
                    <button
                      aria-label="Done today"
                      onClick={() => toggle(h.id, today)}
                      className={cx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-90',
                        todayOn ? 'bg-[var(--primary-2)] text-white' : 'bg-[var(--card-2)] text-muted',
                      )}
                      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
                    >
                      <Check size={18} strokeWidth={3} />
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/r/habits/${h.id}`)}>
                      <p className="truncate text-[14.5px] font-semibold">{h.name}</p>
                      <p className="text-[12px] text-muted">
                        {weekDone}/{h.target_per_week} this week
                      </p>
                    </button>
                    {st > 0 && (
                      <span className="flex items-center gap-1 text-[13px] font-semibold text-amber-500">
                        <Flame size={15} /> {st}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex justify-between">
                    {days.map((d) => {
                      const on = logs.has(`${h.id}|${d}`);
                      return (
                        <button key={d} onClick={() => toggle(h.id, d)} className="flex flex-col items-center gap-1">
                          <span className="text-[10px] text-muted">{new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
                          <span className={cx('h-6 w-6 rounded-full', on ? 'bg-[var(--primary-2)]' : 'bg-[var(--hairline)]')} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </Page>
  );
}
