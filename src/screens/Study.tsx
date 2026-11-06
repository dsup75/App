import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Timer, ClipboardCheck, GraduationCap, AlertTriangle, BookOpen } from 'lucide-react';
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
  BarChart, Button, Card, Empty, ErrorBox,  HeroCard, IconBubble, IconButton, List, ListRow, Page, ProgressBar, SectionTitle, SeeAll,  Sheet, Spinner,
} from '../components/ui';
import { LibraryBig } from 'lucide-react';

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

      {data.chapters.length === 0 && (
        <Card className="flex items-center gap-3">
          <IconBubble tone="violet"><LibraryBig size={17} /></IconBubble>
          <p className="flex-1 text-[13px] text-muted">Load JEE, NEET or board chapters in one tap.</p>
          <Button size="sm" variant="primary" onClick={() => setTplOpen(true)}>Templates</Button>
        </Card>
      )}

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
