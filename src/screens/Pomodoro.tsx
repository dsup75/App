// Focus timer with your own photo. Works in portrait and as a landscape desk timer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, RotateCcw, ImagePlus, Maximize2, Minimize2, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createRecord, friendlyError } from '../lib/db';
import { todayISO } from '../lib/dates';
import { compressImage } from '../lib/parse';
import { askPermission } from '../lib/reminders';
import { focusStatus, getFocusPrefs, pauseFocusGuard, resumeFocusGuard, setFocusPrefs, startFocusGuard, stopFocusGuard } from '../lib/focusGuard';
import { useNavigate } from 'react-router-dom';
import { ShieldBan, ChevronDown } from 'lucide-react';
import { useLookups } from '../lib/useLookups';
import { useToast } from '../context/ToastContext';
import { useLock } from '../context/LockContext';
import { Button, Card, FormRow, IconButton, Page, Segmented, cx } from '../components/ui';

type Phase = 'focus' | 'short' | 'long';
const KEY = 'pomodoro-state';
const IMG_KEY = 'pomodoro-image';
const NOTIF_ID = 900;

interface TimerState {
  phase: Phase;
  durations: Record<Phase, number>; // minutes
  endsAt: number | null; // running → timestamp (keeps exact time in background)
  remainingMs: number; // paused → ms left
  startedAt: number | null; // when this focus block started
  focusedMs: number; // focus time already counted before pauses
  subjectId: string;
  chapterId: string;
  rounds: number;
  showRing: boolean;
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
  showRing: true,
});

function loadState(): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.durations) return { ...defaultState(), ...s };
  } catch {
    /* ignore */
  }
  return defaultState();
}

function loadImage(): string | null {
  try {
    return localStorage.getItem(IMG_KEY);
  } catch {
    return null;
  }
}

const native = Capacitor.isNativePlatform();

async function keepAwake(on: boolean) {
  if (!native) return;
  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    if (on) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
  } catch {
    /* plugin missing on web */
  }
}

async function scheduleEnd(at: number, phase: Phase) {
  if (!native) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title: phase === 'focus' ? 'Focus done 🎉' : 'Break over',
          body: phase === 'focus' ? 'Great work. Take a short break.' : 'Back to focus when you are ready.',
          schedule: { at: new Date(at), allowWhileIdle: true },
          extra: { url: '/pomodoro' },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}
async function cancelEnd() {
  if (!native) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
  } catch {
    /* ignore */
  }
}

function useLandscape() {
  const q = '(orientation: landscape) and (max-height: 560px)';
  const [land, setLand] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setLand(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return land;
}

export function Pomodoro() {
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const { refs } = useLookups();
  const [s, setS] = useState<TimerState>(loadState);
  const [img, setImg] = useState<string | null>(loadImage);
  const [now, setNow] = useState(Date.now());
  const [desk, setDesk] = useState(false);
  const landscape = useLandscape();
  const saving = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s]);

  const running = s.endsAt !== null;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), running ? 250 : 1000);
    return () => clearInterval(t);
  }, [running]);

  // keep the screen on while the timer runs (desk timer)
  useEffect(() => {
    keepAwake(running);
    return () => {
      keepAwake(false);
    };
  }, [running]);

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

  // Phase finished (also runs when you come back to the app after it ended)
  useEffect(() => {
    if (!running || remaining > 0) return;
    try {
      navigator.vibrate?.([300, 150, 300]);
    } catch {
      /* ignore */
    }
    if (s.phase === 'focus') {
      const focused = s.focusedMs + (s.startedAt ? Math.min(Date.now(), s.endsAt!) - s.startedAt : 0);
      saveSession(Math.min(focused, s.durations.focus * 60000));
      stopFocusGuard('completed');
      const rounds = s.rounds + 1;
      const next: Phase = rounds % 4 === 0 ? 'long' : 'short';
      setS((x) => ({ ...x, phase: next, rounds, endsAt: null, remainingMs: x.durations[next] * 60000, startedAt: null, focusedMs: 0 }));
    } else {
      setS((x) => ({ ...x, phase: 'focus', endsAt: null, remainingMs: x.durations.focus * 60000, startedAt: null, focusedMs: 0 }));
    }
  }, [running, remaining, s, saveSession]);

  const start = async () => {
    suppressBriefly();
    if (native && !asked.current) {
      asked.current = true;
      await askPermission().catch(() => false);
    }
    const endsAt = Date.now() + s.remainingMs;
    setS((x) => ({ ...x, endsAt, startedAt: x.phase === 'focus' ? Date.now() : null }));
    scheduleEnd(endsAt, s.phase);
    if (s.phase === 'focus') {
      const st = await focusStatus();
      if (st.running && st.paused) await resumeFocusGuard(endsAt);
      else startFocusGuard(endsAt).then((m) => m && toast(m, 'error'));
    }
  };
  const pause = () => {
    cancelEnd();
    pauseFocusGuard();
    setS((x) => ({
      ...x,
      endsAt: null,
      remainingMs: Math.max(0, (x.endsAt ?? Date.now()) - Date.now()),
      focusedMs: x.focusedMs + (x.startedAt ? Date.now() - x.startedAt : 0),
      startedAt: null,
    }));
  };
  /** Back to the full time of this phase (nothing is saved) — works while running too */
  const reset = () => {
    cancelEnd();
    stopFocusGuard();
    setS((x) => ({ ...x, endsAt: null, remainingMs: x.durations[x.phase] * 60000, focusedMs: 0, startedAt: null }));
  };
  /** Stop and save the real focus minutes */
  const stop = async () => {
    cancelEnd();
    stopFocusGuard();
    if (s.phase === 'focus') await saveSession(s.focusedMs + (s.startedAt ? Date.now() - s.startedAt : 0));
    setS((x) => ({ ...x, phase: 'focus', endsAt: null, remainingMs: x.durations.focus * 60000, startedAt: null, focusedMs: 0 }));
  };
  const switchPhase = (p: Phase) => {
    if (running) return toast('Pause the timer to switch');
    setS((x) => ({ ...x, phase: p, remainingMs: x.durations[p] * 60000, focusedMs: 0, startedAt: null }));
  };
  const setDuration = (p: Phase, m: number) => {
    if (running || !m || m < 1 || m > 180) return;
    setS((x) => ({ ...x, durations: { ...x.durations, [p]: m }, remainingMs: x.phase === p ? m * 60000 : x.remainingMs }));
  };

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    try {
      const c = await compressImage(f);
      try {
        localStorage.setItem(IMG_KEY, c.preview);
      } catch {
        toast('Photo is too big to save, try another one', 'error');
        return;
      }
      setImg(c.preview);
      toast('Photo set');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeImage = () => {
    try {
      localStorage.removeItem(IMG_KEY);
    } catch {
      /* ignore */
    }
    setImg(null);
  };
  const choose = () => {
    suppressBriefly();
    fileRef.current?.click();
  };

  const total = s.durations[s.phase] * 60000;
  const pct = Math.min(1, Math.max(0, 1 - remaining / total));
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  const ringColor = s.phase === 'focus' ? 'var(--primary-2)' : '#3B82F6';
  const phaseLabel = `${s.phase === 'focus' ? 'Focus' : s.phase === 'short' ? 'Short break' : 'Long break'} · round ${s.rounds + (s.phase === 'focus' ? 1 : 0)}`;
  const subjects = (refs.subjects ?? []).filter((x) => !x.deleted_at);
  const chapters = (refs.chapters ?? []).filter((x) => !x.deleted_at && (!s.subjectId || x.subject_id === s.subjectId));

  const fileInput = <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />;

  const controls = (big?: boolean) => (
    <div className="flex items-center justify-center gap-3">
      <IconButton label="Reset" onClick={reset}>
        <RotateCcw size={17} />
      </IconButton>
      {running ? (
        <Button variant="primary" size="lg" onClick={pause} className={big ? 'w-40' : 'w-36'}>
          <Pause size={17} /> Pause
        </Button>
      ) : (
        <Button variant="primary" size="lg" onClick={start} className={big ? 'w-40' : 'w-36'}>
          <Play size={17} /> {s.remainingMs < total ? 'Resume' : 'Start'}
        </Button>
      )}
      <IconButton label="Stop and save" onClick={stop}>
        <Square size={16} />
      </IconButton>
    </div>
  );

  // Desk timer: full screen (landscape automatically, or by button)
  if (desk || landscape) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center overflow-hidden" style={{ background: 'var(--bg)' }}>
        {fileInput}
        <div className="app-bg" />
        {img && (
          <div
            className="absolute inset-0 scale-110 opacity-40"
            style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) saturate(140%)' }}
          />
        )}
        <div
          className="relative z-10 grid h-full w-full items-center gap-6 px-6 py-4"
          style={{
            gridTemplateColumns: landscape ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
            paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
            paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
          }}
        >
          <div className="flex items-center justify-center">
            <Visual img={img} pct={pct} color={ringColor} showRing={s.showRing} size={landscape ? 'min(78vh, 42vw)' : 'min(72vw, 46vh)'} onPick={choose} />
          </div>
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-[14px] font-semibold text-muted">{phaseLabel}</p>
            <p className="tabular font-bold leading-none tracking-tight" style={{ fontSize: landscape ? 'min(22vh, 12vw)' : 'min(22vw, 13vh)' }}>
              {mm}:{ss}
            </p>
            {controls(true)}
          </div>
        </div>
        {!landscape && (
          <button
            aria-label="Exit desk mode"
            onClick={() => setDesk(false)}
            className="liquid absolute right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <Minimize2 size={17} />
          </button>
        )}
      </div>
    );
  }

  return (
    <Page
      title="Focus"
      subtitle="Only real focus time is saved to your study log"
      back
      right={
        <IconButton label="Desk mode" onClick={() => setDesk(true)}>
          <Maximize2 size={17} />
        </IconButton>
      }
    >
      {fileInput}
      <Segmented
        value={s.phase}
        onChange={switchPhase}
        options={[
          { value: 'focus', label: `Focus ${s.durations.focus}m` },
          { value: 'short', label: `Break ${s.durations.short}m` },
          { value: 'long', label: `Long ${s.durations.long}m` },
        ]}
      />
      <Card className="flex flex-col items-center gap-4 py-6">
        <Visual img={img} pct={pct} color={ringColor} showRing={s.showRing} size="min(68vw, 270px)" onPick={choose} />
        <div className="text-center">
          <p className="tabular text-[54px] font-bold leading-none tracking-tight">
            {mm}:{ss}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">{phaseLabel}</p>
        </div>
        {controls()}
        <p className="text-[11.5px] text-muted">Turn your phone sideways for the desk timer · screen stays on while running</p>
      </Card>

      <FocusModeCard />

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={choose}>
            <ImagePlus size={15} /> {img ? 'Change photo' : 'Add your photo'}
          </Button>
          {img && (
            <Button size="sm" onClick={removeImage}>
              <X size={15} /> Remove
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={s.showRing} onChange={(e) => setS((x) => ({ ...x, showRing: e.target.checked }))} />
            Progress ring
          </label>
        </div>
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

/** Round photo with the progress ring around it */
function Visual({ img, pct, color, showRing, size, onPick }: { img: string | null; pct: number; color: string; showRing: boolean; size: string; onPick: () => void }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative aspect-square" style={{ width: size }}>
      {showRing && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hairline)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - c * pct}
            style={{ transition: 'stroke-dashoffset .3s linear' }}
          />
        </svg>
      )}
      <button
        onClick={onPick}
        aria-label={img ? 'Change photo' : 'Add photo'}
        className={cx('absolute overflow-hidden rounded-full', showRing ? 'inset-[9%]' : 'inset-0')}
        style={{ boxShadow: 'var(--shadow), inset 0 0 0 1px var(--edge)', background: 'var(--card-2)' }}
      >
        {img ? (
          <img src={img} alt="Focus" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted">
            <ImagePlus size={26} />
            <span className="text-[12px] font-semibold">Add your photo</span>
          </span>
        )}
      </button>
    </div>
  );
}

/** Collapsed by default: "block other apps while focusing" (Android) */
function FocusModeCard() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(() => getFocusPrefs().on);
  return (
    <Card className="space-y-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <ShieldBan size={16} className="text-primary" />
        <span className="min-w-0 flex-1 text-[14px] font-semibold">Distraction-free focus mode</span>
        <span className="text-[12px] text-muted">{on ? 'On' : 'Off'}</span>
        <ChevronDown size={15} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                setOn(e.target.checked);
                setFocusPrefs({ ...getFocusPrefs(), on: e.target.checked });
              }}
            />
            Block other apps during Focus (not during breaks)
          </label>
          <Button size="sm" onClick={() => nav('/focus-mode')}>
            Permissions & apps to block
          </Button>
          <p className="text-[11.5px] text-muted">Android app only. Phone, settings and keyboard are never blocked.</p>
        </>
      )}
    </Card>
  );
}
