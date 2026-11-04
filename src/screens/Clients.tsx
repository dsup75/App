import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Briefcase, FileText, Megaphone, FolderKanban } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, updateRecord, type Row } from '../lib/db';
import { formatINR } from '../lib/money';
import { todayISO } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordLine } from '../components/RecordLine';
import { TaskLine } from './Home';
import { Empty, ErrorBox, HeroCard, IconBubble, IconButton, List, ListRow, Page, Segmented, Spinner } from '../components/ui';

type Tab = 'clients' | 'tasks' | 'campaigns';

export function ClientsHub() {
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'clients';
  const { nameOf } = useLookups();
  const [clients, setClients] = useState<Row[] | null>(null);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [error, setError] = useState('');
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, t, k, inv, tot] = await Promise.all([
        supabase.from('clients').select('*').is('deleted_at', null).order('name'),
        supabase.from('tasks').select('*').is('deleted_at', null).not('client_id', 'is', null).in('status', ['pending', 'in_progress', 'waiting']).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('campaigns').select('*').is('deleted_at', null).in('status', ['active', 'planned', 'paused']).order('end_date', { ascending: true, nullsFirst: false }),
        supabase.from('invoices').select('id,amount_paise,status').is('deleted_at', null).eq('status', 'sent'),
        supabase.from('invoice_totals').select('id,received_paise'),
      ]);
      for (const r of [c, t, k, inv, tot]) if (r.error) throw r.error;
      setClients(c.data as Row[]);
      setTasks(t.data as Row[]);
      setCampaigns(k.data as Row[]);
      const rec = new Map(((tot.data as any[]) ?? []).map((x) => [x.id, Number(x.received_paise)]));
      setOutstanding(((inv.data as any[]) ?? []).reduce((s, x) => s + Math.max(0, x.amount_paise - (rec.get(x.id) ?? 0)), 0));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => (clients ?? []).filter((c) => c.status === 'active').length, [clients]);
  const followUps = tasks.filter((t) => t.task_type === 'follow_up' || t.task_type === 'approval' || t.status === 'waiting').length;

  const toggle = async (t: Row) => {
    try {
      await updateRecord('tasks', t.id, { status: 'completed' });
      toast('Task completed');
      load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const addPath = tab === 'clients' ? '/r/clients/new' : tab === 'tasks' ? '/r/tasks/new?area=business' : '/r/campaigns/new';

  return (
    <Page
      title="Clients"
      right={
        <IconButton label="Add" onClick={() => nav(addPath)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <HeroCard onClick={() => nav('/invoices')}>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[11.5px] opacity-80">Active clients</p>
            <p className="text-[22px] font-bold">{active}</p>
          </div>
          <div>
            <p className="text-[11.5px] opacity-80">Follow-ups</p>
            <p className="text-[22px] font-bold">{followUps}</p>
          </div>
          <div>
            <p className="text-[11.5px] opacity-80">To receive</p>
            <p className="truncate text-[18px] font-bold leading-[33px]">{formatINR(outstanding)}</p>
          </div>
        </div>
      </HeroCard>

      <div className="grid grid-cols-3 gap-2">
        <Shortcut icon={<FileText size={16} />} label="Invoices" onClick={() => nav('/invoices')} />
        <Shortcut icon={<FolderKanban size={16} />} label="Projects" onClick={() => nav('/projects')} />
        <Shortcut icon={<Megaphone size={16} />} label="Campaigns" onClick={() => nav('/campaigns')} />
      </div>

      <Segmented
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'clients', label: 'Clients' },
          { value: 'tasks', label: 'Client tasks' },
          { value: 'campaigns', label: 'Live campaigns' },
        ]}
      />

      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !clients ? (
        <Spinner />
      ) : tab === 'clients' ? (
        clients.length === 0 ? (
          <Empty title="No clients yet" text="Add your first client to track tasks, invoices and campaigns." />
        ) : (
          <List>
            {clients.map((c) => (
              <RecordLine key={c.id} table="clients" row={c} nameOf={nameOf} />
            ))}
          </List>
        )
      ) : tab === 'tasks' ? (
        tasks.length === 0 ? (
          <Empty title="No open client tasks" />
        ) : (
          <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">
            {tasks.map((t) => (
              <TaskLine key={t.id} task={t} today={today} onToggle={() => toggle(t)} onOpen={() => nav(`/r/tasks/${t.id}`)} extra={nameOf(t.client_id)} />
            ))}
          </div>
        )
      ) : campaigns.length === 0 ? (
        <Empty title="No live campaigns" />
      ) : (
        <List>
          {campaigns.map((c) => (
            <ListRow
              key={c.id}
              icon={<IconBubble tone="pink"><Briefcase size={16} /></IconBubble>}
              title={c.name}
              subtitle={`${nameOf(c.client_id)} · ${c.status}${c.end_date ? ` · ends ${c.end_date}` : ''}`}
              right={c.budget_paise ? <span className="text-[13px] font-semibold">{formatINR(c.budget_paise)}</span> : undefined}
              onClick={() => nav(`/r/campaigns/${c.id}`)}
            />
          ))}
        </List>
      )}
    </Page>
  );
}

export function Shortcut({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass flex items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-[12.5px] font-semibold active:scale-95 transition-transform">
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}


