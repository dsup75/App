import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Briefcase, FileText, Megaphone, FolderKanban, ChevronRight } from 'lucide-react';
import { EntityIcon } from '../components/EntityIcon';
import { supabase } from '../lib/supabase';
import { friendlyError, updateRecord, type Row } from '../lib/db';
import { formatINR } from '../lib/money';
import { todayISO } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordLine } from '../components/RecordLine';
import { TaskLine } from './Home';
import { Empty, ErrorBox, HeroCard, IconBubble, IconButton, List, ListRow, Page, SectionTitle, SeeAll, Segmented, Spinner } from '../components/ui';

type Tab = 'clients' | 'projects' | 'tasks' | 'invoices' | 'campaigns';

export function ClientsHub() {
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'clients';
  const { nameOf } = useLookups();
  const [clients, setClients] = useState<Row[] | null>(null);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [received, setReceived] = useState<Map<string, number>>(new Map());
  const [outstanding, setOutstanding] = useState(0);
  const [error, setError] = useState('');
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, t, k, inv, tot, pr, allInv] = await Promise.all([
        supabase.from('clients').select('*').is('deleted_at', null).order('name'),
        supabase.from('tasks').select('*').is('deleted_at', null).not('client_id', 'is', null).in('status', ['pending', 'in_progress', 'waiting']).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('campaigns').select('*').is('deleted_at', null).in('status', ['active', 'planned', 'paused']).order('end_date', { ascending: true, nullsFirst: false }),
        supabase.from('invoices').select('id,amount_paise,status').is('deleted_at', null).eq('status', 'sent'),
        supabase.from('invoice_totals').select('id,received_paise'),
        supabase.from('projects').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      ]);
      setProjects((pr.data as Row[]) ?? []);
      supabase
        .from('incomes')
        .select('client_id,amount_paise')
        .is('deleted_at', null)
        .not('client_id', 'is', null)
        .then(({ data }) => {
          const m = new Map<string, number>();
          for (const r of (data as any[]) ?? []) m.set(r.client_id, (m.get(r.client_id) ?? 0) + Number(r.amount_paise));
          setReceived(m);
        });
      setInvoices((allInv.data as Row[]) ?? []);
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

  const addPath =
    tab === 'clients' ? '/r/clients/new' : tab === 'projects' ? '/r/projects/new' : tab === 'tasks' ? '/r/tasks/new?area=business' : tab === 'invoices' ? '/r/invoices/new' : '/r/campaigns/new';

  return (
    <Page
      title="Work"
      subtitle="Clients • Projects • Growth"
      glyph="briefcase"
      right={
        <IconButton label="Add" onClick={() => nav(addPath)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <Segmented
        value={tab === 'campaigns' ? 'clients' : tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'clients', label: 'Clients' },
          { value: 'projects', label: 'Projects' },
          { value: 'tasks', label: 'Tasks' },
          { value: 'invoices', label: 'Invoices' },
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
          <>
            <SectionTitle right={<SeeAll onClick={() => nav('/r/clients/new')} label="+ Add" />}>My Clients</SectionTitle>
            <div className="space-y-2">
              {clients.map((c) => {
                const n = projects.filter((p) => p.client_id === c.id).length;
                const got = received.get(c.id) ?? 0;
                return (
                  <button key={c.id} type="button" onClick={() => nav(`/r/clients/${c.id}`)} className="glass press flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left">
                    <EntityIcon table="clients" id={c.id} fallback={Briefcase} fallbackTone="blue" size={44} brandName={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px] font-semibold">{c.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {n} Project{n === 1 ? '' : 's'} • {formatINR(got)}
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-muted" />
                  </button>
                );
              })}
            </div>
            {outstanding > 0 && <p className="px-1 text-[12px] text-muted">To receive from clients: {formatINR(outstanding)} · {active} active · {followUps} follow-ups</p>}
            <div className="grid grid-cols-3 gap-2">
              <Shortcut icon={<Megaphone size={16} />} label="Campaigns" onClick={() => setParams({ tab: 'campaigns' }, { replace: true })} />
              <Shortcut icon={<FileText size={16} />} label="Requests" onClick={() => nav('/requests')} />
              <Shortcut icon={<FolderKanban size={16} />} label="All projects" onClick={() => nav('/projects')} />
            </div>
            {tasks.filter((t) => t.due_date && t.due_date <= today).length > 0 && (
              <>
                <SectionTitle right={<SeeAll onClick={() => setParams({ tab: 'tasks' }, { replace: true })} />}>Today's Tasks</SectionTitle>
                <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">
                  {tasks
                    .filter((t) => t.due_date && t.due_date <= today)
                    .slice(0, 6)
                    .map((t) => (
                      <TaskLine key={t.id} task={t} today={today} onToggle={() => toggle(t)} onOpen={() => nav(`/r/tasks/${t.id}`)} extra={nameOf(t.client_id)} />
                    ))}
                </div>
              </>
            )}
          </>
        )
      ) : tab === 'projects' ? (
        projects.length === 0 ? (
          <Empty title="No projects yet" text="Add a project for a client to track its work and money." />
        ) : (
          <List>
            {projects.map((r) => (
              <RecordLine key={r.id} table="projects" row={r} nameOf={nameOf} />
            ))}
          </List>
        )
      ) : tab === 'invoices' ? (
        invoices.length === 0 ? (
          <Empty title="No invoices yet" text="Create an invoice and share it with a UPI payment link." />
        ) : (
          <List>
            {invoices.map((r) => (
              <RecordLine key={r.id} table="invoices" row={r} nameOf={nameOf} />
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


