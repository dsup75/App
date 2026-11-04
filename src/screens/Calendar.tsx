import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { currentMonth, monthLabel, monthRange, shiftMonth, todayISO, formatDate } from '../lib/dates';
import { formatINR } from '../lib/money';
import { Empty, ErrorBox, IconButton, List, ListRow, Page, Segmented, Spinner, cx, TONES, type Tone } from '../components/ui';

interface Item {
  date: string;
  title: string;
  kind: string;
  tone: Tone;
  to: string;
  time?: string;
}

/** Unified calendar: tasks, events, study, tests, exams, client & campaign deadlines, invoice / loan / request dues */
export function CalendarScreen() {
  const nav = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selected, setSelected] = useState(todayISO());
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setItems(null);
    const { from: f0 } = monthRange(shiftMonth(month, -1));
    const { to: t0 } = monthRange(shiftMonth(month, 1));
    try {
      const r = await Promise.all([
        supabase.from('tasks').select('id,title,due_date,status,client_id').is('deleted_at', null).gte('due_date', f0).lte('due_date', t0),
        supabase.from('events').select('id,title,event_date,start_time').is('deleted_at', null).gte('event_date', f0).lte('event_date', t0),
        supabase.from('study_sessions').select('id,title,session_date,minutes').is('deleted_at', null).gte('session_date', f0).lte('session_date', t0),
        supabase.from('mock_tests').select('id,name,test_date').is('deleted_at', null).gte('test_date', f0).lte('test_date', t0),
        supabase.from('exams').select('id,name,exam_date').is('deleted_at', null).gte('exam_date', f0).lte('exam_date', t0),
        supabase.from('invoices').select('id,invoice_no,due_date,status').is('deleted_at', null).eq('status', 'sent').gte('due_date', f0).lte('due_date', t0),
        supabase.from('loans').select('id,person,direction,due_date').is('deleted_at', null).gte('due_date', f0).lte('due_date', t0),
        supabase.from('payment_requests').select('id,title,due_date,status').is('deleted_at', null).eq('status', 'pending').gte('due_date', f0).lte('due_date', t0),
        supabase.from('projects').select('id,name,deadline').is('deleted_at', null).gte('deadline', f0).lte('deadline', t0),
        supabase.from('campaigns').select('id,name,end_date').is('deleted_at', null).gte('end_date', f0).lte('end_date', t0),
      ]);
      for (const x of r) if (x.error) throw x.error;
      const d = r.map((x) => (x.data as any[]) ?? []);
      setItems([
        ...d[0].map((x) => ({ date: x.due_date, title: x.title, kind: x.client_id ? 'Client task' : 'Task', tone: (x.status === 'completed' ? 'muted' : 'blue') as Tone, to: `/r/tasks/${x.id}` })),
        ...d[1].map((x) => ({ date: x.event_date, title: x.title, kind: 'Event', tone: 'violet' as Tone, to: `/r/events/${x.id}`, time: x.start_time?.slice(0, 5) })),
        ...d[2].map((x) => ({ date: x.session_date, title: `${x.title} · ${x.minutes} min`, kind: 'Study', tone: 'primary' as Tone, to: `/r/study_sessions/${x.id}` })),
        ...d[3].map((x) => ({ date: x.test_date, title: x.name, kind: 'Test', tone: 'violet' as Tone, to: `/r/mock_tests/${x.id}` })),
        ...d[4].map((x) => ({ date: x.exam_date, title: x.name, kind: 'Exam', tone: 'expense' as Tone, to: `/r/exams/${x.id}` })),
        ...d[5].map((x) => ({ date: x.due_date, title: `Invoice ${x.invoice_no}`, kind: 'Invoice due', tone: 'teal' as Tone, to: `/r/invoices/${x.id}` })),
        ...d[6].map((x) => ({ date: x.due_date, title: `${x.direction === 'lent' ? 'Collect from' : 'Repay'} ${x.person}`, kind: 'Loan due', tone: 'amber' as Tone, to: `/r/loans/${x.id}` })),
        ...d[7].map((x) => ({ date: x.due_date, title: x.title, kind: 'Payment due', tone: 'teal' as Tone, to: `/r/payment_requests/${x.id}` })),
        ...d[8].map((x) => ({ date: x.deadline, title: x.name, kind: 'Project deadline', tone: 'pink' as Tone, to: `/r/projects/${x.id}` })),
        ...d[9].map((x) => ({ date: x.end_date, title: x.name, kind: 'Campaign ends', tone: 'pink' as Tone, to: `/r/campaigns/${x.id}` })),
      ]);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    (items ?? []).forEach((i) => m.set(i.date, [...(m.get(i.date) ?? []), i]));
    return m;
  }, [items]);

  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(y, mo, 0).getDate();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const weekDates = useMemo(() => {
    const d = new Date(selected + 'T00:00:00');
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday);
      x.setDate(monday.getDate() + i);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    });
  }, [selected]);

  const listDates = view === 'day' ? [selected] : view === 'week' ? weekDates : [selected];

  return (
    <Page
      title="Calendar"
      back
      right={
        <IconButton label="Add event" onClick={() => nav(`/r/events/new?event_date=${selected}`)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'week', label: 'Week' },
          { value: 'day', label: 'Day' },
        ]}
      />
      <div className="flex items-center justify-between">
        <IconButton label="Previous" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} />
        </IconButton>
        <span className="text-[15px] font-semibold">{monthLabel(month)}</span>
        <IconButton label="Next" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={18} />
        </IconButton>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !items ? (
        <Spinner />
      ) : (
        <>
          {view === 'month' && (
            <div className="glass rounded-[18px] p-2.5">
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-muted">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((c, i) =>
                  c ? (
                    <button
                      key={i}
                      onClick={() => setSelected(c)}
                      className={cx(
                        'flex aspect-square flex-col items-center justify-center rounded-[10px] text-[13px]',
                        c === selected ? 'liquid-primary' : c === todayISO() ? 'bg-[var(--primary-soft)] font-bold text-primary' : '',
                      )}
                    >
                      {Number(c.slice(8))}
                      <span className="mt-0.5 flex h-1.5 gap-0.5">
                        {(byDate.get(c) ?? []).slice(0, 3).map((it, j) => (
                          <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: c === selected ? '#fff' : TONES[it.tone].solid }} />
                        ))}
                      </span>
                    </button>
                  ) : (
                    <span key={i} />
                  ),
                )}
              </div>
            </div>
          )}
          {view !== 'month' && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
              {weekDates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelected(d)}
                  className={cx('liquid flex w-12 shrink-0 flex-col items-center rounded-[14px] py-2', d === selected && 'liquid-primary')}
                >
                  <span className="text-[10px] opacity-75">{new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                  <span className="text-[16px] font-bold">{Number(d.slice(8))}</span>
                </button>
              ))}
            </div>
          )}

          {listDates.map((d) => {
            const list = (byDate.get(d) ?? []).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
            return (
              <div key={d} className="space-y-2">
                <p className="px-0.5 pt-1 text-[14px] font-semibold">{formatDate(d)}</p>
                {list.length === 0 ? (
                  view === 'week' ? <p className="px-1 text-[12.5px] text-muted">Nothing</p> : <Empty title="Nothing on this day" />
                ) : (
                  <List>
                    {list.map((it, i) => (
                      <ListRow
                        key={i}
                        icon={<span className="h-8 w-1.5 rounded-full" style={{ background: TONES[it.tone].solid }} />}
                        title={it.title}
                        subtitle={[it.kind, it.time].filter(Boolean).join(' · ')}
                        onClick={() => nav(it.to)}
                        chevron
                      />
                    ))}
                  </List>
                )}
              </div>
            );
          })}
        </>
      )}
    </Page>
  );
}

export { formatINR };
