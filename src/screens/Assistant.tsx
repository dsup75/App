import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Bot } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callAssistant } from '../lib/ai';
import { currentMonth, monthRange, todayISO, toISODate, formatDate } from '../lib/dates';
import { formatINR, sumPaise } from '../lib/money';
import { Card, Page, cx } from '../components/ui';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  local?: boolean;
}

const QUICK = [
  "Show today's pending tasks",
  'How much did I spend this month?',
  'Which client payments are pending?',
  'Show my outstanding loans',
  'Show my weak chapters',
  'Summarize my weekly productivity',
  'Create a study plan for this week',
  'Prepare a client proposal for Meta ads',
];

/** Gathers the signed-in user's own data (RLS-protected) into a compact summary. */
async function buildContext() {
  const today = todayISO();
  const { from, to } = monthRange(currentMonth());
  const wk = new Date();
  wk.setDate(wk.getDate() - 6);
  const weekFrom = toISODate(wk);
  const q = await Promise.all([
    supabase.from('tasks').select('title,status,due_date,priority,area,task_type,client_id').is('deleted_at', null).in('status', ['pending', 'in_progress', 'waiting']).limit(150),
    supabase.from('incomes').select('title,amount_paise,txn_date,category_id,client_id,area').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to),
    supabase.from('expenses').select('title,amount_paise,txn_date,category_id,area').is('deleted_at', null).gte('txn_date', from).lte('txn_date', to),
    supabase.from('categories').select('id,name'),
    supabase.from('clients').select('id,name,status,business_type').is('deleted_at', null),
    supabase.from('invoices').select('id,invoice_no,client_id,amount_paise,due_date,status,period').is('deleted_at', null).eq('status', 'sent'),
    supabase.from('invoice_totals').select('id,received_paise'),
    supabase.from('loans').select('id,person,direction,principal_paise,due_date,interest_type,interest_rate_bp').is('deleted_at', null),
    supabase.from('loan_totals').select('id,principal_repaid_paise,interest_paid_paise'),
    supabase.from('chapters').select('name,status,is_weak,is_backlog,revision_count,subject_id').is('deleted_at', null),
    supabase.from('subjects').select('id,name').is('deleted_at', null),
    supabase.from('study_sessions').select('minutes,session_date,subject_id').is('deleted_at', null).gte('session_date', weekFrom),
    supabase.from('mock_tests').select('name,test_date,obtained_marks,total_marks,correct,incorrect').is('deleted_at', null).order('test_date', { ascending: false }).limit(10),
    supabase.from('exams').select('name,exam_date').is('deleted_at', null).gte('exam_date', today),
    supabase.from('tasks').select('title,completed_at,area').is('deleted_at', null).eq('status', 'completed').gte('completed_at', weekFrom),
    supabase.from('account_balances').select('name,balance_paise,upi_app'),
    supabase.from('payment_requests').select('title,client_name,amount_paise,due_date').is('deleted_at', null).eq('status', 'pending'),
    supabase.from('campaigns').select('name,client_id,platform,objective,status,budget_paise,results').is('deleted_at', null).limit(50),
  ]);
  const d = q.map((x) => (x.data as any[]) ?? []);
  const name = (rows: any[], id: string) => rows.find((r) => r.id === id)?.name ?? null;
  const rec = new Map(d[6].map((x: any) => [x.id, Number(x.received_paise)]));
  const lt = new Map(d[8].map((x: any) => [x.id, x]));
  return {
    today,
    month: currentMonth(),
    balances: d[15],
    open_tasks: d[0].map((t: any) => ({ ...t, client: t.client_id ? name(d[4], t.client_id) : null, client_id: undefined })),
    month_income: d[1].map((r: any) => ({ ...r, category: name(d[3], r.category_id), client: name(d[4], r.client_id), category_id: undefined, client_id: undefined })),
    month_expenses: d[2].map((r: any) => ({ ...r, category: name(d[3], r.category_id), category_id: undefined })),
    clients: d[4].map((c: any) => ({ name: c.name, status: c.status, business: c.business_type })),
    unpaid_invoices: d[5]
      .map((i: any) => ({ invoice_no: i.invoice_no, client: name(d[4], i.client_id), period: i.period, due_date: i.due_date, amount_paise: i.amount_paise, received_paise: rec.get(i.id) ?? 0 }))
      .filter((i: any) => i.received_paise < i.amount_paise),
    pending_payment_requests: d[16],
    loans: d[7].map((l: any) => ({
      person: l.person,
      direction: l.direction,
      principal_paise: l.principal_paise,
      repaid_paise: (lt.get(l.id) as any)?.principal_repaid_paise ?? 0,
      due_date: l.due_date,
      interest: l.interest_type === 'simple' ? `${l.interest_rate_bp / 100}% simple yearly` : 'none',
    })),
    chapters: d[9].map((c: any) => ({ ...c, subject: name(d[10], c.subject_id), subject_id: undefined })),
    study_last_7_days: d[11].map((s: any) => ({ ...s, subject: name(d[10], s.subject_id), subject_id: undefined })),
    recent_tests: d[12],
    upcoming_exams: d[13],
    tasks_completed_last_7_days: d[14],
    campaigns: d[17].map((c: any) => ({ ...c, client: name(d[4], c.client_id), client_id: undefined })),
  };
}

/** Answers that don't need AI — computed directly from the data. */
function localAnswer(q: string, c: Awaited<ReturnType<typeof buildContext>>): string | null {
  const s = q.toLowerCase();
  if (s.includes('pending task') || s.includes("today's task")) {
    const due = c.open_tasks.filter((t: any) => !t.due_date || t.due_date <= c.today);
    if (!due.length) return 'No pending tasks for today. 🎉';
    return `Pending today (${due.length}):\n` + due.map((t: any) => `• ${t.title}${t.client ? ` (${t.client})` : ''}${t.due_date && t.due_date < c.today ? ' — overdue' : ''}`).join('\n');
  }
  if (s.includes('spend') || s.includes('spent') || s.includes('kharch')) {
    const total = sumPaise(c.month_expenses);
    const byCat = new Map<string, number>();
    c.month_expenses.forEach((e: any) => byCat.set(e.category ?? 'Uncategorised', (byCat.get(e.category ?? 'Uncategorised') ?? 0) + e.amount_paise));
    return (
      `You spent ${formatINR(total)} this month (income ${formatINR(sumPaise(c.month_income))}).\n` +
      [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `• ${k}: ${formatINR(v)}`).join('\n')
    );
  }
  if (s.includes('client payment') || s.includes('pending payment') || s.includes('outstanding invoice')) {
    const inv = c.unpaid_invoices;
    const req = c.pending_payment_requests;
    if (!inv.length && !req.length) return 'No pending client payments.';
    return [
      ...inv.map((i: any) => `• ${i.client} — ${i.invoice_no}: ${formatINR(i.amount_paise - i.received_paise)} due${i.due_date ? ` (${formatDate(i.due_date)})` : ''}`),
      ...req.map((r: any) => `• ${r.client_name ?? 'Request'} — ${r.title}: ${formatINR(r.amount_paise)}`),
    ].join('\n');
  }
  if (s.includes('loan') || s.includes('udhaar')) {
    const open = c.loans.filter((l: any) => l.principal_paise > l.repaid_paise);
    if (!open.length) return 'No outstanding loans.';
    return open
      .map((l: any) => `• ${l.direction === 'lent' ? `${l.person} owes you` : `You owe ${l.person}`} ${formatINR(l.principal_paise - l.repaid_paise)}${l.due_date ? ` (due ${formatDate(l.due_date)})` : ''}`)
      .join('\n');
  }
  if (s.includes('weak chapter') || s.includes('weak topic')) {
    const w = c.chapters.filter((x: any) => x.is_weak);
    if (!w.length) return 'No chapters are marked as weak yet. Mark them in Study → Subject → Chapter.';
    return w.map((x: any) => `• ${x.subject}: ${x.name}`).join('\n');
  }
  return null;
}

export function AssistantScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setInput('');
    const next: Msg[] = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setBusy(true);
    try {
      const ctx = await buildContext();
      const local = localAnswer(q, ctx);
      if (local) {
        setMsgs([...next, { role: 'assistant', text: local, local: true }]);
        return;
      }
      const { data, error } = await callAssistant({ question: q, context: ctx, history: msgs.slice(-6) });
      if (error || !data) {
        const msg = error ?? '';
        setMsgs([
          ...next,
          {
            role: 'assistant',
            text: /not found|404|Failed to send|reach|GEMINI|setup/i.test(msg)
              ? 'AI setup pending (Settings → AI Assistant). Quick questions (tasks, spending, pending payments, loans, weak chapters) still work. To enable full AI, deploy the "assistant" Edge Function in Supabase and add a GEMINI_API_KEY secret (see README).'
              : `AI error: ${msg}`,
          },
        ]);
        return;
      }
      setMsgs([...next, { role: 'assistant', text: data.answer }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', text: 'Could not reach your data. Check internet and try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Assistant" subtitle="Answers from your own data. It never changes anything." back>
      {msgs.length === 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Sparkles size={17} />
            <span className="text-[14px] font-semibold">Try asking</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button key={q} onClick={() => ask(q)} className="liquid rounded-full px-3 py-1.5 text-left text-[12.5px] font-medium">
                {q}
              </button>
            ))}
          </div>
        </Card>
      )}
      <div className="space-y-2.5">
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] whitespace-pre-wrap rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed',
                m.role === 'user' ? 'liquid-primary rounded-br-[6px]' : 'glass rounded-bl-[6px]',
              )}
            >
              {m.role === 'assistant' && (
                <span className="mb-1 flex items-center gap-1 text-[11px] text-muted">
                  <Bot size={12} /> {m.local ? 'From your data' : 'AI'}
                </span>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <p className="px-1 text-[13px] text-muted">Thinking…</p>}
        <div ref={endRef} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4 pb-4 pb-safe">
        <div className="glass-strong flex items-center gap-2 rounded-full p-1.5 pl-4">
          <input
            className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--muted)]"
            placeholder="Ask about your money, tasks, study…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          />
          <button aria-label="Send" onClick={() => ask(input)} className="liquid liquid-primary flex h-9 w-9 items-center justify-center rounded-full">
            <Send size={16} />
          </button>
        </div>
      </div>
    </Page>
  );
}
