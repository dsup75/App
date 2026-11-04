// Save a generated file and open the share sheet (Android) or download (browser).
import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function saveFile(filename: string, blob: Blob): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title: filename, url: res.uri, dialogTitle: `Share ${filename}` });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export async function exportCSV(filename: string, headers: string[], rows: any[][]) {
  return saveFile(filename, new Blob(['﻿' + toCSV(headers, rows)], { type: 'text/csv' }));
}

export async function exportXLSX(filename: string, sheets: { name: string; headers: string[]; rows: any[][] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return saveFile(filename, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/** Plain-ASCII rupee text for PDFs (default PDF fonts have no ₹ glyph) */
export function pdfMoney(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.trunc(abs / 100).toLocaleString('en-IN');
  const p = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}Rs. ${r}.${p}`;
}

export async function exportPDFTable(
  filename: string,
  title: string,
  subtitle: string,
  summary: [string, string][],
  headers: string[],
  rows: (string | number)[][],
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 91, 69);
  doc.text(title, 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(subtitle, 40, 68);
  let y = 92;
  doc.setTextColor(20);
  summary.forEach(([k, v]) => {
    doc.text(`${k}: ${v}`, 40, y);
    y += 15;
  });
  autoTable(doc, {
    startY: y + 8,
    head: [headers],
    body: rows,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 91, 69] },
    alternateRowStyles: { fillColor: [244, 246, 245] },
  });
  return saveFile(filename, doc.output('blob'));
}
