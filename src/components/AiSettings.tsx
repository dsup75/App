// Settings → AI Assistant: paste your Gemini API key here. It is saved encrypted on the server (Supabase Vault)
// and only the AI function can use it — the app never reads it back, it is not kept on the phone or in GitHub.
import { useEffect, useState } from 'react';
import { Bot, Eye, EyeOff, KeyRound, PlugZap, Trash2, ExternalLink } from 'lucide-react';
import {
  DEFAULT_AI_URL, aiKeyInfo, disconnectAi, loadAiConnection, looksLikeFunctionUrl, removeAiKey, saveAiKey, saveAiUrl, testAiConnection, type AiStatus,
} from '../lib/ai';
import { friendlyError } from '../lib/db';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, FormRow, SectionTitle } from './ui';

const LABEL: Record<AiStatus, string> = { connected: 'Connected', not_connected: 'Not Connected', setup_pending: 'Setup Pending' };
const TONE: Record<AiStatus, 'primary' | 'danger' | 'amber'> = { connected: 'primary', not_connected: 'danger', setup_pending: 'amber' };

export function AiSettings() {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState<{ last4: string; updated_at: string } | null>(null);
  const [status, setStatus] = useState<AiStatus>('setup_pending');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [adv, setAdv] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    aiKeyInfo().then(setInfo);
    loadAiConnection().then((c) => {
      setUrl(c.url);
      if (c.status) setStatus(c.status);
    });
  }, []);

  const test = async () => {
    setBusy('test');
    const r = await testAiConnection();
    setStatus(r.status);
    setMsg(r.message);
    setBusy('');
  };

  const save = async () => {
    if (!key.trim()) return toast('Paste your Gemini API key first', 'error');
    setBusy('save');
    try {
      const last4 = await saveAiKey(key);
      setKey('');
      setShow(false);
      setInfo({ last4, updated_at: new Date().toISOString() });
      toast('API key saved securely');
      // make sure the app uses this project's AI function
      if (!url && DEFAULT_AI_URL) await saveAiUrl(DEFAULT_AI_URL).catch(() => {});
      await test();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await removeAiKey();
      setInfo(null);
      setStatus('setup_pending');
      setMsg('Key removed. Typed Smart Add and quick answers still work without AI.');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <SectionTitle>AI Assistant</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot size={17} className="text-primary" />
          <p className="min-w-0 flex-1 text-[14.5px] font-semibold">Gemini AI</p>
          <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
        </div>

        {info && (
          <div className="flex items-center gap-2 rounded-[12px] p-2.5 text-[13px]" style={{ background: 'var(--card-2)' }}>
            <KeyRound size={15} className="text-primary" />
            <span className="min-w-0 flex-1">
              Key saved · ending <b>{info.last4}</b>
            </span>
            <Button size="sm" loading={busy === 'remove'} onClick={remove}>
              <Trash2 size={13} /> Remove
            </Button>
          </div>
        )}

        <FormRow label={info ? 'Replace API key' : 'Gemini API key'}>
          <div className="relative">
            <input
              className="field pr-11"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="AIza…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="button" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormRow>
        <div className="grid grid-cols-2 gap-2">
          <Button full variant="primary" loading={busy === 'save'} onClick={save}>
            <KeyRound size={14} /> Save key
          </Button>
          <Button full loading={busy === 'test'} onClick={test}>
            <PlugZap size={14} /> Test AI
          </Button>
        </div>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
          <ExternalLink size={13} /> Get a free key from Google AI Studio
        </a>
        {msg && <p className={status === 'connected' ? 'text-[13px] font-semibold text-income' : 'text-[13px] text-danger'}>{msg}</p>}
        <p className="text-[11.5px] text-muted">
          Your key is saved encrypted on your DeepBoost server (Supabase Vault). The app can't read it back — only the last 4 letters are shown — and it is never stored on the phone or in GitHub.
        </p>

        <button type="button" className="text-[12px] text-muted underline" onClick={() => setAdv(!adv)}>
          {adv ? 'Hide advanced' : 'Advanced (AI function URL)'}
        </button>
        {adv && (
          <div className="space-y-2">
            <input className="field" inputMode="url" placeholder={DEFAULT_AI_URL} value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  const err = looksLikeFunctionUrl(url);
                  if (err) return toast(err, 'error');
                  await saveAiUrl(url).then(() => toast('URL saved')).catch((e) => toast(friendlyError(e), 'error'));
                }}
              >
                Save URL
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await disconnectAi().catch(() => {});
                  setUrl('');
                  toast('Using the default AI function');
                }}
              >
                Use default
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
