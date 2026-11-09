// Chapter detail: revision plan + history (Smart revision)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { FEEDBACK_LABEL, fetchChapterRevisions, startRevisionPlan, type RevisionRow } from '../lib/revisions';
import { friendlyError } from '../lib/db';
import { formatDate, relativeDay } from '../lib/dates';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card } from './ui';

export function ChapterRevisions({ chapterId, reloadKey }: { chapterId: string; reloadKey: number }) {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const load = () => fetchChapterRevisions(chapterId).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [chapterId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return null;
  const pending = rows.find((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  const plan = async () => {
    try {
      await startRevisionPlan(chapterId);
      toast('Revision planned');
      load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <RotateCcw size={16} className="text-primary" />
        <p className="min-w-0 flex-1 text-[14px] font-semibold">Revision</p>
        {pending ? (
          <Button size="sm" onClick={() => nav('/revisions')}>
            Next: {relativeDay(pending.due_date)}
          </Button>
        ) : (
          <Button size="sm" onClick={plan}>
            Plan revision
          </Button>
        )}
      </div>
      {done.length === 0 ? (
        <p className="text-[12.5px] text-muted">No revisions done yet. Mastery is never assumed — it comes from your feedback after each revision.</p>
      ) : (
        <div className="space-y-1.5">
          {done.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 text-muted">
                Revision {r.step} · {formatDate(r.done_at ? r.done_at.slice(0, 10) : r.due_date)}
              </span>
              <Badge tone={r.feedback === 'easy' ? 'primary' : r.feedback === 'difficult' ? 'danger' : r.status === 'skipped' ? 'muted' : 'amber'}>
                {r.feedback ? FEEDBACK_LABEL[r.feedback] : 'Skipped'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
