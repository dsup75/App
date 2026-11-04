import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Lock, Fingerprint, Timer, LogOut, FileSpreadsheet, User, Moon, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLock } from '../context/LockContext';
import { useToast } from '../context/ToastContext';
import { friendlyError, saveSettings } from '../lib/db';
import { biometricAvailable, biometricPrompt, hashPin, verifyPin, LOCK_TIMEOUTS, type LockConfig } from '../lib/lock';
import { getThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';
import { isValidScriptUrl, syncAll, testScript } from '../lib/sheets';
import { formatDateTime } from '../lib/dates';
import { PinPad } from '../components/PinPad';
import { Badge, Button, Card, Confirm, FormRow, IconBubble, List, ListRow, Page, SectionTitle, Segmented, Sheet, Toggle } from '../components/ui';

export function SettingsScreen() {
  const { user, settings, reloadSettings, signOut } = useAuth();
  const { config, updateConfig, lockNow, suppressBriefly } = useLock();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode());
  const [name, setName] = useState(settings?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [pinFlow, setPinFlow] = useState<null | 'set' | 'change' | 'remove'>(null);
  const [bioOk, setBioOk] = useState(false);
  const [logout, setLogout] = useState(false);

  useEffect(() => setName(settings?.full_name ?? ''), [settings?.full_name]);
  useEffect(() => {
    biometricAvailable().then(setBioOk);
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
      const ok = await biometricPrompt('Confirm to enable fingerprint unlock');
      suppressBriefly();
      if (!ok) return toast('Fingerprint not confirmed', 'error');
    }
    await updateConfig({ ...config, biometric: on });
    toast(on ? 'Fingerprint unlock on' : 'Fingerprint unlock off');
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

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <IconBubble tone="violet"><Moon size={18} /></IconBubble>
          <span className="font-medium">Theme</span>
        </div>
        <Segmented
          value={theme}
          onChange={(m) => {
            setTheme(m);
            setThemeMode(m);
          }}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

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
              icon={<IconBubble tone="blue"><Fingerprint size={18} /></IconBubble>}
              title="Fingerprint unlock"
              subtitle={bioOk ? 'Use your phone fingerprint' : Capacitor.isNativePlatform() ? 'Not set up on this phone' : 'Available in the Android app'}
              right={<Toggle checked={config.biometric} disabled={!bioOk} onChange={toggleBio} />}
            />
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
        <p className="px-1 text-[12px] text-muted">The app works without this. The sheet gets a copy of your data; the app database stays the main record.</p>
      </Card>
    </>
  );
}
