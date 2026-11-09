// The app blocker was removed: Google Play Protect blocks installing downloaded APKs that use the
// permissions a real blocker needs. This screen keeps the history of earlier focus sessions.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer } from 'lucide-react';
import { fetchFocusStats, type FocusStats } from '../lib/focusGuard';
import { Badge, Button, Card, List, ListRow, Page, SectionTitle } from '../components/ui';

export function FocusModeScreen() {
  const nav = useNavigate();
  const [stats, setStats] = useState<FocusStats | null>(null);
  useEffect(() => {
    fetchFocusStats().then(setStats);
  }, []);
  return (
    <Page title="Focus" subtitle="Focus timer & history" back>
      <Card className="space-y-2">
        <p className="text-[14.5px] font-semibold">App blocker is turned off</p>
        <p className="text-[13px] text-muted">
          Blocking other apps needs special Android permissions, and Google Play Protect stops installing the app when it asks for them. So DeepBoost Life no longer blocks apps. The focus timer, study logging, revision and screen time all still work.
        </p>
        <Button full variant="primary" onClick={() => nav('/pomodoro')}>
          <Timer size={14} /> Open focus timer
        </Button>
      </Card>
      {stats && stats.recent.length > 0 && (
        <>
          <SectionTitle>Earlier sessions</SectionTitle>
          <List>
            {stats.recent.map((r) => (
              <ListRow
                key={r.started_at}
                title={`${r.focused_minutes} of ${r.planned_minutes} min`}
                subtitle={new Date(r.started_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                right={<Badge tone="muted">{r.end_reason.replace('_', ' ')}</Badge>}
              />
            ))}
          </List>
        </>
      )}
    </Page>
  );
}
