import { Capacitor } from '@capacitor/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeStyle = 'glass' | 'midnight' | 'clean';
export type Accent = 'green' | 'blue' | 'violet' | 'rose' | 'amber' | 'teal';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type ThemeId = 'signature' | 'dark' | 'light' | 'midnight' | 'pearl' | 'forest' | 'sunset' | 'mono' | 'custom';
export type ImageDisplay = 'theme' | 'original';

export interface ThemePrefs {
  theme: ThemeId;
  /** uploaded logos/icons: follow theme (grey in Black & White) or keep their colours */
  images: ImageDisplay;
  mode: ThemeMode;
  style: ThemeStyle;
  accent: Accent;
  text: TextSize;
  reduceEffects: boolean;
}

/** The 7 complete themes. `mode` = forced light/dark; undefined = follows the Light / dark setting. */
export const THEMES: { value: ThemeId; label: string; hint: string; mode?: 'light' | 'dark'; style: ThemeStyle; accent: Accent; swatch: [string, string, string] }[] = [
  { value: 'signature', label: 'Signature', hint: 'DeepBoost Signature — deep space navy, aurora glow, electric indigo to cyan', mode: 'dark', style: 'glass', accent: 'violet', swatch: ['#05070f', '#6d5bff', '#22d3ee'] },
  { value: 'dark', label: 'Dark', hint: 'Graphite dark with ocean blue', mode: 'dark', style: 'glass', accent: 'blue', swatch: ['#0d1117', '#1b2230', '#5b8cf0'] },
  { value: 'light', label: 'Light', hint: 'Bright, crisp and neutral', mode: 'light', style: 'glass', accent: 'blue', swatch: ['#f4f6f9', '#ffffff', '#2f6bd6'] },
  { value: 'midnight', label: 'Midnight', hint: 'True black for AMOLED, violet accent', mode: 'dark', style: 'midnight', accent: 'violet', swatch: ['#000000', '#121214', '#9b84ff'] },
  { value: 'pearl', label: 'Pearl', hint: 'Warm ivory with champagne gold', mode: 'light', style: 'glass', accent: 'amber', swatch: ['#f6f1ea', '#fffdf9', '#a67c46'] },
  { value: 'forest', label: 'Forest', hint: 'The DeepBoost green liquid glass', style: 'glass', accent: 'green', swatch: ['#eef3f0', '#2f7a5c', '#12392b'] },
  { value: 'sunset', label: 'Sunset', hint: 'Soft peach to plum, coral accent', mode: 'light', style: 'glass', accent: 'rose', swatch: ['#fff1ea', '#f2795b', '#6b2f5c'] },
  { value: 'mono', label: 'Black & White', hint: 'Pure monochrome — no colour anywhere', style: 'clean', accent: 'green', swatch: ['#ffffff', '#111111', '#808080'] },
];

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
const DEFAULTS: ThemePrefs = { theme: 'forest', images: 'theme', mode: 'system', style: 'glass', accent: 'green', text: 'md', reduceEffects: false };
const listeners = new Set<(p: ThemePrefs) => void>();

export function getThemePrefs(): ThemePrefs {
  try {
    const v = localStorage.getItem(KEY);
    if (v) {
      const saved = JSON.parse(v);
      // people who set up their look before themes existed keep exactly that look
      return { ...DEFAULTS, theme: 'custom', ...saved };
    }
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

/** Style + accent actually used (a theme preset decides them; "custom" uses the user's own picks). */
export function effective(p: ThemePrefs): { style: ThemeStyle; accent: Accent; forced?: 'light' | 'dark' } {
  const t = THEMES.find((x) => x.value === p.theme);
  if (!t) return { style: p.style, accent: p.accent, forced: p.style === 'midnight' ? 'dark' : undefined };
  return { style: t.style, accent: t.accent, forced: t.mode };
}

export function isDark(): boolean {
  const p = getThemePrefs();
  const e = effective(p);
  if (e.forced) return e.forced === 'dark';
  return p.mode === 'dark' || (p.mode === 'system' && mq().matches);
}

export async function applyTheme() {
  const p = getThemePrefs();
  const dark = isDark();
  const el = document.documentElement;
  const e = effective(p);
  el.classList.toggle('dark', dark);
  el.dataset.theme = p.theme;
  el.dataset.style = e.style;
  el.dataset.accent = e.accent;
  el.dataset.images = p.images;
  el.dataset.fx = p.reduceEffects ? 'reduced' : 'full';
  el.style.setProperty('--zoom', String(TEXT_SIZES.find((t) => t.value === p.text)?.zoom ?? 1));
  let color = dark ? '#0b110e' : '#eef3f0';
  try {
    color = getComputedStyle(el).getPropertyValue('--bg').trim() || color;
  } catch {
    /* ignore */
  }
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
