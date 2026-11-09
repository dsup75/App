// "Link money source" inside one money-out payment row.
// Shows only money that is in this row's account right now (traced through transfers).
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Link2, Plus, Wand2, X } from 'lucide-react';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { formatDate } from '../lib/dates';
import { fetchSourcePositions, sourceKey, type SourcePosition, type SourceTable } from '../lib/moneyTools';
import { Sheet, cx } from './ui';

export interface RowLinkState {
  source_table: SourceTable;
  source_id: string;
  amount: string;
}

// One shared fetch per form
let cache: Promise<SourcePosition[]> | null = null;
let cacheAt = 0;
export function loadPositions(force = false): Promise<SourcePosition[]> {
  if (force || !cache || Date.now() - cacheAt > 20000) {
    cacheAt = Date.now();
    cache = fetchSourcePositions().catch(() => [] as SourcePosition[]);
  }
  return cache;
}

const KIND_LABEL: Record<string, string> = { incomes: 'Income', transfers: 'Moved in', loans: 'Udhaar taken', loan_repayments: 'Udhaar returned' };

export function rowLinksTotal(links: RowLinkState[] | undefined) {
  return (links ?? []).reduce((t, l) => t + (parseRupeesToPaise(l.amount) ?? 0), 0);
}

export function RowSourceLinks({
  accountId,
  accountName,
  rowAmount,
  links,
  own,
  onChange,
}: {
  accountId: string;
  accountName: string;
  rowAmount: number;
  links: RowLinkState[];
  /** amounts this entry already holds (when editing) — available again */
  own: Map<string, number>;
  onChange: (links: RowLinkState[]) => void;
}) {
  const [open, setOpen] = useState(links.length > 0);
  const [picking, setPicking] = useState(false);
  const [positions, setPositions] = useState<SourcePosition[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadPositions().then((p) => alive && setPositions(p));
    return () => {
      alive = false;
    };
  }, [open]);

  const here = useMemo(
    () =>
      (positions ?? [])
        .filter((p) => p.account_id === accountId)
        .map((p) => ({ ...p, available_paise: p.available_paise + (own.get(sourceKey(p.source_table, p.source_id) + '@' + accountId) ?? 0) }))
        .sort((a, b) => (a.source_date ?? '').localeCompare(b.source_date ?? '')),
    [positions, accountId, own],
  );
  const find = (l: RowLinkState) => here.find((p) => p.source_table === l.source_table && p.source_id === l.source_id);
  const linked = rowLinksTotal(links);
  const usedElsewhere = (key: string, except: number) =>
    links.reduce((t, l, i) => (i !== except && sourceKey(l.source_table, l.source_id) === key ? t + (parseRupeesToPaise(l.amount) ?? 0) : t), 0);

  const add = (p: SourcePosition) => {
    const can = Math.max(0, Math.min(p.available_paise - usedElsewhere(sourceKey(p.source_table, p.source_id), -1), rowAmount - linked));
    onChange([...links, { source_table: p.source_table, source_id: p.source_id, amount: can ? paiseToInput(can) : '' }]);
    setPicking(false);
  };

  /** Fill the rest of this row from the oldest money in this account first */
  const autoFill = () => {
    let need = rowAmount - linked;
    if (need <= 0) return;
    const next = [...links];
    for (const p of here) {
      if (need <= 0) break;
      const key = sourceKey(p.source_table, p.source_id);
      const free = p.available_paise - usedElsewhere(key, -1);
      if (free <= 0) continue;
      const take = Math.min(free, need);
      const i = next.findIndex((l) => sourceKey(l.source_table, l.source_id) === key);
      if (i >= 0) next[i] = { ...next[i], amount: paiseToInput((parseRupeesToPaise(next[i].amount) ?? 0) + take) };
      else next.push({ source_table: p.source_table, source_id: p.source_id, amount: paiseToInput(take) });
      need -= take;
    }
    onChange(next);
  };

  if (!accountId) return null;

  return (
    <div className="rounded-[12px]" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Link2 size={14} className="text-primary" />
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold">
          Link money source <span className="font-normal text-muted">(optional)</span>
        </span>
        {links.length > 0 && <span className="text-[12px] text-muted">{formatINR(linked)} linked</span>}
        <ChevronDown size={15} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <p className="text-[11.5px] text-muted">Only money that is in {accountName} right now is shown.</p>
          {links.map((l, i) => {
            const p = find(l);
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{p?.title ?? 'Source'}</p>
                  {p && <p className="truncate text-[11.5px] text-muted">{formatINR(p.available_paise)} available{p.via_title ? ` · via ${p.via_title}` : ''}</p>}
                </div>
                <input
                  className="field w-24 py-2 text-[13px]"
                  inputMode="decimal"
                  placeholder="₹"
                  value={l.amount}
                  onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
                <button type="button" aria-label="Remove source" className="p-1 text-muted" onClick={() => onChange(links.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="liquid h-8 rounded-full px-3 text-[12px] font-semibold" onClick={() => setPicking(true)}>
              <Plus size={13} className="mr-1 inline" /> Source
            </button>
            <button type="button" className="liquid h-8 rounded-full px-3 text-[12px] font-semibold" disabled={!rowAmount || linked >= rowAmount} onClick={autoFill}>
              <Wand2 size={13} className="mr-1 inline" /> Auto-fill
            </button>
            {rowAmount > 0 && (
              <span className={cx('ml-auto text-[11.5px]', linked > rowAmount ? 'font-semibold text-danger' : 'text-muted')}>
                {formatINR(linked)} of {formatINR(rowAmount)}
              </span>
            )}
          </div>
        </div>
      )}
      {createPortal(
        <Sheet open={picking} onClose={() => setPicking(false)} title={`Money in ${accountName}`}>
          {positions === null ? (
            <p className="py-6 text-center text-[13px] text-muted">Loading…</p>
          ) : (
            (() => {
              const list = here.filter((p) => p.available_paise - usedElsewhere(sourceKey(p.source_table, p.source_id), -1) > 0);
              if (!list.length)
                return <p className="py-6 text-center text-[13.5px] text-muted">No traced money is left in {accountName}. Link the income (or the transfer that brought money here) first.</p>;
              return (
                <div className="glass list-in divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">
                  {list.map((p) => (
                    <button key={sourceKey(p.source_table, p.source_id)} type="button" className="flex w-full items-center gap-3 px-3.5 py-3 text-left" onClick={() => add(p)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{p.title}</span>
                        <span className="block text-[13.5px]">
                          <span className="font-semibold text-income">{formatINR(p.available_paise)}</span>
                          <span className="text-muted"> available in {accountName}</span>
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {KIND_LABEL[p.source_table]}
                          {p.via_title ? ` · via ${p.via_title}` : ''}
                          {p.source_date ? ` · ${formatDate(p.source_date)}` : ''}
                        </span>
                      </span>
                      <Plus size={18} className="shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              );
            })()
          )}
        </Sheet>,
        document.body,
      )}
    </div>
  );
}
