// Settings → AI Assistant: paste the Edge Function URL (like the Apps Script URL), test it, change or disconnect.
import { useEffect, useState } from 'react';
import { Bot, Link2, PlugZap, Unplug } from 'lucide-react';
import { DEFAULT_AI_URL, disconnectAi, loadAiConnection, looksLikeFunctionUrl, saveAiUrl, testAiConnection, type AiStatus } from '../lib/ai';
import { friendlyError } from '../lib/db';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, FormRow, SectionTitle } from './ui';

const LABEL: Record<AiStatus, string> = { connected: 'Connected', not_connected: 'Not Connected', setup_pending: 'Setup Pending' };
const TONE: Record<AiStatus, 'primary' | 'danger' | 'amber'> = { connected: 'primary', not_connected: 'danger', setup_pending: 'amber' };

export function AiSettings() {
  const toast = useToast();
  const [saved, setSaved] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<AiStatus>('setup_pending');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    loadAiConnection().then((c) => {
      setSaved(c.url);
      setUrl(c.url);
      setEditing(!c.url);
      setStatus(c.status ?? (c.url ? 'setup_pending' : 'not_connected'));
    });
  }, []);

  const save = async () => {
    const err = looksLikeFunctionUrl(url);
    if (err) return toast(err, 'error');
    setBusy('save');
    try {
      await saveAiUrl(url);
      setSaved(url.trim());
      setEditing(false);
      toast('AI URL saved');
      await test();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    const r = await testAiConnection();
    setStatus(r.status);
    setMsg(r.message);
    setBusy('');
  };

  const disconnect = async () => {
    setBusy('off');
    try {
      await disconnectAi();
    } catch {
      /* ignore */
    }
    setSaved('');
    setUrl('');
    setEditing(true);
    setStatus('not_connected');
    setMsg('Disconnected. Typed Smart Add and quick answers still work.');
    setBusy('');
  };

  return (
    <>
      <SectionTitle>AI Assistant setup</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot size={17} className="text-primary" />
          <p className="min-w-0 flex-1 text-[14.5px] font-semibold">AI connection</p>
          <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
        </div>
        {editing ? (
          <>
            <FormRow label="AI Connection URL (Edge Function)">
              <input
                className="field"
                inputMode="url"
                placeholder={DEFAULT_AI_URL || 'https://xxxx.supabase.co/functions/v1/assistant'}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </FormRow>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_AI_URL && !url && (
                <Button full onClick={() => setUrl(DEFAULT_AI_URL)}>
                  <Link2 size={14} /> Use my project
                </Button>
              )}
              <Button full variant="primary" loading={busy === 'save'} onClick={save} className={DEFAULT_AI_URL && !url ? '' : 'col-span-2'}>
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="break-all rounded-[12px] p-2.5 text-[12.5px]" style={{ background: 'var(--card-2)' }}>
              {saved}
            </p>
            <Button full variant="primary" loading={busy === 'test'} onClick={test}>
              <PlugZap size={15} /> Test AI Connection
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button full onClick={() => setEditing(true)}>
                Change URL
              </Button>
              <Button full loading={busy === 'off'} onClick={disconnect}>
                <Unplug size={14} /> Disconnect AI
              </Button>
            </div>
          </>
        )}
        {msg && <p className={status === 'connected' ? 'text-[13px] font-semibold text-income' : 'text-[13px] text-danger'}>{msg}</p>}
        <p className="text-[11.5px] text-muted">API Key Supabase Secrets me daalni hai, app me nahi. (Supabase → Edge Functions → Secrets → GEMINI_API_KEY)</p>
      </Card>
    </>
  );
}
