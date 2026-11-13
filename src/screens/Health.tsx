// Daily health stats from Health Connect (smartwatch data appears only if your watch app shares it there)
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Watch } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { healthAvailable, openHealthConnect, readToday, requestHealthAccess, saveHealthSnapshot, type HealthState, type HealthToday } from '../lib/health';
import { useLock } from '../context/LockContext';
import { Button, Card, Page, SectionTitle, SeeAll, Skeleton } from '../components/ui';
import { Glyph, type GlyphName } from '../components/Glyph';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function Stat({ glyph, label, value, unit }: { glyph: GlyphName; label: string; value: number | null; unit?: string }) {
  return (
    <Card className="space-y-1 !p-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
        <Glyph name={glyph} size={24} />
        {label}
      </div>
      <p className="text-[22px] font-bold tracking-tight">
        {value === null ? <span className="text-[14px] font-medium text-muted">No data</span> : value.toLocaleString('en-IN')}
        {value !== null && unit && <span className="text-[13px] font-medium text-muted"> {unit}</span>}
      </p>
    </Card>
  );
}

export function HealthScreen() {
  const { suppressBriefly } = useLock();
  const [state, setState] = useState<HealthState | null>(null);
  const [data, setData] = useState<HealthToday | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const st = await healthAvailable();
    setState(st);
    if (st === 'ready') {
      const d = await readToday();
      setData(d);
      saveHealthSnapshot(d).catch(() => {});
    }
  }, []);
  useEffect(() => {
    load();
    let sub: { remove: () => void } | null = null;
    CapApp.addListener('resume', () => load()).then((h) => (sub = h)).catch(() => {});
    return () => sub?.remove();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    suppressBriefly();
    await requestHealthAccess();
    await load();
    setBusy(false);
  };

  const noAccess = !data || !Object.values(data.permissions).some(Boolean);

  return (
    <Page title="Health" subtitle="Healthy You • Happy You" back glyph="heart">
      {state === null ? (
        <Skeleton rows={3} />
      ) : state === 'web' ? (
        <Card className="space-y-2">
          <p className="text-[14.5px] font-semibold">Android app only</p>
          <p className="text-[13px] text-muted">Health data comes from Android Health Connect, so it shows only in the installed Android app.</p>
        </Card>
      ) : state !== 'ready' ? (
        <Card className="space-y-3">
          <p className="text-[14.5px] font-semibold">{state === 'needs_update' ? 'Health Connect needs an update' : 'Health Connect not found'}</p>
          <p className="text-[13px] text-muted">Install or update "Health Connect" from the Play Store (it is built in on Android 14+), then come back.</p>
          <Button full onClick={() => { suppressBriefly(); openHealthConnect(); }}>
            Open Health Connect
          </Button>
        </Card>
      ) : (
        <>
          <div className="hero relative overflow-hidden rounded-[24px] p-4">
            <p className="text-[16px] font-bold">Today's Activity</p>
            <div className="mt-2 space-y-1.5">
              {[
                ['#3b82f6', data?.steps, 'Steps'],
                ['#ef4444', data?.calories, 'Cal'],
                ['#22c55e', data?.distanceKm, 'km'],
              ].map(([c, v, u]) => (
                <p key={u as string} className="flex items-baseline gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c as string }} />
                  <span className="text-[22px] font-bold leading-tight">{v == null ? '—' : Number(v).toLocaleString('en-IN')}</span>
                  <span className="text-[13px] opacity-80">{u as string}</span>
                </p>
              ))}
            </div>
            <span className="pointer-events-none absolute -right-2 bottom-1">
              <Glyph name="shoe" size={128} />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat glyph="heart" label="Heart rate (avg)" value={data?.heartRateAvg ?? null} unit="bpm" />
            <Stat glyph="moon" label="Sleep last night" value={data?.sleepMinutes != null ? Math.round((data.sleepMinutes / 60) * 10) / 10 : null} unit="h" />
            <Stat glyph="heart" label="Heart rate (latest)" value={data?.heartRateLatest ?? null} unit="bpm" />
            <Stat glyph="scale" label="Weight (latest)" value={data?.weightKg ?? null} unit="kg" />
            <Stat glyph="body" label="Body fat" value={data?.bodyFatPct ?? null} unit="%" />
            <Stat glyph="flame" label="Calories" value={data?.calories ?? null} unit="kcal" />
          </div>
          {data && <p className="px-1 text-[11.5px] text-muted">Read from Health Connect at {new Date(data.readAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. "No data" means Health Connect has nothing for today or access was not given.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button full variant="primary" loading={busy} onClick={connect}>
              {noAccess ? 'Give access' : 'Change access'}
            </Button>
            <Button full onClick={() => load()}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
          <Card className="space-y-2">
            <div className="flex items-center gap-2">
              <Watch size={16} className="text-primary" />
              <p className="text-[14px] font-semibold">Smartwatch (Da Fit etc.)</p>
            </div>
            <p className="text-[12.5px] text-muted">
              Your watch talks to the Da Fit app over Bluetooth — not to this app. Its data shows here only when Da Fit (or Google Fit / another app that Da Fit syncs to) writes it into Health Connect. In Health Connect → App permissions, allow that app to write steps, heart rate and sleep, and allow DeepBoost Life to read them. If Da Fit doesn't write to Health Connect, these boxes stay "No data" — no fake numbers are ever shown.
            </p>
            <Button size="sm" onClick={() => { suppressBriefly(); openHealthConnect(); }}>
              Open Health Connect settings
            </Button>
          </Card>
        </>
      )}
      <DevicesAndBody />
    </Page>
  );
}

/** Devices, weight and screen time — always shown, from your own saved data */
function DevicesAndBody() {
  const nav = useNavigate();
  const [g, setG] = useState<any[]>([]);
  const [w, setW] = useState<any | null>(null);
  useEffect(() => {
    supabase.from('gadgets').select('id,name,kind,last_status,last_sync_at').is('deleted_at', null).then(({ data }) => setG((data as any[]) ?? []));
    supabase
      .from('body_measurements')
      .select('weight_kg,bmi,measured_at')
      .is('deleted_at', null)
      .order('measured_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setW(((data as any[]) ?? [])[0] ?? null));
  }, []);
  const tile = (glyph: GlyphName, title: string, sub: string, to: string, ok?: boolean) => (
    <button key={title} type="button" onClick={() => nav(to)} className="glass press flex items-center gap-2.5 rounded-[18px] p-3 text-left">
      <Glyph name={glyph} size={44} />
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-semibold">{title}</span>
        <span className={'block truncate text-[12px] ' + (ok ? 'text-income' : 'text-muted')}>{sub}</span>
      </span>
    </button>
  );
  const watch = g.find((x) => x.kind === 'watch');
  const scale = g.find((x) => x.kind === 'scale');
  return (
    <>
      <SectionTitle right={<SeeAll onClick={() => nav('/gadgets')} />}>Health devices</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {tile('watch', watch?.name ?? 'Watch', watch ? watch.last_status ?? 'Not synced yet' : 'Add your watch', watch ? `/gadgets/${watch.id}` : '/gadgets', /connected|synced/i.test(watch?.last_status ?? ''))}
        {tile('scale', scale?.name ?? 'Scale', scale ? scale.last_status ?? 'Not connected yet' : 'Add your scale', scale ? `/gadgets/${scale.id}` : '/gadgets', /connected|synced/i.test(scale?.last_status ?? ''))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => nav('/weight')} className="glass press rounded-[18px] p-3 text-left">
          <p className="text-[13px] font-semibold text-muted">Weight & Body</p>
          <p className="mt-1 text-[24px] font-bold leading-tight">{w?.weight_kg != null ? <>{w.weight_kg}<span className="text-[13px] font-medium"> kg</span></> : '—'}</p>
          <p className="text-[11.5px] text-muted">{w?.bmi ? `BMI ${w.bmi}` : 'Add a weight entry'}</p>
        </button>
        <button type="button" onClick={() => nav('/screen-time')} className="glass press relative overflow-hidden rounded-[18px] p-3 text-left">
          <p className="text-[13px] font-semibold text-muted">Screen Time</p>
          <p className="mt-1 text-[15px] font-semibold">Today's phone use</p>
          <p className="text-[11.5px] text-muted">Open to see apps</p>
          <span className="pointer-events-none absolute -bottom-1 -right-1 opacity-90">
            <Glyph name="phone" size={54} />
          </span>
        </button>
      </div>
    </>
  );
}
