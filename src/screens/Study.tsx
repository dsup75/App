import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardCheck, GraduationCap, AlertTriangle, BookOpen, Play, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError, type Row } from '../lib/db';
import { formatDate, todayISO, toISODate } from '../lib/dates';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { RecordLine } from '../components/RecordLine';
import { Shortcut } from './Clients';
import { TableList } from '../components/TableList';
import { TEMPLATES, applyTemplate, type SyllabusTemplate } from '../lib/syllabus';
import {
  BarChart, Button, Card, Empty, ErrorBox, IconBubble, IconButton, List, ListRow, Page, SectionTitle, SeeAll,  Sheet, Spinner,
} from '../components/ui';
import { LibraryBig } from 'lucide-react';
import { RevisionSummary } from './Revisions';
import { Glyph, type GlyphName } from '../components/Glyph';

export function StudyHub() {
  const nav = useNavigate();
  const { nameOf } = useLookups();
  const [data, setData] = useState<{ subjects: Row[]; chapters: Row[]; sessions: Row[]; tests: Row[]; exams: Row[] } | null>(null);
  const [error, setError] = useState('');
  const [tplOpen, setTplOpen] = useState(false);

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
      subtitle="Learn • Revise • Excel"
      glyph="cap"
      right={
        <IconButton label="Log study session" onClick={() => nav('/r/study_sessions/new')}>
          <Plus size={19} />
        </IconButton>
      }
    >
      <TodayProgress
        todayMin={todayMin}
        weekMin={weekMin}
        chaptersToday={data.chapters.filter((c) => c.status === 'completed' && String(c.updated_at ?? '').slice(0, 10) === todayISO()).length}
        testsToday={data.tests.filter((t) => t.test_date === todayISO()).length}
        exam={data.exams[0] ? { name: data.exams[0].name, days: daysLeft(data.exams[0].exam_date) } : null}
      />

      <SectionTitle
        right={
          <div className="flex gap-3">
            <SeeAll onClick={() => setTplOpen(true)} label="Templates" />
            <SeeAll onClick={() => nav('/r/subjects/new')} label="+ Subject" />
          </div>
        }
      >
        Subjects
      </SectionTitle>
      {data.subjects.length === 0 ? (
        <Empty title="No subjects" text="Add subjects or load a JEE / NEET / board template." />
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {data.subjects.map((s) => {
            const ch = data.chapters.filter((c) => c.subject_id === s.id);
            const done = ch.filter((c) => c.status === 'completed').length;
            const pct = ch.length ? Math.round((done / ch.length) * 100) : 0;
            return (
              <button key={s.id} type="button" onClick={() => nav(`/r/subjects/${s.id}`)} className="glass press flex flex-col items-center rounded-[18px] px-1.5 pb-3 pt-3.5 text-center">
                <Glyph name={subjectGlyph(s.name)} size={40} />
                <span className="mt-1.5 w-full truncate text-[13px] font-semibold">{s.name}</span>
                <span className="text-[12px] text-muted">{pct}%</span>
                <svg width="46" height="14" viewBox="0 0 46 14" className="mt-1" aria-hidden>
                  <path d="M3 3 Q23 17 43 3" fill="none" stroke="var(--hairline)" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M3 3 Q23 17 43 3" fill="none" stroke={pct >= 70 ? '#4ade80' : pct >= 35 ? '#facc15' : '#38bdf8'} strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(4, pct)} 100`} />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      <RevisionSummary />

      <div className="glass rounded-[22px] p-3.5">
        <p className="text-[16px] font-bold">Study Timer</p>
        <div className="mt-1.5 flex items-center justify-center gap-3">
          <p className="tabular text-[42px] font-bold tracking-tight">25:00</p>
          <button type="button" aria-label="Stopwatch" onClick={() => nav('/clock?tab=stopwatch')} className="press flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' }}>
            <ChevronRightIcon size={20} />
          </button>
          <button type="button" aria-label="Start focus timer" onClick={() => nav('/pomodoro')} className="press flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg,#a78bfa,#6366f1)', boxShadow: '0 0 16px rgba(139,92,246,.6)' }}>
            <Play size={22} fill="currentColor" />
          </button>
        </div>
        <p className="mt-1 text-center text-[13px]">
          <b>Study</b> <span className="text-muted">25m</span> <span className="mx-3" /> <b>Break</b> <span className="text-muted">5m</span>
        </p>
      </div>

      <Card>
        <p className="mb-2 text-[13px] font-semibold">Last 7 days (minutes)</p>
        <BarChart data={week} format={(v) => `${v}m`} height={90} />
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Shortcut icon={<ClipboardCheck size={16} />} label="Tests" onClick={() => nav('/tests')} />
        <Shortcut icon={<GraduationCap size={16} />} label="Exams" onClick={() => nav('/exams')} />
        <Shortcut icon={<BookOpen size={16} />} label="Sessions" onClick={() => nav('/sessions')} />
      </div>

      {data.chapters.length === 0 && (
        <Card className="flex items-center gap-3">
          <IconBubble tone="violet"><LibraryBig size={17} /></IconBubble>
          <p className="flex-1 text-[13px] text-muted">Load JEE, NEET or board chapters in one tap.</p>
          <Button size="sm" variant="primary" onClick={() => setTplOpen(true)}>Templates</Button>
        </Card>
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

      <TemplateSheet open={tplOpen} onClose={() => setTplOpen(false)} onApplied={load} />

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

function TemplateSheet({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const apply = async (t: SyllabusTemplate) => {
    setBusy(t.id);
    try {
      const n = await applyTemplate(t);
      toast(n ? `${n} chapters added from ${t.title}` : 'All chapters already added');
      onApplied();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Syllabus templates">
      <p className="mb-3 text-center text-[12.5px] text-muted">
        Chapter names follow NCERT (rationalised) books. Check your official syllabus — you can edit or delete any chapter later.
      </p>
      <List>
        {TEMPLATES.map((t) => (
          <ListRow
            key={t.id}
            title={t.title}
            subtitle={t.description}
            right={busy === t.id ? <span className="text-[12px] text-muted">Adding…</span> : <Button size="sm" onClick={() => apply(t)} disabled={!!busy}>Add</Button>}
          />
        ))}
      </List>
    </Sheet>
  );
}

/** a picture for the subject from its name */
function subjectGlyph(name: string): GlyphName {
  const n = name.toLowerCase();
  if (/math|maths|ganit/.test(n)) return 'sigma';
  if (/phys/.test(n)) return 'atom';
  if (/chem|rasayan/.test(n)) return 'flask';
  if (/bio|botany|zoology/.test(n)) return 'leaf';
  if (/geo|history|civic|social|polit|econ/.test(n)) return 'globe';
  if (/computer|coding|program|it\b/.test(n)) return 'phone';
  return 'book';
}

const GOAL_KEY = 'study-daily-goal-min';
function dailyGoal(): number {
  try {
    return Number(localStorage.getItem(GOAL_KEY)) || 180;
  } catch {
    return 180;
  }
}

function TodayProgress({ todayMin, weekMin, chaptersToday, testsToday, exam }: { todayMin: number; weekMin: number; chaptersToday: number; testsToday: number; exam: { name: string; days: number } | null }) {
  const [goal, setGoal] = useState(dailyGoal);
  const pct = Math.min(100, Math.round((todayMin / goal) * 100));
  const R = 44;
  const L = 2 * Math.PI * R;
  const editGoal = () => {
    const v = window.prompt('Daily study goal (minutes)', String(goal));
    const n = Number(v);
    if (n > 0 && n <= 1000) {
      setGoal(n);
      try {
        localStorage.setItem(GOAL_KEY, String(n));
      } catch {
        /* ignore */
      }
    }
  };
  const Line = ({ ok, color, text }: { ok: boolean; color: string; text: string }) => (
    <p className="flex items-center gap-2 text-[14px]">
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ok ? color : 'rgba(255,255,255,.2)' }}>✓</span>
      {text}
    </p>
  );
  return (
    <div className="hero relative overflow-hidden rounded-[24px] p-4" style={{ background: 'linear-gradient(140deg, #5b21b6 0%, #3730a3 55%, #1e1b4b 100%)', color: '#fff' }}>
      <p className="flex items-center gap-2 text-[16px] font-bold">
        <Glyph name="calendar" size={22} /> Today's Progress
      </p>
      <div className="mt-2 flex items-center gap-4">
        <button type="button" onClick={editGoal} aria-label="Change daily goal" className="relative h-[108px] w-[108px] shrink-0">
          <svg width="108" height="108" viewBox="0 0 108 108" className="-rotate-90">
            <defs>
              <linearGradient id="study-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22d3ee" />
                <stop offset="1" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="10" />
            <circle cx="54" cy="54" r={R} fill="none" stroke="url(#study-ring)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(L * pct) / 100} ${L}`} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[24px] font-bold leading-none">{pct}%</span>
            <span className="mt-0.5 text-[10px] opacity-75">of {goal} min</span>
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Line ok={chaptersToday > 0} color="#a855f7" text={`${chaptersToday}/3 Chapters`} />
          <Line ok={testsToday > 0} color="#22c55e" text={`${testsToday} Mock Test`} />
          <Line ok={todayMin > 0} color="#22c55e" text={`${Math.floor(todayMin / 60) ? `${Math.floor(todayMin / 60)}h ` : ''}${todayMin % 60} min Study`} />
          <p className="text-[11.5px] opacity-75">This week {Math.floor(weekMin / 60)}h {weekMin % 60}m</p>
        </div>
      </div>
      {exam && (
        <div className="mt-3 rounded-[14px] px-3 py-2" style={{ background: 'rgba(255,255,255,.12)' }}>
          <p className="text-[13px] font-semibold">
            {exam.name} · {exam.days} days left
          </p>
        </div>
      )}
    </div>
  );
}

function daysLeft(iso: string) {
  return Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000);
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
