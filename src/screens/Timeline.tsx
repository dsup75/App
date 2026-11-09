// Full activity timeline with filters, search and older pages
import { ActivityTimeline } from '../components/ActivityTimeline';
import { Page } from '../components/ui';

export function TimelineScreen() {
  return (
    <Page title="Activity" subtitle="Everything you did, newest first" back>
      <ActivityTimeline />
    </Page>
  );
}
