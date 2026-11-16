// Health Care hub + Medicines, Vitals, Appointments, Medical Vault, Water and Sleep.
// New screens only — they read/write their own tables and never change other app data.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Minus, Plus, Undo2, X, BellRing, Package, Phone, FileText } from 'lucide-react';
import { Badge, BarChart, Button, Card, Empty, ErrorBox, FormRow, List, Page, SectionTitle, SeeAll, Segmented, Sheet, Skeleton, Toggle, cx } from '../components/ui';
import { Glyph, type GlyphName } from '../components/Glyph';
import { RecordLine } from '../components/RecordLine';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { formatDate, relativeDay, todayISO, toISODate } from '../lib/dates';
import { DOC_TYPES, SLEEP_QUALITY } from '../lib/tables';
import {
  FOOD_LABEL, VITAL_UNIT, addStock, careNotifyPermission, daysLeft, fetchAppointments, fetchDoseLogs, fetchMedicines, fetchVitals, fetchWellness,
  fmt12, fmtDur, hhmm, logDose, onDay, saveWellness, scheduleCareReminders, sleepMinutes, slotsOf, stockState, undoDose, vitalStatus, vitalValue, waterByDay,
  DEFAULT_WELLNESS, type Appointment, type DoseLog, type Medicine, type Slot, type Vital, type Wellness,
} from '../lib/care';

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
const dayShort = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
const noName = () => '';

/* ---------------- shared pieces ---------------- */
function PillCTA({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="care-pill active:scale-[.98]">
      {children}
      <span className="care-arrows">›››</span>
    </button>
  );
}

/** "Suggested setup" style row card */
function ToolCard({ glyph, title, sub, right, onClick }: { glyph: GlyphName; title: string; sub: ReactNode; right?: ReactNode; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="flex items-center gap-3 !p-3.5">
      <Glyph name={glyph} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        <div className="truncate text-[12.5px] text-muted">{sub}</div>
      </div>
      {right}
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Card>
  );
}

function Ring({ pct, size = 112, children }: { pct: number; size?: number; children: ReactNode }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="care-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1f6fff" />
            <stop offset="1" stopColor="#27c46b" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#care-ring)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .7s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** simple line chart from real readings only (oldest → newest) */
function TrendChart({ series, height = 120 }: { series: { values: number[]; cls: string; label: string }[]; height?: number }) {
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return <p className="py-6 text-center text-[12.5px] text-muted">Add at least 2 readings to see the trend.</p>;
  const min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.15 || 5;
  const lo = min - pad, hi = max + pad;
  const W = 300;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 16) + 8);
  const y = (v: number) => height - 8 - ((v - lo) / (hi - lo)) * (height - 16);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }}>
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" className={s.cls} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === s.values.length - 1 ? 4 : 2.4} className={s.cls} fill="var(--card)" strokeWidth="2" />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>Low {Math.round(min)}</span>
        {series.length > 1 && (
          <span className="flex gap-3">
            {series.map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <span className={cx('inline-block h-0.5 w-3', s.cls === 'care-line-a' ? 'bg-[#1f6fff]' : 'bg-[#19b38a]')} /> {s.label}
              </span>
            ))}
          </span>
        )}
        <span>High {Math.round(max)}</span>
      </div>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await fn());
    } catch (e) {
      setErr(friendlyError(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { data, err, load };
}

/* ---------------- hub ---------------- */
export function CareScreen() {
  const nav = useNavigate();
  const today = todayISO();
  const { data, err, load } = useLoad(async () => {
    const [meds, logs, appts, well, water, bp, sugar, docs, sleep] = await Promise.all([
      fetchMedicines(),
      fetchDoseLogs(today),
      fetchAppointments(),
      fetchWellness(),
      waterByDay(today, today),
      fetchVitals('bp', 1),
      fetchVitals('sugar', 1),
      supabase.from('medical_documents').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('sleep_logs').select('*').is('deleted_at', null).order('sleep_date', { ascending: false }).limit(1),
    ]);
    return { meds, logs, appts, well, water: water.get(today) ?? 0, bp: bp[0], sugar: sugar[0], docs: docs.count ?? 0, sleep: (sleep.data ?? [])[0] as any };
  });
  useEffect(() => {
    scheduleCareReminders().catch(() => {});
  }, []);

  if (err) return <Page title="Health Care" back glyph="care"><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Health Care" subtitle="Medicines · Vitals · Doctor · Water · Sleep" back glyph="care"><Skeleton rows={5} /></Page>;

  const todays = data.meds.filter((m) => onDay(m, today));
  const doses = todays.flatMap((m) => slotsOf(m).map((s) => ({ m, s })));
  const done = doses.filter(({ m, s }) => data.logs.some((l) => l.medicine_id === m.id && l.slot === s.slot)).length;
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = doses
    .filter(({ m, s }) => !data.logs.some((l) => l.medicine_id === m.id && l.slot === s.slot))
    .sort((a, b) => a.s.at.localeCompare(b.s.at))
    .find(({ s }) => s.at >= nowHM) ?? doses.find(({ m, s }) => !data.logs.some((l) => l.medicine_id === m.id && l.slot === s.slot));
  const low = data.meds.filter((m) => ['low', 'out'].includes(stockState(m)));
  const nextVisit = data.appts.find((a) => a.status === 'upcoming' && a.appointment_date >= today);
  const waterPct = data.water / data.well.water_goal_ml;

  return (
    <Page title="Health Care" subtitle="Medicines · Vitals · Doctor · Water · Sleep" back glyph="care">
      <div className="care-hero">
        <p className="text-[12.5px] font-medium opacity-85">Today's care · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
        <div className="mt-2 flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[34px] font-bold leading-none">
              {done}
              <span className="text-[18px] font-semibold opacity-80">/{doses.length}</span>
            </p>
            <p className="mt-1 text-[13px] opacity-90">{doses.length ? 'doses taken today' : 'no medicines scheduled today'}</p>
            <p className="mt-2 text-[13px] opacity-90">
              💧 {(data.water / 1000).toFixed(2)} / {(data.well.water_goal_ml / 1000).toFixed(1)} L water
            </p>
          </div>
          <Glyph name="pill" size={84} />
        </div>
        {next && (
          <p className="mt-3 rounded-2xl bg-white/15 px-3 py-2 text-[13px]">
            Next: <b>{next.m.name}</b> · {next.s.label} {fmt12(next.s.at)} · {FOOD_LABEL[next.m.food]}
          </p>
        )}
        <div className="relative z-10 mt-3.5">
          <PillCTA onClick={() => nav('/care/medicines')}>{doses.length ? 'Open today’s doses' : 'Add a medicine'}</PillCTA>
        </div>
      </div>

      {low.length > 0 && (
        <Card className="space-y-1.5 !p-3.5" onClick={() => nav('/care/medicines?tab=all')}>
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <Package size={16} className="text-[var(--danger)]" /> Medicine stock running low
          </p>
          {low.map((m) => (
            <p key={m.id} className="text-[12.5px] text-muted">
              {m.name}: {m.stock_qty} left · about {daysLeft(m)} day(s)
            </p>
          ))}
        </Card>
      )}

      <SectionTitle>Your care tools</SectionTitle>
      <div className="space-y-2.5">
        <ToolCard glyph="pill" title="Medicines" sub={`${data.meds.filter((m) => m.status === 'active').length} active · ${done}/${doses.length} taken today`} right={low.length ? <Badge tone="danger">{low.length} low</Badge> : undefined} onClick={() => nav('/care/medicines')} />
        <ToolCard
          glyph="bp"
          title="Vitals"
          sub={data.bp ? `BP ${vitalValue(data.bp)} · ${relativeDay(data.bp.measured_on)}${data.sugar ? ` · Sugar ${data.sugar.sugar_mgdl}` : ''}` : 'BP, sugar, pulse, SpO2, weight'}
          right={data.bp ? <Badge tone={vitalStatus(data.bp).tone}>{vitalStatus(data.bp).label}</Badge> : undefined}
          onClick={() => nav('/care/vitals')}
        />
        <ToolCard glyph="stethoscope" title="Doctor appointments" sub={nextVisit ? `${nextVisit.doctor_name} · ${relativeDay(nextVisit.appointment_date)}${nextVisit.appointment_time ? ' ' + fmt12(nextVisit.appointment_time) : ''}` : 'No upcoming visit'} onClick={() => nav('/care/appointments')} />
        <ToolCard glyph="folder" title="Medical vault" sub={`${data.docs} document${data.docs === 1 ? '' : 's'} · prescriptions, reports, scans`} onClick={() => nav('/care/vault')} />
        <ToolCard glyph="drop" title="Water" sub={`${data.water} ml of ${data.well.water_goal_ml} ml today`} right={<span className="text-[13px] font-semibold text-primary">{Math.round(waterPct * 100)}%</span>} onClick={() => nav('/care/water')} />
        <ToolCard glyph="bed" title="Sleep" sub={data.sleep ? `${fmtDur(sleepMinutes(hhmm(data.sleep.bed_time), hhmm(data.sleep.wake_time)))} · ${formatDate(data.sleep.sleep_date)}` : 'Log your sleep'} onClick={() => nav('/care/sleep')} />
      </div>
      <p className="px-1 text-[11.5px] text-muted">For tracking only — not medical advice. Always follow your doctor.</p>
    </Page>
  );
}

/* ---------------- medicines ---------------- */
export function MedicinesScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [tab, setTab] = useState<'today' | 'all'>(() => (new URLSearchParams(location.search).get('tab') === 'all' ? 'all' : 'today'));
  const [busy, setBusy] = useState('');
  const [stockFor, setStockFor] = useState<Medicine | null>(null);
  const { data, err, load } = useLoad(async () => {
    const [meds, logs] = await Promise.all([fetchMedicines(), fetchDoseLogs(today)]);
    return { meds, logs };
  });
  useEffect(() => {
    careNotifyPermission().then(() => scheduleCareReminders()).catch(() => {});
  }, []);

  const act = async (key: string, fn: () => Promise<void>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast(msg);
      await load();
      scheduleCareReminders().catch(() => {});
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
    setBusy('');
  };

  const add = (
    <Button size="sm" variant="primary" onClick={() => nav('/r/medicines/new')}>
      <Plus size={14} /> Add
    </Button>
  );
  if (err) return <Page title="Medicines" back right={add}><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Medicines" back right={add}><Skeleton rows={4} /></Page>;

  const todays = data.meds.filter((m) => onDay(m, today));
  const logOf = (m: Medicine, slot: Slot) => data.logs.find((l) => l.medicine_id === m.id && l.slot === slot);

  return (
    <Page title="Medicines" subtitle="Doses, timings and stock" back right={add}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today' }, { value: 'all', label: `All (${data.meds.length})` }]} />
      {data.meds.length === 0 ? (
        <Empty title="No medicines yet" text="Add a medicine with its timings (morning / afternoon / night), before or after food, and how many tablets you have." action={<Button variant="primary" onClick={() => nav('/r/medicines/new')}><Plus size={14} /> Add medicine</Button>} />
      ) : tab === 'today' ? (
        todays.length === 0 ? (
          <Empty title="Nothing scheduled today" text="Active medicines whose dates include today show here." />
        ) : (
          (['morning', 'afternoon', 'night'] as Slot[]).map((slot) => {
            const rows = todays.flatMap((m) => slotsOf(m).filter((s) => s.slot === slot).map((s) => ({ m, s })));
            if (!rows.length) return null;
            return (
              <div key={slot} className="space-y-2">
                <SectionTitle>{rows[0].s.label}</SectionTitle>
                {rows.map(({ m, s }) => {
                  const log: DoseLog | undefined = logOf(m, slot);
                  const st = stockState(m);
                  return (
                    <Card key={m.id + slot} className="!p-3.5">
                      <div className="flex items-center gap-3">
                        <Glyph name="pill" size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">
                            {m.name} {m.dose && <span className="text-[12.5px] font-medium text-muted">{m.dose}</span>}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                            <span>{fmt12(s.at)}</span>
                            <span className="care-tag">{FOOD_LABEL[m.food]}</span>
                            <span>
                              {m.per_dose} {m.form}
                            </span>
                            {st === 'low' && <Badge tone="amber">{daysLeft(m)}d stock</Badge>}
                            {st === 'out' && <Badge tone="danger">Out of stock</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {log ? (
                          <>
                            <span className={cx('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold', log.status === 'taken' ? 'care-chip-on' : 'bg-[var(--tone-amber-bg)] text-[var(--tone-amber)]')}>
                              {log.status === 'taken' ? <Check size={15} /> : <X size={15} />}
                              {log.status === 'taken' ? `Taken ${new Date(log.taken_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'Skipped'}
                            </span>
                            <Button size="md" loading={busy === log.id} onClick={() => act(log.id, () => undoDose(log.id), 'Undone')}>
                              <Undo2 size={14} /> Undo
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={!!busy}
                              onClick={() => act(m.id + slot, () => logDose(m, slot, 'taken'), `${m.name} marked taken`)}
                              className="care-chip-on flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold active:scale-[.98] disabled:opacity-60"
                            >
                              <Check size={15} /> {busy === m.id + slot ? 'Saving…' : 'Take'}
                            </button>
                            <Button size="md" disabled={!!busy} onClick={() => act(m.id + slot + 's', () => logDose(m, slot, 'skipped'), 'Dose skipped')}>
                              Skip
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })
        )
      ) : (
        <div className="space-y-2.5">
          {data.meds.map((m) => {
            const st = stockState(m);
            const d = daysLeft(m);
            return (
              <Card key={m.id} className="!p-3.5" onClick={() => nav(`/r/medicines/${m.id}`)}>
                <div className="flex items-center gap-3">
                  <Glyph name="pill" size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {m.name} {m.dose && <span className="text-[12.5px] font-medium text-muted">{m.dose}</span>}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {slotsOf(m).map((s) => `${s.label} ${fmt12(s.at)}`).join(' · ') || 'No time set'} · {FOOD_LABEL[m.food]}
                    </p>
                  </div>
                  {m.status !== 'active' ? <Badge>{m.status === 'paused' ? 'Paused' : 'Finished'}</Badge> : st === 'out' ? <Badge tone="danger">Out</Badge> : st === 'low' ? <Badge tone="amber">Low</Badge> : null}
                </div>
                {m.stock_qty != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-muted">
                          {m.stock_qty} left{d != null ? ` · about ${d} day${d === 1 ? '' : 's'}` : ''}
                        </span>
                        <span className="text-muted">warn at {m.low_stock_days}d</span>
                      </div>
                      <div className="bar-track mt-1">
                        <div className="bar-fill" style={{ width: `${Math.min(100, ((d ?? 0) / Math.max(1, m.low_stock_days * 4)) * 100)}%`, background: st === 'out' || st === 'low' ? 'var(--danger)' : 'linear-gradient(90deg,#1f6fff,#27c46b)' }} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStockFor(m);
                      }}
                    >
                      <Plus size={13} /> Stock
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p className="flex items-center gap-1.5 px-1 text-[11.5px] text-muted">
        <BellRing size={12} /> Reminders ring at each dose time (turn off per medicine). Stock goes down when you tap Take; Undo puts it back.
      </p>
      <StockSheet med={stockFor} onClose={() => setStockFor(null)} onDone={load} />
    </Page>
  );
}

function StockSheet({ med, onClose, onDone }: { med: Medicine | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [n, setN] = useState('10');
  const [busy, setBusy] = useState(false);
  useEffect(() => setN('10'), [med?.id]);
  const save = async () => {
    if (!med) return;
    const v = Number(n);
    if (!Number.isInteger(v) || v <= 0 || v > 5000) return toast('Enter how many you bought (1–5000).', 'error');
    setBusy(true);
    try {
      await addStock(med, v);
      toast(`Added ${v} to ${med.name}`);
      onClose();
      onDone();
      scheduleCareReminders().catch(() => {});
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
    setBusy(false);
  };
  return (
    <Sheet open={!!med} onClose={onClose} title={med ? `Add stock · ${med.name}` : ''}>
      <p className="mb-3 text-center text-[13px] text-muted">Now {med?.stock_qty ?? 0} left. Bought a new strip / bottle? Add how many.</p>
      <div className="mb-4 flex items-center justify-center gap-3">
        <Button onClick={() => setN(String(Math.max(1, Number(n || 0) - 1)))} aria-label="Less">
          <Minus size={15} />
        </Button>
        <input className="field w-24 text-center text-[18px] font-bold" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} />
        <Button onClick={() => setN(String(Number(n || 0) + 1))} aria-label="More">
          <Plus size={15} />
        </Button>
      </div>
      <div className="mb-4 flex justify-center gap-2">
        {[10, 15, 30].map((q) => (
          <Button key={q} size="sm" onClick={() => setN(String(q))}>
            +{q}
          </Button>
        ))}
      </div>
      <Button variant="primary" full size="lg" loading={busy} onClick={save}>
        Add to stock
      </Button>
    </Sheet>
  );
}

/* ---------------- vitals ---------------- */
type VKind = Vital['kind'] | 'weight';
const VKINDS: { value: VKind; label: string }[] = [
  { value: 'bp', label: 'BP' },
  { value: 'sugar', label: 'Sugar' },
  { value: 'weight', label: 'Weight' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'spo2', label: 'SpO2' },
  { value: 'temperature', label: 'Temp' },
];

export function VitalsScreen() {
  const nav = useNavigate();
  const [kind, setKind] = useState<VKind>('bp');
  const [rows, setRows] = useState<Vital[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    if (kind === 'weight') return;
    setRows(null);
    setErr('');
    try {
      setRows(await fetchVitals(kind, 60));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);

  const vk = kind === 'weight' ? null : kind;
  const add = (
    <Button size="sm" variant="primary" onClick={() => (vk ? nav(`/r/vitals/new?kind=${vk}`) : nav('/weight'))}>
      <Plus size={14} /> Add
    </Button>
  );
  const chrono = useMemo(() => (rows ? [...rows].reverse().slice(-30) : []), [rows]);
  const avg = (days: number, f: (v: Vital) => number | null) => {
    const from = addDays(todayISO(), -days + 1);
    const xs = (rows ?? []).filter((r) => r.measured_on >= from).map(f).filter((x): x is number => x != null && Number.isFinite(x));
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };
  const latest = rows?.[0];

  return (
    <Page title="Vitals" subtitle="BP, sugar, weight & more" back right={add}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {VKINDS.map((k) => (
          <button key={k.value} onClick={() => setKind(k.value)} className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold', kind === k.value ? 'care-chip-on' : 'bg-[var(--card-2)] text-muted')}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'weight' ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <Glyph name="scale" size={48} />
            <div>
              <p className="text-[15px] font-semibold">Weight & body</p>
              <p className="text-[12.5px] text-muted">Your weight log, BMI and goal are on the Weight screen.</p>
            </div>
          </div>
          <PillCTA onClick={() => nav('/weight')}>Open weight log</PillCTA>
        </Card>
      ) : err ? (
        <ErrorBox message={err} onRetry={load} />
      ) : !rows ? (
        <Skeleton rows={4} />
      ) : rows.length === 0 ? (
        <Empty title="No readings yet" text="Add your first reading. Trends and averages show after a few entries." action={<Button variant="primary" onClick={() => nav(`/r/vitals/new?kind=${vk}`)}><Plus size={14} /> Add reading</Button>} />
      ) : (
        <>
          <div className="care-hero">
            <p className="text-[12.5px] opacity-85">Latest · {formatDate(latest!.measured_on)}{latest!.measured_time ? ' · ' + fmt12(latest!.measured_time) : ''}</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-[40px] font-bold leading-none">
                {vitalValue(latest!)}
                <span className="ml-1 text-[14px] font-semibold opacity-85">{VITAL_UNIT[latest!.kind]}</span>
              </p>
              <span className="rounded-full bg-white/20 px-3 py-1 text-[13px] font-semibold">{vitalStatus(latest!).label}</span>
            </div>
            {latest!.kind === 'bp' && latest!.pulse && <p className="mt-1 text-[13px] opacity-90">Pulse {latest!.pulse} bpm</p>}
          </div>
          <Card className="space-y-2">
            <p className="text-[14px] font-semibold">Trend (last {chrono.length})</p>
            {vk === 'bp' ? (
              <TrendChart series={[{ label: 'Upper', cls: 'care-line-a', values: chrono.map((r) => r.systolic ?? 0) }, { label: 'Lower', cls: 'care-line-b', values: chrono.map((r) => r.diastolic ?? 0) }]} />
            ) : (
              <TrendChart series={[{ label: 'Value', cls: 'care-line-a', values: chrono.map((r) => Number(vitalValue(r))) }]} />
            )}
          </Card>
          <div className="grid grid-cols-2 gap-2.5">
            {[7, 30].map((d) => {
              const a = vk === 'bp' ? avg(d, (r) => r.systolic) : avg(d, (r) => Number(vitalValue(r)));
              const b = vk === 'bp' ? avg(d, (r) => r.diastolic) : null;
              return (
                <Card key={d} className="!p-3.5">
                  <p className="text-[12px] text-muted">{d}-day average</p>
                  <p className="text-[20px] font-bold">{a == null ? '—' : vk === 'bp' ? `${Math.round(a)}/${Math.round(b ?? 0)}` : a}</p>
                </Card>
              );
            })}
          </div>
          <SectionTitle>History</SectionTitle>
          <List>
            {rows.slice(0, 40).map((r) => (
              <RecordLine key={r.id} table="vitals" row={r} nameOf={noName} />
            ))}
          </List>
          <p className="px-1 text-[11.5px] text-muted">"Normal / High" uses general adult ranges as a guide only. Your doctor's targets come first.</p>
        </>
      )}
    </Page>
  );
}

/* ---------------- appointments ---------------- */
export function AppointmentsScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [tab, setTab] = useState<'up' | 'past'>('up');
  const { data, err, load } = useLoad(fetchAppointments);
  useEffect(() => {
    careNotifyPermission().then(() => scheduleCareReminders()).catch(() => {});
  }, []);
  const add = (
    <Button size="sm" variant="primary" onClick={() => nav('/r/doctor_appointments/new')}>
      <Plus size={14} /> Add
    </Button>
  );
  const markDone = async (a: Appointment) => {
    const { error } = await supabase.from('doctor_appointments').update({ status: 'done' }).eq('id', a.id);
    if (error) return toast(friendlyError(error), 'error');
    toast('Marked as visited');
    load();
    scheduleCareReminders().catch(() => {});
  };

  if (err) return <Page title="Appointments" back right={add}><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Appointments" back right={add}><Skeleton rows={4} /></Page>;
  const up = data.filter((a) => a.status === 'upcoming' && a.appointment_date >= today);
  const past = data.filter((a) => !(a.status === 'upcoming' && a.appointment_date >= today)).reverse();
  const list = tab === 'up' ? up : past;

  return (
    <Page title="Appointments" subtitle="Doctor visits & follow-ups" back right={add}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'up', label: `Upcoming (${up.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
      {list.length === 0 ? (
        <Empty title={tab === 'up' ? 'No upcoming visit' : 'No past visits'} text="Add a doctor visit to get a reminder 1 day before and 2 hours before." action={tab === 'up' ? <Button variant="primary" onClick={() => nav('/r/doctor_appointments/new')}><Plus size={14} /> Add appointment</Button> : undefined} />
      ) : (
        list.map((a) => (
          <Card key={a.id} className="!p-3.5" onClick={() => nav(`/r/doctor_appointments/${a.id}`)}>
            <div className="flex items-center gap-3">
              <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl text-white" style={{ background: 'linear-gradient(140deg,#1f6fff,#14b8a6)' }}>
                <span className="text-[18px] font-bold leading-none">{new Date(a.appointment_date + 'T00:00:00').getDate()}</span>
                <span className="text-[10.5px] font-semibold uppercase">{new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{a.doctor_name}</p>
                <p className="truncate text-[12.5px] text-muted">{[a.speciality, a.appointment_time && fmt12(a.appointment_time), a.clinic, a.for_person].filter(Boolean).join(' · ') || relativeDay(a.appointment_date)}</p>
              </div>
              {tab === 'past' && <Badge tone={a.status === 'done' ? 'primary' : 'muted'}>{a.status === 'done' ? 'Visited' : a.status === 'upcoming' ? 'Not updated' : a.status === 'cancelled' ? 'Cancelled' : 'Missed'}</Badge>}
            </div>
            <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
              {a.phone && (
                <a href={`tel:${a.phone}`} className="liquid inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold">
                  <Phone size={13} /> Call
                </a>
              )}
              {a.status === 'upcoming' && a.appointment_date <= today && (
                <Button size="sm" onClick={() => markDone(a)}>
                  <Check size={13} /> Visited
                </Button>
              )}
              <Button size="sm" onClick={() => nav(`/r/medical_documents/new?appointment_id=${a.id}&doctor_name=${encodeURIComponent(a.doctor_name)}&doc_date=${a.appointment_date}`)}>
                <FileText size={13} /> Add prescription
              </Button>
            </div>
          </Card>
        ))
      )}
    </Page>
  );
}

/* ---------------- medical vault ---------------- */
export function VaultScreen() {
  const nav = useNavigate();
  const [type, setType] = useState('all');
  const { data, err, load } = useLoad(async () => {
    const [docs, files] = await Promise.all([
      supabase.from('medical_documents').select('*').is('deleted_at', null).order('doc_date', { ascending: false }),
      supabase.from('attachments').select('parent_id').eq('parent_table', 'medical_documents').is('deleted_at', null),
    ]);
    if (docs.error) throw docs.error;
    const count = new Map<string, number>();
    (files.data ?? []).forEach((f: any) => count.set(f.parent_id, (count.get(f.parent_id) ?? 0) + 1));
    return { docs: (docs.data ?? []) as any[], count };
  });
  const add = (
    <Button size="sm" variant="primary" onClick={() => nav(`/r/medical_documents/new${type !== 'all' ? `?doc_type=${type}` : ''}`)}>
      <Plus size={14} /> Add
    </Button>
  );
  if (err) return <Page title="Medical vault" back right={add}><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Medical vault" back right={add}><Skeleton rows={4} /></Page>;
  const types = [{ value: 'all', label: 'All' }, ...DOC_TYPES.filter((t) => data.docs.some((d) => d.doc_type === t.value))];
  const list = type === 'all' ? data.docs : data.docs.filter((d) => d.doc_type === type);

  return (
    <Page title="Medical vault" subtitle="Prescriptions, reports & scans" back right={add}>
      <div className="care-hero !py-4">
        <div className="flex items-center gap-3">
          <Glyph name="folder" size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-bold leading-tight">{data.docs.length} documents</p>
            <p className="text-[12.5px] opacity-90">{[...data.count.values()].reduce((a, b) => a + b, 0)} photos / PDFs · private to you</p>
          </div>
        </div>
      </div>
      {types.length > 2 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {types.map((t) => (
            <button key={t.value} onClick={() => setType(t.value)} className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold', type === t.value ? 'care-chip-on' : 'bg-[var(--card-2)] text-muted')}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <Empty title="Vault is empty" text="Add a prescription or report, save it, then add photos or a PDF in its Photos section." action={<Button variant="primary" onClick={() => nav('/r/medical_documents/new')}><Plus size={14} /> Add document</Button>} />
      ) : (
        <List>
          {list.map((d) => (
            <div key={d.id} className="relative">
              <RecordLine table="medical_documents" row={d} nameOf={noName} />
              {(data.count.get(d.id) ?? 0) > 0 && (
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                  <span className="care-tag">📎 {data.count.get(d.id)}</span>
                </span>
              )}
            </div>
          ))}
        </List>
      )}
      <p className="px-1 text-[11.5px] text-muted">Files are stored in your private storage — only your login can open them. Max 5 MB each (JPG, PNG, WEBP, PDF).</p>
    </Page>
  );
}

/* ---------------- water ---------------- */
export function WaterScreen() {
  const toast = useToast();
  const today = todayISO();
  const [busy, setBusy] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const { data, err, load } = useLoad(async () => {
    const [well, logs, week] = await Promise.all([
      fetchWellness(),
      supabase.from('water_logs').select('*').is('deleted_at', null).eq('logged_on', today).order('logged_at', { ascending: false }),
      waterByDay(addDays(today, -6), today),
    ]);
    if (logs.error) throw logs.error;
    return { well, logs: (logs.data ?? []) as any[], week };
  });
  const drink = async (ml: number) => {
    setBusy(true);
    const { error } = await supabase.from('water_logs').insert({ ml, logged_on: today });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(`+${ml} ml`);
    load();
  };
  const undo = async (id: string) => {
    const { error } = await supabase.from('water_logs').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast(friendlyError(error), 'error');
    load();
  };
  if (err) return <Page title="Water" back><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Water" back><Skeleton rows={4} /></Page>;
  const total = data.logs.reduce((a, l) => a + l.ml, 0);
  const goal = data.well.water_goal_ml;
  const glasses = Math.floor(total / data.well.glass_ml);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ label: dayShort(d), value: data.week.get(d) ?? 0, highlight: d === today }));

  return (
    <Page title="Water" subtitle="Daily intake counter" back right={<Button size="sm" onClick={() => setGoalOpen(true)}>Goal</Button>}>
      <Card className="flex items-center gap-4">
        <Ring pct={total / goal}>
          <Glyph name="drop" size={30} />
          <p className="text-[18px] font-bold leading-tight">{(total / 1000).toFixed(2)}L</p>
          <p className="text-[11px] text-muted">of {(goal / 1000).toFixed(1)}L</p>
        </Ring>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[15px] font-semibold">{total >= goal ? 'Goal done today 🎉' : `${goal - total} ml to go`}</p>
          <p className="text-[12.5px] text-muted">
            {glasses} glass{glasses === 1 ? '' : 'es'} of {data.well.glass_ml} ml
          </p>
          <p className="text-[12.5px] text-muted">Reminders: {data.well.water_reminders ? 'every 2 hours, 9 AM–9 PM' : 'off'}</p>
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[data.well.glass_ml, 500, 1000].map((ml, i) => (
          <button key={i} disabled={busy} onClick={() => drink(ml)} className={cx('flex h-16 flex-col items-center justify-center rounded-2xl text-[13px] font-semibold active:scale-[.98] disabled:opacity-60', i === 0 ? 'care-chip-on' : 'glass')}>
            <span className="text-[16px] font-bold">+{ml >= 1000 ? `${ml / 1000}L` : ml}</span>
            <span className="text-[11px] opacity-80">{i === 0 ? '1 glass' : i === 1 ? 'Bottle' : 'Big bottle'}</span>
          </button>
        ))}
      </div>
      <Card className="space-y-2">
        <p className="text-[14px] font-semibold">Last 7 days</p>
        <BarChart data={week} height={90} format={(v) => `${(v / 1000).toFixed(1)}L`} />
      </Card>
      {data.logs.length > 0 && (
        <>
          <SectionTitle>Today</SectionTitle>
          <List>
            {data.logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Glyph name="drop" size={26} />
                <p className="flex-1 text-[14px] font-medium">{l.ml} ml</p>
                <span className="text-[12px] text-muted">{new Date(l.logged_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                <button onClick={() => undo(l.id)} className="text-[12.5px] font-semibold text-primary">
                  Undo
                </button>
              </div>
            ))}
          </List>
        </>
      )}
      <WellnessSheet open={goalOpen} well={data.well} onClose={() => setGoalOpen(false)} onSaved={load} />
    </Page>
  );
}

function WellnessSheet({ open, well, onClose, onSaved }: { open: boolean; well: Wellness; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [goal, setGoal] = useState(String(well.water_goal_ml));
  const [glass, setGlass] = useState(String(well.glass_ml));
  const [sleepH, setSleepH] = useState(String(well.sleep_goal_minutes / 60));
  const [rem, setRem] = useState(well.water_reminders);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setGoal(String(well.water_goal_ml));
    setGlass(String(well.glass_ml));
    setSleepH(String(well.sleep_goal_minutes / 60));
    setRem(well.water_reminders);
  }, [open, well]);
  const save = async () => {
    const g = Number(goal), gl = Number(glass), sh = Number(sleepH);
    if (!(g >= 500 && g <= 8000)) return toast('Water goal: 500 to 8000 ml', 'error');
    if (!(gl >= 50 && gl <= 1000)) return toast('Glass size: 50 to 1000 ml', 'error');
    if (!(sh >= 3 && sh <= 14)) return toast('Sleep goal: 3 to 14 hours', 'error');
    setBusy(true);
    try {
      if (rem) await careNotifyPermission();
      await saveWellness({ water_goal_ml: Math.round(g), glass_ml: Math.round(gl), sleep_goal_minutes: Math.round(sh * 60), water_reminders: rem });
      scheduleCareReminders().catch(() => {});
      toast('Saved');
      onClose();
      onSaved();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Goals">
      <div className="space-y-3">
        <FormRow label="Water goal per day (ml)">
          <input className="field" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ''))} />
        </FormRow>
        <FormRow label="My glass size (ml)">
          <input className="field" inputMode="numeric" value={glass} onChange={(e) => setGlass(e.target.value.replace(/\D/g, ''))} />
        </FormRow>
        <FormRow label="Sleep goal (hours)">
          <input className="field" inputMode="decimal" value={sleepH} onChange={(e) => setSleepH(e.target.value.replace(/[^\d.]/g, ''))} />
        </FormRow>
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[14px] font-medium">Water reminders</p>
            <p className="text-[12px] text-muted">Every 2 hours, 9 AM – 9 PM</p>
          </div>
          <Toggle checked={rem} onChange={setRem} />
        </div>
        <Button variant="primary" full size="lg" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------------- sleep ---------------- */
export function SleepScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [bed, setBed] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [quality, setQuality] = useState('good');
  const [busy, setBusy] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const { data, err, load } = useLoad(async () => {
    const [well, rows] = await Promise.all([fetchWellness(), supabase.from('sleep_logs').select('*').is('deleted_at', null).order('sleep_date', { ascending: false }).limit(30)]);
    if (rows.error) throw rows.error;
    return { well, rows: (rows.data ?? []) as any[] };
  });
  const lastNight = addDays(today, -1);
  const already = data?.rows.find((r) => r.sleep_date === lastNight);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('sleep_logs').insert({ sleep_date: lastNight, bed_time: bed, wake_time: wake, quality });
    setBusy(false);
    if (error) return toast(friendlyError(error), 'error');
    toast('Sleep saved');
    load();
  };
  if (err) return <Page title="Sleep" back><ErrorBox message={err} onRetry={load} /></Page>;
  if (!data) return <Page title="Sleep" back><Skeleton rows={4} /></Page>;
  const byDay = new Map<string, number>();
  data.rows.forEach((r) => byDay.set(r.sleep_date, (byDay.get(r.sleep_date) ?? 0) + sleepMinutes(hhmm(r.bed_time), hhmm(r.wake_time))));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 7)).map((d) => ({ label: dayShort(addDays(d, 1)), value: Math.round(((byDay.get(d) ?? 0) / 60) * 10) / 10, highlight: d === lastNight }));
  const logged = week.filter((w) => w.value > 0);
  const avg = logged.length ? logged.reduce((a, w) => a + w.value, 0) / logged.length : null;
  const mins = sleepMinutes(bed, wake);

  return (
    <Page title="Sleep" subtitle="Bedtime routine tracker" back right={<Button size="sm" onClick={() => setGoalOpen(true)}>Goal</Button>}>
      <div className="care-hero">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] opacity-85">7-night average</p>
            <p className="text-[32px] font-bold leading-tight">{avg == null ? '—' : fmtDur(avg * 60)}</p>
            <p className="text-[12.5px] opacity-90">Goal {fmtDur(data.well.sleep_goal_minutes)} · {logged.length}/7 nights logged</p>
          </div>
          <Glyph name="moon" size={76} />
        </div>
      </div>
      {already ? (
        <Card className="!p-3.5">
          <p className="text-[14px] font-semibold">Last night is logged ✓</p>
          <p className="text-[12.5px] text-muted">
            {hhmm(already.bed_time)} → {hhmm(already.wake_time)} · {fmtDur(sleepMinutes(hhmm(already.bed_time), hhmm(already.wake_time)))}
          </p>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-[14px] font-semibold">Log last night</p>
          <div className="grid grid-cols-2 gap-2.5">
            <FormRow label="Slept at">
              <input className="field" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
            </FormRow>
            <FormRow label="Woke up at">
              <input className="field" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            </FormRow>
          </div>
          <div className="flex gap-2">
            {SLEEP_QUALITY.map((q) => (
              <button key={q.value} onClick={() => setQuality(q.value)} className={cx('h-9 flex-1 rounded-full text-[12.5px] font-semibold', quality === q.value ? 'care-chip-on' : 'bg-[var(--card-2)] text-muted')}>
                {q.label}
              </button>
            ))}
          </div>
          <Button variant="primary" full loading={busy} onClick={save}>
            Save · {fmtDur(mins)}
          </Button>
        </Card>
      )}
      <Card className="space-y-2">
        <p className="text-[14px] font-semibold">Last 7 nights (hours)</p>
        <BarChart data={week} height={90} format={(v) => `${v}h`} />
      </Card>
      {data.rows.length > 0 && (
        <>
          <SectionTitle right={<SeeAll label="Add older" onClick={() => nav('/r/sleep_logs/new')} />}>History</SectionTitle>
          <List>
            {data.rows.slice(0, 14).map((r) => (
              <RecordLine key={r.id} table="sleep_logs" row={r} nameOf={noName} />
            ))}
          </List>
        </>
      )}
      <WellnessSheet open={goalOpen} well={data.well ?? DEFAULT_WELLNESS} onClose={() => setGoalOpen(false)} onSaved={load} />
    </Page>
  );
}

/** small entry card used on the Health screen */
export function CareEntryCard() {
  const nav = useNavigate();
  return (
    <div className="care-hero !py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold">Health Care</p>
          <p className="text-[12.5px] opacity-90">Medicines · Vitals · Doctor visits · Vault · Water · Sleep</p>
          <div className="relative z-10 mt-3">
            <PillCTA onClick={() => nav('/care')}>Open Health Care</PillCTA>
          </div>
        </div>
        <Glyph name="stethoscope" size={72} />
      </div>
    </div>
  );
}
