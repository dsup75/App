import { Capacitor } from '@capacitor/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeStyle = 'glass' | 'midnight' | 'clean';
export type Accent = 'green' | 'blue' | 'violet' | 'rose' | 'amber' | 'teal';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type ThemeId = 'nebula' | 'lumina' | 'signature' | 'dark' | 'light' | 'midnight' | 'pearl' | 'forest' | 'sunset' | 'mono' | 'custom';
export type ImageDisplay = 'theme' | 'original';

/** Custom theme: your own colours (any hex). Empty = derived automatically. */
export interface CustomColors {
  bg?: string;
  card?: string;
  primary?: string;
  text?: string;
  hero?: string;
  glow?: boolean;
}

export interface ThemePrefs {
  theme: ThemeId;
  custom?: CustomColors;
  /** uploaded logos/icons: follow theme (grey in Black & White) or keep their colours */
  images: ImageDisplay;
  mode: ThemeMode;
  style: ThemeStyle;
  accent: Accent;
  text: TextSize;
  reduceEffects: boolean;
}

/** 7 ready themes + Custom = 8. `mode` = forced light/dark; undefined = follows the Light / dark setting. */
export const THEMES: { value: ThemeId; label: string; hint: string; mode?: 'light' | 'dark'; style: ThemeStyle; accent: Accent; swatch: [string, string, string] }[] = [
  { value: 'nebula', label: 'Nebula', hint: 'Deep navy space, neon-blue glass, glowing edges and real-looking icons — like your reference design', mode: 'dark', style: 'glass', accent: 'blue', swatch: ['#040818', '#102463', '#4c8dff'] },
  { value: 'signature', label: 'Signature', hint: 'DeepBoost Signature — deep space navy, aurora glow, electric indigo to cyan', mode: 'dark', style: 'glass', accent: 'violet', swatch: ['#05070f', '#6d5bff', '#22d3ee'] },
  { value: 'lumina', label: 'Lumina', hint: 'Frosted lavender glass, indigo buttons and real app logos — bright and premium', mode: 'light', style: 'glass', accent: 'violet', swatch: ['#f3f2fb', '#ffffff', '#5b5cf0'] },
  { value: 'light', label: 'Classic', hint: 'Bright, crisp and neutral — easy to read in sunlight', mode: 'light', style: 'glass', accent: 'blue', swatch: ['#f4f6f9', '#ffffff', '#2f6bd6'] },
  { value: 'midnight', label: 'Midnight', hint: 'True black for AMOLED screens, violet accent — saves battery', mode: 'dark', style: 'midnight', accent: 'violet', swatch: ['#000000', '#121214', '#9b84ff'] },
  { value: 'pearl', label: 'Pearl', hint: 'Warm ivory with champagne gold — calm and elegant', mode: 'light', style: 'glass', accent: 'amber', swatch: ['#f6f1ea', '#fffdf9', '#a67c46'] },
  { value: 'mono', label: 'Black & White', hint: 'Pure monochrome — no colour anywhere', style: 'clean', accent: 'green', swatch: ['#ffffff', '#111111', '#808080'] },
];

/** themes that were removed → the closest one that is still here */
const RETIRED: Partial<Record<ThemeId, ThemeId>> = { dark: 'midnight', forest: 'light', sunset: 'pearl' };

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
const DEFAULTS: ThemePrefs = { theme: 'nebula', images: 'theme', mode: 'system', style: 'glass', accent: 'blue', text: 'md', reduceEffects: false };
const listeners = new Set<(p: ThemePrefs) => void>();

export function getThemePrefs(): ThemePrefs {
  try {
    const v = localStorage.getItem(KEY);
    if (v) {
      const saved = JSON.parse(v);
      // people who set up their look before themes existed keep exactly that look
      const out: ThemePrefs = { ...DEFAULTS, theme: 'custom', ...saved };
      if (RETIRED[out.theme]) out.theme = RETIRED[out.theme]!;
      return out;
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
  if (!t) {
    // custom: a chosen background decides light or dark by itself
    const bg = p.custom?.bg ? hexRgb(p.custom.bg) : null;
    const forced = bg ? (lightness(bg) < 0.5 ? 'dark' : 'light') : p.style === 'midnight' ? 'dark' : undefined;
    return { style: p.style, accent: p.accent, forced };
  }
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
  applyCustomColors(el, p.theme === 'custom' ? p.custom : undefined, dark);
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

/* ---------------- Custom theme colours ---------------- */
const CUSTOM_VARS = [
  '--bg', '--card', '--card-2', '--solid', '--text', '--muted', '--hairline', '--edge', '--field', '--nav', '--sheet',
  '--primary', '--primary-2', '--primary-soft', '--acc', '--hero-1', '--hero-2', '--on-primary', '--blob1', '--blob2', '--logo-1', '--logo-2',
];

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
const toHex = (c: [number, number, number]) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
/** perceived brightness 0..1 */
export const lightness = (c: [number, number, number]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/** Your own colours on top of the light / dark base. Everything else (lines, fields, sheets) is worked out to match. */
function applyCustomColors(el: HTMLElement, c: CustomColors | undefined, dark: boolean) {
  CUSTOM_VARS.forEach((v) => el.style.removeProperty(v));
  if (!c) return;
  const set = (k: string, v: string) => el.style.setProperty(k, v);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const bg = c.bg ? hexRgb(c.bg) : null;
  const text = c.text ? hexRgb(c.text) : bg ? (lightness(bg) < 0.5 ? [242, 245, 255] as [number, number, number] : [17, 20, 28] as [number, number, number]) : null;
  const isDarkBg = bg ? lightness(bg) < 0.5 : dark;
  if (bg) {
    set('--bg', toHex(bg));
    set('--solid', toHex(mix(bg, isDarkBg ? white : white, isDarkBg ? 0.07 : 0.85)));
    set('--nav', rgba(mix(bg, isDarkBg ? black : white, 0.2), 0.86));
    set('--sheet', rgba(mix(bg, isDarkBg ? white : white, isDarkBg ? 0.04 : 0.9), 0.98));
    set('--field', isDarkBg ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.045)');
    set('--hairline', isDarkBg ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.08)');
    set('--edge', isDarkBg ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.7)');
    set('--card-2', isDarkBg ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)');
    if (!c.card) set('--card', isDarkBg ? rgba(mix(bg, white, 0.08), 0.72) : 'rgba(255, 255, 255, 0.78)');
  }
  const card = c.card ? hexRgb(c.card) : null;
  if (card) {
    set('--card', rgba(card, 0.86));
    set('--solid', toHex(card));
  }
  if (text) {
    set('--text', toHex(text));
    set('--muted', rgba(text, 0.62));
  }
  const pr = c.primary ? hexRgb(c.primary) : null;
  if (pr) {
    set('--primary', toHex(isDarkBg ? mix(pr, white, 0.25) : pr));
    set('--primary-2', toHex(pr));
    set('--primary-soft', rgba(pr, 0.16));
    set('--acc', `${pr[0]}, ${pr[1]}, ${pr[2]}`);
    set('--on-primary', lightness(pr) > 0.62 ? '#111111' : '#ffffff');
    set('--logo-1', toHex(pr));
    set('--logo-2', toHex(mix(pr, black, 0.35)));
    if (c.glow !== false) {
      set('--blob1', rgba(pr, isDarkBg ? 0.38 : 0.22));
      set('--blob2', rgba(mix(pr, [168, 85, 247], 0.5), isDarkBg ? 0.22 : 0.14));
    } else {
      set('--blob1', 'transparent');
      set('--blob2', 'transparent');
    }
  }
  const hero = c.hero ? hexRgb(c.hero) : pr;
  if (hero) {
    set('--hero-1', toHex(hero));
    set('--hero-2', toHex(mix(hero, black, 0.55)));
  }
}
