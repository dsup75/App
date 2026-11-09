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
import { Button, Card, Page, Sheet } from '../components/ui';

/** Parents before children, so links always find what they point to */
export const BACKUP_TABLES = [
  'accounts', 'categories', 'custom_options', 'clients', 'client_contacts', 'projects', 'campaigns', 'subjects', 'chapters', 'exams',
  'habits', 'habit_logs', 'tasks', 'events', 'notes', 'shopping_items', 'savings_goals', 'savings_entries', 'groups', 'group_members',
  'group_expenses', 'group_settlements', 'invoices', 'payment_requests', 'incomes', 'expenses', 'transfers', 'loans', 'loan_repayments',
  'payment_lines', 'allocations', 'money_links', 'budgets', 'recurring_rules', 'study_sessions', 'mock_tests', 'reconciliations',
  'reconciliation_adjustments', 'entry_reversals', 'checklist_items',
] as const;

const FORMAT = 'deepboost-life-backup';

interface BackupFile {
  format: string;
  version: number;
  exported_at: string;
  user_id: string;
  tables: Record<string, Record<string, unknown>[]>;
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

/** Checks the file before anything is written. Returns an error message, or null when it is fine. */
export function validateBackup(x: unknown, userId: string): string | null {
  const b = x as BackupFile;
  if (!b || typeof b !== 'object') return 'This is not a DeepBoost Life backup file.';
  if (b.format !== FORMAT) return 'This is not a DeepBoost Life backup file.';
  if (typeof b.version !== 'number' || b.version > 1) return 'This backup was made by a newer app version. Update the app first.';
  if (!b.tables || typeof b.tables !== 'object') return 'The backup file is damaged (no tables).';
  if (b.user_id !== userId) return 'This backup belongs to a different account. Sign in with that account to import it.';
  for (const [t, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(t)) return `Unknown section "${t}" in the backup.`;
    if (!Array.isArray(rows)) return `Section "${t}" is damaged.`;
    if (rows.some((r) => !r || typeof r !== 'object' || typeof (r as any).id !== 'string')) return `Some rows in "${t}" are damaged.`;
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

  const exportAll = async () => {
    if (!user) return;
    setBusy('Reading your data…');
    try {
      const tables: Record<string, Record<string, unknown>[]> = {};
      for (const t of BACKUP_TABLES) tables[t] = await readAll(t);
      const file: BackupFile = { format: FORMAT, version: 1, exported_at: new Date().toISOString(), user_id: user.id, tables };
      const count = Object.values(tables).reduce((s, r) => s + r.length, 0);
      const name = `deepboost-backup-${new Date().toISOString().slice(0, 10)}.json`;
      suppressBriefly();
      await saveFile(name, new Blob([JSON.stringify(file)], { type: 'application/json' }));
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
      setPending(json as BackupFile);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importNow = async () => {
    if (!pending) return;
    const b = pending;
    setPending(null);
    let added = 0;
    const failed: string[] = [];
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
        added += Number(data) || 0;
      }
    }
    invalidateLookups();
    setBusy('');
    setResult(`${added} records added. Records you already had were left as they are.${failed.length ? `\n\nNot imported:\n${failed.join('\n')}` : ''}`);
  };

  const counts = pending ? Object.entries(pending.tables).filter(([, r]) => r.length) : [];

  return (
    <Page title="Backup" subtitle="Keep a copy of all your data on your phone or Drive" back>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Download size={17} className="text-primary" />
          <p className="text-[14.5px] font-semibold">Export backup</p>
        </div>
        <p className="text-[13px] text-muted">One JSON file with all your entries, accounts, clients, study and tasks. Photos are not included.</p>
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
