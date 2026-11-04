import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, QrCode } from 'lucide-react';
import { fetchActive, friendlyError, type Row } from '../lib/db';
import { formatINR, sumPaise } from '../lib/money';
import { relativeDay, todayISO } from '../lib/dates';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Empty, ErrorBox, IconBubble, IconButton, List, ListRow, Page, Segmented, Spinner } from '../components/ui';

type View = 'pending' | 'paid' | 'all';

export function Requests() {
  const nav = useNavigate();
  const { settings } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('pending');
  const today = todayISO();

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await fetchActive('payment_requests'));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => (rows ?? []).filter((r) => view === 'all' || r.status === view), [rows, view]);
  const pendingTotal = sumPaise((rows ?? []).filter((r) => r.status === 'pending'));

  return (
    <Page
      title="Payment Requests"
      back
      right={
        <IconButton label="New request" onClick={() => nav('/r/payment_requests/new')}>
          <Plus size={20} />
        </IconButton>
      }
    >
      {!settings?.upi_id && (
        <Card className="flex items-center gap-3">
          <QrCode className="shrink-0 text-muted" />
          <p className="flex-1 text-[13px] text-muted">Add your UPI ID in Settings to share QR codes and payment links.</p>
          <Button size="sm" onClick={() => nav('/settings')}>Add</Button>
        </Card>
      )}
      <Card>
        <p className="text-[13px] text-muted">Waiting to receive</p>
        <p className="text-[30px] font-bold tracking-tight">{formatINR(pendingTotal)}</p>
      </Card>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' },
          { value: 'all', label: 'All' },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="No requests" text="Create one and share the UPI QR with your client." />
      ) : (
        <List>
          {list.map((r) => {
            const overdue = r.status === 'pending' && r.due_date && r.due_date < today;
            return (
              <ListRow
                key={r.id}
                icon={<IconBubble tone="income"><QrCode size={17} /></IconBubble>}
                title={r.client_name ? `${r.client_name} · ${r.title}` : r.title}
                subtitle={
                  r.status === 'pending'
                    ? r.due_date
                      ? `${overdue ? 'Overdue · ' : 'Due '}${relativeDay(r.due_date)}`
                      : 'Pending'
                    : r.status === 'paid'
                      ? 'Paid'
                      : 'Cancelled'
                }
                right={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-semibold">{formatINR(r.amount_paise)}</span>
                    {overdue && <Badge tone="danger">Overdue</Badge>}
                  </div>
                }
                onClick={() => nav(`/r/payment_requests/${r.id}`)}
              />
            );
          })}
        </List>
      )}
    </Page>
  );
}
