// Money & everyday calculators (read-only — nothing is saved to your entries)
import { useState } from 'react';
import { formatINR } from '../lib/money';
import { Card, Chips, FormRow, KV, Page, Segmented } from '../components/ui';

type Calc = 'sip' | 'emi' | 'udhaar' | 'fuel' | 'discount';

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
        ]}
      />
      {c === 'sip' && <Sip />}
      {c === 'emi' && <Emi />}
      {c === 'udhaar' && <Udhaar />}
      {c === 'fuel' && <Fuel />}
      {c === 'discount' && <Discount />}
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
