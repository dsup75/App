// Turns a typed sentence (or AI output) into a draft income / expense / transfer.
import { todayISO, toISODate } from './dates';
import { parseRupeesToPaise } from './money';

export interface Draft {
  kind: 'incomes' | 'expenses' | 'transfers';
  title: string;
  amount_paise: number | null;
  txn_date: string;
  txn_time: string;
  payment_app: string | null;
  payment_method: string | null;
  payer_name: string | null;
  reference: string | null;
  payment_mode: 'personal' | 'business';
  notes: string | null;
  confidence: 'ai' | 'text';
}

const APPS: [RegExp, string][] = [
  [/\b(g\s?pay|google\s?pay|tez)\b/i, 'gpay'],
  [/\bphone\s?pe\b/i, 'phonepe'],
  [/\bpaytm\b/i, 'paytm'],
  [/\bbhim\b/i, 'bhim'],
  [/\bamazon\s?pay\b/i, 'amazonpay'],
  [/\bcred\b/i, 'cred'],
  [/\bnet\s?banking|neft|imps|rtgs\b/i, 'netbanking'],
  [/\b(card|credit card|debit card)\b/i, 'card'],
  [/\b(cash|nakad|naqad)\b/i, 'cash'],
];

const pad = (n: number) => String(n).padStart(2, '0');

function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDate(s: string): string | null {
  const low = s.toLowerCase();
  if (/\b(today|aaj)\b/.test(low)) return todayISO();
  if (/\b(yesterday|kal)\b/.test(low)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toISODate(d);
  }
  let m = low.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = low.match(/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*,?\s*(\d{4})?/);
  if (m) {
    const y = m[3] ? Number(m[3]) : new Date().getFullYear();
    return `${y}-${pad(MONTHS.indexOf(m[2]) + 1)}-${pad(Number(m[1]))}`;
  }
  return null;
}

function parseTime(s: string): string | null {
  let h: number;
  let min = 0;
  let ap = '';
  const a = s.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  if (a) {
    h = Number(a[1]);
    min = Number(a[2]);
    ap = (a[3] ?? '').toLowerCase();
  } else {
    const b = s.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (!b) return null;
    h = Number(b[1]);
    ap = b[2].toLowerCase();
  }
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Offline parser for messages like "GPay se 500 Ramesh ko diye khane ke liye 2:30 pm" */
export function parseText(text: string): Draft {
  const s = text.trim();
  const low = s.toLowerCase();

  const income = /\b(received|credited|got|mila|mile|aaya|aaye|jama|from client|payment from|received from)\b/i.test(s);
  const transfer = /\b(transfer(red)?|moved|self)\b/i.test(s) && !income;
  const kind: Draft['kind'] = transfer ? 'transfers' : income ? 'incomes' : 'expenses';

  // amount: prefer ₹/rs marked numbers, else the largest plain number that is not a time/date/UTR
  let amount: number | null = null;
  const marked = s.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i) || s.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|rupaye|₹)/i);
  if (marked) amount = parseRupeesToPaise(marked[1]);
  if (amount === null) {
    const cleaned = s.replace(/\b\d{1,2}[:.]\d{2}\b/g, ' ').replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, ' ').replace(/\b\d{10,}\b/g, ' ');
    const nums = [...cleaned.matchAll(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/g)].map((x) => parseRupeesToPaise(x[1])).filter((x): x is number => !!x);
    if (nums.length) amount = Math.max(...nums);
  }

  let app: string | null = null;
  for (const [re, v] of APPS) if (re.test(s)) {
    app = v;
    break;
  }

  const ref = s.match(/\b(?:utr|ref(?:erence)?(?:\s*no)?|txn\s*id|transaction\s*id|upi\s*ref)[\s:#.-]*([A-Za-z0-9]{6,})/i)?.[1] ?? s.match(/\b(\d{12})\b/)?.[1] ?? null;

  // party: "to X" / "X ko" for expenses, "from X" / "X se" for income
  let party: string | null = null;
  const stop = '(?=\\s+(?:for|via|on|using|through|at|ke liye|ko|se|by)\\b|[,.]|$)';
  const p1 = income ? s.match(new RegExp(`\\bfrom\\s+([A-Za-z][\\w .&'-]{1,40}?)${stop}`, 'i')) : s.match(new RegExp(`\\bto\\s+([A-Za-z][\\w .&'-]{1,40}?)${stop}`, 'i'));
  if (p1) party = p1[1].trim();
  if (!party) {
    const p2 = income ? s.match(/([A-Z][\w.&'-]*(?:\s[A-Z][\w.&'-]*)?)\s+se\b/) : s.match(/([A-Z][\w.&'-]*(?:\s[A-Z][\w.&'-]*)?)\s+ko\b/);
    if (p2 && !APPS.some(([re]) => re.test(p2[1]))) party = p2[1].trim();
  }

  const purpose = s.match(/\bfor\s+([\w .&'-]{2,40}?)(?=\s+(?:via|on|using|to|from|at)\b|[,.]|$)/i)?.[1] ?? s.match(/(\w+)\s+ke\s+liye/i)?.[1] ?? null;

  const business = /\b(client|business|office|ads?|campaign|invoice|work)\b/i.test(s);

  let title = purpose?.trim() || party || (kind === 'incomes' ? 'Payment received' : kind === 'transfers' ? 'Transfer' : 'Expense');
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    kind,
    title: title.slice(0, 120),
    amount_paise: amount,
    txn_date: parseDate(low) ?? todayISO(),
    txn_time: parseTime(s) ?? nowTime(),
    payment_app: app,
    payment_method: app === 'cash' ? 'cash' : app === 'card' ? 'card' : app === 'netbanking' ? 'bank' : app ? 'upi' : null,
    payer_name: party,
    reference: ref,
    payment_mode: business ? 'business' : 'personal',
    notes: s.length > 120 ? s : null,
    confidence: 'text',
  };
}

/** Normalises the JSON returned by the AI extractor into a Draft. */
export function fromAI(x: any): Draft {
  const kind = x?.type === 'income' ? 'incomes' : x?.type === 'transfer' ? 'transfers' : 'expenses';
  const amt = typeof x?.amount === 'number' ? Math.round(x.amount * 100) : parseRupeesToPaise(String(x?.amount ?? ''));
  const app = typeof x?.app === 'string' ? x.app.toLowerCase() : null;
  const allowed = ['gpay', 'phonepe', 'paytm', 'bhim', 'amazonpay', 'cred', 'bank_app', 'netbanking', 'card', 'cash', 'other'];
  return {
    kind,
    title: String(x?.title || (kind === 'incomes' ? 'Payment received' : 'Expense')).slice(0, 120),
    amount_paise: amt && amt > 0 ? amt : null,
    txn_date: /^\d{4}-\d{2}-\d{2}$/.test(x?.date ?? '') ? x.date : todayISO(),
    txn_time: /^\d{2}:\d{2}/.test(x?.time ?? '') ? String(x.time).slice(0, 5) : nowTime(),
    payment_app: app && allowed.includes(app) ? app : null,
    payment_method: app === 'cash' ? 'cash' : app === 'card' ? 'card' : app ? 'upi' : null,
    payer_name: x?.party ? String(x.party).slice(0, 120) : null,
    reference: x?.reference ? String(x.reference).slice(0, 60) : null,
    payment_mode: x?.mode === 'business' ? 'business' : 'personal',
    notes: x?.notes ? String(x.notes).slice(0, 500) : null,
    confidence: 'ai',
  };
}

/** Shrinks a picked image so it uploads fast (max 1280px, JPEG). Returns base64 without prefix. */
export function compressImage(file: File): Promise<{ base64: string; mime: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const preview = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      resolve({ base64: preview.split(',')[1], mime: 'image/jpeg', preview });
    };
    img.onerror = () => reject(new Error('Could not read this image.'));
    img.src = url;
  });
}
