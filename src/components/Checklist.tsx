// Sub-checklist for a task or habit, with progress %.
// Tasks: an item stays ticked. Habits: ticks count for today only, so the list is fresh every day.
import { useCallback, useEffect, useState } from 'react';
import { Check, Circle, Plus, RotateCcw, Trash2, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { todayISO } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { Card, ProgressBar, cx } from './ui';

interface Item {
  id: string;
  title: string;
  done_on: string | null;
  sort: number;
}

export function Checklist({ parentTable, parentId }: { parentTable: 'tasks' | 'habits'; parentId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [text, setText] = useState('');
  const today = todayISO();
  const isDone = (i: Item) => (parentTable === 'habits' ? i.done_on === today : !!i.done_on);

  const load = useCallback(() => {
    supabase
      .from('checklist_items')
      .select('id,title,done_on,sort')
      .eq('parent_table', parentTable)
      .eq('parent_id', parentId)
      .is('deleted_at', null)
      .order('sort')
      .order('created_at')
      .then(({ data, error }) => setItems(error ? [] : ((data as Item[]) ?? [])));
  }, [parentTable, parentId]);
  useEffect(load, [load]);

  const add = async () => {
    const title = text.trim();
    if (!title) return;
    const { error } = await supabase.from('checklist_items').insert({ parent_table: parentTable, parent_id: parentId, title, sort: (items?.length ?? 0) + 1 });
    if (error) return toast(friendlyError(error), 'error');
    setText('');
    load();
  };
  const toggle = async (i: Item) => {
    const next = isDone(i) ? null : today;
    setItems((x) => (x ?? []).map((y) => (y.id === i.id ? { ...y, done_on: next } : y)));
    const { error } = await supabase.from('checklist_items').update({ done_on: next }).eq('id', i.id);
    if (error) {
      toast(friendlyError(error), 'error');
      load();
    }
  };
  const remove = async (i: Item) => {
    const { error } = await supabase.from('checklist_items').update({ deleted_at: new Date().toISOString() }).eq('id', i.id);
    if (error) return toast(friendlyError(error), 'error');
    load();
  };
  const resetAll = async () => {
    const ids = (items ?? []).filter(isDone).map((i) => i.id);
    if (!ids.length) return;
    const { error } = await supabase.from('checklist_items').update({ done_on: null }).in('id', ids);
    if (error) return toast(friendlyError(error), 'error');
    load();
  };

  if (items === null) return null;
  const done = items.filter(isDone).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-primary" />
        <p className="min-w-0 flex-1 text-[14px] font-semibold">Checklist</p>
        {items.length > 0 && (
          <span className="text-[12.5px] text-muted">
            {done}/{items.length} · {pct}%
          </span>
        )}
      </div>
      {items.length > 0 && <ProgressBar pct={pct} />}
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2.5">
          <button type="button" aria-label={isDone(i) ? 'Mark not done' : 'Mark done'} onClick={() => toggle(i)} className="shrink-0">
            {isDone(i) ? (
              <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[var(--primary-2)] text-[var(--on-primary)]">
                <Check size={13} strokeWidth={3} />
              </span>
            ) : (
              <Circle size={20} className="text-muted" />
            )}
          </button>
          <span className={cx('min-w-0 flex-1 text-[14px]', isDone(i) && 'text-muted line-through')}>{i.title}</span>
          <button type="button" aria-label="Remove item" onClick={() => remove(i)} className="p-1 text-muted">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="field min-w-0 flex-1 py-2 text-[14px]"
          placeholder={parentTable === 'habits' ? 'Add a step (resets daily)' : 'Add a sub-task'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          enterKeyHint="done"
        />
        <button type="button" aria-label="Add item" onClick={add} className="liquid flex h-10 w-10 items-center justify-center rounded-full">
          <Plus size={16} />
        </button>
      </div>
      {parentTable === 'tasks' && done > 0 && (
        <button type="button" onClick={resetAll} className="flex items-center gap-1 text-[12.5px] font-semibold text-primary">
          <RotateCcw size={13} /> Untick all (for the next round)
        </button>
      )}
    </Card>
  );
}
