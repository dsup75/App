// Bill / screenshot photos on any record (private Supabase Storage)
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, FileText, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { compressImage } from '../lib/parse';
import { useAuth } from '../context/AuthContext';
import { useLock } from '../context/LockContext';
import { useToast } from '../context/ToastContext';
import { Confirm, SectionTitle, Spinner } from './ui';

const BUCKET = 'attachments';

interface Att {
  id: string;
  path: string;
  mime: string | null;
  url?: string;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Uploads one photo / PDF and links it to a record. Images are shrunk first. */
export async function uploadAttachment(userId: string, table: string, parentId: string, input: File | { base64: string; mime: string }): Promise<void> {
  let blob: Blob;
  let mime: string;
  if (input instanceof File) {
    if (input.type === 'application/pdf') {
      blob = input;
      mime = 'application/pdf';
    } else {
      const c = await compressImage(input);
      blob = base64ToBlob(c.base64, c.mime);
      mime = c.mime;
    }
  } else {
    blob = base64ToBlob(input.base64, input.mime);
    mime = input.mime;
  }
  if (blob.size > 5 * 1024 * 1024) throw new Error('File is bigger than 5 MB.');
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${table}/${parentId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const ins = await supabase.from('attachments').insert({ parent_table: table, parent_id: parentId, path, mime, size_bytes: blob.size });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw ins.error;
  }
}

export function Attachments({ table, id }: { table: string; id: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const { suppressBriefly } = useLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<Att[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<Att | null>(null);
  const [del, setDel] = useState<Att | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('attachments').select('id,path,mime').eq('parent_table', table).eq('parent_id', id).is('deleted_at', null).order('created_at');
    if (error) return setList([]);
    const rows = (data as Att[]) ?? [];
    if (rows.length) {
      const s = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
      const urls = new Map<string, string>(((s.data ?? []) as any[]).map((x) => [x.path, x.signedUrl]));
      rows.forEach((r) => (r.url = urls.get(r.path) ?? undefined));
    }
    setList(rows);
  }, [table, id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setBusy(true);
    try {
      for (const f of Array.from(files).slice(0, 6)) await uploadAttachment(user.id, table, id, f);
      toast('Photo added');
      await load();
    } catch (e) {
      const msg = friendlyError(e);
      toast(/bucket|not found/i.test(msg) ? 'Photo storage is not ready yet. Try again in a few minutes.' : msg, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (a: Att) => {
    setBusy(true);
    try {
      await supabase.storage.from(BUCKET).remove([a.path]);
      const r = await supabase.from('attachments').delete().eq('id', a.id);
      if (r.error) throw r.error;
      setDel(null);
      setView(null);
      await load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle right={<span className="text-[12.5px] text-muted">{list?.length ? `${list.length}` : ''}</span>}>Photos & bills</SectionTitle>
      <div className="glass rounded-[18px] p-3">
        {list === null ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {list.map((a) => (
              <button key={a.id} onClick={() => (a.mime === 'application/pdf' ? a.url && window.open(a.url, '_blank') : setView(a))} className="aspect-square overflow-hidden rounded-[12px] bg-[var(--card-2)]">
                {a.mime === 'application/pdf' ? (
                  <span className="flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted">
                    <FileText size={20} /> PDF
                  </span>
                ) : a.url ? (
                  <img src={a.url} alt="Attachment" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </button>
            ))}
            <button
              onClick={() => {
                suppressBriefly();
                fileRef.current?.click();
              }}
              disabled={busy}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] text-[11px] font-semibold text-primary"
              style={{ boxShadow: 'inset 0 0 0 1.5px var(--hairline)' }}
            >
              {busy ? <Spinner /> : <ImagePlus size={20} />}
              {!busy && 'Add'}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>

      {view && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setView(null)}>
          <div className="flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button aria-label="Delete photo" className="rounded-full bg-white/15 p-2 text-white" onClick={(e) => { e.stopPropagation(); setDel(view); setView(null); }}>
              <Trash2 size={18} />
            </button>
            <button aria-label="Close" className="rounded-full bg-white/15 p-2 text-white">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-3">
            <img src={view.url} alt="Attachment" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
      <Confirm open={!!del} title="Delete this photo?" message="It will be removed permanently." confirmLabel="Delete" danger loading={busy} onConfirm={() => del && remove(del)} onClose={() => setDel(null)} />
    </>
  );
}
