// Home: "Health & connected devices" — one configurable carousel. Shows only data the app really has.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, Moon, Scale, HeartPulse, Flame, Activity, MonitorSmartphone, Headphones, Watch, Settings2, GripVertical, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dates';
import { healthAvailable, readToday, saveHealthSnapshot } from '../lib/health';
import { fmtMinutes, hasUsageAccess, usageForDay } from '../lib/screenTime';
import { Button, Segmented, Sheet, Toggle, cx } from './ui';

type SlideId = 'steps' | 'sleep' | 'weight' | 'body' | 'heart' | 'calories' | 'activity' | 'screen' | 'earbuds' | 'watch';
const LABEL: Record<SlideId, string> = {
  steps: 'Steps', sleep: 'Sleep', weight: 'Weight', body: 'Body composition', heart: 'Heart rate', calories: 'Calories',
  activity: 'Activity summary', screen: 'Screen time', earbuds: 'AirPods / earbuds', watch: 'Fire-Boltt / watch',
};
const ICON: Record<SlideId, ReactNode> = {
  steps: <Footprints size={16} />, sleep: <Moon size={16} />, weight: <Scale size={16} />, body: <Scale size={16} />, heart: <HeartPulse size={16} />,
  calories: <Flame size={16} />, activity: <Activity size={16} />, screen: <MonitorSmartphone size={16} />, earbuds: <Headphones size={16} />, watch: <Watch size={16} />,
};
const ALL: SlideId[] = ['steps', 'sleep', 'weight', 'body', 'heart', 'calories', 'activity', 'screen', 'earbuds', 'watch'];

interface Prefs {
  order: SlideId[];
  off: SlideId[];
  auto: boolean;
  every: number;
}
const DEFAULTS: Prefs = { order: ALL, off: [], auto: true, every: 5 };
const KEY = 'health-carousel';
function loadPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v?.order) return { ...DEFAULTS, ...v, order: [...v.order.filter((x: SlideId) => ALL.includes(x)), ...ALL.filter((x) => !v.order.includes(x))] };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface Slide {
  id: SlideId;
  value: string;
  sub: string;
  to: string;
}

const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never synced';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `synced ${Math.max(1, m)} min ago`;
  if (m < 1440) return `synced ${Math.round(m / 60)} h ago`;
  return `synced ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

async function loadSlides(): Promise<Slide[]> {
  const today = todayISO();
  const out: Slide[] = [];
  // fresh Health Connect read (Android) — saved as today's snapshot
  try {
    if ((await healthAvailable()) === 'ready') {
      const d = await readToday();
      await saveHealthSnapshot(d).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  const [act, body, gadgets] = await Promise.all([
    supabase.from('activity_daily').select('*').eq('day', today),
    supabase.from('body_measurements').select('*').is('deleted_at', null).order('measured_at', { ascending: false }).limit(1),
    supabase.from('gadgets').select('id,name,kind,last_sync_at,last_status').is('deleted_at', null),
  ]);
  const rows = (act.data ?? []) as any[];
  // prefer the watch's own numbers when the user confirmed them, else Health Connect
  const pick = (k: string) => {
    for (const src of ['watch_ble', 'health_connect', 'manual']) {
      const r = rows.find((x) => x.source === src && x[k] !== null && x[k] !== undefined);
      if (r) return { v: Number(r[k]), src: src === 'watch_ble' ? 'watch' : src === 'health_connect' ? 'Health Connect' : 'manual' };
    }
    return null;
  };
  const steps = pick('steps');
  if (steps) out.push({ id: 'steps', value: steps.v.toLocaleString('en-IN'), sub: `Today · ${steps.src}`, to: '/health' });
  const sleep = pick('sleep_minutes');
  if (sleep) out.push({ id: 'sleep', value: fmtMinutes(sleep.v), sub: `Last night · ${sleep.src}`, to: '/health' });
  const m = (body.data ?? [])[0] as any;
  if (m) {
    out.push({ id: 'weight', value: `${Number(m.weight_kg).toFixed(1)} kg`, sub: `${new Date(m.measured_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${m.bmi ? ` · BMI ${m.bmi}` : ''}`, to: '/weight' });
    const parts = [m.body_fat_pct && `Fat ${Number(m.body_fat_pct)}%`, m.muscle_kg && `Muscle ${Number(m.muscle_kg)} kg`, m.water_pct && `Water ${Number(m.water_pct)}%`].filter(Boolean);
    if (parts.length) out.push({ id: 'body', value: parts[0] as string, sub: parts.slice(1).join(' · ') || 'Latest reading', to: '/weight' });
  }
  const hr = pick('heart_rate_avg');
  if (hr) out.push({ id: 'heart', value: `${hr.v} bpm`, sub: `Average today · ${hr.src}`, to: '/health' });
  const cal = pick('calories_kcal');
  if (cal) out.push({ id: 'calories', value: `${cal.v.toLocaleString('en-IN')} kcal`, sub: `Active today · ${cal.src}`, to: '/health' });
  const dist = pick('distance_m');
  if (steps || dist || cal) {
    const bits = [steps && `${steps.v.toLocaleString('en-IN')} steps`, dist && `${(dist.v / 1000).toFixed(1)} km`, cal && `${cal.v} kcal`].filter(Boolean);
    out.push({ id: 'activity', value: bits[0] as string, sub: bits.slice(1).join(' · ') || 'Today', to: '/health' });
  }
  try {
    if (await hasUsageAccess()) {
      const u = await usageForDay(new Date());
      if (u) out.push({ id: 'screen', value: fmtMinutes(u.totalMs / 60000), sub: `Today${u.unlocks != null ? ` · ${u.unlocks} unlocks` : ''}${u.apps[0] ? ` · most: ${u.apps[0].label}` : ''}`, to: '/screen-time' });
    }
  } catch {
    /* ignore */
  }
  const g = (gadgets.data ?? []) as any[];
  const ear = g.find((x) => x.kind === 'earbuds');
  if (ear) out.push({ id: 'earbuds', value: ear.name, sub: `${ear.last_status ?? 'Status not checked'} · ${ago(ear.last_sync_at)}`, to: `/gadgets/${ear.id}` });
  const w = g.find((x) => x.kind === 'watch');
  if (w) out.push({ id: 'watch', value: w.name, sub: `${w.last_status ?? 'Not synced yet'} · ${ago(w.last_sync_at)}`, to: `/gadgets/${w.id}` });
  return out;
}

export function HealthCarousel() {
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [touching, setTouching] = useState(false);
  const [setup, setSetup] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    loadSlides().then(setSlides).catch(() => setSlides([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (slides ?? []).filter((s) => !prefs.off.includes(s.id)).sort((a, b) => prefs.order.indexOf(a.id) - prefs.order.indexOf(b.id));

  const go = (i: number) => {
    const el = track.current;
    if (!el || !shown.length) return;
    const n = ((i % shown.length) + shown.length) % shown.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  // auto-slide (pauses while touched)
  useEffect(() => {
    if (!prefs.auto || touching || shown.length < 2) return;
    const t = setTimeout(() => go(idx + 1), prefs.every * 1000);
    return () => clearTimeout(t);
  }, [idx, prefs.auto, prefs.every, touching, shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  /* ---- drag to reorder (in the settings sheet) ---- */
  const [drag, setDrag] = useState<{ id: SlideId; y: number } | null>(null);
  const rowH = 48;
  const onDragMove = (e: RPointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    const i = prefs.order.indexOf(drag.id);
    const j = i + Math.round(dy / rowH);
    if (j !== i && j >= 0 && j < prefs.order.length) {
      const o = [...prefs.order];
      o.splice(i, 1);
      o.splice(j, 0, drag.id);
      set({ ...prefs, order: o });
      setDrag({ id: drag.id, y: drag.y + (j - i) * rowH });
    }
  };

  if (slides === null) return <div className="glass h-[104px] animate-pulse rounded-[22px]" />;

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <p className="text-[15px] font-semibold">Health &amp; devices</p>
        <button type="button" aria-label="Health carousel settings" onClick={() => setSetup(true)} className="p-1 text-muted">
          <Settings2 size={16} />
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="glass flex items-center gap-3 rounded-[22px] p-4">
          <HeartPulse size={18} className="text-primary" />
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">No health data yet. Connect Health Connect, add your weight or turn on screen time — only real data shows here.</p>
          <Button size="sm" onClick={() => nav('/gadgets')}>Set up</Button>
        </div>
      ) : (
        <div onPointerDown={() => setTouching(true)} onPointerUp={() => setTouching(false)} onPointerCancel={() => setTouching(false)} onPointerLeave={() => setTouching(false)}>
          <div
            ref={track}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
            onScroll={(e) => {
              const el = e.currentTarget;
              setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
          >
            {shown.map((s) => (
              <button key={s.id} type="button" onClick={() => nav(s.to)} className="w-full shrink-0 snap-center px-0.5 text-left">
                <div className="glass flex items-center gap-3 rounded-[22px] p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--primary-soft)] text-primary">{ICON[s.id]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-muted">{LABEL[s.id]}</span>
                    <span className="block truncate text-[20px] font-bold tracking-tight">{s.value}</span>
                    <span className="block truncate text-[11.5px] text-muted">{s.sub}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
          {shown.length > 1 && (
            <div className="mt-1.5 flex justify-center gap-1.5">
              {shown.map((s, i) => (
                <button key={s.id} type="button" aria-label={`Show ${LABEL[s.id]}`} onClick={() => go(i)} className={cx('h-1.5 rounded-full transition-all', i === idx ? 'w-4 bg-[var(--primary-2)]' : 'w-1.5 bg-[var(--hairline)]')} />
              ))}
            </div>
          )}
        </div>
      )}

      <Sheet open={setup} onClose={() => setSetup(false)} title="Health & devices carousel">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[14px]">Slide automatically</p>
            <Toggle checked={prefs.auto} onChange={(v) => set({ ...prefs, auto: v })} />
          </div>
          {prefs.auto && (
            <Segmented
              value={String(prefs.every) as '3' | '5' | '8' | '10'}
              onChange={(v) => set({ ...prefs, every: Number(v) })}
              options={[{ value: '3', label: '3 s' }, { value: '5', label: '5 s' }, { value: '8', label: '8 s' }, { value: '10', label: '10 s' }]}
            />
          )}
          <p className="text-[12px] text-muted">Touching the carousel pauses it. Drag ⠿ to change the order; switch slides on or off.</p>
          <div className="glass overflow-hidden rounded-[16px]" onPointerMove={onDragMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
            {prefs.order.map((id) => {
              const has = (slides ?? []).some((s) => s.id === id);
              return (
                <div key={id} className={cx('flex items-center gap-2 px-3', drag?.id === id && 'bg-[var(--primary-soft)]')} style={{ height: rowH }}>
                  <span
                    className="touch-none cursor-grab p-1 text-muted"
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      setDrag({ id, y: e.clientY });
                    }}
                    aria-label={`Drag ${LABEL[id]}`}
                  >
                    <GripVertical size={16} />
                  </span>
                  <span className="text-primary">{ICON[id]}</span>
                  <span className="min-w-0 flex-1 text-[14px]">
                    {LABEL[id]}
                    {!has && <span className="ml-1 text-[11px] text-muted">· no data yet</span>}
                  </span>
                  <Toggle checked={!prefs.off.includes(id)} onChange={(v) => set({ ...prefs, off: v ? prefs.off.filter((x) => x !== id) : [...prefs.off, id] })} />
                </div>
              );
            })}
          </div>
          <Button full onClick={() => set(DEFAULTS)}>
            <RotateCcw size={14} /> Restore defaults
          </Button>
        </div>
      </Sheet>
    </>
  );
}
