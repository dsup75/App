import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { Button, Card, FormRow, Segmented } from '../components/ui';
import { useToast } from '../context/ToastContext';

type Mode = 'login' | 'signup' | 'forgot';

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <div
      className="liquid mx-auto flex items-center justify-center rounded-[22px] text-white"
      style={{ width: size, height: size, background: 'linear-gradient(140deg,#2F7A5C,#143F30)', boxShadow: '0 10px 24px rgba(20,63,48,.3)' }}
    >
      <span className="text-[28px] font-extrabold tracking-tight">D</span>
    </div>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  return (
    <div className="relative min-h-screen">
      <div className="app-bg" />
      <div className="page-in relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 pt-safe">
        <Logo />
        <h1 className="mt-4 text-center text-[28px] font-bold tracking-tight">DeepBoost Life</h1>
        <p className="mb-6 text-center text-[15px] text-muted">Money, study, work and life — in one place.</p>
        {mode !== 'forgot' && (
          <Segmented
            className="mb-4"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'login', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />
        )}
        {mode === 'login' && <Login onForgot={() => setMode('forgot')} />}
        {mode === 'signup' && <Signup onDone={() => setMode('login')} />}
        {mode === 'forgot' && <Forgot onBack={() => setMode('login')} />}
      </div>
    </div>
  );
}

function Login({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!email || !password) return setErr('Enter email and password.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : friendlyError(error));
  };

  return (
    <Card className="space-y-4">
      <FormRow label="Email">
        <input className="field" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Password">
        <input
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </FormRow>
      {err && <p className="px-1 text-[13px] text-danger">{err}</p>}
      <Button variant="primary" size="lg" full loading={busy} onClick={submit}>
        Sign in
      </Button>
      <button onClick={onForgot} className="w-full text-center text-[14px] font-medium text-primary">
        Forgot password?
      </button>
    </Card>
  );
}

function Signup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const toast = useToast();

  const submit = async () => {
    setErr('');
    if (!name.trim()) return setErr('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    if (data.session) toast('Account created. Welcome!');
    else {
      setInfo('Account created. Check your email to confirm it, then sign in.');
      setTimeout(onDone, 4000);
    }
  };

  return (
    <Card className="space-y-4">
      <FormRow label="Your name">
        <input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormRow>
      <FormRow label="Email">
        <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Password" hint="At least 8 characters">
        <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormRow>
      <FormRow label="Confirm password">
        <input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormRow>
      {err && <p className="px-1 text-[13px] text-danger">{err}</p>}
      {info && <p className="px-1 text-[13px] text-primary">{info}</p>}
      <Button variant="primary" size="lg" full loading={busy} onClick={submit}>
        Create account
      </Button>
    </Card>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();

  const sendCode = async () => {
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setStep('code');
  };

  const reset = async () => {
    setErr('');
    if (!/^\d{6,10}$/.test(code.trim())) return setErr('Enter the code from the email.');
    if (password.length < 8) return setErr('New password must be at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (error) {
      setBusy(false);
      return setErr('Code is wrong or expired.');
    }
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e2) return setErr(friendlyError(e2));
    toast('Password changed. You are signed in.');
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-[18px] font-semibold">Reset password</h2>
      {step === 'email' ? (
        <>
          <FormRow label="Email">
            <input className="field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormRow>
          {err && <p className="px-1 text-[13px] text-danger">{err}</p>}
          <Button variant="primary" size="lg" full loading={busy} onClick={sendCode}>
            Send reset code
          </Button>
        </>
      ) : (
        <>
          <p className="text-[14px] text-muted">We sent an email to {email}. Enter the 6-digit code from it below with your new password. (Check Spam too. Don't tap the link in the email — use the code.)</p>
          <FormRow label="Code">
            <input className="field tracking-[0.3em]" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </FormRow>
          <FormRow label="New password">
            <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormRow>
          {err && <p className="px-1 text-[13px] text-danger">{err}</p>}
          <Button variant="primary" size="lg" full loading={busy} onClick={reset}>
            Change password
          </Button>
        </>
      )}
      <button onClick={onBack} className="w-full text-center text-[14px] font-medium text-primary">
        Back to sign in
      </button>
    </Card>
  );
}
