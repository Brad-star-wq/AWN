'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, X, Check } from 'lucide-react';
import { draftEdit, draftPush, draftSetOnline, intakeItemCreate } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { FINISH_CATEGORIES, ADVANCED_OPTIONS, categoryItemType } from '@/lib/categories';
import { FocusFlow } from '@/components/forms/focus-flow';
import { ChipGroup, SegGroup } from '@/components/forms/button-group';
import { MoneyField } from '@/components/forms/money-field';
import { PhotoPicker } from '@/components/drafts/photo-picker';
import { CustomerCombobox } from '@/components/forms/customer-combobox';
import type { CustomerSelection } from '@/components/customer-picker';
import type { DraftRow } from '@/lib/types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Logical Enter-advance order (not DOM order). Unrendered stops are skipped, so
// the same array serves both intake (customer…payout present) and finish.
const ORDER = ['customer', 'phone', 'cost', 'payout', 'category', 'brand', 'name', 'size-gender', 'size', 'condition', 'list', 'color', 'colorway', 'stylecode', 'desc', 'online', 'submit'];

export function FinishIntakeForm({ draft, asPage = false, onClose }: { draft?: DraftRow; asPage?: boolean; onClose?: () => void }) {
  const router = useRouter();
  const mode: 'intake' | 'finish' = draft ? 'finish' : 'intake';
  const a = draft?.attributes ?? {};

  const [sel, setSel] = useState<CustomerSelection>({ kind: 'none' });
  const [phone, setPhone] = useState('');
  const [payout, setPayout] = useState<'store_credit' | 'cash'>('store_credit');
  const [costCents, setCostCents] = useState<number | null>(null);

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
  const [listCents, setListCents] = useState<number | null>(draft?.priceCents ?? null);

  const [err, setErr] = useState('');
  const [savedBalance, setSavedBalance] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const opts = ADVANCED_OPTIONS[category] ?? ADVANCED_OPTIONS.Other!;
  const cost = mode === 'intake' ? costCents : draft?.costCents ?? null;
  const marginPct = useMemo(() => (listCents == null || !cost || cost <= 0 ? null : ((listCents - cost) / cost) * 100), [listCents, cost]);

  const customerOk = sel.kind === 'existing' || (sel.kind === 'new' && sel.name.trim().length > 0);
  const intakeValid = customerOk && (costCents ?? 0) > 0;

  function handleSel(s: CustomerSelection) {
    setSel(s);
    if (s.kind === 'existing' && s.pick.phone) setPhone(s.pick.phone);
  }
  function onPhone(v: string) {
    setPhone(v);
    if (sel.kind === 'new') setSel({ ...sel, phone: v });
  }

  function itemAttributes() {
    return {
      ...a, category,
      ...(brand ? { brand } : {}), ...(name ? { name } : {}),
      ...(size ? { size, sizeUnit } : {}), ...(condition ? { condition } : {}),
      ...(colors.length ? { colors } : {}), ...(colorway ? { colorway } : {}),
      ...(styleCode ? { styleCode } : {}), ...(description ? { description } : {}), qty,
    };
  }

  function saveIntake() {
    if (!intakeValid) return;
    setErr('');
    const customer = sel.kind === 'existing' ? { customerId: sel.pick.id } : { displayName: sel.name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) };
    start(async () => {
      const res = await intakeItemCreate({
        ...customer, payout, costCents: costCents!, ...(listCents != null ? { listPriceCents: listCents } : {}),
        itemType: categoryItemType(category), attributes: itemAttributes(),
      });
      if (!res.ok) return setErr(res.error);
      setSavedBalance(res.balanceCents);
      router.refresh();
    });
  }
  function persistDraft(): Promise<void> {
    return draftEdit({ id: draft!.id, itemType: categoryItemType(category), attributes: itemAttributes(), ...(listCents != null ? { priceCents: listCents } : {}) }).then(async (res) => {
      if (!res.ok) throw new Error(res.error);
      if (online !== draft!.online) await draftSetOnline(draft!.id, online);
    });
  }
  function saveDraft() {
    setErr('');
    start(async () => { try { await persistDraft(); router.refresh(); onClose?.(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } });
  }
  function pushToSquare() {
    setErr('');
    if (listCents == null) return setErr('Set a list price before pushing to the catalog.');
    start(async () => {
      try { await persistDraft(); const res = await draftPush(draft!.id); if (!res.ok) throw new Error(res.error); router.refresh(); onClose?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Could not push.'); }
    });
  }
  function resetForNext() {
    setSavedBalance(null); setSel({ kind: 'none' }); setPhone(''); setCostCents(null);
    setBrand(''); setName(''); setSize(''); setCondition(''); setColors([]); setColorway(''); setStyleCode(''); setDescription(''); setQty(1); setListCents(null);
  }

  if (savedBalance !== null) {
    return (
      <Shell asPage={asPage} onClose={onClose}>
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent"><Check size={28} /></span>
          <div className="mt-2 font-display text-lg font-semibold">{payout === 'store_credit' ? 'Credit issued' : 'Cash buy logged'}</div>
          <div className="sub">New balance</div>
          <div className="num text-[26px] font-extrabold text-accent">{formatCents(savedBalance)}</div>
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn primary" onClick={resetForNext}>New intake</button>
            <button type="button" className="btn" onClick={() => router.push('/drafts')}>Go to Drafts</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell asPage={asPage} onClose={onClose} title={mode === 'intake' ? 'New intake' : 'Finish item'} ctx={mode === 'finish' ? `${category}${cost != null ? ` · ${formatCents(cost)} cost` : ''} · ${draft!.sourceName}` : undefined}>
      <FocusFlow order={ORDER} className="grid flex-1 grid-cols-1 gap-5 overflow-auto p-4 md:grid-cols-[1fr_290px] md:p-5">
        <div>
          {err && <div className="err">{err}</div>}

          {mode === 'intake' && (
            <div className="mb-5 rounded-[10px] border border-line p-4">
              <CustomerCombobox value={sel} onChange={handleSel} />
              <Field label="Phone (optional)"><input data-stop="phone" enterKeyHint="next" value={phone} placeholder="(555) 555-0100" onChange={(e) => onPhone(e.target.value)} className="finp" /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Price you’re paying (cost)"><MoneyField cents={costCents} onCents={setCostCents} stopId="cost" /></Field>
                <Field label="Payout"><SegGroup stopId="payout" ariaLabel="Payout" value={payout} onSelect={setPayout} options={[{ label: 'Store credit', value: 'store_credit' }, { label: 'Cash', value: 'cash' }]} /></Field>
              </div>
            </div>
          )}

          <Field label="Category"><ChipGroup stopId="category" ariaLabel="Category" options={[...FINISH_CATEGORIES]} value={category} onSelect={setCategory} /></Field>
          {opts.brands.length > 0 && <Field label="Brand"><ChipGroup stopId="brand" ariaLabel="Brand" options={opts.brands} value={brand} onSelect={(v) => setBrand(v === brand ? '' : v)} allowMore /></Field>}
          <Field label="Name"><input data-stop="name" enterKeyHint="next" className="finp" value={name} placeholder="e.g. Air Jordan 1 Retro High OG" onChange={(e) => setName(e.target.value)} /></Field>
          {opts.sizes && opts.sizes.length > 0 && (
            <Field label="Size">
              {category === 'Sneakers' && <div style={{ marginBottom: 10 }}><SegGroup stopId="size-gender" ariaLabel="Size unit" value={sizeUnit} onSelect={setSizeUnit} options={[{ label: 'Men’s', value: 'mens' }, { label: 'Women’s', value: 'womens' }]} /></div>}
              <ChipGroup stopId="size" ariaLabel="Size" options={opts.sizes} value={size} onSelect={(v) => setSize(v === size ? '' : v)} allowMore />
            </Field>
          )}
          <Field label="Condition"><ChipGroup stopId="condition" ariaLabel="Condition" options={opts.conditions} value={condition} onSelect={(v) => setCondition(v === condition ? '' : v)} /></Field>

          <div className="my-5 h-px bg-line" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="List price"><MoneyField cents={listCents} onCents={setListCents} stopId="list" isLast /></Field>
            <Field label="Quantity">
              <div className="inline-flex items-center overflow-hidden rounded-[8px] border border-line">
                <button type="button" className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <span className="num w-[46px] text-center text-base font-extrabold">{qty}</span>
                <button type="button" className="h-[42px] w-10 text-lg text-ink-soft" onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
              </div>
            </Field>
          </div>

          {opts.colors && opts.colors.length > 0 && <Field label="Color"><ChipGroup stopId="color" ariaLabel="Color" multi options={opts.colors} values={colors} onSelect={(v) => setColors((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]))} allowMore /></Field>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Colorway"><input data-stop="colorway" enterKeyHint="next" className="finp" value={colorway} placeholder="e.g. Bred" onChange={(e) => setColorway(e.target.value)} /></Field>
            <Field label="Style code"><input data-stop="stylecode" enterKeyHint="next" className="finp" value={styleCode} placeholder="e.g. 555088-062" onChange={(e) => setStyleCode(e.target.value)} /></Field>
          </div>
          <Field label="Description"><textarea data-stop="desc" className="finp min-h-[66px] resize-y" value={description} placeholder="Flaws, box, extras… (Enter = newline)" onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>

        {/* right rail */}
        <div className="flex flex-col gap-[14px] md:sticky md:top-0 md:self-start">
          {/* TODO(photo-persistence): image storage (e.g. Supabase Storage) isn't
              wired yet — PhotoPicker holds the selected files in form state and
              previews them; on save they are not uploaded. Wire onChange +
              upload here when a bucket lands. */}
          <PhotoPicker />
          <div className="rounded-[10px] bg-ink p-[16px_18px] text-white">
            <MarginRow l="Cost" v={cost != null ? formatCents(cost) : '—'} />
            <div className="my-1 h-px" style={{ background: '#37465a' }} />
            <MarginRow l="List price" v={listCents != null ? formatCents(listCents) : '—'} />
            <div className="my-1 h-px" style={{ background: '#37465a' }} />
            <MarginRow l="Margin" v={marginPct != null ? `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(1)}%` : '—'} accent />
          </div>
          <button type="button" data-stop="online" className="flex items-center justify-between rounded-[9px] border border-line p-[13px_15px]" onClick={() => setOnline((o) => !o)} aria-pressed={online}>
            <span className="text-left"><span className="block font-display text-[13.5px] font-semibold">List online</span><span className="text-[11.5px] text-muted">Space toggles · Enter continues</span></span>
            <span className="relative h-6 w-[42px] flex-none rounded-full transition-colors" style={{ background: online ? 'var(--accent)' : 'var(--line)' }}>
              <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: online ? 21 : 3 }} />
            </span>
          </button>

          {mode === 'intake' ? (
            <button type="button" data-stop="submit" data-primary="true" aria-disabled={!intakeValid || pending}
              className="flex items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white"
              style={{ opacity: !intakeValid || pending ? 0.5 : 1 }} onClick={() => intakeValid && saveIntake()}>
              {pending ? 'Saving…' : payout === 'store_credit' ? 'Save & issue credit' : 'Save & log cash'}
            </button>
          ) : (
            <>
              <button type="button" data-stop="submit" data-primary="true" disabled={pending}
                className="flex items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white disabled:opacity-60" onClick={pushToSquare}>
                Push to Square <ArrowUp size={16} strokeWidth={2.2} />
              </button>
              <button type="button" className="rounded-[9px] p-[12px] font-display text-[13.5px] font-semibold text-ink-soft hover:bg-accent-soft disabled:opacity-60" disabled={pending} onClick={saveDraft}>
                {pending ? 'Saving…' : 'Save draft'}
              </button>
            </>
          )}
          {mode === 'intake' && <p className="hint text-center">Issuing credit moves money. Catalog push happens later, in Drafts.</p>}
        </div>
      </FocusFlow>
    </Shell>
  );
}

function Shell({ asPage, onClose, title, ctx, children }: { asPage: boolean; onClose?: () => void; title?: string; ctx?: string; children: React.ReactNode }) {
  const header = title ? (
    <div className="flex items-center gap-3 border-b border-line px-5 py-4">
      <span className="font-display text-[15px] font-semibold">{title}</span>
      {ctx ? <span className="sub hidden sm:inline">{ctx}</span> : null}
      {onClose ? <button type="button" onClick={onClose} className="ml-auto text-ink-soft" aria-label="Close"><X size={20} /></button> : null}
    </div>
  ) : null;
  if (asPage) return <div className="card flex flex-col">{header}{children}</div>;
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
  return <div className="mb-[13px]"><div className="flabel mb-[5px]">{label}</div>{children}</div>;
}
function MarginRow({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <div className="flex items-center justify-between py-1.5"><span className="font-display text-[12.5px] font-medium" style={{ color: '#9aa6b4' }}>{l}</span><span className="num text-base font-extrabold" style={accent ? { color: '#7fb8a3' } : undefined}>{v}</span></div>;
}
