// Gadgets hub: your devices, live Bluetooth checks, scale reading, experimental watch sync
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bluetooth, Copy, HeartPulse, Plus, RefreshCw, Scale, Smartphone, Watch, Headphones, Trash2, MonitorSmartphone, Activity } from 'lucide-react';
import {
  UUID, bleSupported, bondedDevices, connect, describeServices, disconnect, openBluetoothSettings, readBattery, readRaw, readStandardScale, readText,
  scaleIsStandard, scan, stopScan, type FoundDevice, type ScaleReading,
} from '../lib/ble';
import { KIND_LABEL, addGadget, decodeMoyoungSteps, fetchGadget, fetchGadgets, isMac, removeGadget, updateGadget, type Gadget, type GadgetKind } from '../lib/gadgets';
import { addMeasurement, bmiOf, getHealthProfile } from '../lib/body';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { todayISO } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, FormRow, IconBubble, IconButton, List, ListRow, Page, SectionTitle, Sheet, Spinner } from '../components/ui';
import type { BleService } from '@capacitor-community/bluetooth-le';

const KIND_ICON: Record<GadgetKind, ReactNode> = {
  scale: <Scale size={17} />,
  watch: <Watch size={17} />,
  earbuds: <Headphones size={17} />,
  phone: <Smartphone size={17} />,
  other: <Bluetooth size={17} />,
};

const ago = (iso: string | null) => {
  if (!iso) return 'Never synced';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Synced just now';
  if (m < 60) return `Synced ${m} min ago`;
  if (m < 1440) return `Synced ${Math.round(m / 60)} h ago`;
  return `Synced ${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

/* ---------------- Add device ---------------- */
function AddDeviceSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const [found, setFound] = useState<Record<string, FoundDevice>>({});
  const [paired, setPaired] = useState<{ deviceId: string; name: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pick, setPick] = useState<{ deviceId: string | null; name: string } | null>(null);
  const [kind, setKind] = useState<GadgetKind>('other');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [app, setApp] = useState('');
  const [mac, setMac] = useState('');

  useEffect(() => {
    if (!open) {
      stopScan();
      return;
    }
    setFound({});
    setPick(null);
    if (bleSupported()) {
      suppressBriefly();
      bondedDevices().then(setPaired);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const doScan = async () => {
    setScanning(true);
    suppressBriefly();
    const err = await scan(10, (d) => setFound((f) => ({ ...f, [d.deviceId]: d })));
    setScanning(false);
    if (err) toast(err, 'error');
  };
  const choose = (deviceId: string | null, n: string, k?: GadgetKind, m?: string, a?: string) => {
    setPick({ deviceId, name: n });
    setName(n);
    setMac(deviceId ?? '');
    setKind(k ?? (/scale|savvy|activex|fitdays|okok/i.test(n) ? 'scale' : /watch|bolt|fit|band|bgs/i.test(n) ? 'watch' : /airpod|buds|pods|headphone|ear/i.test(n) ? 'earbuds' : 'other'));
    setModel(m ?? '');
    setApp(a ?? '');
  };
  const save = async () => {
    if (!name.trim()) return toast('Give it a name', 'error');
    if (mac && !isMac(mac)) return toast('Bluetooth address looks wrong (like C9:BB:BC:D3:54:5A)', 'error');
    try {
      await addGadget({ name: name.trim(), kind, model: model.trim() || null, companion_app: app.trim() || null, ble_address: mac ? mac.toUpperCase() : null });
      toast('Device added');
      onAdded();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const list = Object.values(found).sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));

  return (
    <Sheet open={open} onClose={onClose} title={pick ? 'Device details' : 'Add a device'}>
      {pick ? (
        <div className="space-y-3">
          <FormRow label="Name">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </FormRow>
          <FormRow label="Type">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as GadgetKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </FormRow>
          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Model (optional)"><input className="field" value={model} onChange={(e) => setModel(e.target.value)} /></FormRow>
            <FormRow label="Its app (optional)"><input className="field" value={app} onChange={(e) => setApp(e.target.value)} placeholder="e.g. Da Fit" /></FormRow>
          </div>
          <FormRow label="Bluetooth address" hint="Filled in from the scan. Needed to connect.">
            <input className="field" value={mac} onChange={(e) => setMac(e.target.value.toUpperCase())} placeholder="C9:BB:BC:D3:54:5A" />
          </FormRow>
          <div className="grid grid-cols-2 gap-2">
            <Button full onClick={() => setPick(null)}>Back</Button>
            <Button full variant="primary" onClick={save}>Add</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-muted">Quick add</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => choose('C9:BB:BC:D3:54:5A', 'Fire-Boltt BGS003', 'watch', 'BGS003', 'Da Fit')}>
              <Watch size={14} /> Fire-Boltt
            </Button>
            <Button onClick={() => choose(null, 'ActiveX SAVVY scale', 'scale', 'SAVVY', 'ActiveX')}>
              <Scale size={14} /> ActiveX scale
            </Button>
          </div>
          {!bleSupported() ? (
            <p className="text-[12.5px] text-muted">Scanning works in the Android app only.</p>
          ) : (
            <>
              <Button full variant="primary" loading={scanning} onClick={doScan}>
                <Bluetooth size={14} /> {scanning ? 'Scanning 10 s…' : 'Scan nearby devices'}
              </Button>
              <p className="text-[11.5px] text-muted">Android asks for "Nearby devices" (and on some phones Location) — needed only to find Bluetooth devices. For a scale: step on it so it wakes up.</p>
              {list.length > 0 && (
                <div className="glass max-h-[34vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-[16px]">
                  {list.map((d) => (
                    <button key={d.deviceId} type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => choose(d.deviceId, d.name)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{d.name}</span>
                        <span className="block text-[11px] text-muted">{d.deviceId}</span>
                      </span>
                      <span className="text-[11px] text-muted">{d.rssi ?? ''} dBm</span>
                    </button>
                  ))}
                </div>
              )}
              {paired.length > 0 && (
                <>
                  <p className="text-[12.5px] text-muted">Paired with this phone</p>
                  <div className="glass max-h-[28vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-[16px]">
                    {paired.map((d) => (
                      <button key={d.deviceId} type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => choose(d.deviceId, d.name)}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px]">{d.name}</span>
                          <span className="block text-[11px] text-muted">{d.deviceId}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Hub ---------------- */
export function GadgetsHub() {
  const nav = useNavigate();
  const { suppressBriefly } = useLock();
  const [rows, setRows] = useState<Gadget[] | null>(null);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const load = useCallback(() => {
    setError('');
    fetchGadgets().then(setRows).catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Page
      title="Gadgets"
      subtitle="Health & connected devices"
      back
      right={
        <IconButton label="Add device" onClick={() => setAddOpen(true)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: <Scale size={16} />, label: 'Weight', to: '/weight' },
          { icon: <HeartPulse size={16} />, label: 'Health', to: '/health' },
          { icon: <MonitorSmartphone size={16} />, label: 'Screen time', to: '/screen-time' },
        ].map((x) => (
          <Card key={x.to} className="flex flex-col items-center gap-1 !p-3 text-center" onClick={() => nav(x.to)}>
            <span className="text-primary">{x.icon}</span>
            <span className="text-[12.5px] font-semibold">{x.label}</span>
          </Card>
        ))}
      </div>

      <SectionTitle>My devices</SectionTitle>
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="No devices yet" text="Add your watch, scale or earbuds. Nothing is shown as connected unless the app actually reaches it." action={<Button variant="primary" onClick={() => setAddOpen(true)}>Add device</Button>} />
      ) : (
        <List>
          {rows.map((g) => (
            <ListRow
              key={g.id}
              icon={<IconBubble tone="primary">{KIND_ICON[g.kind]}</IconBubble>}
              title={g.name}
              subtitle={`${KIND_LABEL[g.kind]} · ${ago(g.last_sync_at)}`}
              onClick={() => nav(`/gadgets/${g.id}`)}
              chevron
            />
          ))}
        </List>
      )}
      {bleSupported() && (
        <Button full onClick={() => { suppressBriefly(); openBluetoothSettings(); }}>
          <Bluetooth size={14} /> Phone Bluetooth settings
        </Button>
      )}
      <p className="px-1 text-[11.5px] text-muted">
        Status shown here is only what the app could actually read. AirPods battery is an Apple-only feature and is not available on Android.
      </p>
      <AddDeviceSheet open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </Page>
  );
}

/* ---------------- Device detail ---------------- */
interface LiveInfo {
  connected: boolean;
  battery: number | null;
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
  services: string[];
  raw: Record<string, string>;
}

export function GadgetDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const [g, setG] = useState<Gadget | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<LiveInfo | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [watchGuess, setWatchGuess] = useState<{ steps: number; distanceM: number; calories: number; hr: number | null } | null>(null);
  const [adv, setAdv] = useState<string[]>([]);
  const [delOpen, setDelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCat, setEditCat] = useState('');

  const load = useCallback(() => {
    fetchGadget(id).then(setG).catch(() => setG(null));
  }, [id]);
  useEffect(() => {
    load();
    return () => {
      stopScan();
    };
  }, [load]);
  const note = (s: string) => setLog((l) => [...l.slice(-30), `${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${s}`]);

  const status = async (text: string, synced = false) => {
    if (!g) return;
    const patch: Partial<Gadget> = { last_status: text.slice(0, 200) };
    if (synced) patch.last_sync_at = new Date().toISOString();
    await updateGadget(g.id, patch).catch(() => {});
    setG({ ...g, ...patch });
  };

  /** Connect, read standard info and list services */
  const inspect = async (keepOpen = false): Promise<BleService[] | null> => {
    if (!g?.ble_address) {
      toast('Add the Bluetooth address first (scan from "Add device")', 'error');
      return null;
    }
    suppressBriefly();
    note(`Connecting to ${g.ble_address}…`);
    try {
      const services = await connect(g.ble_address, () => {
        note('Disconnected');
        setLive((l) => (l ? { ...l, connected: false } : l));
      });
      note(`Connected · ${services.length} services`);
      const [battery, manufacturer, model, firmware] = await Promise.all([
        readBattery(g.ble_address, services),
        readText(g.ble_address, services, UUID.deviceInfo, UUID.manufacturer),
        readText(g.ble_address, services, UUID.deviceInfo, UUID.model),
        readText(g.ble_address, services, UUID.deviceInfo, UUID.firmware),
      ]);
      setLive({ connected: true, battery, manufacturer, model, firmware, services: describeServices(services), raw: {} });
      if (!keepOpen) await disconnect(g.ble_address);
      return services;
    } catch (e) {
      const msg = (e as Error).message || 'Could not connect';
      note(`Failed: ${msg}`);
      setLive({ connected: false, battery: null, manufacturer: null, model: null, firmware: null, services: [], raw: {} });
      await status(`Not reachable: ${msg}`);
      toast(g.kind === 'watch' ? 'Could not connect. Close Da Fit (it keeps the watch busy) and keep the watch near the phone.' : 'Could not connect. Keep the device on and near the phone.', 'error');
      return null;
    }
  };

  /* ----- scale ----- */
  const readScale = async () => {
    if (!g?.ble_address) return toast('Scan and add the scale address first', 'error');
    setBusy('scale');
    setReading(null);
    toast('Step on the scale now');
    const services = await inspect(true);
    if (!services) return setBusy(null);
    try {
      if (!scaleIsStandard(services)) {
        note('This scale does not use the standard Bluetooth weight format.');
        await status('Connected, private data format');
        toast('This scale uses a private data format — see "Help add your scale" below', 'error');
        return;
      }
      note('Standard weight format found — waiting for a stable reading (up to 60 s)…');
      const r = await readStandardScale(g.ble_address, services, 60000);
      if (!r?.weightKg) {
        note('No weight received');
        toast('No weight received. Step on the scale and try again.', 'error');
        await status('Connected, no reading');
      } else {
        note(`Weight ${r.weightKg} kg`);
        setReading(r);
        await status('Reading received', true);
      }
    } catch (e) {
      note(`Error: ${(e as Error).message}`);
    } finally {
      await disconnect(g.ble_address);
      setBusy(null);
    }
  };
  const saveReading = async () => {
    if (!reading?.weightKg || !g) return;
    try {
      const p = await getHealthProfile();
      await addMeasurement({
        weight_kg: reading.weightKg,
        bmi: reading.bmi ?? bmiOf(reading.weightKg, p.height_cm),
        body_fat_pct: reading.bodyFatPct,
        muscle_kg: reading.muscleKg,
        water_pct: reading.waterKg && reading.weightKg ? Math.round((reading.waterKg / reading.weightKg) * 1000) / 10 : null,
        bmr_kcal: reading.bmrKcal,
        measured_at: reading.timestamp ?? new Date().toISOString(),
        source: 'scale_ble',
        gadget_id: g.id,
      });
      toast('Saved to Weight');
      setReading(null);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  /** Watches the scale's broadcast while the user stands on it — helps decode private scales */
  const watchAdverts = async () => {
    if (!g?.ble_address) return;
    setBusy('adv');
    setAdv([]);
    toast('Step on the scale and stand still for 20 s');
    const seen = new Set<string>();
    const err = await scan(20, (d) => {
      if (d.deviceId.toUpperCase() !== g.ble_address!.toUpperCase()) return;
      const line = [d.manufacturerHex, d.serviceDataHex].filter(Boolean).join(' | ');
      if (line && !seen.has(line)) {
        seen.add(line);
        setAdv((a) => [...a.slice(-40), line]);
      }
    });
    if (err) toast(err, 'error');
    setBusy(null);
  };

  /* ----- watch (experimental) ----- */
  const syncWatch = async () => {
    if (!g?.ble_address) return;
    setBusy('watch');
    setWatchGuess(null);
    const services = await inspect(true);
    if (!services) return setBusy(null);
    try {
      let hr: number | null = null;
      const hasHr = services.some((s) => s.uuid.toLowerCase() === UUID.heartRate);
      if (hasHr) {
        note('Heart rate service found — listening 10 s…');
        const { BleClient } = await import('@capacitor-community/bluetooth-le');
        const vals: number[] = [];
        await BleClient.startNotifications(g.ble_address, UUID.heartRate, UUID.heartRateMeasurement, (v) => {
          const flags = v.getUint8(0);
          const bpm = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
          if (bpm > 25 && bpm < 240) vals.push(bpm);
        }).catch(() => note('Heart rate not readable'));
        await new Promise((r) => setTimeout(r, 10000));
        await BleClient.stopNotifications(g.ble_address, UUID.heartRate, UUID.heartRateMeasurement).catch(() => {});
        if (vals.length) hr = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
      const hasMoyoung = services.some((s) => s.uuid.toLowerCase() === UUID.moyoungService);
      if (hasMoyoung) {
        const raw = await readRaw(g.ble_address, UUID.moyoungService, UUID.moyoungSteps);
        note(raw ? `Da Fit steps data: ${raw}` : 'Da Fit steps data not readable');
        const d = decodeMoyoungSteps(raw);
        if (d) setWatchGuess({ ...d, hr });
        setLive((l) => (l ? { ...l, raw: { ...l.raw, fee1: raw ?? '-' } } : l));
      } else {
        note('No Da Fit (FEEA) service — this watch uses a different private protocol.');
        if (hr !== null) setWatchGuess({ steps: -1, distanceM: -1, calories: -1, hr });
      }
      await status(hasMoyoung ? 'Connected (experimental)' : 'Connected, data not decodable', true);
    } catch (e) {
      note(`Error: ${(e as Error).message}`);
    } finally {
      await disconnect(g.ble_address);
      setBusy(null);
    }
  };
  const confirmWatch = async (matches: boolean) => {
    if (!g || !watchGuess) return;
    await updateGadget(g.id, { settings: { ...g.settings, moyoungStepsVerified: matches } }).catch(() => {});
    setG({ ...g, settings: { ...g.settings, moyoungStepsVerified: matches } });
    if (!matches) {
      toast('Thanks — not saved. Send me the "Copy details" text so the decoder can be fixed.');
      setWatchGuess(null);
      return;
    }
    const row: Record<string, unknown> = { day: todayISO(), source: 'watch_ble', updated_at: new Date().toISOString() };
    if (watchGuess.steps >= 0) Object.assign(row, { steps: watchGuess.steps, distance_m: watchGuess.distanceM, calories_kcal: watchGuess.calories });
    if (watchGuess.hr !== null) row.heart_rate_avg = watchGuess.hr;
    const { error } = await supabase.from('activity_daily').upsert(row, { onConflict: 'user_id,day,source' });
    if (error) toast(friendlyError(error), 'error');
    else toast("Saved today's watch data");
    setWatchGuess(null);
  };

  const copyDetails = async () => {
    const text = [
      `Device: ${g?.name} (${g?.model ?? '-'}) ${g?.ble_address ?? ''}`,
      live ? `Battery: ${live.battery ?? '-'} · ${live.manufacturer ?? ''} ${live.model ?? ''} fw ${live.firmware ?? ''}` : '',
      ...(live?.services ?? []),
      ...Object.entries(live?.raw ?? {}).map(([k, v]) => `${k}: ${v}`),
      ...adv.map((a) => `adv ${a}`),
      ...log,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it to me in chat');
    } catch {
      toast('Could not copy', 'error');
    }
  };

  if (g === undefined) return <Page title="Device" back><Spinner /></Page>;
  if (g === null) return <Page title="Device" back><Empty title="Device not found" /></Page>;
  const verified = g.settings?.moyoungStepsVerified === true;

  return (
    <Page title={g.name} subtitle={`${KIND_LABEL[g.kind]}${g.model ? ` · ${g.model}` : ''}`} back>
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <IconBubble tone="primary">{KIND_ICON[g.kind]}</IconBubble>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold">{live ? (live.connected ? 'Reached just now' : 'Not reachable') : 'Not checked yet'}</span>
            <span className="block text-[12px] text-muted">{ago(g.last_sync_at)}{g.last_status ? ` · ${g.last_status}` : ''}</span>
          </span>
          {live?.battery != null && <Badge tone="primary">{live.battery}%</Badge>}
        </div>
        <p className="text-[12px] text-muted">
          {g.ble_address ? `Bluetooth ${g.ble_address}` : 'No Bluetooth address — scan from Add device to connect'}
          {g.companion_app ? ` · App: ${g.companion_app}` : ''}
        </p>
        {bleSupported() && g.ble_address && (
          <Button size="sm" loading={busy === 'check'} onClick={async () => { setBusy('check'); await inspect(false); setBusy(null); }}>
            <RefreshCw size={13} /> Check connection
          </Button>
        )}
      </Card>

      {g.kind === 'scale' && (
        <>
          <SectionTitle>Scale</SectionTitle>
          <Card className="space-y-2.5">
            <Button full variant="primary" loading={busy === 'scale'} disabled={!bleSupported() || !g.ble_address} onClick={readScale}>
              <Scale size={14} /> Read weight from scale
            </Button>
            {reading?.weightKg && (
              <div className="space-y-2 rounded-[14px] p-3" style={{ background: 'var(--primary-soft)' }}>
                <p className="text-[22px] font-bold">{reading.weightKg} kg</p>
                <p className="text-[12px] text-muted">
                  {[reading.bodyFatPct && `Fat ${reading.bodyFatPct}%`, reading.muscleKg && `Muscle ${reading.muscleKg} kg`, reading.bmrKcal && `BMR ${reading.bmrKcal} kcal`].filter(Boolean).join(' · ') || 'Weight only (the scale sent no body-composition data)'}
                </p>
                <Button full variant="primary" onClick={saveReading}>Save to Weight</Button>
              </div>
            )}
            <Button full onClick={() => nav('/weight')}>Open Weight log (manual entry)</Button>
          </Card>
          <details className="glass rounded-[18px] px-3.5 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold">Help add your scale (private format)</summary>
            <div className="mt-2 space-y-2">
              <p className="text-[12px] text-muted">
                Many scales (including ActiveX) may use their own data format instead of the Bluetooth standard. Tap below, step on the scale and stand still. Then tap "Copy details" and send it to me with the weight the scale showed — that is enough to add a decoder.
              </p>
              <Button size="sm" loading={busy === 'adv'} disabled={!bleSupported() || !g.ble_address} onClick={watchAdverts}>
                <Activity size={13} /> Record scale broadcast (20 s)
              </Button>
              {adv.length > 0 && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[10px] bg-black/5 p-2 text-[10.5px]">{adv.join('\n')}</pre>}
            </div>
          </details>
        </>
      )}

      {g.kind === 'watch' && (
        <>
          <SectionTitle>Watch (experimental)</SectionTitle>
          <Card className="space-y-2.5">
            <p className="text-[12px] text-muted">
              Direct Bluetooth with a Da Fit watch is <b>experimental</b>: the format is private and not published. The watch talks to one app at a time — close Da Fit (or turn off its connection) before syncing. Numbers are shown for you to check against Da Fit before anything is saved.
            </p>
            <Button full variant="primary" loading={busy === 'watch'} disabled={!bleSupported() || !g.ble_address} onClick={syncWatch}>
              <RefreshCw size={14} /> Sync now
            </Button>
            {watchGuess && (
              <div className="space-y-2 rounded-[14px] p-3" style={{ background: 'var(--primary-soft)' }}>
                {watchGuess.steps >= 0 && (
                  <p className="text-[14px]">
                    <b>{watchGuess.steps.toLocaleString('en-IN')}</b> steps · {(watchGuess.distanceM / 1000).toFixed(2)} km · {watchGuess.calories} kcal
                  </p>
                )}
                {watchGuess.hr !== null && <p className="text-[14px]">Heart rate (10 s average): <b>{watchGuess.hr}</b> bpm</p>}
                <p className="text-[12px] text-muted">{verified ? 'Decoder confirmed earlier.' : 'Unverified — does this match what Da Fit shows for today?'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button full onClick={() => confirmWatch(false)}>No, wrong</Button>
                  <Button full variant="primary" onClick={() => confirmWatch(true)}>Yes, save</Button>
                </div>
              </div>
            )}
            <Button full onClick={() => nav('/health')}>Health Connect data (if Da Fit shares it)</Button>
          </Card>
        </>
      )}

      {(g.kind === 'earbuds' || g.kind === 'other' || g.kind === 'phone') && (
        <Card className="space-y-2">
          <p className="text-[12.5px] text-muted">
            Android lets apps see paired devices and their name. Rename and connect/disconnect happen in the phone's Bluetooth settings. AirPods battery and Apple features are not available on Android.
          </p>
          <Button full onClick={() => { suppressBriefly(); openBluetoothSettings(); }}>
            <Bluetooth size={14} /> Open Bluetooth settings
          </Button>
        </Card>
      )}

      {live && (
        <>
          <SectionTitle>What the device reported</SectionTitle>
          <Card className="space-y-1.5 text-[12px]">
            {(live.manufacturer || live.model || live.firmware) && <p>{[live.manufacturer, live.model, live.firmware && `fw ${live.firmware}`].filter(Boolean).join(' · ')}</p>}
            {live.services.length === 0 ? <p className="text-muted">No services read.</p> : live.services.map((s, i) => <p key={i} className="break-all text-muted">{s}</p>)}
          </Card>
        </>
      )}
      {log.length > 0 && (
        <details className="glass rounded-[18px] px-3.5 py-2.5">
          <summary className="cursor-pointer text-[13px] font-semibold">Connection log</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10.5px]">{log.join('\n')}</pre>
        </details>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" onClick={copyDetails}>
          <Copy size={13} /> Copy details
        </Button>
        <Button size="sm" onClick={() => { setEditName(g.name); setEditCat(g.category ?? ''); setEditOpen(true); }}>
          Rename
        </Button>
        <Button size="sm" onClick={() => setDelOpen(true)}>
          <Trash2 size={13} /> Remove
        </Button>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Rename device">
        <div className="space-y-3">
          <FormRow label="Name in DeepBoost"><input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} /></FormRow>
          <FormRow label="Category (optional)"><input className="field" value={editCat} onChange={(e) => setEditCat(e.target.value)} placeholder="e.g. Fitness" /></FormRow>
          <p className="text-[11.5px] text-muted">This changes the name only inside DeepBoost Life. The name other phones see is set in Bluetooth settings.</p>
          <Button full variant="primary" onClick={async () => {
            if (!editName.trim()) return;
            try {
              await updateGadget(g.id, { name: editName.trim(), category: editCat.trim() || null });
              setEditOpen(false);
              load();
            } catch (e) {
              toast(friendlyError(e), 'error');
            }
          }}>Save</Button>
        </div>
      </Sheet>
      <Confirm
        open={delOpen}
        title="Remove this device?"
        message="Saved weight and activity stay. Only the device entry is removed."
        confirmLabel="Remove"
        danger
        onClose={() => setDelOpen(false)}
        onConfirm={async () => {
          await removeGadget(g.id).catch(() => {});
          nav('/gadgets', { replace: true });
        }}
      />
    </Page>
  );
}

