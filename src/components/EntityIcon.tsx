// Shows a record's own icon (library or uploaded) — or the default one — and the picker to change it.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, Upload, RotateCcw, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ICON_GROUPS, ICON_TONES, LIBRARY, clearEntityIcon, deleteCustomIcon, prepareIcon, setEntityIcon, setKeepColors, uploadIcon, useIconStore, type IconTone,
} from '../lib/icons';
import { friendlyError } from '../lib/db';
import { useToast } from '../context/ToastContext';
import { Button, IconBubble, Segmented, Sheet, TONES, Toggle, cx, type Tone } from './ui';

export function EntityIcon({
  table, id, fallback: Fallback, fallbackTone = 'primary', size = 36,
}: { table: string; id: string; fallback: LucideIcon; fallbackTone?: Tone; size?: number }) {
  const store = useIconStore();
  const row = store.get(table, id);
  const inner = Math.round(size * 0.47);
  if (row?.kind === 'custom') {
    const up = store.upload(row.custom_icon_id);
    const url = up ? store.url(up.path) : null;
    if (url) {
      const tone = row.tone && row.tone !== 'none' ? TONES[row.tone as Tone] : null;
      return (
        <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-[11px]" style={{ width: size, height: size, background: tone ? tone.bg : 'var(--card-2)' }}>
          <img
            src={url}
            alt=""
            className={cx(up?.keep_colors ? '' : 'themed-img')}
            style={{ width: row.fit === 'cover' ? size : size * 0.78, height: row.fit === 'cover' ? size : size * 0.78, objectFit: row.fit === 'cover' ? 'cover' : 'contain' }}
          />
        </div>
      );
    }
  }
  if (row?.kind === 'library' && row.library_name && LIBRARY[row.library_name]) {
    const Icon = LIBRARY[row.library_name];
    const tone = (row.tone && row.tone !== 'none' ? row.tone : fallbackTone) as Tone;
    return (
      <IconBubble tone={tone} size={size}>
        <Icon size={inner} />
      </IconBubble>
    );
  }
  return (
    <IconBubble tone={fallbackTone} size={size}>
      <Fallback size={inner} />
    </IconBubble>
  );
}

export function IconPickerSheet({ open, onClose, table, id, title }: { open: boolean; onClose: () => void; table: string; id: string; title?: string }) {
  const toast = useToast();
  const store = useIconStore();
  const current = store.get(table, id);
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const [tone, setTone] = useState<IconTone>((current?.tone as IconTone) ?? 'primary');
  const [libPick, setLibPick] = useState<string | null>(current?.kind === 'library' ? current.library_name : null);
  const [customPick, setCustomPick] = useState<string | null>(current?.kind === 'custom' ? current.custom_icon_id : null);
  const [fit, setFit] = useState<'contain' | 'cover'>(current?.fit ?? 'contain');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const c = store.get(table, id);
    setTone((c?.tone as IconTone) ?? 'primary');
    setLibPick(c?.kind === 'library' ? c.library_name : null);
    setCustomPick(c?.kind === 'custom' ? c.custom_icon_id : null);
    setFit(c?.fit ?? 'contain');
    setTab(c?.kind === 'custom' ? 'upload' : 'library');
    setFile(null);
    setPreview(null);
    setZoom(1);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // live preview of the processed upload
  useEffect(() => {
    if (!file) return;
    let url: string | null = null;
    let cancelled = false;
    prepareIcon(file, fit, zoom)
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setPreview(url);
      })
      .catch((e) => toast((e as Error).message, 'error'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, fit, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ICON_GROUPS.map((g) => ({
      label: g.label,
      names: Object.keys(g.icons).filter((n) => !s || n.toLowerCase().includes(s) || g.label.toLowerCase().includes(s)),
    })).filter((g) => g.names.length);
  }, [q]);

  const save = async () => {
    setBusy(true);
    try {
      if (tab === 'library') {
        if (!libPick) return toast('Pick an icon', 'error');
        await setEntityIcon(table, id, { kind: 'library', library_name: libPick, custom_icon_id: null, tone, fit: 'contain' });
      } else {
        let cid = customPick;
        if (file) {
          const blob = await prepareIcon(file, fit, zoom);
          cid = await uploadIcon(blob, file.name.replace(/\.[^.]+$/, ''), keep);
        }
        if (!cid) return toast('Upload an image or pick one of yours', 'error');
        await setEntityIcon(table, id, { kind: 'custom', library_name: null, custom_icon_id: cid, tone, fit });
      }
      toast('Icon saved');
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await clearEntityIcon(table, id);
      toast('Back to the default icon');
      onClose();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toneDot = (t: IconTone): ReactNode =>
    t === 'none' ? (
      <span className="block h-7 w-7 rounded-full" style={{ boxShadow: 'inset 0 0 0 2px var(--hairline)', background: 'var(--card-2)' }} />
    ) : (
      <span className="block h-7 w-7 rounded-full" style={{ background: TONES[t as Tone].bg, boxShadow: `inset 0 0 0 2px ${TONES[t as Tone].fg}` }} />
    );

  return (
    <Sheet open={open} onClose={onClose} title={title ?? 'Choose icon'}>
      <div className="space-y-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'library', label: 'Icon library' }, { value: 'upload', label: 'My image / logo' }]} />

        {tab === 'library' ? (
          <>
            <div className="glass flex items-center gap-2 rounded-[14px] px-3">
              <Search size={16} className="text-muted" />
              <input className="min-w-0 flex-1 bg-transparent py-2.5 text-[14.5px] outline-none" placeholder="Search (e.g. atom, gym, bank)" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="mb-1.5 text-[11.5px] font-semibold text-muted">{g.label}</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {g.names.map((n) => {
                      const I = LIBRARY[n];
                      const on = libPick === n;
                      return (
                        <button
                          key={g.label + n}
                          type="button"
                          aria-label={n}
                          onClick={() => setLibPick(n)}
                          className={cx('press flex aspect-square items-center justify-center rounded-[12px]', on ? 'ring-2 ring-[var(--primary-2)]' : '')}
                          style={{ background: on ? TONES[(tone === 'none' ? 'primary' : tone) as Tone].bg : 'var(--card-2)', color: on ? TONES[(tone === 'none' ? 'primary' : tone) as Tone].fg : 'var(--text)' }}
                        >
                          <I size={19} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setCustomPick(null);
                }
                e.target.value = '';
              }}
            />
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[16px]" style={{ background: tone === 'none' ? 'var(--card-2)' : TONES[tone as Tone].bg }}>
                {preview ? (
                  <img src={preview} alt="Preview" className={keep ? '' : 'themed-img'} style={{ width: fit === 'cover' ? 80 : 62, height: fit === 'cover' ? 80 : 62, objectFit: fit }} />
                ) : customPick && store.upload(customPick) ? (
                  <img src={store.url(store.upload(customPick)!.path) ?? ''} alt="" className={store.upload(customPick)!.keep_colors ? '' : 'themed-img'} style={{ width: 62, height: 62, objectFit: 'contain' }} />
                ) : (
                  <Upload size={22} className="text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Button full onClick={() => input.current?.click()}>
                  <Upload size={14} /> {file ? 'Choose another' : 'Upload from phone'}
                </Button>
                <p className="text-[11px] text-muted">PNG, JPG, WebP or SVG · made into a 256 px icon</p>
              </div>
            </div>
            {file && (
              <>
                <Segmented value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit whole image' }, { value: 'cover', label: 'Fill (crop edges)' }]} />
                <label className="block text-[12px] text-muted">
                  Zoom {zoom.toFixed(1)}×
                  <input type="range" min={0.6} max={2} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
                </label>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13px]">Keep original colours (also in Black &amp; White)</p>
                  <Toggle checked={keep} onChange={setKeep} />
                </div>
              </>
            )}
            {store.uploads().length > 0 && (
              <>
                <p className="text-[11.5px] font-semibold text-muted">Your uploaded icons</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {store.uploads().map((u) => {
                    const url = store.url(u.path);
                    const on = customPick === u.id && !file;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setCustomPick(u.id);
                          setFile(null);
                          setPreview(null);
                        }}
                        className={cx('press flex aspect-square items-center justify-center overflow-hidden rounded-[12px]', on ? 'ring-2 ring-[var(--primary-2)]' : '')}
                        style={{ background: 'var(--card-2)' }}
                      >
                        {url && <img src={url} alt={u.name ?? ''} className={u.keep_colors ? '' : 'themed-img'} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />}
                      </button>
                    );
                  })}
                </div>
                {customPick && !file && store.upload(customPick) && (
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[12.5px]">Keep this icon's original colours</p>
                    <Toggle checked={store.upload(customPick)!.keep_colors} onChange={(v) => setKeepColors(customPick, v).catch((e) => toast(friendlyError(e), 'error'))} />
                    <button
                      type="button"
                      aria-label="Delete this uploaded icon"
                      className="text-muted"
                      onClick={async () => {
                        try {
                          await deleteCustomIcon(customPick);
                          setCustomPick(null);
                          toast('Icon deleted');
                        } catch (e) {
                          toast(friendlyError(e), 'error');
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold text-muted">Background</p>
          <div className="flex flex-wrap gap-2">
            {ICON_TONES.map((t) => (
              <button key={t} type="button" aria-label={t} onClick={() => setTone(t)} className={cx('press rounded-full p-0.5', tone === t ? 'ring-2 ring-[var(--primary-2)]' : '')}>
                {toneDot(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button full disabled={!current || busy} onClick={reset}>
            <RotateCcw size={14} /> Default icon
          </Button>
          <Button full variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
