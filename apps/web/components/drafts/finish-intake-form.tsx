'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ArrowUp, X, Check } from 'lucide-react';
import { draftEdit, draftPush, draftSetOnline, intakeItemCreate } from '@/lib/actions';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { FINISH_CATEGORIES, ADVANCED_OPTIONS, categoryItemType } from '@/lib/categories';
import { CustomerPicker, type CustomerSelection } from '@/components/customer-picker';
import type { DraftRow } from '@/lib/types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * The one canonical item form. Two contexts, same fields:
 *  - intake (no draft): customer + price-paying (cost) + payout, then the item
 *    fields. Commit "Save & issue credit" / "Save & log cash" — moves money.
 *  - finish (existing draft): the item fields prefilled. Commit "Push to Square"
 *    / "Save draft" — pushes the catalog. The two actions stay distinct.
 * Renders inline on a page (asPage) or as a modal over Drafts/Inventory.
 * Every field is tap- and keyboard-operable; chip groups take arrow keys.
 */
export function FinishIntakeForm({
  draft,
  asPage = false,
  onClose,
}: {
  draft?: DraftRow;
  asPage?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const mode: 'intake' | 'finish' = draft ? 'finish' : 'intake';
  const a = draft?.attributes ?? {};

  // intake-only fields
  const [sel, setSel] = useState<CustomerSelection>({ kind: 'none' });
  const [payout, setPayout] = useState<'store_credit' | 'cash'>('store_credit');
  const [cost, setCost] = useState('');

  // item fields (shared)
  const [category, setCategory] = useState(str(a.category) || (draft ? guessCategory(draft.itemType) : 'Sneakers'));
  const [brand, setBrand] = useState(str(a.brand));
  const [name, setName] = useState(str(a.name) || (draft && draft.title !== str(a.category) ? draft.title : ''));
  const [sizeUnit, setSizeUnit] = useState<'mens' | 'womens'>(a.sizeUnit === 'womens' ? 'womens' : 'mens');
  const [size, setSize] = useState(str(a.size));
  const [condition, setCondition] = useState(str(a.condition));
  const [colors, setColors] = useState<string[]>(Array.isArray(a.colors) ? (a.colors as string[]) : []);
  const [colorway, setColorway] = useState(str(a.colorway));
  const [styleCode, setStyleCode] = useState(str(a.styleCode));
  const [description, setDescription] = useState(str(a.description));
  const [qty, setQty] = useState(typeof a.qty === 'number' ? a.qty : 1);
  const [online, setOnline] = useState(draft?.online ?? false);
  const [list, setList] = useState(draft?.priceCents !== undefined ? (draft.priceCents / 100).toString() : '');

  const [err, setErr] = useState('');
  const [savedBalance, setSavedBalance] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const opts = ADVANCED_OPTIONS[category] ?? ADVANCED_OPTIONS.Other!;
  const listCents = parseDollarsToCents(list);
  const costCents = mode === 'intake' ? parseDollarsToCents(cost) : draft?.costCents ?? null;
  const marginPct = useMemo(() => {
    if (listCents == null || !costCents || costCents <= 0) return null;
    return ((listCents - costCents) / costCents) * 100;
  }, [listCents, costCents]);

  function itemAttributes() {
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

  // ---- intake commit (moves money) ----
  function saveIntake() {
    setErr('');
    if (costCents == null || costCents <= 0) return setErr('Enter the price you’re paying.');
    const customer =
      sel.kind === 'existing'
        ? { customerId: sel.pick.id }
        : sel.kind === 'new' && sel.name.trim()
          ? { displayName: sel.name.trim(), ...(sel.phone.trim() ? { phone: sel.phone.trim() } : {}) }
          : null;
    if (!customer) return setErr('Pick a customer or enter a name.');
    start(async () => {
      const res = await intakeItemCreate({
        ...customer,
        payout,
        costCents,
        ...(listCents != null ? { listPriceCents: listCents } : {}),
        itemType: categoryItemType(category),
        attributes: itemAttributes(),
      });
      if (!res.ok) return setErr(res.error);
      setSavedBalance(res.balanceCents);
      router.refresh();
    });
  }

  // ---- finish commits (push catalog) ----
  function persistDraft(): Promise<void> {
    return draftEdit({
      id: draft!.id,
      itemType: categoryItemType(category),
      attributes: itemAttributes(),
      ...(listCents != null ? { priceCents: listCents } : {}),
    }).then(async (res) => {
      if (!res.ok) throw new Error(res.error);
      if (online !== draft!.online) await draftSetOnline(draft!.id, online);
    });
  }
  function saveDraft() {
    setErr('');
    start(async () => {
      try { await persistDraft(); router.refresh(); onClose?.(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
    });
  }
  function pushToSquare() {
    setErr('');
    if (listCents == null) return setErr('Set a list price before pushing to the catalog.');
    start(async () => {
      try {
        await persistDraft();
        const res = await draftPush(draft!.id);
        if (!res.ok) throw new Error(res.error);
        router.refresh();
        onClose?.();
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not push.'); }
    });
  }

  function resetForNext() {
    setSavedBalance(null);
    setSel({ kind: 'none' });
    setCost(''); setBrand(''); setName(''); setSize(''); setCondition(''); setColors([]); setColorway(''); setStyleCode(''); setDescription(''); setQty(1); setList('');
  }

  if (savedBalance !== null) {
    return (
      <Shell asPage={asPage} onClose={onClose}>
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent"><Check size={28} /></span>
          <div className="mt-2 font-display text-lg font-semibold">{payout === 'store_credit' ? 'Credit issued' : 'Cash buy logged'}</div>
          <div className="sub">New balance</div>
          <div className="num text-[34px] font-extrabold text-accent">{formatCents(savedBalance)}</div>
          <div className="mt-5 flex gap-2">
            <button className="btn primary" onClick={resetForNext}>New intake</button>
            <button className="btn" onClick={() => router.push('/drafts')}>Go to Drafts</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell asPage={asPage} onClose={onClose} title={mode === 'intake' ? 'New intake' : 'Finish item'} ctx={mode === 'finish' ? `${category}${costCents != null ? ` · ${formatCents(costCents)} cost` : ''} · ${draft!.sourceName}` : undefined}>
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto p-5 md:grid-cols-[1fr_300px] md:p-7">
        <div>
          {err && <div className="err">{err}</div>}

          {mode === 'intake' && (
            <div className="mb-5 rounded-[10px] border border-line p-4">
              <CustomerPicker allowNew onChange={setSel} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Price you’re paying (cost)">
                  <div className="flex max-w-[180px] items-center gap-1.5 border-b border-line focus-within:border-accent">
                    <span className="font-extrabold text-faint">$</span>
                    <input className="num w-full border-0 bg-transparent py-[9px] text-[17px] font-extrabold text-ink outline-none" inputMode="decimal" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} />
                  </div>
                </Field>
                <Field label="Payout">
                  <div className="seg">
                    <button className={payout === 'store_credit' ? 'on' : undefined} onClick={() => setPayout('store_credit')}>Store credit</button>
                    <button className={payout === 'cash' ? 'on' : undefined} onClick={() => setPayout('cash')}>Cash</button>
                  </div>
                </Field>
              </div>
            </div>
          )}

          <Field label="Category"><Chips options={[...FINISH_CATEGORIES]} value={category} onPick={setCategory} /></Field>
          {opts.brands.length > 0 && <Field label="Brand"><Chips options={opts.brands} value={brand} onPick={(v) => setBrand(v === brand ? '' : v)} allowMore /></Field>}
          <Field label="Name"><input className="finp" value={name} placeholder="e.g. Air Jordan 1 Retro High OG" onChange={(e) => setName(e.target.value)} /></Field>
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
              <div className="flex max-w-[180px] items-center gap-1.5 border-b border-line focus-within:border-accent">
                <span className="font-extrabold text-faint">$</span>
                <input className="num w-full border-0 bg-transparent py-[9px] text-[17px] font-extrabold text-ink outline-none" inputMode="decimal" placeholder="0" value={list} onChange={(e) => setList(e.target.value)} />
              </div>
            </Field>
            <Field label="Quantity">
              <div className="inline-flex items-center overflow-hidden rounded-[8px] border border-line">
                <button className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <span className="num w-[46px] text-center text-base font-extrabold">{qty}</span>
                <button className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
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
          <div className="cursor-pointer rounded-[10px] border border-dashed border-line p-[22px] text-center" title="Photo upload arrives with storage wiring">
            <Upload size={24} strokeWidth={1.8} className="mx-auto text-faint" />
            <div className="mt-2 font-display text-[13px] font-semibold">Add photos</div>
            <div className="mt-1 text-[12px] text-muted">Drag in or click to upload</div>
          </div>
          <div className="rounded-[10px] bg-ink p-[16px_18px] text-white">
            <MarginRow l="Cost" v={costCents != null ? formatCents(costCents) : '—'} />
            <div className="my-1 h-px" style={{ background: '#37465a' }} />
            <MarginRow l="List price" v={listCents != null ? formatCents(listCents) : '—'} />
            <div className="my-1 h-px" style={{ background: '#37465a' }} />
            <MarginRow l="Margin" v={marginPct != null ? `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(1)}%` : '—'} accent />
          </div>
          <button className="flex items-center justify-between rounded-[9px] border border-line p-[13px_15px]" onClick={() => setOnline((o) => !o)}>
            <span className="text-left">
              <span className="block font-display text-[13.5px] font-semibold">List online</span>
              <span className="text-[11.5px] text-muted">Show on the web store</span>
            </span>
            <span className="relative h-6 w-[42px] flex-none rounded-full transition-colors" style={{ background: online ? 'var(--accent)' : 'var(--line)' }}>
              <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: online ? 21 : 3 }} />
            </span>
          </button>

          {mode === 'intake' ? (
            <button className="flex items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white disabled:opacity-60" disabled={pending} onClick={saveIntake}>
              {pending ? 'Saving…' : payout === 'store_credit' ? 'Save & issue credit' : 'Save & log cash'}
            </button>
          ) : (
            <>
              <button className="flex items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white disabled:opacity-60" disabled={pending} onClick={pushToSquare}>
                Push to Square <ArrowUp size={16} strokeWidth={2.2} />
              </button>
              <button className="rounded-[9px] p-[12px] font-display text-[13.5px] font-semibold text-ink-soft hover:bg-accent-soft disabled:opacity-60" disabled={pending} onClick={saveDraft}>
                {pending ? 'Saving…' : 'Save draft'}
              </button>
            </>
          )}
          {mode === 'intake' && <p className="hint text-center">Issuing credit moves money. Pushing to the catalog happens later, in Drafts.</p>}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ asPage, onClose, title, ctx, children }: { asPage: boolean; onClose?: () => void; title?: string; ctx?: string; children: React.ReactNode }) {
  const header = title ? (
    <div className="flex items-center gap-3 border-b border-line px-5 py-4">
      <span className="font-display text-[15px] font-semibold">{title}</span>
      {ctx ? <span className="sub hidden sm:inline">{ctx}</span> : null}
      {onClose ? <button onClick={onClose} className="ml-auto text-ink-soft" aria-label="Close"><X size={20} /></button> : null}
    </div>
  ) : null;

  if (asPage) {
    return <div className="card flex flex-col">{header}{children}</div>;
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-auto bg-ink/35 p-0 md:p-6" onClick={onClose}>
      <div className="card flex h-full w-full max-w-[1000px] flex-col md:h-auto md:max-h-full" onClick={(e) => e.stopPropagation()}>{header}{children}</div>
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

// Keyboard: Tab focuses the group; arrow keys move the selection within it;
// Space/Enter toggles the focused chip (native button). No focus trap.
function Chips({ options, value, values, multi, allowMore, onPick, onToggle }: {
  options: string[]; value?: string; values?: string[]; multi?: boolean; allowMore?: boolean;
  onPick?: (v: string) => void; onToggle?: (v: string) => void;
}) {
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-chip]'));
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const curIdx = btns.findIndex((b) => b === document.activeElement);
    const next = (curIdx < 0 ? 0 : curIdx + dir + btns.length) % btns.length;
    btns[next]?.focus();
    if (!multi) onPick?.(options[next]!);
  }
  return (
    <div className="chips" role="group" onKeyDown={onKey}>
      {options.map((o) => {
        const on = multi ? values?.includes(o) : value === o;
        return (
          <button key={o} data-chip className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => (multi ? onToggle?.(o) : onPick?.(o))}>{o}</button>
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
