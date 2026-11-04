// All money is integer paise. Floats are never used for balances.

export function parseRupeesToPaise(input: string): number | null {
  const s = String(input ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [rupees, frac = ''] = s.split('.');
  const paise = Number(rupees) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise)) return null;
  return paise;
}

/** For number inputs that allow negatives (e.g. opening balance). */
export function parseSignedRupeesToPaise(input: string): number | null {
  const s = String(input ?? '').trim();
  const neg = s.startsWith('-');
  const v = parseRupeesToPaise(neg ? s.slice(1) : s);
  if (v === null) return null;
  return neg ? -v : v;
}

export function paiseToInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.trunc(abs / 100);
  const p = abs % 100;
  return `${neg ? '-' : ''}${r}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

export function formatINR(paise: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const v = Number(paise ?? 0);
  const neg = v < 0;
  const abs = Math.abs(v);
  const r = Math.trunc(abs / 100);
  const p = abs % 100;
  const rs = r.toLocaleString('en-IN');
  const sign = neg ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}₹${rs}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

export function sumPaise(rows: { amount_paise: number }[]): number {
  let total = 0;
  for (const r of rows) total += Number(r.amount_paise);
  return total;
}
