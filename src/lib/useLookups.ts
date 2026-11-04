import { useCallback, useEffect, useState } from 'react';
import { fetchLookups, type Account, type Category } from './db';

export function useLookups() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchLookups();
      setAccounts(r.accounts);
      setCategories(r.categories);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return accounts.find((a) => a.id === id)?.name ?? categories.find((c) => c.id === id)?.name ?? '—';
    },
    [accounts, categories],
  );

  return { accounts, categories, loaded, nameOf, reload: load };
}
