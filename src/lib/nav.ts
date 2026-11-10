// Safe "Back": if there is no earlier screen in this app session (e.g. opened from a notification),
// go Home instead of leaving the app's history (which showed a blank screen).
import type { NavigateFunction } from 'react-router-dom';

export function goBack(nav: NavigateFunction) {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) nav(-1);
  else nav('/', { replace: true });
}
