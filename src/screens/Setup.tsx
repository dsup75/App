// First-run setup: accounts → categories → clients & staff
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Trash2, Landmark, Tag, Briefcase } from 'lucide-react';
import { createRecord, friendlyError, softDelete } from '../lib/db';
import { parseSignedRupeesToPaise } from '../lib/money';
import { ACCOUNT_TYPES, UPI_APPS } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { Button, Card, FormRow, IconBubble, List, ListRow, Page, cx } from '../components/ui';

const ACCOUNT_PRESETS: { name: string; type: string; upi_app?: string }[] = [
  { name: 'Cash', type: 'cash', upi_app: 'cash' },
  { name: 'Google Pay', type: 'upi', upi_app: 'gpay' },
  { name: 'PhonePe', type: 'upi', upi_app: 'phonepe' },
  { name: 'Paytm', type: 'upi', upi_app: 'paytm' },
  { name: 'Bank account', type: 'bank', upi_app: 'bank_app' },
];

const EXPENSE_CATS = ['Food', 'Travel', 'Rent', 'Mobile & internet', 'Study material', 'Fees', 'Ads spend', 'Software & tools', 'Shopping', 'Health', 'Family', 'Other'];
const INCOME_CATS = ['Client payment', 'Salary', 'Freelance', 'Pocket money', 'Refund', 'Gift', 'Other income'];

export function SetupScreen() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const steps = ['Accounts', 'Categories', 'Clients'];
  return (
    <Page title="Set up your app" subtitle="3 quick steps — you can change everything later in Manage lists" back>
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className="flex-1 text-left">
            <span className={cx('block h-1.5 rounded-full', i <= step ? 'bg-[var(--primary-2)]' : 'bg-[var(--hairline)]')} />
            <span className={cx('mt-1 block text-[12px] font-semibold', i === step ? 'text-primary' : 'text-muted')}>
              {i + 1}. {s}
            </span>
          </button>
        ))}
      </div>
      {step === 0 && <AccountsStep onNext={() => setStep(1)} />}
      {step === 1 && <CategoriesStep onNext={() => setStep(2)} />}
      {step === 2 && (
        <ClientsStep
          onDone={() => {
            nav('/', { replace: true });
          }}
        />
      )}
    </Page>
  );
}

function AccountsStep({ onNext }: { onNext: () => void }) {
  const toast = useToast();
  const { accounts, reload } = useLookups();
  const active = accounts.filter((a) => !a.deleted_at);
  const [f, setF] = useState({ name: '', type: 'bank', upi_app: '', upi_id: '', opening: '', date: '' });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!f.name.trim()) return toast('Enter the account name', 'error');
    const opening = f.opening.trim() ? parseSignedRupeesToPaise(f.opening) : 0;
    if (opening === null) return toast('Opening balance looks wrong', 'error');
    setBusy(true);
    try {
      await createRecord('accounts', {
        name: f.name.trim(),
        type: f.type,
        upi_app: f.upi_app || null,
        upi_id: f.upi_id.trim() || null,
        opening_balance_paise: opening,
        opening_date: f.date || null,
      });
      setF({ name: '', type: 'bank', upi_app: '', upi_id: '', opening: '', date: '' });
      reload();
      toast('Account added');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="space-y-3">
        <p className="text-[14px] font-semibold">Where do you keep money?</p>
        <p className="text-[12.5px] text-muted">Add each bank, wallet and UPI app separately (e.g. SBI, India Post, Paytm, Cash). Choosing the UPI app lets the app pick the right account automatically.</p>
        <div className="flex flex-wrap gap-1.5">
          {ACCOUNT_PRESETS.filter((p) => !active.some((a) => a.name.toLowerCase() === p.name.toLowerCase())).map((p) => (
            <button key={p.name} className="liquid rounded-full px-3 py-1.5 text-[12.5px] font-semibold" onClick={() => setF((x) => ({ ...x, name: p.name, type: p.type, upi_app: p.upi_app ?? '' }))}>
              + {p.name}
            </button>
          ))}
        </div>
        <FormRow label="Account name">
          <input className="field" placeholder="e.g. SBI, India Post, Paytm" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
        </FormRow>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Type">
            <select className="field" value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value }))}>
              {ACCOUNT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="UPI app">
            <select className="field" value={f.upi_app} onChange={(e) => setF((x) => ({ ...x, upi_app: e.target.value }))}>
              <option value="">None</option>
              {UPI_APPS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Opening balance (₹)">
            <input className="field" inputMode="decimal" placeholder="0" value={f.opening} onChange={(e) => setF((x) => ({ ...x, opening: e.target.value }))} />
          </FormRow>
          <FormRow label="As on date">
            <input type="date" className="field" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} />
          </FormRow>
        </div>
        <FormRow label="UPI ID (optional, to receive payments)">
          <input className="field" placeholder="name@okaxis" value={f.upi_id} onChange={(e) => setF((x) => ({ ...x, upi_id: e.target.value }))} />
        </FormRow>
        <Button full loading={busy} onClick={add}>
          <Plus size={15} /> Add account
        </Button>
      </Card>

      {active.length > 0 && (
        <List>
          {active.map((a: any) => (
            <ListRow
              key={a.id}
              icon={<IconBubble tone="amber"><Landmark size={17} /></IconBubble>}
              title={a.name}
              subtitle={[a.upi_app ? UPI_APPS.find((o) => o.value === a.upi_app)?.label : a.type, a.upi_id].filter(Boolean).join(' · ')}
              right={
                <button aria-label={`Remove ${a.name}`} className="p-1 text-muted" onClick={() => softDelete('accounts', a.id).then(reload).catch((e) => toast(friendlyError(e), 'error'))}>
                  <Trash2 size={15} />
                </button>
              }
            />
          ))}
        </List>
      )}
      <Button full variant="primary" disabled={!active.length} onClick={onNext}>
        Next: categories
      </Button>
    </>
  );
}

function CategoriesStep({ onNext }: { onNext: () => void }) {
  const toast = useToast();
  const { categories, reload } = useLookups();
  const have = new Set(categories.filter((c) => !c.deleted_at).map((c) => `${c.kind}:${c.name.toLowerCase()}`));
  const [pick, setPick] = useState<Set<string>>(() => new Set([...EXPENSE_CATS.map((n) => `expense:${n}`), ...INCOME_CATS.map((n) => `income:${n}`)]));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) =>
    setPick((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const save = async () => {
    setBusy(true);
    try {
      const list = [...pick].filter((k) => !have.has(`${k.split(':')[0]}:${k.split(':')[1].toLowerCase()}`));
      for (const k of list) {
        const [kind, name] = k.split(':');
        await createRecord('categories', { kind, name });
      }
      reload();
      if (list.length) toast(`${list.length} categories added`);
      onNext();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const chip = (kind: 'income' | 'expense', name: string) => {
    const k = `${kind}:${name}`;
    const exists = have.has(`${kind}:${name.toLowerCase()}`);
    const on = exists || pick.has(k);
    return (
      <button
        key={k}
        disabled={exists}
        onClick={() => toggle(k)}
        className={cx('rounded-full px-3 py-1.5 text-[12.5px] font-semibold', on ? 'liquid-primary' : 'liquid')}
      >
        {on && <Check size={12} className="mr-1 inline" />}
        {name}
      </button>
    );
  };

  const extra = [...pick].filter((k) => ![...EXPENSE_CATS.map((n) => `expense:${n}`), ...INCOME_CATS.map((n) => `income:${n}`)].includes(k));

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <IconBubble tone="expense"><Tag size={16} /></IconBubble>
          <p className="text-[14px] font-semibold">Expense categories</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXPENSE_CATS.map((n) => chip('expense', n))}
          {extra.filter((k) => k.startsWith('expense:')).map((k) => chip('expense', k.split(':')[1]))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <IconBubble tone="income"><Tag size={16} /></IconBubble>
          <p className="text-[14px] font-semibold">Income categories</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INCOME_CATS.map((n) => chip('income', n))}
          {extra.filter((k) => k.startsWith('income:')).map((k) => chip('income', k.split(':')[1]))}
        </div>
        <div className="flex gap-2">
          <input className="field" placeholder="Your own category" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <Button size="sm" onClick={() => custom.trim() && (setPick((s) => new Set(s).add(`expense:${custom.trim()}`)), setCustom(''))}>+ Expense</Button>
          <Button size="sm" onClick={() => custom.trim() && (setPick((s) => new Set(s).add(`income:${custom.trim()}`)), setCustom(''))}>+ Income</Button>
        </div>
      </Card>
      <Button full variant="primary" loading={busy} onClick={save}>
        Save & next: clients
      </Button>
    </>
  );
}

function ClientsStep({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { refs, reload } = useLookups();
  const clients = (refs.clients ?? []).filter((c) => !c.deleted_at);
  const [name, setName] = useState('');
  const [staff, setStaff] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return toast('Enter the client name', 'error');
    setBusy(true);
    try {
      const c = await createRecord('clients', { name: name.trim(), status: 'active' });
      for (const s of staff.split(',').map((x) => x.trim()).filter(Boolean)) await createRecord('client_contacts', { client_id: c.id, name: s });
      setName('');
      setStaff('');
      reload();
      toast('Client added');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="space-y-3">
        <p className="text-[14px] font-semibold">Clients who pay you (optional)</p>
        <p className="text-[12.5px] text-muted">Add the client and the staff who send payments for them. When you record a payment from this client, only their staff names show up.</p>
        <FormRow label="Client / company">
          <input className="field" placeholder="e.g. company name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="Staff names (comma separated)">
          <input className="field" placeholder="e.g. Sejal, Gautam" value={staff} onChange={(e) => setStaff(e.target.value)} />
        </FormRow>
        <Button full loading={busy} onClick={add}>
          <Plus size={15} /> Add client
        </Button>
      </Card>
      {clients.length > 0 && (
        <List>
          {clients.map((c) => (
            <ListRow key={c.id} icon={<IconBubble tone="primary"><Briefcase size={17} /></IconBubble>} title={c.label} />
          ))}
        </List>
      )}
      <Button full variant="primary" onClick={onDone}>
        <Check size={16} /> Finish setup
      </Button>
    </>
  );
}
