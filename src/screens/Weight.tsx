// Weight log: manual entry, scale readings (Bluetooth / Health Connect), history and trend
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Scale, Trash2, Ruler } from 'lucide-react';
import {
  SOURCE_LABEL, addMeasurement, bmiLabel, bmiOf, deleteMeasurement, fetchMeasurements, getHealthProfile, saveHealthProfile, type Measurement,
} from '../lib/body';
import { friendlyError } from '../lib/db';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, FormRow, IconButton, List, ListRow, Page, SectionTitle, Segmented, Sheet, Spinner } from '../components/ui';

function TrendChart({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return <p className="text-[12.5px] text-muted">Add at least two entries to see the trend.</p>;
  const W = 320;
  const H = 110;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys) - 0.5;
  const y1 = Math.max(...ys) + 0.5;
  const px = (t: number) => (x1 === x0 ? W / 2 : 8 + ((t - x0) / (x1 - x0)) * (W - 16));
  const py = (v: number) => H - 10 - ((v - y0) / (y1 - y0)) * (H - 24);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight trend">
      <path d={d} fill="none" stroke="var(--primary-2)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.t)} cy={py(p.v)} r={i === points.length - 1 ? 4 : 2.5} fill="var(--primary-2)" />
      ))}
      <text x="4" y="12" fontSize="10" fill="var(--muted)">{Math.max(...ys).toFixed(1)} kg</text>
      <text x="4" y={H - 1} fontSize="10" fill="var(--muted)">{Math.min(...ys).toFixed(1)} kg</text>
    </svg>
  );
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function AddSheet({ open, onClose, heightCm, onSaved }: { open: boolean; onClose: () => void; heightCm: number | null; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ weight: '', fat: '', muscle: '', bone: '', water: '', visceral: '', bmr: '', when: '' });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setF({ weight: '', fat: '', muscle: '', bone: '', water: '', visceral: '', bmr: '', when: now.toISOString().slice(0, 16) });
    }
  }, [open]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const w = num(f.weight);
    if (!w || w < 10 || w > 400) return toast('Enter weight between 10 and 400 kg', 'error');
    setBusy(true);
    try {
      await addMeasurement({
        weight_kg: Math.round(w * 100) / 100,
        bmi: bmiOf(w, heightCm),
        body_fat_pct: num(f.fat),
        muscle_kg: num(f.muscle),
        bone_kg: num(f.bone),
        water_pct: num(f.water),
        visceral_fat: num(f.visceral),
        bmr_kcal: num(f.bmr) === null ? null : Math.round(num(f.bmr)!),
        measured_at: f.when ? new Date(f.when).toISOString() : new Date().toISOString(),
        source: 'manual',
      });
      toast('Saved');
      onSaved();
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add weight">
      <div className="space-y-3">
        <FormRow label="Weight (kg)">
          <input className="field" inputMode="decimal" autoFocus value={f.weight} onChange={set('weight')} placeholder="e.g. 62.4" />
        </FormRow>
        <FormRow label="Date & time">
          <input className="field" type="datetime-local" value={f.when} onChange={set('when')} />
        </FormRow>
        {!more ? (
          <Button size="sm" onClick={() => setMore(true)}>
            + Body composition (from your scale app)
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <FormRow label="Body fat %"><input className="field" inputMode="decimal" value={f.fat} onChange={set('fat')} /></FormRow>
            <FormRow label="Muscle (kg)"><input className="field" inputMode="decimal" value={f.muscle} onChange={set('muscle')} /></FormRow>
            <FormRow label="Bone (kg)"><input className="field" inputMode="decimal" value={f.bone} onChange={set('bone')} /></FormRow>
            <FormRow label="Body water %"><input className="field" inputMode="decimal" value={f.water} onChange={set('water')} /></FormRow>
            <FormRow label="Visceral fat"><input className="field" inputMode="decimal" value={f.visceral} onChange={set('visceral')} /></FormRow>
            <FormRow label="BMR (kcal)"><input className="field" inputMode="numeric" value={f.bmr} onChange={set('bmr')} /></FormRow>
          </div>
        )}
        <p className="text-[11.5px] text-muted">BMI is worked out from your height. Body-composition numbers are only saved if you type them — the app never guesses them.</p>
        <Button full variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}

export function WeightScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [error, setError] = useState('');
  const [height, setHeight] = useState<number | null>(null);
  const [heightOpen, setHeightOpen] = useState(false);
  const [heightInput, setHeightInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState<Measurement | null>(null);
  const [range, setRange] = useState<'30' | '90' | '365'>('90');

  const load = useCallback(async () => {
    setError('');
    try {
      const [m, p] = await Promise.all([fetchMeasurements(400), getHealthProfile()]);
      setRows(m);
      setHeight(p.height_cm);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const latest = rows?.[0] ?? null;
  const bmi = latest ? latest.bmi ?? bmiOf(latest.weight_kg, height) : null;
  const points = useMemo(() => {
    const since = Date.now() - Number(range) * 86400000;
    return (rows ?? [])
      .filter((r) => new Date(r.measured_at).getTime() >= since)
      .map((r) => ({ t: new Date(r.measured_at).getTime(), v: r.weight_kg }))
      .reverse();
  }, [rows, range]);
  const change = points.length >= 2 ? Math.round((points[points.length - 1].v - points[0].v) * 10) / 10 : null;

  const saveHeight = async () => {
    const h = Number(heightInput);
    if (!(h >= 50 && h <= 250)) return toast('Height must be 50–250 cm', 'error');
    try {
      await saveHealthProfile({ height_cm: h, weight_goal_kg: null });
      setHeight(h);
      setHeightOpen(false);
      toast('Height saved');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <Page
      title="Weight"
      subtitle="Body measurements"
      back
      right={
        <IconButton label="Add weight" onClick={() => setAddOpen(true)}>
          <Plus size={19} />
        </IconButton>
      }
    >
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : rows === null ? (
        <Spinner />
      ) : (
        <>
          <Card className="space-y-2">
            {latest ? (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[12.5px] text-muted">Latest</p>
                    <p className="text-[30px] font-bold tracking-tight">
                      {latest.weight_kg.toFixed(1)} <span className="text-[15px] font-medium text-muted">kg</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {bmi !== null ? (
                      <>
                        <p className="text-[12.5px] text-muted">BMI</p>
                        <p className="text-[18px] font-bold">{bmi}</p>
                        <p className="text-[11.5px] text-muted">{bmiLabel(bmi)}</p>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => setHeightOpen(true)}>
                        <Ruler size={13} /> Add height for BMI
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-muted">
                  {new Date(latest.measured_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {SOURCE_LABEL[latest.source]}
                </p>
              </>
            ) : (
              <Empty title="No weight yet" text="Add your first weight, or read it from your scale in Gadgets." action={<Button variant="primary" onClick={() => setAddOpen(true)}>Add weight</Button>} />
            )}
          </Card>

          {rows.length > 0 && (
            <Card className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[13px] font-semibold">
                  Trend {change !== null && <span className={change > 0 ? 'text-expense' : 'text-income'}>{change > 0 ? '+' : ''}{change} kg</span>}
                </p>
              </div>
              <Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} />
              <TrendChart points={points} />
            </Card>
          )}

          {latest && (latest.body_fat_pct || latest.muscle_kg || latest.water_pct || latest.bone_kg || latest.visceral_fat || latest.bmr_kcal) && (
            <>
              <SectionTitle>Body composition (latest)</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Body fat', latest.body_fat_pct, '%'],
                  ['Muscle', latest.muscle_kg, 'kg'],
                  ['Water', latest.water_pct, '%'],
                  ['Bone', latest.bone_kg, 'kg'],
                  ['Visceral', latest.visceral_fat, ''],
                  ['BMR', latest.bmr_kcal, 'kcal'],
                ]
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([l, v, u]) => (
                    <Card key={String(l)} className="!p-3">
                      <p className="text-[11.5px] text-muted">{l}</p>
                      <p className="text-[16px] font-bold">
                        {Number(v)} <span className="text-[11px] font-medium text-muted">{u}</span>
                      </p>
                    </Card>
                  ))}
              </div>
            </>
          )}

          <SectionTitle right={<Button size="sm" onClick={() => nav('/gadgets')}><Scale size={13} /> Scale</Button>}>History</SectionTitle>
          {rows.length > 0 && (
            <List>
              {rows.slice(0, 60).map((r) => (
                <ListRow
                  key={r.id}
                  title={`${r.weight_kg.toFixed(1)} kg${r.body_fat_pct ? ` · fat ${Number(r.body_fat_pct)}%` : ''}`}
                  subtitle={new Date(r.measured_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  right={
                    <span className="flex items-center gap-2">
                      <Badge tone={r.source === 'manual' ? 'muted' : 'primary'}>{r.source === 'manual' ? 'Manual' : 'Synced'}</Badge>
                      <button type="button" aria-label="Delete" onClick={() => setDel(r)} className="text-muted">
                        <Trash2 size={15} />
                      </button>
                    </span>
                  }
                />
              ))}
            </List>
          )}
          <Button size="sm" onClick={() => { setHeightInput(height ? String(height) : ''); setHeightOpen(true); }}>
            <Ruler size={13} /> {height ? `Height ${height} cm` : 'Set height'}
          </Button>
        </>
      )}

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} heightCm={height} onSaved={load} />
      <Sheet open={heightOpen} onClose={() => setHeightOpen(false)} title="Your height">
        <div className="space-y-3">
          <input className="field" inputMode="decimal" placeholder="Height in cm (e.g. 170)" value={heightInput} onChange={(e) => setHeightInput(e.target.value)} />
          <Button full variant="primary" onClick={saveHeight}>
            Save
          </Button>
        </div>
      </Sheet>
      <Confirm
        open={!!del}
        title="Delete this entry?"
        message={del ? `${del.weight_kg.toFixed(1)} kg on ${new Date(del.measured_at).toLocaleDateString('en-IN')}` : ''}
        confirmLabel="Delete"
        danger
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          try {
            await deleteMeasurement(del.id);
            setDel(null);
            load();
          } catch (e) {
            toast(friendlyError(e), 'error');
          }
        }}
      />
    </Page>
  );
}
