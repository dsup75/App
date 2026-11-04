// User-editable dropdown lists: built-in choices + the user's own additions,
// minus built-ins the user chose to hide (Settings → Manage lists).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PAYMENT_METHODS, PLATFORMS, TASK_TYPES, UPI_APPS, type ListKey, type Option } from './tables';

export const BUILTIN: Record<ListKey, { title: string; options: Option[] }> = {
  payment_app: { title: 'Payment apps', options: UPI_APPS },
  payment_method: { title: 'Payment methods', options: PAYMENT_METHODS },
  task_type: { title: 'Task types', options: TASK_TYPES },
  platform: { title: 'Ad platforms', options: PLATFORMS },
};

export interface CustomOption {
  id: string;
  list_key: ListKey;
  value: string;
  label: string;
  hidden: boolean;
}

let cache: CustomOption[] | null = null;
const listeners = new Set<(o: CustomOption[]) => void>();

export async function loadCustomOptions(force = false): Promise<CustomOption[]> {
  if (cache && !force) return cache;
  const { data } = await supabase.from('custom_options').select('id,list_key,value,label,hidden').is('deleted_at', null).order('sort').order('label');
  cache = (data as CustomOption[]) ?? [];
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function mergeOptions(key: ListKey, builtin: Option[], custom: CustomOption[]): Option[] {
  const mine = custom.filter((c) => c.list_key === key);
  const hidden = new Set(mine.filter((c) => c.hidden).map((c) => c.value));
  const renamed = new Map(mine.filter((c) => !c.hidden).map((c) => [c.value, c.label]));
  const out = builtin.filter((o) => !hidden.has(o.value)).map((o) => ({ value: o.value, label: renamed.get(o.value) ?? o.label }));
  for (const c of mine) if (!c.hidden && !builtin.some((b) => b.value === c.value)) out.push({ value: c.value, label: c.label });
  return out;
}

export function useCustomOptions() {
  const [opts, setOpts] = useState<CustomOption[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setOpts);
    loadCustomOptions().then(setOpts).catch(() => {});
    return () => {
      listeners.delete(setOpts);
    };
  }, []);
  const reload = useCallback(() => loadCustomOptions(true), []);
  const optionsFor = useCallback((key: ListKey, builtin: Option[]) => mergeOptions(key, builtin, opts), [opts]);
  /** label for a stored value, including custom ones */
  const labelOf = useCallback(
    (key: ListKey, value: string | null | undefined) => {
      if (!value) return '—';
      return mergeOptions(key, BUILTIN[key].options, opts).find((o) => o.value === value)?.label ?? opts.find((o) => o.list_key === key && o.value === value)?.label ?? BUILTIN[key].options.find((o) => o.value === value)?.label ?? value;
    },
    [opts],
  );
  return { custom: opts, optionsFor, labelOf, reload };
}
