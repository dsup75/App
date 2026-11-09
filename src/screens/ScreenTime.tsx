// Screen time: today, app-wise (this phone only), 7/30-day totals, unlocks and a daily goal
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { MonitorSmartphone } from 'lucide-react';
import {
  fmtMinutes, getScreenGoal, hasUsageAccess, openUsageAccess, savedTotals, screenTimeSupported, setScreenGoal, syncScreenTimeTotals, usageForDay, usageForRange, type Usage,
} from '../lib/screenTime';
import { toISODate } from '../lib/dates';
import { useLock } from '../context/LockContext';
import { BarChart, Button, Card, Page, ProgressBar, SectionTitle, Segmented, Sheet, Spinner, Toggle } from '../components/ui';

export function ScreenTimeScreen() {
  const { suppressBriefly } = useLock();
  const [access, setAccess] = useState<boolean | null>(null);
  const [today, setToday] = useState<Usage | null>(null);
  const [range, setRange] = useState<'today' | '7' | '30'>('today');
  const [rangeUsage, setRangeUsage] = useState<Usage | null>(null);
  const [days, setDays] = useState<{ day: string; total_minutes: number; unlocks: number | null }[]>([]);
  const [goal, setGoal] = useState(getScreenGoal);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState(String(getScreenGoal().minutes));

  const load = useCallback(async () => {
    const ok = await hasUsageAccess();
    setAccess(ok);
    if (!ok) return;
    const t = await usageForDay(new Date());
    setToday(t);
    syncScreenTimeTotals()
      .catch(() => {})
      .finally(() => savedTotals(30).then(setDays).catch(() => {}));
  }, []);
  useEffect(() => {
    load();
    let sub: { remove: () => void } | null = null;
    CapApp.addListener('resume', () => load()).then((h) => (sub = h)).catch(() => {});
    return () => sub?.remove();
  }, [load]);
  useEffect(() => {
    if (!access || range === 'today') return setRangeUsage(null);
    setRangeUsage(null);
    usageForRange(Number(range)).then(setRangeUsage);
  }, [range, access]);

  const shown = range === 'today' ? today : rangeUsage;
  const todayMin = today ? today.totalMs / 60000 : 0;
  const week = useMemo(() => {
    const m = new Map(days.map((d) => [d.day, d.total_minutes]));
    const out: { label: string; value: number; highlight?: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      out.push({ label: d.toLocaleDateString('en-IN', { weekday: 'narrow' }), value: i === 0 ? Math.round(todayMin) : m.get(toISODate(d)) ?? 0, highlight: i === 0 });
    }
    return out;
  }, [days, todayMin]);
  const monthTotal = days.reduce((t, d) => t + d.total_minutes, 0);

  if (!screenTimeSupported())
    return (
      <Page title="Screen time" back>
        <Card>
          <p className="text-[13px] text-muted">Screen time is read from Android, so it works in the installed Android app only.</p>
        </Card>
      </Page>
    );

  return (
    <Page title="Screen time" subtitle="How you use your phone" back>
      {access === null ? (
        <Spinner />
      ) : !access ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={18} className="text-primary" />
            <p className="text-[14.5px] font-semibold">Allow Usage access</p>
          </div>
          <p className="text-[13px] text-muted">
            Android shows which apps you used and for how long only to apps with "Usage access". App-wise details stay on this phone; only your daily total and unlock count are saved to your account.
          </p>
          <Button full variant="primary" onClick={() => { suppressBriefly(); openUsageAccess(); }}>
            Open Usage access settings
          </Button>
        </Card>
      ) : (
        <>
          <Card className="space-y-2">
            <p className="text-[12.5px] text-muted">Today</p>
            <p className="text-[30px] font-bold tracking-tight">{fmtMinutes(todayMin)}</p>
            <ProgressBar pct={Math.min(100, (todayMin / goal.minutes) * 100)} color={todayMin > goal.minutes ? 'var(--danger)' : 'var(--primary-2)'} />
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span>Goal {fmtMinutes(goal.minutes)}{todayMin > goal.minutes ? ' · over goal' : ''}</span>
              <span>{today?.unlocks != null ? `${today.unlocks} unlocks` : ''}</span>
            </div>
            <Button size="sm" onClick={() => setGoalOpen(true)}>Daily goal</Button>
          </Card>

          <Card>
            <p className="mb-2 text-[13px] font-semibold">Last 7 days</p>
            <BarChart data={week} format={(v) => fmtMinutes(v)} height={90} />
            {days.length > 7 && <p className="mt-1 text-[11.5px] text-muted">Last 30 days: {fmtMinutes(monthTotal)} total · {fmtMinutes(monthTotal / days.length)} a day</p>}
          </Card>

          <SectionTitle>Most used apps</SectionTitle>
          <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
          {!shown ? (
            <Spinner />
          ) : shown.apps.length === 0 ? (
            <Card><p className="text-[13px] text-muted">No app use recorded for this period.</p></Card>
          ) : (
            <Card className="space-y-2.5">
              {shown.apps.slice(0, 15).map((a) => (
                <div key={a.packageName} className="space-y-1">
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    <span className="font-semibold tabular-nums">{fmtMinutes(a.ms / 60000)}</span>
                  </div>
                  <ProgressBar pct={(a.ms / shown.apps[0].ms) * 100} />
                </div>
              ))}
              {range === '30' && <p className="text-[11px] text-muted">Android keeps detailed app history for about 7–10 days, so 30-day app lists can be shorter.</p>}
            </Card>
          )}
          <p className="px-1 text-[11.5px] text-muted">App-wise data is read on this phone only and never uploaded. Totals can differ a little from Digital Wellbeing.</p>
        </>
      )}

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Daily screen-time goal">
        <div className="space-y-3">
          <input className="field" inputMode="numeric" value={goalInput} onChange={(e) => setGoalInput(e.target.value.replace(/\D/g, ''))} placeholder="Minutes per day" />
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[14px]">Show a warning when I open the app and I'm over the goal</p>
            <Toggle checked={goal.alert} onChange={(v) => setGoal({ ...goal, alert: v })} />
          </div>
          <Button
            full
            variant="primary"
            onClick={() => {
              const m = Math.max(10, Math.min(1440, Number(goalInput) || 180));
              const g = { minutes: m, alert: goal.alert };
              setGoal(g);
              setScreenGoal(g);
              setGoalOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
