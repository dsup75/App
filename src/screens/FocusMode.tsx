// Focus mode setup: permissions, allowed apps, quick start
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldBan, Check, Search, ExternalLink } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import {
  focusStatus, focusSupported, getFocusPrefs, listInstalledApps, openOverlaySettings, openUsageSettings, setFocusPrefs, startFocusGuard, stopFocusGuard,
  type AppInfo, type FocusPrefs, type FocusStatus,
} from '../lib/focusGuard';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { Badge, Button, Card, Chips, List, ListRow, Page, SectionTitle, Toggle, cx } from '../components/ui';

export function FocusModeScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const [st, setSt] = useState<FocusStatus | null>(null);
  const [prefs, setPrefs] = useState<FocusPrefs>(getFocusPrefs);
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [q, setQ] = useState('');
  const [mins, setMins] = useState<'25' | '50' | '90'>('50');

  const refresh = useCallback(() => {
    focusStatus().then(setSt);
  }, []);
  useEffect(() => {
    refresh();
    // permissions are granted in Android settings — re-check when the user comes back
    let sub: { remove: () => void } | null = null;
    CapApp.addListener('resume', refresh).then((h) => (sub = h)).catch(() => {});
    return () => sub?.remove();
  }, [refresh]);
  useEffect(() => {
    if (st?.supported && apps === null) listInstalledApps().then(setApps);
  }, [st, apps]);

  const save = (p: FocusPrefs) => {
    setPrefs(p);
    setFocusPrefs(p);
  };
  const toggleApp = (pkg: string) =>
    save({ ...prefs, allowed: prefs.allowed.includes(pkg) ? prefs.allowed.filter((x) => x !== pkg) : [...prefs.allowed, pkg] });

  const list = useMemo(() => (apps ?? []).filter((a) => !q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase())), [apps, q]);
  const ready = !!st?.usageAccess && !!st?.overlay;

  const quickStart = async () => {
    if (!prefs.on) save({ ...prefs, on: true });
    setFocusPrefs({ ...prefs, on: true });
    const msg = await startFocusGuard(Date.now() + Number(mins) * 60000);
    if (msg) toast(msg, 'error');
    else toast(`Focus mode on for ${mins} min`);
    refresh();
  };
  const stopNow = async () => {
    await stopFocusGuard();
    toast('Focus mode stopped');
    refresh();
  };

  return (
    <Page title="Focus mode" subtitle="Stay on study apps — other apps send you back to DeepBoost Life" back>
      {!focusSupported() ? (
        <Card className="space-y-2">
          <p className="text-[14.5px] font-semibold">Android app only</p>
          <p className="text-[13px] text-muted">Blocking other apps needs Android permissions, so it works only in the installed Android app — not in a browser. The focus timer itself works everywhere.</p>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldBan size={17} className="text-primary" />
              <p className="min-w-0 flex-1 text-[14.5px] font-semibold">Use with the focus timer</p>
              <Toggle checked={prefs.on} onChange={(v) => save({ ...prefs, on: v })} />
            </div>
            <p className="text-[12.5px] text-muted">When on, starting a Focus session in the timer also turns on app blocking until that session ends. Breaks are not blocked.</p>
            {st?.running && (
              <div className="flex items-center justify-between rounded-[12px] p-2.5" style={{ background: 'var(--primary-soft)' }}>
                <span className="text-[13px] font-semibold">Running until {new Date(st.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                <Button size="sm" onClick={stopNow}>
                  Stop
                </Button>
              </div>
            )}
          </Card>

          <SectionTitle>1 · Permissions</SectionTitle>
          <List>
            <ListRow
              title="Usage access"
              subtitle="Lets DeepBoost Life see which app is open"
              right={st?.usageAccess ? <Badge tone="primary">Allowed</Badge> : <Badge tone="amber">Off</Badge>}
              onClick={() => {
                suppressBriefly();
                openUsageSettings();
              }}
              chevron
            />
            <ListRow
              title="Display over other apps"
              subtitle="Lets DeepBoost Life come back to the front"
              right={st?.overlay ? <Badge tone="primary">Allowed</Badge> : <Badge tone="amber">Off</Badge>}
              onClick={() => {
                suppressBriefly();
                openOverlaySettings();
              }}
              chevron
            />
          </List>
          <p className="px-1 text-[11.5px] text-muted">
            In Usage access, find DeepBoost Life and switch it on. Come back here — the status updates by itself. Phone, emergency, settings and keyboard are never blocked.
          </p>

          <SectionTitle right={<span className="text-[12.5px] text-muted">{prefs.allowed.length} allowed</span>}>2 · Allowed apps</SectionTitle>
          <div className="glass flex items-center gap-2 rounded-[14px] px-3">
            <Search size={16} className="text-muted" />
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {apps === null ? (
            <p className="px-1 text-[13px] text-muted">Loading apps…</p>
          ) : (
            <div className="glass max-h-[46vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-[18px]">
              {list.map((a) => {
                const on = prefs.allowed.includes(a.packageName);
                return (
                  <button key={a.packageName} type="button" onClick={() => toggleApp(a.packageName)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px]">{a.label}</span>
                      <span className="block truncate text-[11px] text-muted">{a.packageName}</span>
                    </span>
                    <span className={cx('flex h-6 w-6 items-center justify-center rounded-full', on ? 'bg-[var(--primary-2)] text-white' : '')} style={on ? undefined : { boxShadow: 'inset 0 0 0 2px var(--muted)' }}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <SectionTitle>3 · Start</SectionTitle>
          <Card className="space-y-3">
            <Chips value={mins} onChange={setMins} options={[{ value: '25', label: '25 min' }, { value: '50', label: '50 min' }, { value: '90', label: '90 min' }]} />
            <Button full variant="primary" disabled={!ready} onClick={quickStart}>
              Start focus mode now
            </Button>
            <Button full onClick={() => nav('/pomodoro')}>
              <ExternalLink size={14} /> Open focus timer
            </Button>
            {!ready && <p className="text-[12px] text-amber-600">Allow both permissions above first.</p>}
          </Card>
        </>
      )}
    </Page>
  );
}
