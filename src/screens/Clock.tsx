// Clock: Timer · Stopwatch · Alarm · World clock (+ a door to Pomodoro focus).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Pause, RotateCcw, Flag, Plus, Trash2, Bell, ChevronRight } from 'lucide-react';
import {
  addToTimer, CITIES, cityTime, clearTimer, exactAlarmAllowed, expireOnceAlarms, fmtClock, getAlarms, getStopwatch, getTimer, getWorld,
  MAX_ALARMS, nextRings, openExactAlarmSetting, pauseTimer, resumeTimer, ring, saveAlarms, saveStopwatch, saveWorld, startTimer, swElapsed, timerLeft,
  type Alarm, type StopwatchState, type TimerState,
} from '../lib/clock';
import { Glyph } from '../components/Glyph';
import { Button, Card, FormRow, Page, Segmented, Sheet, Toggle, cx } from '../components/ui';
import { useToast } from '../context/ToastContext';

type Tab = 'timer' | 'stopwatch' | 'alarm' | 'world';

function useTick(ms: number, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(i);
  }, [ms, on]);
}

export function ClockScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'timer';
  return (
    <Page title="Clock" subtitle="Timer · Stopwatch · Alarm · World" back glyph="clock">
      <Segmented
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'timer', label: 'Timer' },
          { value: 'stopwatch', label: 'Stopwatch' },
          { value: 'alarm', label: 'Alarm' },
          { value: 'world', label: 'World' },
        ]}
      />
      {tab === 'timer' && <TimerTab />}
      {tab === 'stopwatch' && <StopwatchTab />}
      {tab === 'alarm' && <AlarmTab />}
      {tab === 'world' && <WorldTab />}
      <Card onClick={() => nav('/pomodoro')} className="press flex items-center gap-3">
        <Glyph name="target" size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Pomodoro focus</p>
          <p className="text-[12.5px] text-muted">25 min work · 5 min break — for study, business or personal, saved to your log</p>
        </div>
        <ChevronRight size={18} className="text-muted" />
      </Card>
    </Page>
  );
}

/* ---------------- ring ---------------- */
function Ring({ pct, children, size = 240 }: { pct: number; children: ReactNode; size?: number }) {
  const r = size / 2 - 12;
  const L = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="clock-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--tone-teal, #22d3ee)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#clock-ring)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${L * Math.max(0, Math.min(1, pct))} ${L}`} style={{ transition: 'stroke-dasharray .25s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ---------------- Timer ---------------- */
const PRESETS = [1, 3, 5, 10, 15, 20, 25, 30, 45, 60];

function TimerTab() {
  const toast = useToast();
  const [t, setT] = useState<TimerState | null>(() => getTimer());
  const [h, setH] = useState('0');
  const [m, setM] = useState('10');
  const [s, setS] = useState('0');
  const [label, setLabel] = useState('');
  const rang = useRef(false);
  useTick(250, !!t?.endAt);
  const left = t ? timerLeft(t) : 0;
  useEffect(() => {
    if (t?.endAt && left <= 0 && !rang.current) {
      rang.current = true;
      ring(4);
      toast(`⏰ ${t.label || "Time's up"}`);
    }
    if (left > 0) rang.current = false;
  }, [left, t, toast]);

  const begin = async (ms: number) => {
    if (ms <= 0) return;
    setT(await startTimer(ms, label.trim()));
  };
  const custom = () => (Number(h) || 0) * 3600000 + (Number(m) || 0) * 60000 + (Number(s) || 0) * 1000;

  if (t) {
    const done = left <= 0;
    return (
      <Card className="space-y-4 py-6">
        <Ring pct={t.total ? left / t.total : 0}>
          <p className="text-[12.5px] text-muted">{t.label || 'Timer'}</p>
          <p className={cx('tabular text-[46px] font-bold tracking-tight', done && 'text-expense')}>{done ? "Time's up" : fmtClock(left)}</p>
          {!done && t.endAt && (
            <p className="flex items-center gap-1 text-[12.5px] text-muted">
              <Bell size={12} /> {new Date(t.endAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </Ring>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={async () => { await clearTimer(); setT(null); }}>
            <RotateCcw size={16} /> Reset
          </Button>
          {!done && (
            <Button variant="primary" size="lg" onClick={async () => setT(t.endAt ? await pauseTimer(t) : await resumeTimer(t))}>
              {t.endAt ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Resume</>}
            </Button>
          )}
          <Button onClick={async () => setT(done ? await startTimer(60000, t.label) : await addToTimer(t, 60000))}>+1 min</Button>
        </div>
        <p className="text-center text-[11.5px] text-muted">Keeps running when you close the app — your phone rings a notification at the end.</p>
      </Card>
    );
  }
  return (
    <>
      <Card className="space-y-3">
        <p className="text-[13px] font-semibold text-muted">Quick start</p>
        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => begin(p * 60000)} className="liquid press rounded-[14px] py-2.5 text-center">
              <span className="block text-[17px] font-bold">{p}</span>
              <span className="block text-[10.5px] text-muted">min</span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="space-y-3">
        <p className="text-[13px] font-semibold text-muted">Custom</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Hours', h, setH],
            ['Minutes', m, setM],
            ['Seconds', s, setS],
          ].map(([l, v, f]: any) => (
            <FormRow key={l} label={l}>
              <input className="field text-center text-[20px] font-bold" inputMode="numeric" value={v} onChange={(e) => f(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </FormRow>
          ))}
        </div>
        <FormRow label="Label (optional)">
          <input className="field" value={label} placeholder="e.g. Tea, Revision break, Call client" onChange={(e) => setLabel(e.target.value)} />
        </FormRow>
        <Button variant="primary" full size="lg" onClick={() => begin(custom())} disabled={custom() <= 0}>
          <Play size={18} /> Start {custom() > 0 ? fmtClock(custom()) : ''}
        </Button>
      </Card>
    </>
  );
}

/* ---------------- Stopwatch ---------------- */
function StopwatchTab() {
  const [sw, setSw] = useState<StopwatchState>(() => getStopwatch());
  useTick(50, !!sw.startAt);
  const now = swElapsed(sw);
  const set = (n: StopwatchState) => {
    setSw(n);
    saveStopwatch(n);
  };
  const laps = sw.laps.map((t, i) => t - (i ? sw.laps.at(i - 1)! : 0));
  const best = laps.length > 1 ? Math.min(...laps) : null;
  const worst = laps.length > 1 ? Math.max(...laps) : null;
  return (
    <Card className="space-y-4 py-6">
      <Ring pct={(now % 60000) / 60000}>
        <p className="tabular text-[44px] font-bold tracking-tight">{fmtClock(now, true)}</p>
        {sw.laps.length > 0 && <p className="text-[12.5px] text-muted">Lap {sw.laps.length + 1} · {fmtClock(now - (sw.laps.at(-1) ?? 0), true)}</p>}
      </Ring>
      <div className="flex items-center justify-center gap-3">
        <Button onClick={() => (sw.startAt ? set({ ...sw, laps: [...sw.laps, now] }) : set({ startAt: null, acc: 0, laps: [] }))} disabled={!sw.startAt && now === 0}>
          {sw.startAt ? <><Flag size={16} /> Lap</> : <><RotateCcw size={16} /> Reset</>}
        </Button>
        <Button variant="primary" size="lg" onClick={() => set(sw.startAt ? { ...sw, acc: now, startAt: null } : { ...sw, startAt: Date.now() })}>
          {sw.startAt ? <><Pause size={18} /> Pause</> : <><Play size={18} /> {now ? 'Resume' : 'Start'}</>}
        </Button>
      </div>
      {laps.length > 0 && (
        <div className="divide-y divide-[var(--hairline)] rounded-[14px] bg-[var(--field)] px-3">
          {laps
            .map((l, i) => ({ l, i }))
            .reverse()
            .map(({ l, i }) => (
              <div key={i} className="flex items-center justify-between py-2 text-[13.5px]">
                <span className="text-muted">Lap {i + 1}</span>
                <span className={cx('tabular font-semibold', l === best && 'text-income', l === worst && 'text-expense')}>{fmtClock(l, true)}</span>
                <span className="tabular text-muted">{fmtClock(sw.laps.at(i)!, true)}</span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Alarm ---------------- */
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function daysText(d: number[]) {
  if (!d.length) return 'Once';
  if (d.length === 7) return 'Every day';
  if ([1, 2, 3, 4, 5].every((x) => d.includes(x)) && d.length === 5) return 'Weekdays';
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Weekends';
  return [...d].sort().map((x) => DAY_NAMES.at(x)).join(', ');
}

function AlarmTab() {
  const toast = useToast();
  const [list, setList] = useState<Alarm[]>(() => {
    expireOnceAlarms();
    return getAlarms();
  });
  const [edit, setEdit] = useState<Alarm | null>(null);
  const [exact, setExact] = useState<boolean | null>(null);
  useEffect(() => {
    exactAlarmAllowed().then(setExact);
  }, []);
  const save = async (l: Alarm[]) => {
    setList(l);
    await saveAlarms(l);
  };
  const next = useMemo(() => {
    const all = list.filter((a) => a.on).flatMap((a) => nextRings(a).slice(0, 1).map((d) => ({ a, d })));
    return all.sort((x, y) => x.d.getTime() - y.d.getTime())[0];
  }, [list]);
  const inText = (d: Date) => {
    const mins = Math.round((d.getTime() - Date.now()) / 60000);
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  };
  return (
    <>
      {next && (
        <Card className="flex items-center gap-3">
          <Glyph name="bell" size={40} />
          <div>
            <p className="text-[13px] text-muted">Next alarm</p>
            <p className="text-[16px] font-semibold">
              {next.a.time} · in {inText(next.d)}
            </p>
          </div>
        </Card>
      )}
      {exact === false && (
        <Card className="space-y-2">
          <p className="text-[13.5px]">To ring at the exact minute, allow <b>Alarms &amp; reminders</b> for DeepBoost Life.</p>
          <Button size="sm" onClick={async () => { await openExactAlarmSetting(); setExact(await exactAlarmAllowed()); }}>Open setting</Button>
        </Card>
      )}
      {list.length === 0 ? (
        <Card className="text-center">
          <p className="text-[14px] font-semibold">No alarms</p>
          <p className="mt-1 text-[12.5px] text-muted">Wake up, study start, medicine, client call…</p>
        </Card>
      ) : (
        list.map((a, i) => (
          <Card key={a.id} className="flex items-center gap-3" onClick={() => setEdit(a)}>
            <div className="min-w-0 flex-1">
              <p className={cx('tabular text-[32px] font-bold leading-none tracking-tight', !a.on && 'opacity-45')}>{a.time}</p>
              <p className="mt-1 truncate text-[12.5px] text-muted">{[a.label || 'Alarm', daysText(a.days)].join(' · ')}</p>
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle checked={a.on} onChange={(v) => save(list.map((x, j) => (j === i ? { ...x, on: v, setAt: Date.now() } : x)))} />
            </span>
          </Card>
        ))
      )}
      <Button
        full
        variant="primary"
        disabled={list.length >= MAX_ALARMS}
        onClick={() => {
          const d = new Date(Date.now() + 3600000);
          setEdit({ id: '', time: `${String(d.getHours()).padStart(2, '0')}:00`, label: '', days: [], on: true });
        }}
      >
        <Plus size={17} /> Add alarm
      </Button>
      <p className="px-1 text-[11.5px] text-muted">Alarms ring as a phone notification with sound, even when the app is closed. Keep notifications on for DeepBoost Life. Up to {MAX_ALARMS} alarms.</p>
      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.id ? 'Edit alarm' : 'New alarm'}>
          <AlarmForm
            a={edit}
            onSave={async (a) => {
              const n = { ...a, setAt: Date.now(), on: true };
              await save(a.id ? list.map((x) => (x.id === a.id ? n : x)) : [...list, { ...n, id: String(Date.now()) }]);
              setEdit(null);
              const r = nextRings(n)[0];
              if (r) toast(`Alarm set for ${r.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`);
            }}
            onDelete={
              edit.id
                ? async () => {
                    await save(list.filter((x) => x.id !== edit.id));
                    setEdit(null);
                  }
                : undefined
            }
          />
        </Sheet>
      )}
    </>
  );
}

function AlarmForm({ a, onSave, onDelete }: { a: Alarm; onSave: (a: Alarm) => void; onDelete?: () => void }) {
  const [x, setX] = useState(a);
  return (
    <div className="space-y-4">
      <input type="time" className="field text-center text-[34px] font-bold" value={x.time} onChange={(e) => setX({ ...x, time: e.target.value || x.time })} />
      <div className="flex justify-between gap-1.5">
        {DAYS.map((d, i) => {
          const on = x.days.includes(i);
          return (
            <button
              key={i}
              type="button"
              aria-label={DAY_NAMES.at(i)}
              onClick={() => setX({ ...x, days: on ? x.days.filter((y) => y !== i) : [...x.days, i] })}
              className={cx('press h-10 w-10 rounded-full text-[14px] font-semibold', on ? 'bg-[var(--primary)] text-[var(--on-primary,#fff)]' : 'bg-[var(--field)] text-muted')}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="text-center text-[12px] text-muted">{daysText(x.days)}</p>
      <FormRow label="Label">
        <input className="field" value={x.label} placeholder="e.g. Wake up, Study start" onChange={(e) => setX({ ...x, label: e.target.value })} />
      </FormRow>
      <Button variant="primary" full size="lg" onClick={() => onSave(x)}>
        Save alarm
      </Button>
      {onDelete && (
        <Button full variant="danger" onClick={onDelete}>
          <Trash2 size={16} /> Delete
        </Button>
      )}
    </div>
  );
}

/* ---------------- World ---------------- */
function WorldTab() {
  const [list, setList] = useState<string[]>(() => getWorld());
  const [adding, setAdding] = useState(false);
  useTick(15000);
  const set = (l: string[]) => {
    setList(l);
    saveWorld(l);
  };
  const now = new Date();
  return (
    <>
      <Card className="py-5 text-center">
        <p className="tabular text-[44px] font-bold tracking-tight">{now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>
        <p className="text-[13px] text-muted">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · India</p>
      </Card>
      {list.map((tz) => {
        const c = CITIES.find((x) => x.tz === tz);
        const t = cityTime(tz, now);
        const diff = t.diffH === 0 ? 'Same time' : `${t.diffH > 0 ? '+' : ''}${Number.isInteger(t.diffH) ? t.diffH : t.diffH.toFixed(1)} h`;
        return (
          <Card key={tz} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{c?.name ?? tz}</p>
              <p className="text-[12.5px] text-muted">
                {t.day} · {diff}
              </p>
            </div>
            <p className="tabular text-[26px] font-bold">{t.hm}</p>
            <button type="button" aria-label="Remove" className="p-1 text-muted" onClick={() => set(list.filter((x) => x !== tz))}>
              <Trash2 size={16} />
            </button>
          </Card>
        );
      })}
      <Button full onClick={() => setAdding(true)}>
        <Plus size={16} /> Add city
      </Button>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add city">
        <div className="space-y-1">
          {CITIES.filter((c) => !list.includes(c.tz)).map((c) => (
            <button key={c.tz} type="button" className="press flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left hover:bg-[var(--field)]" onClick={() => { set([...list, c.tz]); setAdding(false); }}>
              <span className="text-[15px] font-medium">{c.name}</span>
              <span className="tabular text-[14px] text-muted">{cityTime(c.tz).hm}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

