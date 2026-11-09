// "This looks like a duplicate" — shown before saving a new entry. Never blocks: Save anyway saves as usual.
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { formatINR } from '../lib/money';
import { formatDate } from '../lib/dates';
import type { DuplicateCandidate } from '../lib/moneyTools';
import { Button, Sheet } from './ui';

export function DuplicateWarning({ list, onCancel, onSaveAnyway }: { list: DuplicateCandidate[] | null; onCancel: () => void; onSaveAnyway: () => void }) {
  const nav = useNavigate();
  return (
    <Sheet open={!!list} onClose={onCancel} title="Possible duplicate">
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-2xl p-3" style={{ background: 'var(--tone-amber-bg)' }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[13.5px]">A similar entry already exists. Check it before saving so the same money isn't counted twice.</p>
        </div>
        <div className="glass divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">
          {(list ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
              onClick={() => {
                onCancel();
                nav(`/r/${d.kind}/${d.id}`);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">{d.title}</span>
                <span className="block text-[12.5px] text-muted">
                  {formatDate(d.txn_date)} · {d.reasons.join(', ')}
                </span>
              </span>
              <span className="text-[14px] font-semibold">{formatINR(d.amount_paise)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button full onClick={onCancel}>
            Cancel
          </Button>
          <Button full variant="primary" onClick={onSaveAnyway}>
            Save anyway
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
