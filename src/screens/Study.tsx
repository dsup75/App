import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Timer, ClipboardCheck, GraduationCap, AlertTriangle, BookOpen, Play, Pause, Square, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createRecord, friendlyError, type Row } from '../lib/db';
import { formatDate, todayISO, toISODate } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { RecordLine } from '../components/RecordLine';
import { Shortcut } from './Clients';
import { TableList } from '../components/TableList';
import {
  BarChart, Button, Card, Empty, ErrorBox, FormRow, HeroCard, IconBubble, IconButton, List, ListRow, Page, ProgressBar, SectionTitle, SeeAll, Segmented, Spinner,
} from '../components/ui';

export function StudyHub() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [data, setData] = useState<{ subjects: Row[]; chapters: Row[]; sessions: Row[]; tests: Row[]; exams: Row[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const r = await Promise.all([
        supabase.from('subjects').select('*').is('deleted_at', null).order('created_at'),
        supabase.from('chapters').select('*').is('deleted_at', null),
        supabase.from('study_sessions').select('*').is('deleted_at', null).gte('session_date', toISODate(from)).order('session_date', { ascending: false }),
        supabase.from('mock_tests').select('*').is('deleted_at', null).order('test_date', { ascending: false }).limit(5),
        supabase.from('exams').select('*').is('deleted_at', null).gte('exam_date', todayISO()).order('exam_date'),
      ]);
      for (const x of r) if (x.error) throw x.error;
      setData({ subjects: r[0].data as Row[], chapters: r[1].data as Row[], sessions: r[2].data as Row[], tests: r[3].data as Row[], exams: r[4].data as Row[] });
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const week = useMemo(() => {
    const days: { label: string; value: number; highlight?: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = toISODate(d);
      days.push({
        label: d.toLocaleDateString('en-IN', { weekday: 'narrow' }),
        value: (data?.sessions ?? []).filter((s) => s.session_date === iso).reduce((a, s) => a + s.minutes, 0),
        highlight: i === 0,
      });
    }
    return days;
  }, [data]);

  if (error) return <Page title="Study"><ErrorBox message={error} onRetry={load} /></Page>;
  if (!data) return <Page title="Study"><Spinner /></Page>;

  const todayMin = week[6].value;
  const weekMin = week.reduce((s, d) => s + d.value, 0);
  const weak = data.chapters.filter((c) => c.is_weak);
  const backlog = data.chapters.filter((c) => c.is_backlog && c.status !== 'completed');

  return (
    <Page
      title="Study"
      right={
        <IconButton label="Log study session" onClick={() => nav('/r/study_sessions/new')}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <HeroCard>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] opacity-80">Studied today</p>
            <p className="mt-1 text-[28px] font-bold tracking-tight">
              {Math.floor(todayMin / 60)}h {todayMin % 60}m
            </p>
            <p className="text-[12px] opacity-80">
              This week: {Math.floor(weekMin / 60)}h {weekMin % 60}m
            </p>
          </div>
          <Button size="sm" onClick={() => nav('/pomodoro')}>
            <Timer size={15} /> Focus
          </Button>
        </div>
        {data.exams[0] && (
          <div className="mt-3 rounded-[14px] p-2.5" style={{ background: 'rgba(255,255,255,.12)' }}>
            <p className="text-[12px] opacity-80">Next exam</p>
            <p className="text-[15px] font-semibold">
              {data.exams[0].name} · {daysLeft(data.exams[0].exam_date)} days left
            </p>
          </div>
        )}
      </HeroCard>

      <Card>
        <p className="mb-2 text-[13px] font-semibold">Last 7 days (minutes)</p>
        <BarChart data={week} format={(v) => `${v}m`} height={90} />
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Shortcut icon={<ClipboardCheck size={16} />} label="Tests" onClick={() => nav('/tests')} />
        <Shortcut icon={<GraduationCap size={16} />} label="Exams" onClick={() => nav('/exams')} />
        <Shortcut icon={<BookOpen size={16} />} label="Sessions" onClick={() => nav('/sessions')} />
      </div>

      <SectionTitle right={<SeeAll onClick={() => nav('/r/subjects/new')} label="+ Subject" />}>Subjects</SectionTitle>
      {data.subjects.length === 0 ? (
        <Empty title="No subjects" />
      ) : (
        <div className="space-y-2.5">
          {data.subjects.map((s) => {
            const ch = data.chapters.filter((c) => c.subject_id === s.id);
            const done = ch.filter((c) => c.status === 'completed').length;
            const pct = ch.length ? Math.round((done / ch.length) * 100) : 0;
            const mins = data.sessions.filter((x) => x.subject_id === s.id).reduce((a, x) => a + x.minutes, 0);
            return (
              <div key={s.id} onClick={() => nav(`/r/subjects/${s.id}`)} className="glass cursor-pointer rounded-[18px] p-3.5 active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-3">
                  <IconBubble tone="blue"><BookOpen size={17} /></IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">{s.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {done}/{ch.length} chapters · {mins} min this week
                    </p>
                  </div>
                  <span className="text-[14px] font-bold">{pct}%</span>
                </div>
                <div className="mt-2.5">
                  <ProgressBar pct={pct} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(weak.length > 0 || backlog.length > 0) && (
        <>
          <SectionTitle>Weak topics & backlog</SectionTitle>
          <List>
            {[...weak, ...backlog.filter((b) => !b.is_weak)].slice(0, 10).map((c) => (
              <ListRow
                key={c.id}
                icon={<IconBubble tone={c.is_weak ? 'expense' : 'amber'}><AlertTriangle size={16} /></IconBubble>}
                title={c.name}
                subtitle={`${nameOf(c.subject_id)} · ${c.is_weak ? 'Weak' : 'Backlog'}`}
                onClick={() => nav(`/r/chapters/${c.id}`)}
                chevron
              />
            ))}
          </List>
        </>
      )}

      <SectionTitle right={<SeeAll onClick={() => nav('/tests')} />}>Recent tests</SectionTitle>
      {data.tests.length === 0 ? (
        <Empty title="No tests yet" action={<Button size="sm" onClick={() => nav('/r/mock_tests/new')}>Add test result</Button>} />
      ) : (
        <List>
          {data.tests.map((t) => (
            <RecordLine key={t.id} table="mock_tests" row={t} nameOf={nameOf} />
          ))}
        </List>
      )}
    </Page>
  );
}

function daysLeft(iso: string) {
  return Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000);
}

/* ---------------- Pomodoro ---------------- */
type Phase = 'focus' | 'short' | 'long';
const KEY = 'pomodoro-state';

interface TimerState {
  phase: Phase;
  durations: Record<Phase, number>; // minutes
  endsAt: number | null; // running → timestamp
  remainingMs: number; // paused → ms left
  startedAt: number | null; // when this focus block started (for real minutes)
  focusedMs: number; // focus time already counted before pauses
  subjectId: string;
  chapterId: string;
  rounds: number;
}

const defaultState = (): TimerState => ({
  phase: 'focus',
  durations: { focus: 25, short: 5, long: 15 },
  endsAt: null,
  remainingMs: 25 * 60000,
  startedAt: null,
  focusedMs: 0,
  subjectId: '',
  chapterId: '',
  rounds: 0,
});

function loadState(): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.durations) return s;
  } catch {
    /* ignore */
  }
  return defaultState();
}

export function Pomodoro() {
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const { refs } = useLookups();
  const [s, setS] = useState<TimerState>(loadState);
  const [now, setNow] = useState(Date.now());
  const saving = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const running = s.endsAt !== null;
  const remaining = running ? Math.max(0, s.endsAt! - now) : s.remainingMs;

  const saveSession = useCallback(
    async (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      if (minutes < 1 || saving.current) return;
      saving.current = true;
      try {
        await createRecord('study_sessions', {
          title: 'Pomodoro focus',
          minutes,
          kind: 'pomodoro',
          session_date: todayISO(),
          subject_id: s.subjectId || null,
          chapter_id: s.chapterId || null,
        });
        toast(`Saved ${minutes} min of study`);
      } catch (e) {
        toast(friendlyError(e), 'error');
      } finally {
        saving.current = false;
      }
    },
    [s.subjectId, s.chapterId, toast],
  );

  // Phase finished
  useEffect(() => {
    if (!running || remaining > 0) return;
    if (s.phase === 'focus') {
      const focused = s.focusedMs + (s.startedAt ? Date.now() - s.startedAt : 0);
      saveSession(Math.min(focused, s.durations.focus * 60000));
      const rounds = s.rounds + 1;
      const next: Phase = rounds % 4 === 0 ? 'long' : 'short';
      setS((x) => ({ ...x, phase: next, rounds, endsAt: null, remainingMs: x.durations[next] * 60000, startedAt: null, focusedMs: 0 }));
      try {
        navigator.vibrate?.([300, 150, 300]);
      } catch {
        /* ignore */
      }
    } else {
      setS((x) => ({ ...x, phase: 'focus', endsAt: null, remainingMs: x.durations.focus * 60000, startedAt: null, focusedMs: 0 }));
    }
  }, [running, remaining, s, saveSession]);

  const start = () => {
    suppressBriefly();
    setS((x) => ({ ...x, endsAt: Date.now() + x.remainingMs, startedAt: x.phase === 'focus' ? Date.now() : null }));
  };
  const pause = () =>
    setS((x) => ({
      ...x,
      endsAt: null,
      remainingMs: Math.max(0, (x.endsAt ?? Date.now()) - Date.now()),
      focusedMs: x.focusedMs + (x.startedAt ? Date.now() - x.startedAt : 0),
      startedAt: null,
    }));
  const stop = async () => {
    if (s.phase === 'focus') await saveSession(s.focusedMs + (s.startedAt ? Date.now() - s.startedAt : 0));
    setS((x) => ({ ...x, phase: 'focus', endsAt: null, remainingMs: x.durations.focus * 60000, startedAt: null, focusedMs: 0 }));
  };
  const switchPhase = (p: Phase) => {
    if (running) return;
    setS((x) => ({ ...x, phase: p, remainingMs: x.durations[p] * 60000, focusedMs: 0, startedAt: null }));
  };
  const setDuration = (p: Phase, m: number) => {
    if (running || !m || m < 1 || m > 180) return;
    setS((x) => ({ ...x, durations: { ...x.durations, [p]: m }, remainingMs: x.phase === p ? m * 60000 : x.remainingMs }));
  };

  const total = s.durations[s.phase] * 60000;
  const pct = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  const r = 110;
  const c = 2 * Math.PI * r;
  const subjects = (refs.subjects ?? []).filter((x) => !x.deleted_at);
  const chapters = (refs.chapters ?? []).filter((x) => !x.deleted_at && (!s.subjectId || x.subject_id === s.subjectId));

  return (
    <Page title="Focus" subtitle="Only real focus time is saved to your study log" back>
      <Segmented
        value={s.phase}
        onChange={switchPhase}
        options={[
          { value: 'focus', label: `Focus ${s.durations.focus}m` },
          { value: 'short', label: `Break ${s.durations.short}m` },
          { value: 'long', label: `Long ${s.durations.long}m` },
        ]}
      />
      <Card className="flex flex-col items-center py-6">
        <div className="relative h-[250px] w-[250px]">
          <svg viewBox="0 0 250 250" className="h-full w-full -rotate-90">
            <circle cx="125" cy="125" r={r} fill="none" stroke="var(--hairline)" strokeWidth="12" />
            <circle
              cx="125"
              cy="125"
              r={r}
              fill="none"
              stroke={s.phase === 'focus' ? 'var(--primary-2)' : '#3B82F6'}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - c * pct}
              style={{ transition: 'stroke-dashoffset .5s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[52px] font-bold tabular-nums tracking-tight">
              {mm}:{ss}
            </span>
            <span className="text-[13px] text-muted">{s.phase === 'focus' ? 'Focus' : 'Break'} · round {s.rounds + (s.phase === 'focus' ? 1 : 0)}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <IconButton label="Reset" onClick={() => switchPhase(s.phase)}>
            <RotateCcw size={17} />
          </IconButton>
          {running ? (
            <Button variant="primary" size="lg" onClick={pause} className="w-36">
              <Pause size={17} /> Pause
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={start} className="w-36">
              <Play size={17} /> {s.remainingMs < total ? 'Resume' : 'Start'}
            </Button>
          )}
          <IconButton label="Stop and save" onClick={stop}>
            <Square size={16} />
          </IconButton>
        </div>
      </Card>

      <Card className="space-y-3">
        <FormRow label="Subject">
          <select className="field" value={s.subjectId} onChange={(e) => setS((x) => ({ ...x, subjectId: e.target.value, chapterId: '' }))}>
            <option value="">Any</option>
            {subjects.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Chapter">
          <select className="field" value={s.chapterId} onChange={(e) => setS((x) => ({ ...x, chapterId: e.target.value }))}>
            <option value="">Any</option>
            {chapters.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </FormRow>
        <div className="grid grid-cols-3 gap-2">
          {(['focus', 'short', 'long'] as Phase[]).map((p) => (
            <FormRow key={p} label={p === 'focus' ? 'Focus (min)' : p === 'short' ? 'Break' : 'Long break'}>
              <input className="field" inputMode="numeric" disabled={running} defaultValue={s.durations[p]} onBlur={(e) => setDuration(p, Number(e.target.value))} />
            </FormRow>
          ))}
        </div>
      </Card>
    </Page>
  );
}

export function TestsScreen() {
  return <StudyList table="mock_tests" order="test_date" />;
}
export function ExamsScreen() {
  return <StudyList table="exams" order="exam_date" asc />;
}
export function SessionsScreen() {
  return <StudyList table="study_sessions" order="session_date" />;
}

function StudyList({ table, order, asc }: { table: 'mock_tests' | 'exams' | 'study_sessions'; order: string; asc?: boolean }) {
  return <TableList table={table} order={order} asc={asc} subtitle={table === 'exams' ? 'Add exam dates for countdowns' : undefined} />;
}

export { formatDate };
