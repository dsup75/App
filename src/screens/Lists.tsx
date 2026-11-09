// Settings → Manage lists: categories, accounts, clients + staff, and every editable dropdown.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Pencil, Eye, EyeOff, ChevronDown, ChevronRight, Check, X, Tag } from 'lucide-react';
import { EntityIcon, IconPickerSheet } from '../components/EntityIcon';
import { supabase } from '../lib/supabase';
import { createRecord, friendlyError, softDelete, updateRecord, type Row } from '../lib/db';
import { BUILTIN, loadCustomOptions, useCustomOptions } from '../lib/options';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import type { ListKey } from '../lib/tables';
import { Badge, Button, Card, Empty, IconButton, List, ListRow, Page, SectionTitle, Segmented, Spinner, cx } from '../components/ui';

type Tab = 'categories' | 'clients' | 'dropdowns' | 'accounts';

export function ListsScreen() {
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <Page title="Manage lists" subtitle="Add, rename, hide or delete anything you pick from in forms." back>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'categories', label: 'Categories' },
          { value: 'clients', label: 'Clients' },
          { value: 'dropdowns', label: 'Dropdowns' },
          { value: 'accounts', label: 'Accounts' },
        ]}
      />
      {tab === 'categories' && <CategoriesEditor />}
      {tab === 'clients' && <ClientsEditor />}
      {tab === 'dropdowns' && <DropdownsEditor />}
      {tab === 'accounts' && <AccountsEditor />}
    </Page>
  );
}

/* Inline "type a name + Add" row */
function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!v.trim()) return;
    setBusy(true);
    try {
      await onAdd(v.trim());
      setV('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2">
      <input className="field flex-1" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <Button variant="primary" loading={busy} onClick={go} disabled={!v.trim()}>
        <Plus size={15} /> Add
      </Button>
    </div>
  );
}

/* Editable line: tap pencil to rename, trash to delete */
function EditLine({
  label, sub, onRename, onDelete, right, icon,
}: { label: string; sub?: string; onRename?: (v: string) => Promise<void>; onDelete?: () => Promise<void>; right?: ReactNode; icon?: { table: string; id: string } }) {
  const [edit, setEdit] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [v, setV] = useState(label);
  const save = async () => {
    if (v.trim() && v.trim() !== label && onRename) await onRename(v.trim());
    setEdit(false);
  };
  return (
    <div className="flex min-h-[50px] items-center gap-2 px-3.5 py-2">
      {edit ? (
        <>
          <input autoFocus className="field flex-1 py-2" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button aria-label="Save" onClick={save} className="text-primary">
            <Check size={18} />
          </button>
          <button aria-label="Cancel" onClick={() => { setV(label); setEdit(false); }} className="text-muted">
            <X size={18} />
          </button>
        </>
      ) : (
        <>
          {icon && (
            <button type="button" aria-label="Change icon" onClick={() => setIconOpen(true)} className="shrink-0">
              <EntityIcon table={icon.table} id={icon.id} fallback={Tag} fallbackTone="muted" size={32} />
            </button>
          )}
          {icon && <IconPickerSheet open={iconOpen} onClose={() => setIconOpen(false)} table={icon.table} id={icon.id} title={`Icon for ${label}`} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-medium">{label}</p>
            {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
          </div>
          {right}
          {onRename && (
            <button aria-label="Rename" onClick={() => setEdit(true)} className="p-1.5 text-muted">
              <Pencil size={15} />
            </button>
          )}
          {onDelete && (
            <button aria-label="Delete" onClick={onDelete} className="p-1.5 text-danger">
              <Trash2 size={15} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function useRun() {
  const toast = useToast();
  const { reload } = useLookups();
  return async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      reload();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
}

/* ---------------- Categories ---------------- */
function CategoriesEditor() {
  const { categories, loaded, reload } = useLookups();
  const run = useRun();
  if (!loaded) return <Spinner />;
  return (
    <>
      {(['expense', 'income'] as const).map((kind) => (
        <div key={kind} className="space-y-2">
          <SectionTitle>{kind === 'expense' ? 'Expense categories' : 'Income categories'}</SectionTitle>
          <AddRow placeholder={`New ${kind} category`} onAdd={(name) => run(() => createRecord('categories', { name, kind }), 'Category added').then(reload)} />
          <List>
            {categories
              .filter((c) => c.kind === kind && !c.deleted_at)
              .map((c) => (
                <EditLine
                  key={c.id}
                  label={c.name}
                  icon={{ table: 'categories', id: c.id }}
                  onRename={(name) => run(() => updateRecord('categories', c.id, { name }), 'Renamed')}
                  onDelete={() => run(() => softDelete('categories', c.id), 'Moved to Recycle Bin')}
                />
              ))}
          </List>
        </div>
      ))}
    </>
  );
}

/* ---------------- Clients + staff ---------------- */
function ClientsEditor() {
  const nav = useNavigate();
  const run = useRun();
  const [clients, setClients] = useState<Row[] | null>(null);
  const [staff, setStaff] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('clients').select('id,name,business_type').is('deleted_at', null).order('name'),
      supabase.from('client_contacts').select('id,client_id,name,role').is('deleted_at', null).order('name'),
    ]);
    setClients((c.data as Row[]) ?? []);
    setStaff((s.data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!clients) return <Spinner />;
  return (
    <>
      <AddRow placeholder="New client / company" onAdd={(name) => run(() => createRecord('clients', { name, status: 'active' }), 'Client added').then(load)} />
      {clients.length === 0 && <Empty title="No clients yet" />}
      <div className="space-y-2">
        {clients.map((c) => {
          const mine = staff.filter((s) => s.client_id === c.id);
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="glass overflow-hidden rounded-[18px]">
              <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                {isOpen ? <ChevronDown size={17} className="text-muted" /> : <ChevronRight size={17} className="text-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{c.name}</p>
                  <p className="text-[12px] text-muted">{mine.length ? mine.map((m) => m.name).join(', ') : 'No staff added'}</p>
                </div>
                <Badge>{mine.length} staff</Badge>
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-[var(--hairline)] p-3">
                  <p className="text-[12px] text-muted">These names appear as "Payer name" when you record a payment from {c.name}.</p>
                  <AddRow placeholder="Staff name, e.g. Sejal" onAdd={(name) => run(() => createRecord('client_contacts', { client_id: c.id, name }), 'Staff added').then(load)} />
                  {mine.map((m) => (
                    <div key={m.id} className="rounded-[14px] bg-[var(--card-2)]">
                      <EditLine
                        label={m.name}
                        sub={m.role ?? undefined}
                        onRename={(name) => run(() => updateRecord('client_contacts', m.id, { name }), 'Renamed').then(load)}
                        onDelete={() => run(() => softDelete('client_contacts', m.id), 'Removed').then(load)}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => nav(`/r/clients/${c.id}`)}>Open client</Button>
                    <Button size="sm" onClick={() => nav(`/r/clients/${c.id}/edit`)}>Edit details</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Dropdown lists ---------------- */
function DropdownsEditor() {
  const { custom, reload } = useCustomOptions();
  const run = useRun();
  const [open, setOpen] = useState<ListKey | null>('payment_app');

  const after = async (): Promise<void> => { await reload(); };
  const findCustom = (key: ListKey, value: string) => custom.find((c) => c.list_key === key && c.value === value);

  const slug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `item_${Date.now()}`;

  return (
    <div className="space-y-2">
      {(Object.keys(BUILTIN) as ListKey[]).map((key) => {
        const b = BUILTIN[key];
        const mine = custom.filter((c) => c.list_key === key);
        const extra = mine.filter((c) => !b.options.some((o) => o.value === c.value));
        const isOpen = open === key;
        return (
          <div key={key} className="glass overflow-hidden rounded-[18px]">
            <button onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
              {isOpen ? <ChevronDown size={17} className="text-muted" /> : <ChevronRight size={17} className="text-muted" />}
              <p className="flex-1 text-[14.5px] font-semibold">{b.title}</p>
              <Badge>{b.options.length - mine.filter((m) => m.hidden).length + extra.filter((e) => !e.hidden).length}</Badge>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-[var(--hairline)] p-3">
                <AddRow
                  placeholder={`Add to ${b.title.toLowerCase()}`}
                  onAdd={(label) => run(() => createRecord('custom_options', { list_key: key, value: slug(label), label }), 'Added').then(after)}
                />
                <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[14px] bg-[var(--card-2)]">
                  {b.options.map((o) => {
                    const c = findCustom(key, o.value);
                    const hidden = !!c?.hidden;
                    const label = c && !c.hidden ? c.label : o.label;
                    return (
                      <EditLine
                        key={o.value}
                        label={label}
                        icon={{ table: 'option', id: `${key}:${o.value}` }}
                        sub={hidden ? 'Hidden' : 'Built-in'}
                        onRename={(nl) =>
                          run(
                            () => (c ? updateRecord('custom_options', c.id, { label: nl, hidden: false }) : createRecord('custom_options', { list_key: key, value: o.value, label: nl })),
                            'Renamed',
                          ).then(after)
                        }
                        right={
                          <button
                            aria-label={hidden ? 'Show' : 'Hide'}
                            className={cx('p-1.5', hidden ? 'text-muted' : 'text-primary')}
                            onClick={() =>
                              run(
                                () => (c ? updateRecord('custom_options', c.id, { hidden: !hidden }) : createRecord('custom_options', { list_key: key, value: o.value, label: o.label, hidden: true })),
                                hidden ? 'Shown' : 'Hidden',
                              ).then(after)
                            }
                          >
                            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                      />
                    );
                  })}
                  {extra.map((c) => (
                    <EditLine
                      key={c.id}
                      label={c.label}
                      icon={{ table: 'option', id: `${key}:${c.value}` }}
                      sub="Added by you"
                      onRename={(nl) => run(() => updateRecord('custom_options', c.id, { label: nl }), 'Renamed').then(after)}
                      onDelete={() => run(() => softDelete('custom_options', c.id), 'Deleted').then(after)}
                    />
                  ))}
                </div>
                <p className="text-[11.5px] text-muted">Built-in items can be renamed or hidden; your own items can also be deleted. Old entries keep their saved value.</p>
              </div>
            )}
          </div>
        );
      })}
      <Card className="text-[12.5px] text-muted">
        Areas (Personal / Study / Business), statuses and Personal/Business mode are fixed because reports depend on them.
      </Card>
    </div>
  );
}

/* ---------------- Accounts ---------------- */
function AccountsEditor() {
  const nav = useNavigate();
  const { accounts, loaded } = useLookups();
  const run = useRun();
  if (!loaded) return <Spinner />;
  return (
    <>
      <AddRow placeholder="New account, e.g. Paytm, HDFC" onAdd={(name) => run(() => createRecord('accounts', { name, type: 'custom' }), 'Account added')} />
      <List>
        {accounts
          .filter((a) => !a.deleted_at)
          .map((a) => (
            <EditLine
              key={a.id}
              label={a.name}
              sub={a.upi_id ?? a.type}
              onRename={(name) => run(() => updateRecord('accounts', a.id, { name }), 'Renamed')}
              onDelete={() => run(() => softDelete('accounts', a.id), 'Moved to Recycle Bin')}
              right={
                <IconButton label="Edit details" onClick={() => nav(`/r/accounts/${a.id}/edit`)}>
                  <Pencil size={14} />
                </IconButton>
              }
            />
          ))}
      </List>
      <p className="px-1 text-[12px] text-muted">Tap the round edit button to set type, UPI app, UPI ID and opening balance.</p>
    </>
  );
}

export { ListRow, loadCustomOptions };
