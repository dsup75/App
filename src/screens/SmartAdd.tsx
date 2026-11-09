import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Wand2, X, Check, PencilLine, Sparkles } from 'lucide-react';
import { friendlyError, saveMoneyEntry, type LineInput } from '../lib/db';
import { LINE_FIELDS } from '../components/MoneyForm';
import { callAssistant } from '../lib/ai';
import { uploadAttachment } from '../components/Attachments';
import { useAuth } from '../context/AuthContext';
import { compressImage, fromAI, parseText, type Draft } from '../lib/parse';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { PAYMENT_MODES, UPI_APPS } from '../lib/tables';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, FormRow, Page, Segmented } from '../components/ui';

const EXAMPLES = ['GPay se 500 Ramesh ko diye khane ke liye 2:30 pm', 'Received ₹15000 from Arvia Biotech via PhonePe UTR 412345678901', 'Paid 2700 for books using Paytm yesterday'];

export function SmartAdd() {
  const nav = useNavigate();
  const toast = useToast();
  const { accounts } = useLookups();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [err, setErr] = useState('');

  const active = accounts.filter((a) => !a.deleted_at);

  // pick the account that matches the detected app
  useEffect(() => {
    if (!draft || !active.length) return;
    const match = draft.payment_app ? active.find((a) => a.upi_app === draft.payment_app) ?? (draft.payment_app === 'cash' ? active.find((a) => a.type === 'cash') : undefined) : undefined;
    setAccountId((cur) => cur || (match ?? active[0]).id);
    setToAccountId((cur) => cur || (active.find((a) => a.id !== (match ?? active[0]).id)?.id ?? ''));
  }, [draft, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImage(await compressImage(f));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const makeDraft = async () => {
    setErr('');
    setDraft(null);
    setAccountId('');
    setToAccountId('');
    if (!text.trim() && !image) return setErr('Type something or add a screenshot.');
    if (!image) {
      const d = parseText(text);
      setDraft(d);
      setAmount(d.amount_paise ? paiseToInput(d.amount_paise) : '');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await callAssistant({ mode: 'extract', text, image: { base64: image.base64, mime: image.mime } });
      if (error || !data) throw new Error(error ?? 'AI failed');
      const d = fromAI(data.draft);
      setDraft(d);
      setAmount(d.amount_paise ? paiseToInput(d.amount_paise) : '');
    } catch (e) {
      const msg = (e as Error).message;
      setErr(
        /not found|404|Failed to send|GEMINI|reach|setup/i.test(msg)
          ? 'AI setup pending — reading screenshots needs AI (Settings → AI Assistant). Typed text works without it.'
          : `Could not read the image: ${msg}`,
      );
      if (text.trim()) {
        const d = parseText(text);
        setDraft(d);
        setAmount(d.amount_paise ? paiseToInput(d.amount_paise) : '');
      }
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const values = (): Record<string, unknown> | string => {
    if (!draft) return 'No draft';
    const p = parseRupeesToPaise(amount);
    if (!p || p <= 0) return 'Enter the amount.';
    if (!draft.title.trim()) return 'Enter a title.';
    if (!accountId) return 'Choose an account.';
    const base = { title: draft.title.trim(), amount_paise: p, txn_date: draft.txn_date, txn_time: draft.txn_time, notes: draft.notes };
    if (draft.kind === 'transfers') {
      if (!toAccountId || toAccountId === accountId) return 'Choose two different accounts.';
      return { ...base, from_account_id: accountId, to_account_id: toAccountId };
    }
    const common = {
      ...base,
      account_id: accountId,
      payment_app: draft.payment_app,
      payment_method: draft.payment_method,
      reference: draft.reference,
      payment_mode: draft.payment_mode,
      area: draft.payment_mode === 'business' ? 'business' : 'personal',
    };
    if (draft.kind === 'incomes') return { ...common, payer_name: draft.payer_name, payer_type: 'client' };
    return { ...common, payer_name: draft.payer_name };
  };

  const approve = async () => {
    const v = values();
    if (typeof v === 'string') return setErr(v);
    setSaving(true);
    try {
      const kind = draft!.kind;
      const line = (direction: 'in' | 'out', account_id: unknown): LineInput => ({
        direction,
        account_id: String(account_id),
        amount_paise: Number(v.amount_paise),
        payment_app: (v.payment_app as string) || null,
        payment_method: (v.payment_method as string) || null,
        txn_date: String(v.txn_date),
        txn_time: (v.txn_time as string) || null,
        reference: (v.reference as string) || null,
        party_name: (v.payer_name as string) || null,
      });
      const lines = kind === 'transfers' ? [line('out', v.from_account_id), line('in', v.to_account_id)] : [line(kind === 'incomes' ? 'in' : 'out', v.account_id)];
      const parent: Record<string, unknown> = { ...v };
      for (const k of [...LINE_FIELDS[kind], 'payer_name']) delete parent[k];
      const id = await saveMoneyEntry(kind, null, parent, lines, null);
      if (image && user) {
        try {
          await uploadAttachment(user.id, kind, id, { base64: image.base64, mime: image.mime });
        } catch {
          toast('Entry saved, but the screenshot could not be attached', 'error');
        }
      }
      toast('Entry saved');
      nav(`/r/${kind}/${id}`, { replace: true });
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const openForm = () => {
    const v = values();
    const obj = typeof v === 'string' ? { title: draft?.title ?? '' } : v;
    const q = new URLSearchParams();
    Object.entries(obj).forEach(([k, val]) => {
      if (val === null || val === undefined || val === '') return;
      q.set(k, k.endsWith('_paise') ? paiseToInput(Number(val)) : String(val));
    });
    nav(`/r/${draft!.kind}/new?${q.toString()}`);
  };

  return (
    <Page title="Smart Add" subtitle="Type it or add a payment screenshot — review, then approve." back>
      <Card className="space-y-3">
        <textarea
          className="field min-h-[96px]"
          placeholder="e.g. PhonePe se 1200 mile Arun Singh se, UTR 4123…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {image && (
          <div className="relative">
            <img src={image.preview} alt="Selected screenshot" className="max-h-64 w-full rounded-[14px] object-contain" style={{ background: 'var(--card-2)' }} />
            <button aria-label="Remove image" onClick={() => setImage(null)} className="liquid absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full">
              <X size={15} />
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> Screenshot
          </Button>
          <Button variant="primary" loading={busy} onClick={makeDraft}>
            <Wand2 size={16} /> Make draft
          </Button>
        </div>
        {!draft && !text && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <button key={x} onClick={() => setText(x)} className="liquid rounded-full px-2.5 py-1 text-left text-[11.5px]">
                {x}
              </button>
            ))}
          </div>
        )}
        {err && <p className="px-0.5 text-[13px] text-danger">{err}</p>}
      </Card>

      {draft && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold">
              <Sparkles size={16} className="text-primary" /> Draft
            </p>
            <Badge tone={draft.confidence === 'ai' ? 'blue' : 'muted'}>{draft.confidence === 'ai' ? 'Read by AI' : 'From text'} · please check</Badge>
          </div>
          <Segmented
            value={draft.kind}
            onChange={(k) => set('kind', k)}
            options={[
              { value: 'expenses', label: 'Expense' },
              { value: 'incomes', label: 'Income' },
              { value: 'transfers', label: 'Transfer' },
            ]}
          />
          <FormRow label="Amount (₹)">
            <input className="field text-[18px] font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormRow>
          <FormRow label="Title">
            <input className="field" value={draft.title} onChange={(e) => set('title', e.target.value)} />
          </FormRow>
          <FormRow label={draft.kind === 'transfers' ? 'From account' : draft.kind === 'incomes' ? 'Received in' : 'Paid from'}>
            <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FormRow>
          {draft.kind === 'transfers' ? (
            <FormRow label="To account">
              <select className="field" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select</option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormRow>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <FormRow label="App">
                  <select className="field" value={draft.payment_app ?? ''} onChange={(e) => set('payment_app', e.target.value || null)}>
                    <option value="">—</option>
                    {UPI_APPS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Mode">
                  <select className="field" value={draft.payment_mode} onChange={(e) => set('payment_mode', e.target.value as Draft['payment_mode'])}>
                    {PAYMENT_MODES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormRow>
              </div>
              <FormRow label={draft.kind === 'incomes' ? 'Received from' : 'Paid to'}>
                <input className="field" value={draft.payer_name ?? ''} onChange={(e) => set('payer_name', e.target.value || null)} />
              </FormRow>
              <FormRow label="UTR / reference">
                <input className="field" value={draft.reference ?? ''} onChange={(e) => set('reference', e.target.value || null)} />
              </FormRow>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Date">
              <input type="date" className="field" value={draft.txn_date} onChange={(e) => set('txn_date', e.target.value)} />
            </FormRow>
            <FormRow label="Time">
              <input type="time" className="field" value={draft.txn_time} onChange={(e) => set('txn_time', e.target.value)} />
            </FormRow>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button onClick={openForm}>
              <PencilLine size={16} /> Full form
            </Button>
            <Button variant="primary" loading={saving} onClick={approve}>
              <Check size={16} /> Approve {amount && parseRupeesToPaise(amount) ? formatINR(parseRupeesToPaise(amount)!) : ''}
            </Button>
          </div>
        </Card>
      )}
    </Page>
  );
}
