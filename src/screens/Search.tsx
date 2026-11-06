// One search for everything: entries, people, clients, tasks, notes…
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TABLES, type TableName } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { formatINR } from '../lib/money';
import { formatDate } from '../lib/dates';
import { RecordLine } from '../components/RecordLine';
import { Empty, List, ListRow, Page, SectionTitle, Skeleton } from '../components/ui';
import type { Row } from '../lib/db';

const TARGETS: { table: TableName; cols: string[] }[] = [
  { table: 'incomes', cols: ['title', 'payer_name', 'client_name', 'reference', 'notes'] },
  { table: 'expenses', cols: ['title', 'reference', 'notes'] },
  { table: 'transfers', cols: ['title', 'notes'] },
  { table: 'loans', cols: ['person', 'notes'] },
  { table: 'recurring_rules', cols: ['title', 'notes'] },
  { table: 'clients', cols: ['name', 'contact_person', 'phone', 'email'] },
  { table: 'client_contacts', cols: ['name', 'role', 'phone'] },
  { table: 'invoices', cols: ['invoice_no', 'title'] },
  { table: 'payment_requests', cols: ['title', 'client_name'] },
  { table: 'tasks', cols: ['title', 'notes'] },
  { table: 'projects', cols: ['name', 'notes'] },
  { table: 'campaigns', cols: ['name', 'notes'] },
  { table: 'notes', cols: ['title', 'body'] },
  { table: 'events', cols: ['title', 'location'] },
  { table: 'subjects', cols: ['name'] },
  { table: 'chapters', cols: ['name'] },
  { table: 'exams', cols: ['name'] },
  { table: 'habits', cols: ['name'] },
  { table: 'shopping_items', cols: ['name'] },
  { table: 'savings_goals', cols: ['name'] },
  { table: 'accounts', cols: ['name', 'upi_id'] },
];

export function SearchScreen() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ table: TableName; rows: Row[] }[] | null>(null);
  const [lines, setLines] = useState<Row[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[,()%*\\]/g, ' ').trim();
    if (term.length < 2) {
      setRes(null);
      setLines([]);
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const out = await Promise.all(
        TARGETS.map(async (x) => {
          const { data } = await supabase
            .from(x.table)
            .select('*')
            .is('deleted_at', null)
            .or(x.cols.map((c) => `${c}.ilike.${like}`).join(','))
            .order('created_at', { ascending: false })
            .limit(8);
          return { table: x.table, rows: (data as Row[]) ?? [] };
        }),
      );
      // UTR / paid by / paid to inside payment parts
      const pl = await supabase
        .from('account_movements')
        .select('id,parent_table,parent_id,amount_paise,direction,txn_date,reference,party_name,title')
        .or(`reference.ilike.${like},party_name.ilike.${like}`)
        .limit(10);
      if (my !== seq.current) return;
      setRes(out.filter((x) => x.rows.length));
      setLines((pl.data as Row[]) ?? []);
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const count = (res ?? []).reduce((t, x) => t + x.rows.length, 0) + lines.length;

  return (
    <Page title="Search" subtitle="Entries, people, clients, tasks, notes, UTR numbers…" back>
      <div className="glass flex items-center gap-2 rounded-[14px] px-3">
        <SearchIcon size={17} className="shrink-0 text-muted" />
        <input
          ref={input}
          className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none"
          placeholder="Type at least 2 letters"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        {q && (
          <button aria-label="Clear" onClick={() => setQ('')} className="text-muted">
            <X size={16} />
          </button>
        )}
      </div>

      {q.trim().length < 2 ? (
        <p className="px-1 text-[13px] text-muted">Try a name (e.g. a client or staff), an amount word, a UTR number, a note or a task.</p>
      ) : busy && !res ? (
        <Skeleton rows={4} />
      ) : count === 0 ? (
        <Empty title="Nothing found" text={`No results for "${q.trim()}".`} />
      ) : (
        <>
          {lines.length > 0 && (
            <>
              <SectionTitle>Payment parts (UTR / person)</SectionTitle>
              <List>
                {lines.map((l) => (
                  <ListRow
                    key={l.id}
                    title={l.title}
                    subtitle={[formatDate(l.txn_date), l.party_name, l.reference && `UTR ${l.reference}`].filter(Boolean).join(' · ')}
                    right={<span className={'text-[14px] font-semibold ' + (l.direction === 'in' ? 'text-income' : 'text-expense')}>{formatINR(l.amount_paise)}</span>}
                    onClick={() => nav(`/r/${l.parent_table}/${l.parent_id}`)}
                    chevron
                  />
                ))}
              </List>
            </>
          )}
          {(res ?? []).map((g) => (
            <div key={g.table} className="space-y-2">
              <SectionTitle>{TABLES[g.table].plural}</SectionTitle>
              <List>
                {g.rows.map((r) => (
                  <RecordLine key={r.id} table={g.table} row={r} nameOf={nameOf} />
                ))}
              </List>
            </div>
          ))}
        </>
      )}
    </Page>
  );
}
