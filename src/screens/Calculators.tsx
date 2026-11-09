// Money & everyday calculators (read-only — nothing is saved to your entries)
import { useState } from 'react';
import { formatINR } from '../lib/money';
import { Card, Chips, FormRow, KV, Page, Segmented } from '../components/ui';

type Calc = 'sip' | 'emi' | 'udhaar' | 'fuel' | 'discount' | 'percent' | 'units';

const n = (v: string) => {
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const rs = (rupees: number) => formatINR(Math.round(rupees * 100));

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <FormRow label={label}>
      <div className="relative">
        <input className="field pr-12" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-muted">{suffix}</span>}
      </div>
    </FormRow>
  );
}

export function CalculatorsScreen() {
  const [c, setC] = useState<Calc>('sip');
  return (
    <Page title="Calculators" subtitle="Quick money maths — nothing here changes your entries" back>
      <Chips
        value={c}
        onChange={setC}
        options={[
          { value: 'sip', label: 'SIP' },
          { value: 'emi', label: 'EMI' },
          { value: 'udhaar', label: 'Udhaar interest' },
          { value: 'fuel', label: 'Fuel cost' },
          { value: 'discount', label: 'Discount' },
          { value: 'percent', label: 'Percentage' },
          { value: 'units', label: 'Unit converter' },
        ]}
      />
      {c === 'sip' && <Sip />}
      {c === 'emi' && <Emi />}
      {c === 'udhaar' && <Udhaar />}
      {c === 'fuel' && <Fuel />}
      {c === 'discount' && <Discount />}
      {c === 'percent' && <Percent />}
      {c === 'units' && <Units />}
      <p className="px-1 text-[11.5px] text-muted">Estimates only. Real returns, bank interest and prices can differ.</p>
    </Page>
  );
}

function Sip() {
  const [p, setP] = useState('1000');
  const [r, setR] = useState('12');
  const [y, setY] = useState('5');
  const months = Math.round(n(y) * 12);
  const i = n(r) / 12 / 100;
  const fv = months <= 0 ? 0 : i === 0 ? n(p) * months : n(p) * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
  const invested = n(p) * months;
  return (
    <Card className="space-y-3">
      <Field label="Monthly investment" value={p} onChange={setP} suffix="₹" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Expected return" value={r} onChange={setR} suffix="% / yr" />
        <Field label="Time" value={y} onChange={setY} suffix="years" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <KV label="You invest" value={rs(invested)} />
        <KV label="Gain" value={rs(fv - invested)} tone="income" />
        <KV label="Total value" value={rs(fv)} />
      </div>
    </Card>
  );
}

function Emi() {
  const [p, setP] = useState('100000');
  const [r, setR] = useState('10.5');
  const [m, setM] = useState('24');
  const months = Math.round(n(m));
  const i = n(r) / 12 / 100;
  const emi = months <= 0 ? 0 : i === 0 ? n(p) / months : (n(p) * i * Math.pow(1 + i, months)) / (Math.pow(1 + i, months) - 1);
  const total = emi * months;
  return (
    <Card className="space-y-3">
      <Field label="Loan amount" value={p} onChange={setP} suffix="₹" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Interest" value={r} onChange={setR} suffix="% / yr" />
        <Field label="Tenure" value={m} onChange={setM} suffix="months" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <KV label="Monthly EMI" value={rs(emi)} />
        <KV label="Total interest" value={rs(total - n(p))} tone="expense" />
        <KV label="Total to pay" value={rs(total)} />
      </div>
    </Card>
  );
}

function Udhaar() {
  const [p, setP] = useState('10000');
  const [r, setR] = useState('2');
  const [per, setPer] = useState<'month' | 'year'>('month');
  const [t, setT] = useState('6');
  const [unit, setUnit] = useState<'months' | 'days'>('months');
  const [type, setType] = useState<'simple' | 'compound'>('simple');
  const months = unit === 'months' ? n(t) : n(t) / 30;
  const monthlyRate = per === 'month' ? n(r) / 100 : n(r) / 12 / 100;
  const interest = type === 'simple' ? n(p) * monthlyRate * months : n(p) * (Math.pow(1 + monthlyRate, months) - 1);
  return (
    <Card className="space-y-3">
      <Field label="Principal (udhaar amount)" value={p} onChange={setP} suffix="₹" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rate" value={r} onChange={setR} suffix="%" />
        <FormRow label="Rate is per">
          <Segmented value={per} onChange={setPer} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        </FormRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Time" value={t} onChange={setT} />
        <FormRow label="In">
          <Segmented value={unit} onChange={setUnit} options={[{ value: 'months', label: 'Months' }, { value: 'days', label: 'Days' }]} />
        </FormRow>
      </div>
      <Segmented value={type} onChange={setType} options={[{ value: 'simple', label: 'Simple interest' }, { value: 'compound', label: 'Compound (monthly)' }]} />
      <div className="grid grid-cols-2 gap-2">
        <KV label="Interest" value={rs(interest)} tone="income" />
        <KV label="Total to return" value={rs(n(p) + interest)} />
      </div>
      <p className="text-[11.5px] text-muted">"2 rupaye sekda" = 2% per month.</p>
    </Card>
  );
}

function Fuel() {
  const [d, setD] = useState('120');
  const [mil, setMil] = useState('45');
  const [price, setPrice] = useState('96');
  const [people, setPeople] = useState('1');
  const [round, setRound] = useState<'one' | 'two'>('one');
  const km = n(d) * (round === 'two' ? 2 : 1);
  const litres = n(mil) > 0 ? km / n(mil) : 0;
  const cost = litres * n(price);
  const ppl = Math.max(1, Math.round(n(people)));
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Distance" value={d} onChange={setD} suffix="km" />
        <FormRow label="Trip">
          <Segmented value={round} onChange={setRound} options={[{ value: 'one', label: 'One way' }, { value: 'two', label: 'Return' }]} />
        </FormRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mileage" value={mil} onChange={setMil} suffix="km/l" />
        <Field label="Fuel price" value={price} onChange={setPrice} suffix="₹/l" />
      </div>
      <Field label="Split between people" value={people} onChange={setPeople} />
      <div className="grid grid-cols-3 gap-2">
        <KV label="Fuel needed" value={`${litres.toFixed(2)} L`} />
        <KV label="Total cost" value={rs(cost)} tone="expense" />
        <KV label="Per person" value={rs(cost / ppl)} />
      </div>
    </Card>
  );
}

function Discount() {
  const [mrp, setMrp] = useState('1999');
  const [d1, setD1] = useState('30');
  const [d2, setD2] = useState('0');
  const [gst, setGst] = useState('0');
  const after1 = n(mrp) * (1 - n(d1) / 100);
  const after2 = after1 * (1 - n(d2) / 100);
  const final = after2 * (1 + n(gst) / 100);
  return (
    <Card className="space-y-3">
      <Field label="Price / MRP" value={mrp} onChange={setMrp} suffix="₹" />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Discount" value={d1} onChange={setD1} suffix="%" />
        <Field label="Extra off" value={d2} onChange={setD2} suffix="%" />
        <Field label="Tax / GST" value={gst} onChange={setGst} suffix="%" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <KV label="You save" value={rs(n(mrp) - after2)} tone="income" />
        <KV label="Effective off" value={`${n(mrp) ? (((n(mrp) - after2) / n(mrp)) * 100).toFixed(1) : '0'}%`} />
        <KV label="You pay" value={rs(final)} />
      </div>
    </Card>
  );
}

const fmt = (x: number, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)).toLocaleString('en-IN', { maximumFractionDigits: d }) : '—');

function Percent() {
  const [a, setA] = useState('18');
  const [b, setB] = useState('2500');
  const [x, setX] = useState('450');
  const [y, setY] = useState('1800');
  const [o, setO] = useState('40000');
  const [nw, setNw] = useState('46000');
  const change = n(o) ? ((n(nw) - n(o)) / n(o)) * 100 : NaN;
  return (
    <>
      <Card className="space-y-3">
        <p className="text-[13.5px] font-semibold">What is X% of Y?</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Percent" value={a} onChange={setA} suffix="%" />
          <Field label="Of" value={b} onChange={setB} />
        </div>
        <KV label="Answer" value={fmt((n(a) / 100) * n(b), 2)} />
      </Card>
      <Card className="space-y-3">
        <p className="text-[13.5px] font-semibold">X is what % of Y?</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X" value={x} onChange={setX} />
          <Field label="Y" value={y} onChange={setY} />
        </div>
        <KV label="Answer" value={n(y) ? `${fmt((n(x) / n(y)) * 100, 2)}%` : '—'} />
      </Card>
      <Card className="space-y-3">
        <p className="text-[13.5px] font-semibold">% change (old → new)</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Old" value={o} onChange={setO} />
          <Field label="New" value={nw} onChange={setNw} />
        </div>
        <KV label={change >= 0 ? 'Increase' : 'Decrease'} value={Number.isFinite(change) ? `${fmt(Math.abs(change), 2)}%` : '—'} tone={change >= 0 ? 'income' : 'expense'} />
      </Card>
    </>
  );
}

type UnitGroup = 'length' | 'weight' | 'area' | 'volume' | 'temp' | 'speed';
// factor = how many base units in one of this unit (base: metre, kg, m², litre, km/h)
const UNITS: Record<Exclude<UnitGroup, 'temp'>, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, foot: 0.3048, yard: 0.9144, mile: 1609.344 },
  weight: { g: 0.001, kg: 1, quintal: 100, tonne: 1000, ounce: 0.028349523125, pound: 0.45359237 },
  area: { 'sq ft': 0.09290304, 'sq m': 1, 'sq yard (gaj)': 0.83612736, acre: 4046.8564224, hectare: 10000, 'bigha (UP, pucca)': 2529.285264 },
  volume: { ml: 0.001, litre: 1, 'cubic m': 1000, 'gallon (US)': 3.785411784, 'cup (240 ml)': 0.24 },
  speed: { 'km/h': 1, 'm/s': 3.6, mph: 1.609344, knot: 1.852 },
};
const TEMP = ['°C', '°F', 'K'];
const toC = (v: number, u: string) => (u === '°C' ? v : u === '°F' ? ((v - 32) * 5) / 9 : v - 273.15);
const fromC = (c: number, u: string) => (u === '°C' ? c : u === '°F' ? (c * 9) / 5 + 32 : c + 273.15);

function Units() {
  const [g, setG] = useState<UnitGroup>('length');
  const names = g === 'temp' ? TEMP : Object.keys(UNITS[g]);
  const [from, setFrom] = useState(names[0]);
  const [to, setTo] = useState(names[1]);
  const [v, setV] = useState('1');
  const pickGroup = (x: UnitGroup) => {
    setG(x);
    const ns = x === 'temp' ? TEMP : Object.keys(UNITS[x]);
    setFrom(ns[0]);
    setTo(ns[1]);
  };
  const f = names.includes(from) ? from : names[0];
  const t = names.includes(to) ? to : names[1];
  const out = g === 'temp' ? fromC(toC(n(v), f), t) : (n(v) * UNITS[g][f]) / UNITS[g][t];
  return (
    <Card className="space-y-3">
      <Chips
        value={g}
        onChange={pickGroup}
        options={[
          { value: 'length', label: 'Length' },
          { value: 'weight', label: 'Weight' },
          { value: 'area', label: 'Area / land' },
          { value: 'volume', label: 'Volume' },
          { value: 'temp', label: 'Temperature' },
          { value: 'speed', label: 'Speed' },
        ]}
      />
      <Field label="Value" value={v} onChange={setV} />
      <div className="grid grid-cols-2 gap-2">
        <FormRow label="From">
          <select className="field" value={f} onChange={(e) => setFrom(e.target.value)}>
            {names.map((u) => <option key={u}>{u}</option>)}
          </select>
        </FormRow>
        <FormRow label="To">
          <select className="field" value={t} onChange={(e) => setTo(e.target.value)}>
            {names.map((u) => <option key={u}>{u}</option>)}
          </select>
        </FormRow>
      </div>
      <KV label={`${fmt(n(v))} ${f} =`} value={`${fmt(out)} ${t}`} />
      {g === 'area' && <p className="text-[11.5px] text-muted">Bigha size differs by state and even district; this uses the UP "pucca" bigha (≈ 27,225 sq ft). Check your local measure.</p>}
    </Card>
  );
}
