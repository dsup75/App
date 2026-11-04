import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchActive, friendlyError, updateRecord, type Row } from '../lib/db';
import { todayISO } from '../lib/dates';
import { AREAS } from '../lib/tables';
import { useToast } from '../context/ToastContext';
import { Chips, Empty, ErrorBox, IconButton, Page, Segmented, Spinner } from '../components/ui';
import { TaskLine } from './Home';

type View = 'today' | 'upcoming' | 'all' | 'done';
type Area = 'all' | 'personal' | 'study' | 'business';
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function Tasks() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('today');
  const [area, setArea] = useState<Area>('all');
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await fetchActive('tasks', 'created_at', false));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    if (!rows) return [];
    const open = (t: Row) => t.status === 'pending' || t.status === 'in_progress';
    let r = rows.filter((t) => area === 'all' || t.area === area);
    if (view === 'today') r = r.filter((t) => open(t) && (!t.due_date || t.due_date <= today));
    if (view === 'upcoming') r = r.filter((t) => open(t) && t.due_date && t.due_date > today);
    if (view === 'all') r = r.filter(open);
    if (view === 'done') r = r.filter((t) => t.status === 'completed' || t.status === 'cancelled');
    return [...r].sort((a, b) => {
      if (view === 'done') return String(b.completed_at ?? b.updated_at).localeCompare(String(a.completed_at ?? a.updated_at));
      const d = String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'));
      return d || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }, [rows, view, area, today]);

  const toggle = async (t: Row) => {
    const status = t.status === 'completed' ? 'pending' : 'completed';
    setRows((all) => all?.map((x) => (x.id === t.id ? { ...x, status, completed_at: status === 'completed' ? new Date().toISOString() : null } : x)) ?? null);
    try {
      await updateRecord('tasks', t.id, { status });
      if (status === 'completed') toast('Task completed');
    } catch (e) {
      toast(friendlyError(e), 'error');
      load();
    }
  };

  return (
    <Page
      title="Tasks"
      back
      right={
        <IconButton label="Add task" onClick={() => nav('/r/tasks/new')}>
          <Plus size={20} />
        </IconButton>
      }
    >
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'all', label: 'Open' },
          { value: 'done', label: 'Done' },
        ]}
      />
      <Chips value={area} onChange={setArea} options={[{ value: 'all', label: 'All' }, ...(AREAS as { value: Area; label: string }[])]} />
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="No tasks here" text="Tap + to add one." />
      ) : (
        <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[22px]">
          {list.map((t) => (
            <TaskLine key={t.id} task={t} today={today} onToggle={() => toggle(t)} onOpen={() => nav(`/r/tasks/${t.id}`)} />
          ))}
        </div>
      )}
    </Page>
  );
}
