import { Capacitor } from '@capacitor/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'theme-mode';

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme();
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function isDark(): boolean {
  const mode = getThemeMode();
  return mode === 'dark' || (mode === 'system' && mq().matches);
}

export async function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle('dark', dark);
  const color = dark ? '#0B1220' : '#F2F4F7';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  if (Capacitor.isNativePlatform()) {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color });
    } catch {
      /* ignore */
    }
  }
}

export function watchSystemTheme() {
  const m = mq();
  const handler = () => getThemeMode() === 'system' && applyTheme();
  m.addEventListener?.('change', handler);
  return () => m.removeEventListener?.('change', handler);
}
