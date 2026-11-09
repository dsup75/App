// Focus mode setup: blocker permissions, apps to block, start/pause/stop, history
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldBan, Check, Search, ExternalLink, Pause, Play, Square, Timer } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import {
  fetchFocusStats, focusReady, focusStatus, focusSupported, getFocusPrefs, listInstalledApps, openAccessibilitySettings, openAppInfo,
  openOverlaySettings, openUsageSettings, pauseFocusGuard, resumeFocusGuard, saveFinishedFocusSession, setFocusPrefs, startFocusGuard, stopFocusGuard,
  type AppInfo, type FocusPrefs, type FocusStats, type FocusStatus,
} from '../lib/focusGuard';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { Badge, Button, Card, Chips, List, ListRow, Page, SectionTitle, Segmented, Toggle, cx } from '../components/ui';

const REASON: Record<string, string> = { completed: 'Completed', stopped: 'Stopped', emergency_exit: 'Emergency exit', replaced: 'Replaced', break: 'Break' };

export function FocusModeScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const [st, setSt] = useState<FocusStatus | null>(null);
  const [prefs, setPrefs] = useState<FocusPrefs>(getFocusPrefs);
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [q, setQ] = useState('');
  const [mins, setMins] = useState<'25' | '50' | '90' | 'custom'>('50');
  const [custom, setCustom] = useState('45');
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    const s = await focusStatus();
    setSt(s);
    if (s.hasLastSession) await saveFinishedFocusSession();
    fetchFocusStats().then(setStats);
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
  useEffect(() => {
    if (!st?.running) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > st.endsAt) refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [st, refresh]);

  const save = (p: FocusPrefs) => {
    setPrefs(p);
    setFocusPrefs(p);
  };
  const listKey = prefs.mode === 'allow' ? 'allowed' : 'blocked';
  const chosen = prefs[listKey];
  const toggleApp = (pkg: string) => save({ ...prefs, [listKey]: chosen.includes(pkg) ? chosen.filter((x) => x !== pkg) : [...chosen, pkg] });

  const list = useMemo(() => {
    const all = (apps ?? []).filter((a) => !q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase()));
    // chosen apps first
    return [...all.filter((a) => chosen.includes(a.packageName)), ...all.filter((a) => !chosen.includes(a.packageName))];
  }, [apps, q, chosen]);
  const ready = focusReady(st);
  const minutes = mins === 'custom' ? Math.max(1, Math.min(600, Number(custom) || 0)) : Number(mins);

  const quickStart = async () => {
    const msg = await startFocusGuard(Date.now() + minutes * 60000, true);
    if (msg) toast(msg, 'error');
    else toast(`Focus mode on for ${minutes} min`);
    refresh();
  };
  const pauseNow = async () => {
    await pauseFocusGuard();
    toast('Paused — apps are not blocked');
    refresh();
  };
  const resumeNow = async () => {
    await resumeFocusGuard();
    toast('Blocking again');
    refresh();
  };
  const stopNow = async () => {
    await stopFocusGuard('stopped');
    toast('Focus mode stopped');
    refresh();
  };
  const left = st?.running ? Math.max(0, st.endsAt - now) : 0;

  return (
    <Page title="Focus mode" subtitle="Block distracting apps while you study" back>
      {!focusSupported() ? (
        <Card className="space-y-2">
          <p className="text-[14.5px] font-semibold">Android app only</p>
          <p className="text-[13px] text-muted">Blocking other apps needs Android permissions, so it works only in the installed Android app — not in a browser. The focus timer itself works everywhere.</p>
        </Card>
      ) : (
        <>
          {st?.running && (
            <Card className="space-y-3">
              <div className="flex items-center gap-2">
                <Timer size={17} className="text-primary" />
                <p className="min-w-0 flex-1 text-[14.5px] font-semibold">{st.paused ? 'Paused' : 'Blocking is on'}</p>
                <span className="text-[18px] font-bold tabular-nums">
                  {Math.floor(left / 60000)}:{String(Math.floor((left / 1000) % 60)).padStart(2, '0')}
                </span>
              </div>
              <p className="text-[12.5px] text-muted">
                Until {new Date(st.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · blocked {st.blockedCount} time{st.blockedCount === 1 ? '' : 's'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {st.paused ? (
                  <Button full variant="primary" onClick={resumeNow}>
                    <Play size={14} /> Resume
                  </Button>
                ) : (
                  <Button full onClick={pauseNow}>
                    <Pause size={14} /> Pause
                  </Button>
                )}
                <Button full onClick={stopNow}>
                  <Square size={14} /> Stop
                </Button>
              </div>
            </Card>
          )}

          <Card className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldBan size={17} className="text-primary" />
              <p className="min-w-0 flex-1 text-[14.5px] font-semibold">Use with the focus timer</p>
              <Toggle checked={prefs.on} onChange={(v) => save({ ...prefs, on: v })} />
            </div>
            <p className="text-[12.5px] text-muted">When on, starting a Focus session in the timer also turns on blocking until that session ends. Breaks are not blocked.</p>
          </Card>

          <SectionTitle>1 · Turn on the blocker</SectionTitle>
          <List>
            <ListRow
              title="DeepBoost blocker (recommended)"
              subtitle="Settings → Accessibility → Installed apps → DeepBoost Life focus blocker → On"
              right={st?.accessibility ? <Badge tone="primary">On</Badge> : <Badge tone="amber">Off</Badge>}
              onClick={() => {
                suppressBriefly();
                openAccessibilitySettings();
              }}
              chevron
            />
          </List>
          {!st?.accessibility && (
            <Card className="space-y-2 !p-3.5">
              <p className="text-[12.5px] text-muted">
                <b>Switch greyed out / "Restricted setting"?</b> Android 13+ protects this for apps installed from an APK. Open App info → ⋮ (top right) → <b>Allow restricted settings</b>, then come back and switch the blocker on.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  suppressBriefly();
                  openAppInfo();
                }}
              >
                Open App info
              </Button>
              <p className="text-[11.5px] text-muted">The blocker only sees the name of the app that opens. It does not read your screen, typing or messages.</p>
            </Card>
          )}
          <details className="glass rounded-[18px] px-3.5 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold">Backup method (if the blocker can't be turned on)</summary>
            <div className="mt-2 space-y-2">
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
                  subtitle="Lets the block screen appear"
                  right={st?.overlay ? <Badge tone="primary">Allowed</Badge> : <Badge tone="amber">Off</Badge>}
                  onClick={() => {
                    suppressBriefly();
                    openOverlaySettings();
                  }}
                  chevron
                />
              </List>
              <p className="text-[11.5px] text-muted">Slower (checks every second) and some phones (Xiaomi, Vivo, Oppo) may still stop it. Also allow "Autostart" / no battery restriction for DeepBoost Life on those phones.</p>
            </div>
          </details>

          <SectionTitle right={<span className="text-[12.5px] text-muted">{chosen.length} selected</span>}>2 · Apps</SectionTitle>
          <Segmented
            value={prefs.mode}
            onChange={(v) => save({ ...prefs, mode: v as FocusPrefs['mode'] })}
            options={[
              { value: 'block', label: 'Block selected apps' },
              { value: 'allow', label: 'Allow only selected' },
            ]}
          />
          <p className="px-1 text-[11.5px] text-muted">
            {prefs.mode === 'block' ? 'Only the apps you tick are blocked (e.g. Instagram, YouTube).' : 'Every app is blocked except the ones you tick.'} Phone, emergency, settings and keyboard are never blocked.
          </p>
          <div className="glass flex items-center gap-2 rounded-[14px] px-3">
            <Search size={16} className="text-muted" />
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {apps === null ? (
            <p className="px-1 text-[13px] text-muted">Loading apps…</p>
          ) : (
            <div className="glass max-h-[46vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-[18px]">
              {list.map((a) => {
                const on = chosen.includes(a.packageName);
                return (
                  <button key={a.packageName} type="button" onClick={() => toggleApp(a.packageName)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px]">{a.label}</span>
                      <span className="block truncate text-[11px] text-muted">{a.packageName}</span>
                    </span>
                    <span
                      className={cx('flex h-6 w-6 items-center justify-center rounded-full', on ? (prefs.mode === 'block' ? 'bg-[var(--danger)] text-[var(--on-primary)]' : 'bg-[var(--primary-2)] text-[var(--on-primary)]') : '')}
                      style={on ? undefined : { boxShadow: 'inset 0 0 0 2px var(--muted)' }}
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <SectionTitle>3 · Start</SectionTitle>
          <Card className="space-y-3">
            <Chips
              value={mins}
              onChange={setMins}
              options={[
                { value: '25', label: '25 min' },
                { value: '50', label: '50 min' },
                { value: '90', label: '90 min' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {mins === 'custom' && (
              <input className="field" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} placeholder="Minutes (1–600)" />
            )}
            <Button full variant="primary" disabled={!ready || !!st?.running} onClick={quickStart}>
              Start blocking for {minutes} min
            </Button>
            <Button full onClick={() => nav('/pomodoro')}>
              <ExternalLink size={14} /> Open focus timer
            </Button>
            {!ready && <p className="text-[12px] text-warn">Turn on the DeepBoost blocker above first.</p>}
            <p className="text-[11.5px] text-muted">
              On the block screen, "Emergency exit" (hold 5 seconds) ends the session. Android does not let any app stop force-stop or uninstall, so this is a self-control tool, not a lock.
            </p>
          </Card>

          <SectionTitle>History (last 7 days)</SectionTitle>
          {stats === null ? (
            <p className="px-1 text-[13px] text-muted">No history yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Card className="!p-3">
                  <p className="text-[11.5px] text-muted">Today</p>
                  <p className="text-[18px] font-bold">{stats.todayMinutes} min</p>
                </Card>
                <Card className="!p-3">
                  <p className="text-[11.5px] text-muted">7 days</p>
                  <p className="text-[18px] font-bold">{Math.round((stats.weekMinutes / 60) * 10) / 10} h</p>
                </Card>
                <Card className="!p-3">
                  <p className="text-[11.5px] text-muted">Blocked</p>
                  <p className="text-[18px] font-bold">{stats.weekBlocked}×</p>
                </Card>
              </div>
              {stats.recent.length > 0 && (
                <List>
                  {stats.recent.map((r) => (
                    <ListRow
                      key={r.started_at}
                      title={`${r.focused_minutes} of ${r.planned_minutes} min`}
                      subtitle={`${new Date(r.started_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · blocked ${r.blocked_attempts}×`}
                      right={<Badge tone={r.end_reason === 'completed' ? 'primary' : r.end_reason === 'emergency_exit' ? 'amber' : undefined}>{REASON[r.end_reason] ?? r.end_reason}</Badge>}
                    />
                  ))}
                </List>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
