// Full data backup: export everything as one JSON file, import it back (adds missing rows only)
import { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { saveFile } from '../lib/exporter';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { invalidateLookups } from '../lib/useLookups';
import { exportIconFiles, importIconFiles, loadIcons } from '../lib/icons';
import { applyTheme } from '../lib/theme';
import { Button, Card, Page, Sheet } from '../components/ui';

/** Parents before children, so links always find what they point to */
export const BACKUP_TABLES = [
  'accounts', 'categories', 'custom_options', 'clients', 'client_contacts', 'projects', 'campaigns', 'subjects', 'chapters', 'exams',
  'habits', 'habit_logs', 'tasks', 'events', 'notes', 'shopping_items', 'savings_goals', 'savings_entries', 'groups', 'group_members',
  'group_expenses', 'group_settlements', 'invoices', 'payment_requests', 'incomes', 'expenses', 'transfers', 'loans', 'loan_repayments',
  'payment_lines', 'allocations', 'money_links', 'budgets', 'recurring_rules', 'study_sessions', 'mock_tests', 'reconciliations',
  'reconciliation_adjustments', 'entry_reversals', 'checklist_items',
  // added Nov 2026
  'focus_sessions', 'revision_settings', 'revisions', 'gadgets', 'health_profile', 'body_measurements', 'activity_daily', 'screen_time_daily',
  'custom_icons', 'entity_icons', 'timer_sessions', 'insurance_policies', 'credit_scores',
] as const;

/** Tables keyed by user (+ day / record) instead of an "id" column */
const KEYED_TABLES = new Set(['revision_settings', 'health_profile', 'activity_daily', 'screen_time_daily', 'entity_icons']);

/** App look & phone settings that can travel with a backup (restored only if you tick the box) */
const LOCAL_KEYS = ['theme-prefs', 'home-layout', 'focus-mode', 'screen-goal', 'hide-balance'];

const FORMAT = 'deepboost-life-backup';

interface BackupFile {
  format: string;
  version: number;
  exported_at: string;
  user_id: string;
  tables: Record<string, Record<string, unknown>[]>;
  icon_files?: Record<string, string>;
  local_settings?: Record<string, string>;
}

async function readAll(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) {
      // a table that doesn't exist on this server yet is skipped, everything else is a real error
      if (/does not exist|schema cache/i.test(error.message)) return out;
      throw error;
    }
    out.push(...((data as Record<string, unknown>[]) ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Older backups from Reports → "Backup all data" keep each table at the top level */
function normalise(x: any): BackupFile | null {
  if (!x || typeof x !== 'object') return null;
  if (x.format === FORMAT) return x as BackupFile;
  if (x.app === 'DeepBoost Life' && typeof x.exported_at === 'string') {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const t of BACKUP_TABLES) if (Array.isArray(x[t])) tables[t] = x[t];
    const owner = Object.values(tables).flat().find((r: any) => typeof r?.user_id === 'string') as any;
    return { format: FORMAT, version: 1, exported_at: x.exported_at, user_id: owner?.user_id ?? '', tables };
  }
  return null;
}

/** Checks the file before anything is written. Returns an error message, or null when it is fine. */
export function validateBackup(x: unknown, userId: string): string | null {
  const b = normalise(x);
  if (!b) return 'This is not a DeepBoost Life backup file.';
  if (typeof b.version !== 'number' || b.version > 1) return 'This backup was made by a newer app version. Update the app first.';
  if (!b.tables || typeof b.tables !== 'object') return 'The backup file is damaged (no tables).';
  if (b.user_id && b.user_id !== userId) return 'This backup belongs to a different account. Sign in with that account to import it.';
  if (b.icon_files && (typeof b.icon_files !== 'object' || Object.keys(b.icon_files).some((k) => !k.startsWith(`${userId}/`)))) return 'The icon files in this backup are damaged.';
  if (b.local_settings && typeof b.local_settings !== 'object') return 'The settings in this backup are damaged.';
  for (const [t, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(t)) return `Unknown section "${t}" in the backup.`;
    if (!Array.isArray(rows)) return `Section "${t}" is damaged.`;
    if (rows.some((r) => !r || typeof r !== 'object' || (!KEYED_TABLES.has(t) && typeof (r as any).id !== 'string'))) return `Some rows in "${t}" are damaged.`;
    if (rows.some((r) => typeof (r as any).user_id === 'string' && (r as any).user_id !== userId)) return 'This backup belongs to a different account.';
  }
  return null;
}

export function BackupScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [restoreLocal, setRestoreLocal] = useState(false);

  const exportAll = async () => {
    if (!user) return;
    setBusy('Reading your data…');
    try {
      const tables: Record<string, Record<string, unknown>[]> = {};
      for (const t of BACKUP_TABLES) tables[t] = await readAll(t);
      setBusy('Adding your icons…');
      const icon_files = await exportIconFiles().catch(() => ({}));
      const local_settings: Record<string, string> = {};
      for (const k of LOCAL_KEYS) {
        try {
          const v = localStorage.getItem(k);
          if (v !== null) local_settings[k] = v;
        } catch {
          /* ignore */
        }
      }
      const file: BackupFile = { format: FORMAT, version: 1, exported_at: new Date().toISOString(), user_id: user.id, tables, icon_files, local_settings };
      const count = Object.values(tables).reduce((s, r) => s + r.length, 0);
      const name = `deepboost-backup-${new Date().toISOString().slice(0, 10)}.json`;
      suppressBriefly();
      await saveFile(name, new Blob([JSON.stringify(file)], { type: 'application/json' }));
      try {
        localStorage.setItem('last-backup-at', new Date().toISOString());
      } catch {
        /* ignore */
      }
      toast(`Backup ready · ${count} records`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f || !user) return;
    try {
      if (f.size > 40 * 1024 * 1024) throw new Error('This file is too big to be a backup.');
      const text = await f.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('This file is not valid JSON.');
      }
      const err = validateBackup(json, user.id);
      if (err) throw new Error(err);
      setPending(normalise(json));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importNow = async () => {
    if (!pending || !user) return;
    const b = pending;
    setPending(null);
    let added = 0;
    let skipped = 0;
    const failed: string[] = [];
    if (b.icon_files && Object.keys(b.icon_files).length) {
      setBusy('Restoring icons…');
      await importIconFiles(b.icon_files, user.id).catch(() => 0);
    }
    for (const t of BACKUP_TABLES) {
      const rows = b.tables[t];
      if (!rows?.length) continue;
      setBusy(`Importing ${t.replace(/_/g, ' ')}…`);
      for (let i = 0; i < rows.length; i += 300) {
        const { data, error } = await supabase.rpc('import_backup_rows', { p_table: t, p_rows: rows.slice(i, i + 300) });
        if (error) {
          failed.push(`${t.replace(/_/g, ' ')}: ${friendlyError(error)}`);
          break;
        }
        const n = Number(data) || 0;
        added += n;
        skipped += rows.slice(i, i + 300).length - n;
      }
    }
    let restoredLook = false;
    if (restoreLocal && b.local_settings) {
      for (const [k, v] of Object.entries(b.local_settings)) {
        if (!LOCAL_KEYS.includes(k) || typeof v !== 'string') continue;
        try {
          localStorage.setItem(k, v);
          restoredLook = true;
        } catch {
          /* ignore */
        }
      }
      if (restoredLook) applyTheme();
    }
    invalidateLookups();
    loadIcons(true).catch(() => {});
    setBusy('');
    setResult(
      `${added} records added. ${skipped} were already in your account (duplicates skipped, nothing changed).${restoredLook ? '\nApp look & phone settings restored.' : ''}${failed.length ? `\n\nNot imported:\n${failed.join('\n')}` : ''}`,
    );
  };

  const counts = pending ? Object.entries(pending.tables).filter(([, r]) => r.length) : [];

  return (
    <Page title="Backup" subtitle="Keep a copy of all your data on your phone or Drive" back>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Download size={17} className="text-primary" />
          <p className="text-[14.5px] font-semibold">Export backup</p>
        </div>
        <p className="text-[13px] text-muted">One JSON file with all your entries, accounts, clients, study, tasks, health data, your uploaded icons and app look. Bill photos are not included.</p>
        <Button full variant="primary" loading={busy !== '' && busy.startsWith('Reading')} disabled={!!busy} onClick={exportAll}>
          Export all data
        </Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Upload size={17} className="text-primary" />
          <p className="text-[14.5px] font-semibold">Import backup</p>
        </div>
        <p className="text-[13px] text-muted">Brings back records that are missing. Nothing you already have is changed or deleted. The file is checked first.</p>
        <Button
          full
          disabled={!!busy}
          onClick={() => {
            suppressBriefly();
            fileRef.current?.click();
          }}
        >
          Choose backup file
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </Card>
      {busy && <p className="text-center text-[13px] text-muted">{busy}</p>}
      <p className="flex items-center gap-1.5 px-1 text-[12px] text-muted">
        <ShieldCheck size={13} /> The file has your money data — keep it private.
      </p>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Import this backup?">
        <div className="space-y-3">
          <p className="text-[13px] text-muted">Made on {pending ? new Date(pending.exported_at).toLocaleString('en-IN') : ''}</p>
          <div className="max-h-48 overflow-y-auto rounded-[14px] p-3 text-[12.5px]" style={{ background: 'var(--card-2)' }}>
            {counts.map(([t, r]) => (
              <div key={t} className="flex justify-between">
                <span>{t.replace(/_/g, ' ')}</span>
                <span className="font-semibold">{r.length}</span>
              </div>
            ))}
          </div>
          {pending?.icon_files && Object.keys(pending.icon_files).length > 0 && (
            <p className="text-[12.5px] text-muted">{Object.keys(pending.icon_files).length} uploaded icons will be restored if missing.</p>
          )}
          {pending?.local_settings && Object.keys(pending.local_settings).length > 0 && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={restoreLocal} onChange={(e) => setRestoreLocal(e.target.checked)} />
              Also restore app look &amp; phone settings (theme, home layout, focus apps)
            </label>
          )}
          <p className="text-[12px] text-muted">Only missing records are added. Anything already in your account is skipped and never overwritten.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button full onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button full variant="primary" onClick={importNow}>
              Import
            </Button>
          </div>
        </div>
      </Sheet>
      <Sheet open={!!result} onClose={() => setResult(null)} title="Import finished">
        <p className="whitespace-pre-line text-[13.5px]">{result}</p>
        <Button full className="mt-3" onClick={() => setResult(null)}>
          OK
        </Button>
      </Sheet>
    </Page>
  );
}
