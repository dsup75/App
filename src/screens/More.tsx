import { useNavigate } from 'react-router-dom';
import {
  ListTodo, Receipt, HandCoins, Users, PiggyBank, TrendingUp, Bot, Settings, Trash2, CalendarDays,
} from 'lucide-react';
import { Badge, IconBubble, List, ListRow, Page, SectionTitle } from '../components/ui';

export function More() {
  const nav = useNavigate();
  const soon = (phase: number) => <Badge>Phase {phase}</Badge>;
  return (
    <Page title="More">
      <SectionTitle>Daily life</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="blue"><ListTodo size={18} /></IconBubble>} title="Tasks" onClick={() => nav('/tasks')} chevron />
        <ListRow icon={<IconBubble tone="violet"><CalendarDays size={18} /></IconBubble>} title="Habits, routine & calendar" right={soon(3)} disabled />
      </List>

      <SectionTitle>Money</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="primary"><Receipt size={18} /></IconBubble>} title="Invoices" right={soon(2)} disabled />
        <ListRow icon={<IconBubble tone="amber"><HandCoins size={18} /></IconBubble>} title="Udhaar & Loans" right={soon(2)} disabled />
        <ListRow icon={<IconBubble tone="violet"><Users size={18} /></IconBubble>} title="Groups & Split" right={soon(2)} disabled />
        <ListRow icon={<IconBubble tone="income"><PiggyBank size={18} /></IconBubble>} title="Savings goals" right={soon(2)} disabled />
      </List>

      <SectionTitle>Insights</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="blue"><TrendingUp size={18} /></IconBubble>} title="Reports & export" right={soon(4)} disabled />
        <ListRow icon={<IconBubble tone="violet"><Bot size={18} /></IconBubble>} title="AI Assistant" right={soon(4)} disabled />
      </List>

      <SectionTitle>App</SectionTitle>
      <List>
        <ListRow icon={<IconBubble tone="muted"><Settings size={18} /></IconBubble>} title="Settings" onClick={() => nav('/settings')} chevron />
        <ListRow icon={<IconBubble tone="expense"><Trash2 size={18} /></IconBubble>} title="Recycle Bin" onClick={() => nav('/recycle')} chevron />
      </List>
    </Page>
  );
}

export function ComingSoon({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <Page title={title}>
      <div className="glass rounded-[26px] p-5">
        <Badge tone="primary">Coming in Phase {phase}</Badge>
        <p className="mt-3 text-[15px]">This section is planned and not built yet. It will include:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
