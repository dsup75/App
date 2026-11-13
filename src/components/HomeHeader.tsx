// Home header: profile photo with glowing ring, greeting, and round action buttons
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Settings as Gear } from 'lucide-react';
import { useIconStore } from '../lib/icons';
import { IconPickerSheet } from './EntityIcon';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};

export function HomeHeader({ name, unread, onBell }: { name?: string; unread: number; onBell: () => void }) {
  const nav = useNavigate();
  const store = useIconStore();
  const [photoOpen, setPhotoOpen] = useState(false);
  const ic = store.get('profile', 'me');
  const up = ic?.kind === 'custom' ? store.upload(ic.custom_icon_id) : null;
  const url = up ? store.url(up.path) : null;
  const round = (label: string, onClick: () => void, child: ReactNode, badge?: number) => (
    <button type="button" aria-label={label} onClick={onClick} className="glass press relative flex h-11 w-11 items-center justify-center rounded-full">
      {child}
      {!!badge && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10.5px] font-bold text-white ring-2 ring-[var(--bg)]">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Profile photo" onClick={() => setPhotoOpen(true)} className="avatar-ring relative shrink-0 rounded-full p-[3px]">
        <span className="flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-full bg-[var(--solid)] text-[20px] font-bold text-primary">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (name || 'D').slice(0, 1).toUpperCase()}
        </span>
        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)] bg-[var(--tone-income)]" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-muted">
          {greeting()}
          {name ? `, ${name.split(' ')[0]}` : ''} 👋
        </p>
        <p className="truncate text-[21px] font-bold leading-tight tracking-tight">DeepBoost Life</p>
        <p className="truncate text-[11px] text-muted">Dream Big • Plan Smart • Achieve More</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {round('Search everything', () => nav('/search'), <Search size={18} />)}
        {round(unread ? `Notifications, ${unread} new` : 'Notifications', onBell, <Bell size={18} />, unread)}
        {round('Settings', () => nav('/settings'), <Gear size={18} />)}
      </div>
      <IconPickerSheet open={photoOpen} onClose={() => setPhotoOpen(false)} table="profile" id="me" title="Profile photo" />
    </div>
  );
}
