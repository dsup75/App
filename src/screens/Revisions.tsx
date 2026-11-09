// Smart revision: due / upcoming revisions with Easy · Moderate · Difficult feedback, plus interval settings
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, RotateCcw, Settings as SettingsIcon, Plus, X } from 'lucide-react';
import {
  DEFAULT_INTERVALS, completeRevision, fetchPendingRevisions, getRevisionSettings, rescheduleRevision, saveRevisionSettings, skipRevision, startRevisionPlan,
  type RevisionFeedback, type RevisionRow, type RevisionSettings,
} from '../lib/revisions';
import { friendlyError, type Row } from '../lib/db';
import { supabase } from '../lib/supabase';
import { relativeDay, todayISO, toISODate } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, Empty, ErrorBox, IconButton, Page, SectionTitle, Segmented, Sheet, Spinner, Toggle } from '../components/ui';

function RevisionCard({ r, total, onDone }: { r: RevisionRow; total: number; onDone: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<RevisionFeedback | 'skip' | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [date, setDate] = useState(r.due_date);
  const today = todayISO();
  const overdue = r.due_date < today;

  const finish = async (f: RevisionFeedback) => {
    setBusy(f);
    try {
      const res = await completeRevision(r.id, f);
      toast(res.cycle_complete ? `${r.chapter_name}: revision cycle complete` : `Next revision ${relativeDay(res.next_due)}`);
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const skip = async () => {
    setBusy('skip');
    try {
      await skipRevision(r.id);
      toast('Skipped');
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const move = async () => {
    try {
      await rescheduleRevision(r.id, date);
      setMoveOpen(false);
      toast(`Moved to ${relativeDay(date)}`);
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <Card className="space-y-2.5">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => nav(`/r/chapters/${r.chapter_id}`)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{r.chapter_name}</span>
          <span className="block text-[12.5px] text-muted">
            {r.subject_name ?? 'Chapter'} · Revision {r.step} of {total}
          </span>
        </span>
        <Badge tone={overdue ? 'danger' : r.due_date === today ? 'amber' : 'muted'}>{overdue ? `Overdue · ${relativeDay(r.due_date)}` : relativeDay(r.due_date)}</Badge>
      </button>
      {r.due_date <= today ? (
        <>
          <p className="text-[12px] text-muted">After revising, how did it feel?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" loading={busy === 'easy'} onClick={() => finish('easy')}>
              Easy
            </Button>
            <Button size="sm" loading={busy === 'moderate'} onClick={() => finish('moderate')}>
              Moderate
            </Button>
            <Button size="sm" loading={busy === 'difficult'} onClick={() => finish('difficult')}>
              Difficult
            </Button>
          </div>
        </>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setMoveOpen(true)}>
          <CalendarClock size={13} /> Move
        </Button>
        <Button size="sm" loading={busy === 'skip'} onClick={skip}>
          Skip
        </Button>
      </div>
      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title="Move revision">
        <div className="space-y-3">
          <input type="date" className="field" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <Button full variant="primary" onClick={move} disabled={!date}>
            Move to {date ? relativeDay(date) : '…'}
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

function SettingsSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<RevisionSettings | null>(null);
  const [add, setAdd] = useState('');
  useEffect(() => {
    if (open) getRevisionSettings().then(setS);
  }, [open]);
  const save = async () => {
    if (!s) return;
    try {
      await saveRevisionSettings(s);
      toast('Saved');
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Revision settings">
      {!s ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[14px]">Plan revisions automatically after a chapter study session</p>
            <Toggle checked={s.auto_schedule} onChange={(v) => setS({ ...s, auto_schedule: v })} />
          </div>
          <p className="text-[13px] font-semibold">Days between revisions</p>
          <div className="flex flex-wrap gap-2">
            {s.intervals.map((n, i) => (
              <span key={i} className="glass flex items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px]">
                Day {n}
                <button type="button" aria-label="Remove" onClick={() => setS({ ...s, intervals: s.intervals.filter((_, j) => j !== i) })}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="field min-w-0 flex-1" inputMode="numeric" placeholder="Add days (1–365)" value={add} onChange={(e) => setAdd(e.target.value.replace(/\D/g, ''))} />
            <Button
              onClick={() => {
                const n = Number(add);
                if (n >= 1 && n <= 365 && s.intervals.length < 10) setS({ ...s, intervals: [...s.intervals, n].sort((a, b) => a - b) });
                setAdd('');
              }}
            >
              <Plus size={14} /> Add
            </Button>
          </div>
          <Button size="sm" onClick={() => setS({ ...s, intervals: DEFAULT_INTERVALS })}>
            <RotateCcw size={13} /> Reset to 1 · 3 · 7 · 14 · 30
          </Button>
          <p className="text-[11.5px] text-muted">
            Easy → next step with 1.5× the gap. Moderate → next step. Difficult → same step again with half the gap. After the last step (Easy/Moderate) the cycle is complete. Revisions already planned keep their date.
          </p>
          <Button full variant="primary" onClick={save}>
            Save
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function PlanSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [chapters, setChapters] = useState<Row[] | null>(null);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('chapters').select('id,name,subject_id,status').is('deleted_at', null).order('name'),
      supabase.from('subjects').select('id,name').is('deleted_at', null),
    ]).then(([c, s]) => {
      setChapters((c.data ?? []) as Row[]);
      setSubjects((s.data ?? []) as Row[]);
    });
  }, [open]);
  const subj = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const list = (chapters ?? []).filter((c) => !q.trim() || `${c.name} ${subj.get(c.subject_id) ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80);
  const plan = async (c: Row) => {
    try {
      await startRevisionPlan(c.id);
      toast(`Revision planned for ${c.name}`);
      onDone();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Plan revision for a chapter">
      <input className="field mb-2" placeholder="Search chapter" value={q} onChange={(e) => setQ(e.target.value)} />
      {chapters === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="No chapters" text="Add subjects and chapters in Study first." />
      ) : (
        <div className="divide-y divide-[var(--hairline)]">
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => plan(c)} className="flex w-full items-center gap-2 py-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]">{c.name}</span>
                <span className="block text-[11.5px] text-muted">{subj.get(c.subject_id) ?? ''}</span>
              </span>
              <Plus size={15} className="text-muted" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function RevisionsScreen() {
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [total, setTotal] = useState(DEFAULT_INTERVALS.length);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'due' | 'upcoming'>('due');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, s] = await Promise.all([fetchPendingRevisions(), getRevisionSettings()]);
      setRows(r);
      setTotal(s.intervals.length);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const due = (rows ?? []).filter((r) => r.due_date <= today);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const upcoming = (rows ?? []).filter((r) => r.due_date > today && r.due_date <= toISODate(in30));
  const shown = tab === 'due' ? due : upcoming;

  return (
    <Page
      title="Revisions"
      subtitle="Spaced repetition for your chapters"
      back
      right={
        <IconButton label="Revision settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={18} />
        </IconButton>
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : rows === null ? (
        <Spinner />
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'due', label: `Due now (${due.length})` },
              { value: 'upcoming', label: `Next 30 days (${upcoming.length})` },
            ]}
          />
          {shown.length === 0 ? (
            <Empty
              title={tab === 'due' ? 'Nothing to revise today' : 'No revisions planned'}
              text="When you log a study session with a chapter (or a Pomodoro with a chapter picked), the first revision is planned automatically."
            />
          ) : (
            shown.map((r) => <RevisionCard key={r.id} r={r} total={Math.max(total, r.step)} onDone={load} />)
          )}
          <SectionTitle>Plan</SectionTitle>
          <Button full onClick={() => setPlanOpen(true)}>
            <Plus size={14} /> Plan revision for a chapter
          </Button>
        </>
      )}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} onDone={load} />
    </Page>
  );
}

/** Small block for the Study hub */
export function RevisionSummary() {
  const nav = useNavigate();
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  useEffect(() => {
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    fetchPendingRevisions(toISODate(in7)).then(setRows).catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  const today = todayISO();
  const due = rows.filter((r) => r.due_date <= today).length;
  return (
    <Card className="flex items-center gap-3" onClick={() => nav('/revisions')}>
      <RotateCcw size={18} className="text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold">Revisions</span>
        <span className="block text-[12.5px] text-muted">
          {due ? `${due} due now` : 'Nothing due today'} · {rows.length - due} in the next 7 days
        </span>
      </span>
      {due > 0 && <Badge tone="amber">{due}</Badge>}
    </Card>
  );
}
