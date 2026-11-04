import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Copy, CircleCheck, Ban, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { friendlyError, updateRecord, type Row } from '../lib/db';
import { copyText, qrDataUrl, requestMessage, shareText, upiLink } from '../lib/upi';
import { formatDate } from '../lib/dates';
import { MoneyRow } from './MoneyRow';
import { useLookups } from '../lib/useLookups';
import { Badge, Button, Card, Confirm, List, SectionTitle } from './ui';

/** Extra panel on a Payment Request's detail screen: QR, share, mark paid. */
export function RequestPanel({ row, nameOf, onChanged }: { row: Row; nameOf: (id: string) => string; onChanged: () => void }) {
  const { settings } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [payments, setPayments] = useState<Row[]>([]);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const { accounts } = useLookups();
  const acc = accounts.find((a) => a.id === row.account_id);
  const upiId = acc?.upi_id || settings?.upi_id || '';
  const upiName = settings?.upi_name || settings?.full_name || '';
  const link = upiId ? upiLink({ upiId, name: upiName, amountPaise: row.amount_paise, note: row.note || row.title }) : '';

  useEffect(() => {
    if (link) qrDataUrl(link).then(setQr).catch(() => setQr(''));
  }, [link]);

  useEffect(() => {
    supabase
      .from('incomes')
      .select('*')
      .eq('payment_request_id', row.id)
      .is('deleted_at', null)
      .order('txn_date', { ascending: false })
      .then(({ data }) => setPayments((data as Row[]) ?? []));
  }, [row.id, row.status]);

  const message = link
    ? requestMessage({
        clientName: row.client_name,
        title: row.title,
        amountPaise: row.amount_paise,
        upiId,
        name: upiName,
        dueDate: row.due_date ? formatDate(row.due_date) : null,
        link,
      })
    : '';

  const share = async () => {
    try {
      const r = await shareText('Payment request', message);
      if (r === 'copied') toast('Message copied');
    } catch {
      /* user closed the share sheet */
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await updateRecord('payment_requests', row.id, { status: 'cancelled' });
      toast('Request cancelled');
      onChanged();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
      setCancel(false);
    }
  };

  if (row.deleted_at) return null;

  return (
    <>
      <Card className="text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Badge tone={row.status === 'paid' ? 'primary' : row.status === 'cancelled' ? 'muted' : 'amber'}>
            {row.status === 'paid' ? 'Paid' : row.status === 'cancelled' ? 'Cancelled' : 'Waiting for payment'}
          </Badge>
        </div>
        {!upiId ? (
          <div className="space-y-3 py-2">
            <QrCode className="mx-auto text-muted" />
            <p className="text-[14px] text-muted">Add a UPI ID to the chosen account (Finance → Accounts) or in Settings to create a QR code and payment link.</p>
            <Button size="sm" onClick={() => nav('/settings')}>Open Settings</Button>
          </div>
        ) : row.status === 'pending' ? (
          <>
            {qr && <img src={qr} alt="UPI QR code" className="mx-auto w-56 rounded-2xl bg-white p-2" />}
            <p className="mt-2 text-[13px] text-muted">
              Scan with any UPI app · pays {upiId}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={share}>
                <Share2 size={16} /> Share
              </Button>
              <Button
                onClick={() =>
                  copyText(message)
                    .then(() => toast('Message copied'))
                    .catch(() => toast('Could not copy', 'error'))
                }
              >
                <Copy size={16} /> Copy
              </Button>
            </div>
          </>
        ) : null}

        {row.status === 'pending' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button onClick={() => nav(`/r/incomes/new?from_request=${row.id}`)}>
              <CircleCheck size={16} /> Mark as paid
            </Button>
            <Button onClick={() => setCancel(true)}>
              <Ban size={16} /> Cancel
            </Button>
          </div>
        )}
        {row.status === 'cancelled' && (
          <Button
            size="sm"
            className="mt-1"
            onClick={() => updateRecord('payment_requests', row.id, { status: 'pending' }).then(onChanged).catch((e) => toast(friendlyError(e), 'error'))}
          >
            Reopen request
          </Button>
        )}
      </Card>

      {payments.length > 0 && (
        <>
          <SectionTitle>Payments received</SectionTitle>
          <List>
            {payments.map((p) => (
              <MoneyRow key={p.id} kind="incomes" row={p} nameOf={nameOf} />
            ))}
          </List>
        </>
      )}

      <Confirm
        open={cancel}
        title="Cancel this request?"
        message="It will be marked as cancelled. You can reopen it later."
        confirmLabel="Cancel request"
        danger
        loading={busy}
        onConfirm={doCancel}
        onClose={() => setCancel(false)}
      />
    </>
  );
}
