'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

// Multi-select photo picker with previews. Presentation + local form state only:
// image persistence (e.g. a Supabase Storage bucket) is NOT wired yet, so the
// selected files are held here and surfaced to the parent via onChange for when
// upload lands. Object URLs are revoked on remove/unmount so blob memory doesn't
// leak. See the TODO(photo-persistence) note in finish-intake-form.tsx.
type PhotoItem = { id: string; file: File; url: string };

export function PhotoPicker({ onChange }: { onChange?: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PhotoItem[]>([]);

  // Revoke any outstanding object URLs when the picker unmounts.
  useEffect(() => {
    return () => {
      items.forEach((it) => URL.revokeObjectURL(it.url));
    };
    // Cleanup runs once on unmount against the latest `items` via the ref-free
    // closure below; we intentionally don't re-run per change (each removal
    // already revokes its own URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: PhotoItem[] = Array.from(list)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({
        id: `${f.name}-${f.size}-${f.lastModified}-${items.length}-${f.type}`,
        file: f,
        url: URL.createObjectURL(f),
      }));
    if (added.length === 0) return;
    setItems((prev) => {
      const next = [...prev, ...added];
      onChange?.(next.map((it) => it.file));
      return next;
    });
    // Reset so picking the same file again still fires onChange.
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(id: string) {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = prev.filter((it) => it.id !== id);
      onChange?.(next.map((it) => it.file));
      return next;
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full cursor-pointer rounded-[10px] border border-dashed border-line p-[22px] text-center transition-colors hover:bg-accent-soft"
      >
        <Upload size={24} strokeWidth={1.8} className="mx-auto text-faint" />
        <div className="mt-2 font-display text-[13px] font-semibold">Add photos</div>
        <div className="mt-1 text-[12px] text-muted">Click to upload — pick several at once</div>
      </button>

      {items.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {items.map((it) => (
              <div key={it.id} className="relative aspect-square overflow-hidden rounded-[8px] border border-line">
                {/* Object-URL preview of a not-yet-uploaded File — next/image can't help here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.file.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label={`Remove ${it.file.name}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-ink"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="hint mt-2">
            {items.length} photo{items.length === 1 ? '' : 's'} selected — held in the form.
            Not uploaded yet (image storage isn’t wired).
          </p>
        </>
      )}
    </div>
  );
}
