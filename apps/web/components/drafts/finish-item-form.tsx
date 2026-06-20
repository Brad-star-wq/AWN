'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ArrowUp, X } from 'lucide-react';
import { draftEdit, draftPush, draftSetOnline } from '@/lib/actions';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { FINISH_CATEGORIES, ADVANCED_OPTIONS, categoryItemType } from '@/lib/categories';
import type { DraftRow } from '@/lib/types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// The full finish-item field set (dashboard-finish-item-clean.html). Used as the
// Drafts "Edit" form and — reused as-is — for dashboard Intake's expand-in-place
// (Model A). Writes through draftEdit/draftPush; never touches the engine.
export function FinishItemForm({
  draft,
  onClose,
  saveLabel = 'Save & next',
}: {
  draft: DraftRow;
  onClose: () => void;
  saveLabel?: string;
}) {
  const router = useRouter();
  const a = draft.attributes;
  const [category, setCategory] = useState(str(a.category) || guessCategory(draft.itemType));
  const [brand, setBrand] = useState(str(a.brand));
  const [name, setName] = useState(str(a.name) || (draft.title !== category ? draft.title : ''));
  const [sizeUnit, setSizeUnit] = useState<'mens' | 'womens'>(a.sizeUnit === 'womens' ? 'womens' : 'mens');
  const [size, setSize] = useState(str(a.size));
  const [condition, setCondition] = useState(str(a.condition));
  const [colors, setColors] = useState<string[]>(Array.isArray(a.colors) ? (a.colors as string[]) : []);
  const [colorway, setColorway] = useState(str(a.colorway));
  const [styleCode, setStyleCode] = useState(str(a.styleCode));
  const [description, setDescription] = useState(str(a.description));
  const [qty, setQty] = useState(typeof a.qty === 'number' ? a.qty : 1);
  const [online, setOnline] = useState(draft.online);
  const [list, setList] = useState(draft.priceCents !== undefined ? (draft.priceCents / 100).toString() : '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const opts = ADVANCED_OPTIONS[category] ?? ADVANCED_OPTIONS.Other!;
  const listCents = parseDollarsToCents(list);
  const cost = draft.costCents;
  const marginPct = useMemo(() => {
    if (listCents == null || !cost || cost <= 0) return null;
    return ((listCents - cost) / cost) * 100;
  }, [listCents, cost]);

  function attributes() {
    return {
      ...a,
      category,
      ...(brand ? { brand } : {}),
      ...(name ? { name } : {}),
      ...(size ? { size, sizeUnit } : {}),
      ...(condition ? { condition } : {}),
      ...(colors.length ? { colors } : {}),
      ...(colorway ? { colorway } : {}),
      ...(styleCode ? { styleCode } : {}),
      ...(description ? { description } : {}),
      qty,
    };
  }

  function persist(): Promise<void> {
    return draftEdit({
      id: draft.id,
      itemType: categoryItemType(category),
      attributes: attributes(),
      ...(listCents != null ? { priceCents: listCents } : {}),
    }).then(async (res) => {
      if (!res.ok) throw new Error(res.error);
      if (online !== draft.online) await draftSetOnline(draft.id, online);
    });
  }

  function save() {
    setErr('');
    start(async () => {
      try {
        await persist();
        router.refresh();
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function pushToSquare() {
    setErr('');
    if (listCents == null) return setErr('Set a list price before pushing to the catalog.');
    start(async () => {
      try {
        await persist();
        const res = await draftPush(draft.id); // marks ready + pushes via the (mock) adapter
        if (!res.ok) throw new Error(res.error);
        router.refresh();
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not push.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-auto bg-ink/35 p-0 md:p-6">
      <div className="card flex h-full w-full max-w-[1000px] flex-col md:h-auto md:max-h-full" onClick={(e) => e.stopPropagation()}>
        {/* top */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="font-display text-[15px] font-semibold">Finish item</span>
          <span className="sub hidden sm:inline">
            {category}{cost !== undefined ? ` · ${formatCents(cost)} cost` : ''} · {draft.sourceName}
          </span>
          <button onClick={onClose} className="ml-auto text-ink-soft" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto p-5 md:grid-cols-[1fr_300px] md:p-7">
          {/* left: fields */}
          <div>
            {err && <div className="err">{err}</div>}
            <Field label="Category">
              <Chips options={[...FINISH_CATEGORIES]} value={category} onPick={(v) => setCategory(v)} />
            </Field>
            {opts.brands.length > 0 && (
              <Field label="Brand"><Chips options={opts.brands} value={brand} onPick={(v) => setBrand(v === brand ? '' : v)} allowMore /></Field>
            )}
            <Field label="Name">
              <input className="finp" value={name} placeholder="e.g. Air Jordan 1 Retro High OG" onChange={(e) => setName(e.target.value)} />
            </Field>
            {opts.sizes && opts.sizes.length > 0 && (
              <Field label="Size">
                {category === 'Sneakers' && (
                  <div className="seg" style={{ marginBottom: 10 }}>
                    <button className={sizeUnit === 'mens' ? 'on' : undefined} onClick={() => setSizeUnit('mens')}>Men’s</button>
                    <button className={sizeUnit === 'womens' ? 'on' : undefined} onClick={() => setSizeUnit('womens')}>Women’s</button>
                  </div>
                )}
                <Chips options={opts.sizes} value={size} onPick={(v) => setSize(v === size ? '' : v)} allowMore />
              </Field>
            )}
            <Field label="Condition"><Chips options={opts.conditions} value={condition} onPick={(v) => setCondition(v === condition ? '' : v)} /></Field>

            <div className="my-5 h-px bg-line" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="List price">
                <div className="flex max-w-[180px] items-center gap-1.5 rounded-[8px] border border-line px-3 focus-within:border-accent">
                  <span className="font-extrabold text-faint">$</span>
                  <input className="num w-full border-0 py-[11px] text-[17px] font-extrabold text-ink outline-none" inputMode="decimal" placeholder="0" value={list} onChange={(e) => setList(e.target.value)} />
                </div>
              </Field>
              <Field label="Quantity">
                <div className="inline-flex items-center overflow-hidden rounded-[8px] border border-line">
                  <button className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                  <span className="num w-[46px] text-center text-base font-extrabold">{qty}</span>
                  <button className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => q + 1)}>+</button>
                </div>
              </Field>
            </div>

            {opts.colors && opts.colors.length > 0 && (
              <Field label="Color"><Chips options={opts.colors} multi values={colors} onToggle={(v) => setColors((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]))} allowMore /></Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Colorway"><input className="finp" value={colorway} placeholder="e.g. Bred" onChange={(e) => setColorway(e.target.value)} /></Field>
              <Field label="Style code"><input className="finp" value={styleCode} placeholder="e.g. 555088-062 (manufacturer code)" onChange={(e) => setStyleCode(e.target.value)} /></Field>
            </div>
            <Field label="Description"><textarea className="finp min-h-[66px] resize-y" value={description} placeholder="Flaws, box, extras…" onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>

          {/* right rail */}
          <div className="flex flex-col gap-[14px] md:sticky md:top-0 md:self-start">
            <div className="cursor-pointer rounded-[10px] border border-dashed border-line bg-surface p-[22px] text-center" title="Photo upload arrives with storage wiring">
              <Upload size={24} strokeWidth={1.8} className="mx-auto text-faint" />
              <div className="mt-2 font-display text-[13px] font-semibold">Add photos</div>
              <div className="mt-1 text-[12px] text-muted">Drag in or click to upload</div>
            </div>

            <div className="rounded-[10px] bg-ink p-[16px_18px] text-white">
              <MarginRow l="Cost" v={cost !== undefined ? formatCents(cost) : '—'} />
              <div className="my-1 h-px" style={{ background: '#37465a' }} />
              <MarginRow l="List price" v={listCents != null ? formatCents(listCents) : '—'} />
              <div className="my-1 h-px" style={{ background: '#37465a' }} />
              <MarginRow l="Margin" v={marginPct != null ? `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(1)}%` : '—'} accent />
            </div>

            <button className="flex items-center justify-between rounded-[9px] border border-line bg-surface p-[13px_15px]" onClick={() => setOnline((o) => !o)}>
              <span className="text-left">
                <span className="block font-display text-[13.5px] font-semibold">List online</span>
                <span className="text-[11.5px] text-muted">Show on the web store</span>
              </span>
              <span className="relative h-6 w-[42px] flex-none rounded-full transition-colors" style={{ background: online ? 'var(--accent)' : 'var(--line)' }}>
                <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: online ? 21 : 3 }} />
              </span>
            </button>

            <button className="flex items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white disabled:opacity-60" disabled={pending} onClick={pushToSquare}>
              Push to Square <ArrowUp size={16} strokeWidth={2.2} />
            </button>
            <button className="rounded-[9px] border border-line bg-surface p-[12px] font-display text-[13.5px] font-semibold text-ink-soft disabled:opacity-60" disabled={pending} onClick={save}>
              {pending ? 'Saving…' : saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function guessCategory(itemType: DraftRow['itemType']) {
  return itemType === 'SHOE' ? 'Sneakers' : itemType === 'CARD' ? 'Cards' : 'Other';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[20px]">
      <div className="mb-[9px] font-display text-[12px] font-semibold text-ink-soft">{label}</div>
      {children}
    </div>
  );
}

function Chips({
  options,
  value,
  values,
  multi,
  allowMore,
  onPick,
  onToggle,
}: {
  options: string[];
  value?: string;
  values?: string[];
  multi?: boolean;
  allowMore?: boolean;
  onPick?: (v: string) => void;
  onToggle?: (v: string) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = multi ? values?.includes(o) : value === o;
        return (
          <button key={o} className={`chip${on ? ' on' : ''}`} onClick={() => (multi ? onToggle?.(o) : onPick?.(o))}>
            {o}
          </button>
        );
      })}
      {allowMore && <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--muted)', cursor: 'default' }}>More…</span>}
    </div>
  );
}

function MarginRow({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-display text-[12.5px] font-medium" style={{ color: '#9aa6b4' }}>{l}</span>
      <span className="num text-base font-extrabold" style={accent ? { color: '#7fb8a3' } : undefined}>{v}</span>
    </div>
  );
}
