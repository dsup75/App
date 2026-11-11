import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Lock, Fingerprint, ScanFace, Smartphone, Timer, LogOut, FileSpreadsheet, User, KeyRound, Bell, DatabaseBackup } from 'lucide-react';
import { AiSettings } from '../components/AiSettings';
import { askPermission, getReminderConfig, remindersSupported, saveReminderConfig, scheduleReminders, DEFAULT_REMINDERS, type ReminderConfig } from '../lib/reminders';
import { useAuth } from '../context/AuthContext';
import { useLock } from '../context/LockContext';
import { useToast } from '../context/ToastContext';
import { friendlyError, saveSettings } from '../lib/db';
import { biometricAvailable, biometricInfo, biometricPrompt, bioLabel, hashPin, verifyPin, LOCK_TIMEOUTS, type BioInfo, type LockConfig } from '../lib/lock';
import { brandLogosOn, setBrandLogosOn } from '../lib/brands';
import { ACCENTS, STYLES, TEXT_SIZES, THEMES, getThemePrefs, setThemePrefs, type CustomColors, type ThemePrefs } from '../lib/theme';
import { isValidScriptUrl, syncAll, testScript } from '../lib/sheets';
import { isValidUpiId } from '../lib/upi';
import { formatDateTime } from '../lib/dates';
import { PinPad } from '../components/PinPad';
import { Badge, Button, Card, Confirm, FormRow, IconBubble, List, ListRow, Page, SectionTitle, Segmented, Sheet, Toggle, cx } from '../components/ui';

export function SettingsScreen() {
  const { user, settings, reloadSettings, signOut } = useAuth();
  const nav = useNavigate();
  const { config, updateConfig, lockNow, suppressBriefly } = useLock();
  const toast = useToast();
  const [name, setName] = useState(settings?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [pinFlow, setPinFlow] = useState<null | 'set' | 'change' | 'remove'>(null);
  const [bioOk, setBioOk] = useState(false);
  const [bio, setBio] = useState<BioInfo | null>(null);
  const [logout, setLogout] = useState(false);

  useEffect(() => setName(settings?.full_name ?? ''), [settings?.full_name]);
  useEffect(() => {
    biometricAvailable().then(setBioOk);
    biometricInfo().then(setBio);
  }, []);

  const saveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      await saveSettings(user.id, { full_name: name.trim() });
      await reloadSettings();
      toast('Name saved');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setSavingName(false);
    }
  };

  const toggleBio = async (on: boolean) => {
    if (!config) return;
    if (on) {
      suppressBriefly();
      const ok = await biometricPrompt('Confirm to turn on face / fingerprint unlock', !bio?.available);
      suppressBriefly();
      if (!ok) return toast('Not confirmed', 'error');
    }
    // phones that do not offer face/fingerprint to apps can still use the phone's own screen lock
    await updateConfig({ ...config, biometric: on, deviceCredential: on ? config.deviceCredential ?? !bio?.available : config.deviceCredential });
    toast(on ? `${bioLabel(bio?.kinds ?? [])} unlock on` : 'Biometric unlock off');
  };

  return (
    <Page title="Settings" back>
      <SectionTitle>Profile</SectionTitle>
      <Card className="space-y-3">
        <FormRow label="Your name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <p className="px-1 text-[13px] text-muted">Signed in as {user?.email}</p>
        <Button size="sm" loading={savingName} onClick={saveName} disabled={name.trim() === (settings?.full_name ?? '')}>
          Save name
        </Button>
      </Card>

      <Appearance />

      <SectionTitle>Security</SectionTitle>
      <List>
        <ListRow
          icon={<IconBubble tone="primary"><Lock size={18} /></IconBubble>}
          title="App lock (PIN)"
          subtitle={config ? `${config.length}-digit PIN is on` : 'Off'}
          right={config ? <Badge tone="primary">On</Badge> : undefined}
          onClick={() => setPinFlow(config ? 'change' : 'set')}
          chevron
        />
        {config && (
          <>
            <ListRow
              icon={<IconBubble tone="blue">{bio?.kinds.includes('face') ? <ScanFace size={18} /> : <Fingerprint size={18} />}</IconBubble>}
              title="Face / fingerprint unlock"
              subtitle={
                !Capacitor.isNativePlatform()
                  ? 'Available in the Android app'
                  : bio?.available
                    ? `Opens by itself, like Face ID · this phone offers: ${bio.kinds.length ? bio.kinds.join(' + ') : 'biometrics'}`
                    : bioOk
                      ? 'Uses your phone screen lock (face unlock here is not shared with apps)'
                      : 'Set up a screen lock / fingerprint in phone Settings first'
              }
              right={<Toggle checked={config.biometric} disabled={!bioOk} onChange={toggleBio} />}
            />
            {config.biometric && (
              <ListRow
                icon={<IconBubble tone="violet"><Smartphone size={18} /></IconBubble>}
                title="Also allow phone PIN / pattern"
                subtitle="If face or finger isn't recognised, unlock with your phone's own screen lock"
                right={<Toggle checked={!!config.deviceCredential} onChange={(v) => updateConfig({ ...config, deviceCredential: v })} />}
              />
            )}
            <div className="flex items-center gap-3 px-4 py-2.5">
              <IconBubble tone="amber"><Timer size={18} /></IconBubble>
              <span className="flex-1 text-[15px] font-medium">Auto-lock</span>
              <select
                className="field w-auto py-2 text-[14px]"
                value={config.timeoutSec}
                onChange={(e) => updateConfig({ ...config, timeoutSec: Number(e.target.value) })}
              >
                {LOCK_TIMEOUTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <ListRow icon={<IconBubble tone="muted"><KeyRound size={18} /></IconBubble>} title="Lock now" onClick={lockNow} />
            <ListRow icon={<IconBubble tone="expense"><Lock size={18} /></IconBubble>} title="Turn off PIN" onClick={() => setPinFlow('remove')} />
          </>
        )}
      </List>
      <p className="px-1 text-[12px] text-muted">
        The PIN protects this app on this phone. Your data on the server is protected by your password and database security
        rules.
      </p>

      <SectionTitle>Lists</SectionTitle>
      <List>
        <ListRow
          icon={<IconBubble tone="teal"><FileSpreadsheet size={18} /></IconBubble>}
          title="Manage lists"
          subtitle="Categories, accounts, clients & staff, payment apps, methods…"
          onClick={() => nav('/lists')}
          chevron
        />
      </List>

      <Reminders />

      <AiSettings />

      <SectionTitle>Data & Backup</SectionTitle>
      <List>
        <ListRow
          icon={<IconBubble tone="pink"><DatabaseBackup size={18} /></IconBubble>}
          title="Backup & restore"
          subtitle="Export all data as a JSON file, or import a backup"
          onClick={() => nav('/money-tools/backup')}
          chevron
        />
      </List>

      <PaymentsBusiness />

      <SheetSync />

      <SectionTitle>Account</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="expense"><LogOut size={18} /></IconBubble>} title="Sign out" onClick={() => setLogout(true)} />
        <ListRow icon={<IconBubble tone="muted"><User size={18} /></IconBubble>} title="App version" right={<span className="text-[14px] text-muted">{import.meta.env.VITE_APP_VERSION ?? 'dev'}</span>} />
      </List>

      <PinFlow mode={pinFlow} onClose={() => setPinFlow(null)} />
      <Confirm
        open={logout}
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign out"
        danger
        onConfirm={signOut}
        onClose={() => setLogout(false)}
      />
    </Page>
  );
}

/* ---------------- PIN set / change / remove ---------------- */
function PinFlow({ mode, onClose }: { mode: null | 'set' | 'change' | 'remove'; onClose: () => void }) {
  const { config, updateConfig } = useLock();
  const toast = useToast();
  const [step, setStep] = useState<'verify' | 'length' | 'enter' | 'confirm'>('length');
  const [length, setLength] = useState<4 | 6>(4);
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mode) return;
    setError('');
    setFirst('');
    setStep(mode === 'set' ? 'length' : 'verify');
  }, [mode]);

  const onVerify = async (pin: string) => {
    setError('');
    if (!config || !(await verifyPin(pin, config))) return setError('Wrong PIN');
    if (mode === 'remove') {
      await updateConfig(null);
      toast('App lock turned off');
      return onClose();
    }
    setStep('length');
  };

  const onEnter = (pin: string) => {
    setFirst(pin);
    setError('');
    setStep('confirm');
  };

  const onConfirm = async (pin: string) => {
    setError('');
    if (pin !== first) {
      setStep('enter');
      setFirst('');
      return setError('PINs did not match. Try again.');
    }
    const { hash, salt } = await hashPin(pin);
    const cfg: LockConfig = {
      hash,
      salt,
      length,
      biometric: config?.biometric ?? false,
      timeoutSec: config?.timeoutSec ?? 30,
      failCount: 0,
      lockoutUntil: 0,
    };
    await updateConfig(cfg);
    toast(mode === 'change' ? 'PIN changed' : 'App lock is on');
    onClose();
  };

  const title =
    step === 'verify' ? 'Enter current PIN' : step === 'length' ? 'Choose PIN length' : step === 'enter' ? 'Enter new PIN' : 'Confirm new PIN';

  return (
    <Sheet open={!!mode} onClose={onClose} title={title}>
      {step === 'length' ? (
        <div className="space-y-4">
          <Segmented
            value={String(length) as '4' | '6'}
            onChange={(v) => setLength(Number(v) as 4 | 6)}
            options={[
              { value: '4', label: '4 digits' },
              { value: '6', label: '6 digits' },
            ]}
          />
          <Button variant="primary" full size="lg" onClick={() => setStep('enter')}>
            Continue
          </Button>
        </div>
      ) : step === 'verify' && config ? (
        <PinPad key="verify" length={config.length} onComplete={onVerify} error={error} />
      ) : step === 'enter' ? (
        <PinPad key="enter" length={length} onComplete={onEnter} error={error} />
      ) : (
        <PinPad key="confirm" length={length} onComplete={onConfirm} error={error} />
      )}
    </Sheet>
  );
}

/* ---------------- Custom theme editor ---------------- */
const CUSTOM_PRESETS: { label: string; c: CustomColors }[] = [
  { label: 'Ocean night', c: { bg: '#06101f', primary: '#3b82f6', hero: '#1d3a8a' } },
  { label: 'Royal', c: { bg: '#0d0820', primary: '#8b5cf6', hero: '#3b1a7a' } },
  { label: 'Emerald', c: { bg: '#04140f', primary: '#10b981', hero: '#065f46' } },
  { label: 'Sunrise', c: { bg: '#fff7ef', primary: '#ea580c', hero: '#c2410c' } },
  { label: 'Rose', c: { bg: '#fff1f4', primary: '#e11d48', hero: '#9f1239' } },
  { label: 'Sky', c: { bg: '#eef6ff', primary: '#0284c7', hero: '#075985' } },
];

function ColorRow({ label, hint, value, fallback, onChange }: { label: string; hint: string; value?: string; fallback: string; onChange: (v: string | undefined) => void }) {
  const [txt, setTxt] = useState(value ?? '');
  useEffect(() => setTxt(value ?? ''), [value]);
  return (
    <div className="flex items-center gap-3">
      <label className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[12px]" style={{ background: value ?? fallback, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <input type="color" aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="truncate text-[11.5px] text-muted">{hint}</p>
      </div>
      <input
        className="field w-[92px] px-2 py-1.5 font-mono text-[12.5px]"
        value={txt}
        placeholder="Auto"
        onChange={(e) => {
          setTxt(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
        }}
      />
      {value && (
        <button type="button" className="text-[12px] font-semibold text-muted" onClick={() => onChange(undefined)}>
          Auto
        </button>
      )}
    </div>
  );
}

function CustomThemeEditor({ p, set }: { p: ThemePrefs; set: (patch: Partial<ThemePrefs>) => void }) {
  const c = p.custom ?? {};
  const put = (k: keyof CustomColors, v: string | boolean | undefined) => set({ custom: { ...c, [k]: v } });
  return (
    <div className="space-y-3 rounded-[16px] p-3" style={{ background: 'var(--card-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <p className="text-[13px] font-semibold">Your colours</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {CUSTOM_PRESETS.map((x) => (
          <button key={x.label} type="button" onClick={() => set({ custom: { ...x.c, glow: c.glow } })} className="press flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[12px] font-semibold" style={{ background: 'var(--field)' }}>
            <span className="h-6 w-6 rounded-full" style={{ background: `linear-gradient(135deg, ${x.c.bg} 50%, ${x.c.primary} 50%)`, boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.3)' }} />
            {x.label}
          </button>
        ))}
      </div>
      <ColorRow label="Background" hint="Dark colour = dark app, light colour = light app" value={c.bg} fallback="#0b1020" onChange={(v) => put('bg', v)} />
      <ColorRow label="Cards" hint="Boxes and lists (Auto matches the background)" value={c.card} fallback="#18203a" onChange={(v) => put('card', v)} />
      <ColorRow label="Buttons & highlights" hint="Accent colour for buttons, links, charts" value={c.primary} fallback={ACCENTS.find((a) => a.value === p.accent)?.color ?? '#2f6bd6'} onChange={(v) => put('primary', v)} />
      <ColorRow label="Header card" hint="Total balance and big cards" value={c.hero} fallback={c.primary ?? '#1d3a8a'} onChange={(v) => put('hero', v)} />
      <ColorRow label="Text" hint="Auto picks black or white for best reading" value={c.text} fallback="#f2f5ff" onChange={(v) => put('text', v)} />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Background glow</p>
          <p className="text-[11.5px] text-muted">Soft coloured light behind the screens</p>
        </div>
        <Toggle checked={c.glow !== false} onChange={(v) => put('glow', v)} />
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-muted">Card style</p>
        <Segmented value={p.style} onChange={(v) => set({ style: v })} options={STYLES.map((st) => ({ value: st.value, label: st.label }))} />
        <p className="text-[12px] text-muted">{STYLES.find((x) => x.value === p.style)?.hint}</p>
      </div>
      {!c.primary && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted">Quick accent</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button key={a.value} aria-label={a.label} onClick={() => set({ accent: a.value })} className="press flex flex-col items-center gap-1">
                <span className="block h-8 w-8 rounded-full" style={{ background: a.color, boxShadow: p.accent === a.value ? `0 0 0 2px var(--bg), 0 0 0 4px ${a.color}` : 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
                <span className="text-[10.5px] text-muted">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Button size="sm" onClick={() => set({ custom: {} })}>Reset colours</Button>
    </div>
  );
}

/* ---------------- UPI + business details ---------------- */
function Appearance() {
  const [p, setP] = useState<ThemePrefs>(getThemePrefs());
  const [brands, setBrands] = useState(brandLogosOn);
  const set = (patch: Partial<ThemePrefs>) => {
    setThemePrefs(patch);
    setP(getThemePrefs());
  };
  const preset = THEMES.find((t) => t.value === p.theme);
  const followsMode = p.theme === 'custom' ? p.style !== 'midnight' && !p.custom?.bg : !preset?.mode;
  return (
    <>
      <SectionTitle>Appearance</SectionTitle>
      <Card className="space-y-4">
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted">Theme</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set({ theme: t.value })}
                aria-pressed={p.theme === t.value}
                className={cx('press rounded-[14px] p-1.5 text-center', p.theme === t.value ? 'ring-2 ring-[var(--primary-2)]' : '')}
                style={{ background: 'var(--card-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
              >
                <span className="relative mb-1 block h-11 overflow-hidden rounded-[10px]" style={{ background: t.swatch[0], boxShadow: 'inset 0 0 0 1px rgba(128,128,128,.25)' }}>
                  <span className="absolute inset-x-1.5 top-1.5 h-3.5 rounded-[5px]" style={{ background: t.swatch[1], opacity: 0.95 }} />
                  <span className="absolute bottom-1.5 left-1.5 h-2.5 w-6 rounded-full" style={{ background: t.swatch[2] }} />
                </span>
                <span className="block truncate text-[11px] font-semibold">{t.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => set({ theme: 'custom' })}
              aria-pressed={p.theme === 'custom'}
              className={cx('press rounded-[14px] p-1.5 text-center', p.theme === 'custom' ? 'ring-2 ring-[var(--primary-2)]' : '')}
              style={{ background: 'var(--card-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
            >
              <span className="mb-1 flex h-11 items-center justify-center rounded-[10px] text-[18px]" style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
                ⚙︎
              </span>
              <span className="block truncate text-[11px] font-semibold">Custom</span>
            </button>
          </div>
          <p className="text-[12px] text-muted">{preset ? preset.hint : 'Fully yours — pick every colour below: background, cards, buttons, text and the header card.'}</p>
        </div>

        {p.theme === 'custom' && <CustomThemeEditor p={p} set={set} />}

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted">Light / dark</p>
          {followsMode ? (
            <Segmented
              value={p.mode}
              onChange={(m) => set({ mode: m })}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          ) : (
            <p className="text-[12.5px] text-muted">
              {p.theme === 'custom' && p.custom?.bg ? 'Your background colour decides light or dark.' : `${preset?.label ?? 'Midnight'} is always ${(preset?.mode ?? 'dark') === 'dark' ? 'dark' : 'light'}.`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium">Brand logos automatically</p>
            <p className="text-[12px] text-muted">Type "Netflix", "Spotify", "Jio", "SBI"… and its logo shows (loaded from the internet once, then cached)</p>
          </div>
          <Toggle checked={brands} onChange={(v) => { setBrands(v); setBrandLogosOn(v); }} />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted">Your logos & photos</p>
          <Segmented
            value={p.images}
            onChange={(v) => set({ images: v })}
            options={[
              { value: 'theme', label: 'Follow theme' },
              { value: 'original', label: 'Original colours' },
            ]}
          />
          <p className="text-[12px] text-muted">In Black &amp; White, "Follow theme" shows uploaded icons, logos and bank cards in grey.</p>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted">Text size</p>
          <Segmented value={p.text} onChange={(t) => set({ text: t })} options={TEXT_SIZES.map((t) => ({ value: t.value, label: t.label === 'Extra large' ? 'XL' : t.label }))} />
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium">Reduce effects</p>
            <p className="text-[12px] text-muted">Less blur and animation — smoother on older phones, saves battery</p>
          </div>
          <Toggle checked={p.reduceEffects} onChange={(v) => set({ reduceEffects: v })} />
        </div>
      </Card>
    </>
  );
}

const REMINDER_KINDS: { key: keyof ReminderConfig; label: string }[] = [
  { key: 'daily', label: 'Morning plan (tasks due today)' },
  { key: 'udhaar', label: 'Udhaar due dates' },
  { key: 'payments', label: 'Invoices, card bills, EMIs & premiums due' },
  { key: 'exams', label: 'Exams (7 days & 1 day before)' },
  { key: 'recurring', label: 'Recurring entries due' },
  { key: 'budget', label: 'Budget crossed' },
];

function Reminders() {
  const { user } = useAuth();
  const toast = useToast();
  const [cfg, setCfg] = useState<ReminderConfig>(DEFAULT_REMINDERS);
  const ok = remindersSupported();
  useEffect(() => {
    if (user) getReminderConfig(user.id).then(setCfg);
  }, [user]);

  const update = async (next: ReminderConfig) => {
    if (!user) return;
    if (next.on && !cfg.on) {
      const allowed = await askPermission();
      if (!allowed) {
        toast('Allow notifications for DeepBoost Life in phone settings', 'error');
        return;
      }
    }
    setCfg(next);
    await saveReminderConfig(user.id, next);
    const n = await scheduleReminders(user.id).catch(() => 0);
    if (next.on && !cfg.on) toast(n ? `Reminders on · ${n} scheduled` : 'Reminders on');
  };

  return (
    <>
      <SectionTitle>Reminders</SectionTitle>
      <List>
        <ListRow
          icon={<IconBubble tone="amber"><Bell size={18} /></IconBubble>}
          title="Phone reminders"
          subtitle={ok ? (cfg.on ? `Every day at ${cfg.time}` : 'Off') : 'Available in the Android app'}
          right={<Toggle checked={cfg.on} disabled={!ok} onChange={(v) => update({ ...cfg, on: v })} />}
        />
        {ok && cfg.on && (
          <>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-[14.5px] font-medium">Reminder time</span>
              <input type="time" className="field w-auto py-2 text-[14px]" value={cfg.time} onChange={(e) => e.target.value && update({ ...cfg, time: e.target.value })} />
            </div>
            {REMINDER_KINDS.map((k) => (
              <div key={k.key} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-[14px]">{k.label}</span>
                <Toggle checked={!!cfg[k.key]} onChange={(v) => update({ ...cfg, [k.key]: v })} />
              </div>
            ))}
          </>
        )}
      </List>
      {ok && cfg.on && <p className="px-1 text-[12px] text-muted">Reminders are planned for the next 30 days each time you open the app.</p>}
    </>
  );
}

function PaymentsBusiness() {
  const { user, settings, reloadSettings } = useAuth();
  const toast = useToast();
  const [upi, setUpi] = useState('');
  const [upiName, setUpiName] = useState('');
  const [biz, setBiz] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setUpi(settings?.upi_id ?? '');
    setUpiName(settings?.upi_name ?? '');
    setBiz(settings?.business_name ?? '');
    setDetails(settings?.business_details ?? '');
  }, [settings?.upi_id, settings?.upi_name, settings?.business_name, settings?.business_details]);

  const save = async () => {
    if (!user) return;
    setErr('');
    if (upi.trim() && !isValidUpiId(upi)) return setErr('UPI ID looks wrong (example: name@okaxis).');
    setBusy(true);
    try {
      await saveSettings(user.id, {
        upi_id: upi.trim() || null,
        upi_name: upiName.trim() || null,
        business_name: biz.trim() || null,
        business_details: details.trim() || null,
      });
      await reloadSettings();
      toast('Saved');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>Payments & invoices</SectionTitle>
      <Card className="space-y-3">
        <FormRow label="Default UPI ID" hint="Used for payment request QR codes when the account has no UPI ID. Add one UPI ID per app in Finance → Accounts.">
          <input className="field" placeholder="name@okaxis" value={upi} onChange={(e) => setUpi(e.target.value)} />
        </FormRow>
        <FormRow label="Name shown in UPI apps">
          <input className="field" placeholder="e.g. Deependra Shakya" value={upiName} onChange={(e) => setUpiName(e.target.value)} />
        </FormRow>
        <FormRow label="Business name (on invoices)">
          <input className="field" placeholder="e.g. DeepBoost — Digital Growth & Creative Solutions" value={biz} onChange={(e) => setBiz(e.target.value)} />
        </FormRow>
        <FormRow label="Business details (address, phone, GSTIN…)">
          <textarea className="field min-h-[72px]" value={details} onChange={(e) => setDetails(e.target.value)} />
        </FormRow>
        {err && <p className="px-0.5 text-[13px] text-danger">{err}</p>}
        <Button size="sm" variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </Card>
    </>
  );
}

/* ---------------- Google Sheet sync ---------------- */
function SheetSync() {
  const { user, settings, reloadSettings } = useAuth();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'sync' | 'disconnect'>('');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    setUrl(settings?.apps_script_url ?? '');
    setKey(settings?.sync_key ?? '');
  }, [settings?.apps_script_url, settings?.sync_key]);

  const connected = !!settings?.apps_script_url;
  const dirty = url.trim() !== (settings?.apps_script_url ?? '') || key !== (settings?.sync_key ?? '');

  const test = async () => {
    if (!isValidScriptUrl(url)) return setStatus({ ok: false, text: 'URL should look like https://script.google.com/macros/s/…/exec' });
    setBusy('test');
    try {
      const msg = await testScript(url, key);
      setStatus({ ok: true, text: msg });
      return true;
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!user) return;
    if (!isValidScriptUrl(url)) return setStatus({ ok: false, text: 'URL should look like https://script.google.com/macros/s/…/exec' });
    const ok = await test();
    setBusy('save');
    try {
      await saveSettings(user.id, {
        apps_script_url: url.trim(),
        sync_key: key || null,
        sheet_verified_at: ok ? new Date().toISOString() : null,
      });
      await reloadSettings();
      toast(ok ? 'Sheet connected' : 'Saved, but the connection test failed', ok ? 'success' : 'error');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    if (!user) return;
    setBusy('disconnect');
    try {
      await saveSettings(user.id, { apps_script_url: null, sync_key: null, sheet_verified_at: null });
      await reloadSettings();
      setStatus(null);
      toast('Sheet disconnected');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const sync = async () => {
    if (!user || !settings?.apps_script_url) return;
    setBusy('sync');
    try {
      const n = await syncAll(settings.apps_script_url, settings.sync_key ?? '', setProgress);
      await saveSettings(user.id, { last_synced_at: new Date().toISOString() });
      await reloadSettings();
      toast(`Synced ${n} records to Google Sheet`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  return (
    <>
      <SectionTitle>Google Sheet sync</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <IconBubble tone="income"><FileSpreadsheet size={18} /></IconBubble>
          <div className="flex-1">
            <p className="font-medium">Apps Script link</p>
            <p className="text-[12px] text-muted">
              {connected
                ? settings?.sheet_verified_at
                  ? `Connected · tested ${formatDateTime(settings.sheet_verified_at)}`
                  : 'Saved · not tested'
                : 'Not connected (optional)'}
            </p>
          </div>
          {connected && <Badge tone={settings?.sheet_verified_at ? 'primary' : 'amber'}>{settings?.sheet_verified_at ? 'Connected' : 'Check'}</Badge>}
        </div>
        <FormRow label="Web App URL">
          <input className="field text-[13px]" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
        </FormRow>
        <FormRow label="Sync key" hint="Must match SYNC_KEY in your Apps Script (leave empty if not set)">
          <input className="field" value={key} onChange={(e) => setKey(e.target.value)} />
        </FormRow>
        {status && <p className={'px-1 text-[13px] ' + (status.ok ? 'text-primary' : 'text-danger')}>{status.text}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" loading={busy === 'test'} onClick={test} disabled={!url.trim()}>Test</Button>
          <Button size="sm" variant="primary" loading={busy === 'save'} onClick={save} disabled={!url.trim() || (!dirty && connected)}>Save</Button>
          {connected && (
            <>
              <Button size="sm" loading={busy === 'sync'} onClick={sync} disabled={dirty}>Sync now</Button>
              <Button size="sm" variant="danger" loading={busy === 'disconnect'} onClick={disconnect}>Disconnect</Button>
            </>
          )}
        </div>
        {progress && <p className="px-1 text-[12px] text-muted">{progress}</p>}
        {settings?.last_synced_at && <p className="px-1 text-[12px] text-muted">Last sync: {formatDateTime(settings.last_synced_at)}</p>}
        <p className="px-1 text-[12px] text-muted">The app works without this. The sheet gets a full copy of your data (25+ tabs) and updates automatically every 6 hours when the app is opened; tap Sync now any time. The app database stays the main record.</p>
      </Card>
    </>
  );
}
