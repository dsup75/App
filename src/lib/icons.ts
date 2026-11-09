// Universal custom icons: built-in library (Lucide) + your own uploaded icons/logos.
// Uploaded images are re-drawn on a canvas into a 256×256 PNG (SVGs too), so no script or
// hidden content from the original file is ever stored. Files are private to your account.
import { useEffect, useState } from 'react';
import {
  Wallet, Landmark, CreditCard, PiggyBank, Coins, Banknote, Receipt, HandCoins, TrendingUp, TrendingDown, ChartPie, Calculator, Percent, BadgeIndianRupee,
  ShoppingBag, ShoppingCart, Store, Gift, Tag, Ticket, Car, Bus, Bike, Fuel, Plane, TrainFront, MapPin, Hotel, Utensils, Coffee, Pizza, Apple, Soup,
  House, Lightbulb, Plug, Droplets, Wifi, Smartphone, Laptop, Tv, Gamepad2, Headphones, Watch, Camera, Printer, Monitor, Router,
  BookOpen, Book, Library, GraduationCap, School, PenTool, Pencil, NotebookPen, Atom, FlaskConical, Microscope, Dna, Sigma, Pi, Ruler, Compass, Globe, Languages, Brain, Lightbulb as Idea,
  HeartPulse, Heart, Activity, Dumbbell, Footprints, Bed, Moon, Pill, Stethoscope, Salad, Scale, Bike as Cycle, Trophy, Medal, Flame,
  Briefcase, Building2, Users, User, UserRound, Handshake, Megaphone, Target, Rocket, Presentation, FileText, Folder, Mail, Phone, MessageCircle, Send, Share2,
  ListTodo, SquareCheckBig, ClipboardList, Calendar, CalendarDays, Clock, Timer, AlarmClock, Bell, Star, Bookmark, Flag, Pin, Zap, Sparkles, Leaf, Sun, Cloud,
  Music, Film, Palette, Brush, Image, Video, Mic, Code, Terminal, Database, Server, Shield, Lock, Key, Settings, Wrench, Hammer,
  Baby, Dog, Cat, Shirt, Scissors, Sofa, Trees, Mountain, Waves, Umbrella, Church, Package, Truck, Ship,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from './supabase';

export const ICON_GROUPS: { label: string; icons: Record<string, LucideIcon> }[] = [
  { label: 'Finance', icons: { Wallet, Coins, Banknote, Receipt, HandCoins, TrendingUp, TrendingDown, ChartPie, Calculator, Percent, BadgeIndianRupee, PiggyBank } },
  { label: 'Banking', icons: { Landmark, CreditCard, Building2, Shield, Lock, Key } },
  { label: 'Study', icons: { BookOpen, Book, Library, GraduationCap, School, PenTool, Pencil, NotebookPen, Languages, Brain, Idea } },
  { label: 'Science & maths', icons: { Atom, FlaskConical, Microscope, Dna, Sigma, Pi, Ruler, Compass, Globe, Calculator } },
  { label: 'Health & fitness', icons: { HeartPulse, Heart, Activity, Dumbbell, Footprints, Bed, Moon, Pill, Stethoscope, Salad, Scale, Cycle, Trophy, Medal, Flame } },
  { label: 'Devices', icons: { Smartphone, Laptop, Tv, Gamepad2, Headphones, Watch, Camera, Printer, Monitor, Router, Wifi, Plug } },
  { label: 'Business', icons: { Briefcase, Building2, Users, User, UserRound, Handshake, Megaphone, Target, Rocket, Presentation, FileText, Folder, Store } },
  { label: 'Tasks & productivity', icons: { ListTodo, SquareCheckBig, ClipboardList, Clock, Timer, AlarmClock, Bell, Star, Bookmark, Flag, Pin, Zap, Sparkles } },
  { label: 'Calendar', icons: { Calendar, CalendarDays, Clock, AlarmClock } },
  { label: 'Travel & transport', icons: { Car, Bus, Bike, Fuel, Plane, TrainFront, MapPin, Hotel, Ship, Truck } },
  { label: 'Shopping & food', icons: { ShoppingBag, ShoppingCart, Gift, Tag, Ticket, Utensils, Coffee, Pizza, Apple, Soup, Package, Shirt } },
  { label: 'Communication', icons: { Mail, Phone, MessageCircle, Send, Share2, Megaphone } },
  { label: 'Home & life', icons: { House, Lightbulb, Droplets, Sofa, Baby, Dog, Cat, Scissors, Trees, Mountain, Waves, Umbrella, Church, Leaf, Sun, Cloud } },
  { label: 'Creative & tech', icons: { Music, Film, Palette, Brush, Image, Video, Mic, Code, Terminal, Database, Server, Settings, Wrench, Hammer } },
];

export const LIBRARY: Record<string, LucideIcon> = Object.assign({}, ...ICON_GROUPS.map((g) => g.icons));

export const ICON_TONES = ['primary', 'blue', 'violet', 'pink', 'amber', 'teal', 'income', 'expense', 'muted', 'none'] as const;
export type IconTone = (typeof ICON_TONES)[number];

export interface EntityIconRow {
  entity_table: string;
  entity_id: string;
  kind: 'library' | 'custom';
  library_name: string | null;
  custom_icon_id: string | null;
  tone: IconTone | null;
  fit: 'contain' | 'cover';
}
export interface CustomIcon {
  id: string;
  path: string;
  name: string | null;
  mime: string;
  size_bytes: number;
  keep_colors: boolean;
  created_at: string;
}

/* ---------- shared cache ---------- */
const BUCKET = 'icons';
let icons = new Map<string, EntityIconRow>(); // "table:id"
let uploads = new Map<string, CustomIcon>();
const urls = new Map<string, { url: string; until: number }>();
let loaded: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const iconKey = (table: string, id: string) => `${table}:${id}`;

async function signUrls(paths: string[]) {
  const need = paths.filter((p) => !urls.has(p) || urls.get(p)!.until < Date.now() + 60000);
  if (!need.length) return;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 86400);
  for (const d of data ?? []) if (d.signedUrl && d.path) urls.set(d.path, { url: d.signedUrl, until: Date.now() + 86400 * 1000 });
}

export function loadIcons(force = false): Promise<void> {
  if (loaded && !force) return loaded;
  loaded = (async () => {
    const [e, c] = await Promise.all([
      supabase.from('entity_icons').select('entity_table,entity_id,kind,library_name,custom_icon_id,tone,fit'),
      supabase.from('custom_icons').select('id,path,name,mime,size_bytes,keep_colors,created_at').is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    if (e.error || c.error) {
      loaded = null; // table may not exist yet on an old database — try again later
      return;
    }
    icons = new Map((e.data as EntityIconRow[]).map((r) => [iconKey(r.entity_table, r.entity_id), r]));
    uploads = new Map((c.data as CustomIcon[]).map((r) => [r.id, r]));
    await signUrls([...uploads.values()].map((u) => u.path)).catch(() => {});
    emit();
  })();
  return loaded;
}

export function useIconStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    subs.add(f);
    loadIcons().catch(() => {});
    return () => {
      subs.delete(f);
    };
  }, []);
  return {
    get: (table: string, id: string) => icons.get(iconKey(table, id)) ?? null,
    upload: (id: string | null) => (id ? uploads.get(id) ?? null : null),
    url: (path: string) => urls.get(path)?.url ?? null,
    uploads: () => [...uploads.values()],
    usageOf: (customId: string) => [...icons.values()].filter((r) => r.custom_icon_id === customId).length,
  };
}

/* ---------- image processing ---------- */
const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('This image could not be opened.'));
    img.src = src;
  });
}

/** Turns any PNG/JPG/WebP/SVG into a clean 256×256 PNG. SVGs are only drawn as a picture (scripts never run). */
export async function prepareIcon(file: File, fit: 'contain' | 'cover', zoom = 1): Promise<Blob> {
  const type = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '');
  if (!OK_TYPES.includes(type)) throw new Error('Use a PNG, JPG, WebP or SVG image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image is too big (max 5 MB).');
  let src: string;
  if (type === 'image/svg+xml') {
    const text = await file.text();
    if (!/<svg[\s>]/i.test(text)) throw new Error('This SVG file is not valid.');
    // strip anything active before drawing; an <img> never runs SVG scripts anyway
    const clean = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/(href|xlink:href)\s*=\s*("|')\s*(javascript:|https?:)[^"']*\2/gi, '');
    src = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
  } else {
    src = URL.createObjectURL(file);
  }
  try {
    const img = await loadImage(src);
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Could not process the image.');
    const w = img.naturalWidth || S;
    const h = img.naturalHeight || S;
    const scale = (fit === 'cover' ? Math.max(S / w, S / h) : Math.min(S / w, S / h)) * zoom;
    const dw = w * scale;
    const dh = h * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not process the image.');
    if (blob.size > 512 * 1024) throw new Error('Processed icon is too big.');
    return blob;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function uploadIcon(blob: Blob, name: string | null, keepColors: boolean): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Please sign in again.');
  const path = `${uid}/${crypto.randomUUID()}.png`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from('custom_icons')
    .insert({ path, name: name?.slice(0, 60) || null, mime: 'image/png', size_bytes: blob.size, keep_colors: keepColors })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  await loadIcons(true);
  return data.id as string;
}

export async function setEntityIcon(table: string, id: string, v: Omit<EntityIconRow, 'entity_table' | 'entity_id'>) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('entity_icons')
    .upsert({ user_id: u.user?.id, entity_table: table, entity_id: id, ...v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,entity_table,entity_id' });
  if (error) throw error;
  await loadIcons(true);
}

export async function clearEntityIcon(table: string, id: string) {
  const { error } = await supabase.from('entity_icons').delete().eq('entity_table', table).eq('entity_id', id);
  if (error) throw error;
  await loadIcons(true);
}

export async function setKeepColors(customId: string, keep: boolean) {
  const { error } = await supabase.from('custom_icons').update({ keep_colors: keep }).eq('id', customId);
  if (error) throw error;
  await loadIcons(true);
}

/** Deletes an uploaded icon only when no record uses it. */
export async function deleteCustomIcon(customId: string) {
  const { count } = await supabase.from('entity_icons').select('entity_id', { count: 'exact', head: true }).eq('custom_icon_id', customId);
  if ((count ?? 0) > 0) throw new Error('This icon is still used. Remove it from those items first.');
  const row = uploads.get(customId);
  const { error } = await supabase.from('custom_icons').update({ deleted_at: new Date().toISOString() }).eq('id', customId);
  if (error) throw error;
  if (row) await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});
  await loadIcons(true);
}

/** Records that can have their own icon (lists where an icon helps, not every transaction). */
export const ICONABLE = new Set([
  'categories', 'custom_options', 'accounts', 'savings_goals', 'budgets', 'recurring_rules', 'groups', 'clients', 'projects', 'campaigns',
  'subjects', 'chapters', 'exams', 'habits', 'events', 'notes', 'tasks', 'shopping_items', 'gadgets',
]);

/* ---------- backup helpers ---------- */
export async function exportIconFiles(): Promise<Record<string, string>> {
  await loadIcons(true);
  const out: Record<string, string> = {};
  for (const u of uploads.values()) {
    const { data } = await supabase.storage.from(BUCKET).download(u.path);
    if (!data) continue;
    const buf = new Uint8Array(await data.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    out[u.path] = btoa(bin);
  }
  return out;
}

/** Uploads icon files from a backup that are missing in Storage (same account). */
export async function importIconFiles(files: Record<string, string>, uid: string): Promise<number> {
  let n = 0;
  for (const [path, b64] of Object.entries(files)) {
    if (!path.startsWith(`${uid}/`) || !/^[0-9a-f-]+\/[0-9a-f-]+\.png$/i.test(path)) continue;
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    if (buf.length > 512 * 1024) continue;
    const up = await supabase.storage.from(BUCKET).upload(path, new Blob([buf], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
    if (!up.error) n++;
  }
  return n;
}
