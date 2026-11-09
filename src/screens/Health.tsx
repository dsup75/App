// Daily health stats from Health Connect (smartwatch data appears only if your watch app shares it there)
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Footprints, Flame, HeartPulse, Moon, Route, RefreshCw, Watch } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { healthAvailable, openHealthConnect, readToday, requestHealthAccess, type HealthState, type HealthToday } from '../lib/health';
import { useLock } from '../context/LockContext';
import { Button, Card, Page, Skeleton } from '../components/ui';

function Stat({ icon, label, value, unit }: { icon: ReactNode; label: string; value: number | null; unit?: string }) {
  return (
    <Card className="space-y-1 !p-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {icon}
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
    if (st === 'ready') setData(await readToday());
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

  const nothing = data && [data.steps, data.calories, data.distanceKm, data.heartRateAvg, data.sleepMinutes].every((v) => v === null);

  return (
    <Page title="Health" subtitle="Today's activity from Health Connect" back>
      {state === null ? (
        <Skeleton rows={3} />
      ) : state === 'web' ? (
        <Card className="space-y-2">
          <p className="text-[14.5px] font-semibold">Android app only</p>
          <p className="text-[13px] text-muted">Health data comes from Android Health Connect, so it shows only in the installed Android app.</p>
        </Card>
      ) : state !== 'ready' ? (
        <Card className="space-y-3">
          <p className="text-[14.5px] font-semibold">Health Connect not found</p>
          <p className="text-[13px] text-muted">Install or update "Health Connect" from the Play Store (it is built in on Android 14+), then come back.</p>
          <Button full onClick={() => { suppressBriefly(); openHealthConnect(); }}>
            Open Health Connect
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat icon={<Footprints size={14} />} label="Steps" value={data?.steps ?? null} />
            <Stat icon={<Flame size={14} />} label="Calories" value={data?.calories ?? null} unit="kcal" />
            <Stat icon={<Route size={14} />} label="Distance" value={data?.distanceKm ?? null} unit="km" />
            <Stat icon={<HeartPulse size={14} />} label="Heart rate (avg)" value={data?.heartRateAvg ?? null} unit="bpm" />
            <Stat icon={<Moon size={14} />} label="Sleep last night" value={data?.sleepMinutes != null ? Math.round((data.sleepMinutes / 60) * 10) / 10 : null} unit="h" />
            <Stat icon={<HeartPulse size={14} />} label="Heart rate (latest)" value={data?.heartRateLatest ?? null} unit="bpm" />
          </div>
          {data && <p className="px-1 text-[11.5px] text-muted">Read from Health Connect at {new Date(data.readAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. "No data" means Health Connect has nothing for today or access was not given.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button full variant="primary" loading={busy} onClick={connect}>
              {nothing ? 'Give access' : 'Check access'}
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
              Da Fit has no public connection for other apps. Your watch data appears here only if the Da Fit app (or Google Fit) shares it with Health Connect: Health Connect → App permissions → allow your watch app to write steps / heart rate / sleep. Native sync — no fake numbers are ever shown.
            </p>
            <Button size="sm" onClick={() => { suppressBriefly(); openHealthConnect(); }}>
              Open Health Connect settings
            </Button>
          </Card>
        </>
      )}
    </Page>
  );
}
