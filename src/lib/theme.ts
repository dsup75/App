import { Capacitor } from '@capacitor/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeStyle = 'glass' | 'midnight' | 'clean';
export type Accent = 'green' | 'blue' | 'violet' | 'rose' | 'amber' | 'teal';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ThemePrefs {
  mode: ThemeMode;
  style: ThemeStyle;
  accent: Accent;
  text: TextSize;
  reduceEffects: boolean;
}

export const STYLES: { value: ThemeStyle; label: string; hint: string }[] = [
  { value: 'glass', label: 'Liquid Glass', hint: 'Transparent glass cards (default)' },
  { value: 'midnight', label: 'Midnight', hint: 'Deep black, always dark — saves battery on AMOLED' },
  { value: 'clean', label: 'Clean', hint: 'Solid cards, no blur — easiest to read' },
];

export const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'green', label: 'Forest', color: '#2f7a5c' },
  { value: 'blue', label: 'Ocean', color: '#2f6bd6' },
  { value: 'violet', label: 'Violet', color: '#7457d6' },
  { value: 'rose', label: 'Rose', color: '#d0466f' },
  { value: 'amber', label: 'Amber', color: '#c9730f' },
  { value: 'teal', label: 'Teal', color: '#148a86' },
];

export const TEXT_SIZES: { value: TextSize; label: string; zoom: number }[] = [
  { value: 'sm', label: 'Small', zoom: 0.92 },
  { value: 'md', label: 'Normal', zoom: 1 },
  { value: 'lg', label: 'Large', zoom: 1.1 },
  { value: 'xl', label: 'Extra large', zoom: 1.2 },
];

const KEY = 'theme-prefs';
const OLD_KEY = 'theme-mode';
const DEFAULTS: ThemePrefs = { mode: 'system', style: 'glass', accent: 'green', text: 'md', reduceEffects: false };
const listeners = new Set<(p: ThemePrefs) => void>();

export function getThemePrefs(): ThemePrefs {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return { ...DEFAULTS, ...JSON.parse(v) };
    const old = localStorage.getItem(OLD_KEY);
    if (old === 'light' || old === 'dark' || old === 'system') return { ...DEFAULTS, mode: old };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function setThemePrefs(patch: Partial<ThemePrefs>) {
  const next = { ...getThemePrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((l) => l(next));
}

export function onThemeChange(fn: (p: ThemePrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* kept for older callers */
export function getThemeMode(): ThemeMode {
  return getThemePrefs().mode;
}
export function setThemeMode(mode: ThemeMode) {
  setThemePrefs({ mode });
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function isDark(): boolean {
  const p = getThemePrefs();
  if (p.style === 'midnight') return true;
  return p.mode === 'dark' || (p.mode === 'system' && mq().matches);
}

export async function applyTheme() {
  const p = getThemePrefs();
  const dark = isDark();
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  el.dataset.style = p.style;
  el.dataset.accent = p.accent;
  el.dataset.fx = p.reduceEffects ? 'reduced' : 'full';
  el.style.setProperty('--zoom', String(TEXT_SIZES.find((t) => t.value === p.text)?.zoom ?? 1));
  const color = p.style === 'midnight' ? '#000000' : dark ? '#0b110e' : '#eef3f0';
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
  const handler = () => getThemePrefs().mode === 'system' && applyTheme();
  m.addEventListener?.('change', handler);
  return () => m.removeEventListener?.('change', handler);
}
