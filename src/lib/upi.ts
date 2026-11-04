import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { paiseToInput, formatINR } from './money';

export function isValidUpiId(v: string): boolean {
  return /^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(v.trim());
}

/** Standard UPI deep link — works with GPay, PhonePe, Paytm, BHIM etc. */
export function upiLink(opts: { upiId: string; name: string; amountPaise: number; note?: string }): string {
  const p = new URLSearchParams();
  p.set('pa', opts.upiId.trim());
  p.set('pn', opts.name.trim() || 'Payee');
  const r = Math.trunc(opts.amountPaise / 100);
  const pp = String(opts.amountPaise % 100).padStart(2, '0');
  p.set('am', `${r}.${pp}`);
  p.set('cu', 'INR');
  if (opts.note) p.set('tn', opts.note.trim().slice(0, 50));
  // URLSearchParams encodes spaces as '+', some UPI apps expect %20
  return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 560, errorCorrectionLevel: 'M' });
}

export function requestMessage(opts: {
  clientName?: string | null;
  title: string;
  amountPaise: number;
  upiId: string;
  name: string;
  dueDate?: string | null;
  link: string;
}): string {
  const lines = [
    `Hello${opts.clientName ? ` ${opts.clientName}` : ''},`,
    '',
    `Payment request: ${opts.title}`,
    `Amount: ${formatINR(opts.amountPaise)}`,
    opts.dueDate ? `Due: ${opts.dueDate}` : '',
    '',
    `Pay by UPI to: ${opts.upiId} (${opts.name})`,
    `UPI link: ${opts.link}`,
    '',
    'Please share the UTR / screenshot after paying. Thank you!',
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, dialogTitle: title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return 'shared';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export { paiseToInput };
