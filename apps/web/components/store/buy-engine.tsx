'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Camera, Check, ChevronRight, Plus, StickyNote } from 'lucide-react';
import { buyCreate, type BuyLineInput } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { STORE_CATEGORIES, ADVANCED_OPTIONS } from '@/lib/categories';
import { MoneyKeypad } from '@/components/store/money-keypad';
import type { CustomerPick } from '@/lib/types';

type Slot = {
  name: string;
  priceCents: number | null;
  size?: string;
  condition?: string;
  brand?: string;
  note?: string;
  showAdv: boolean;
  showNote: boolean;
};
type Line = {
  id: string;
  category: string;
  itemType: BuyLineInput['itemType'];
  qty: number;
  groupCents: number | null; // group total typed on the price cell (path 2)
  slots: Slot[];
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
const uid = () => Math.random().toString(36).slice(2, 9);

// Sum of a line's slot prices, or null if none are priced.
function slotSum(line: Line): number | null {
  const priced = line.slots.filter((s) => s.priceCents != null);
  if (priced.length === 0) return null;
  return priced.reduce((n, s) => n + (s.priceCents ?? 0), 0);
}
// A line contributes its slot prices if any, else its group total, else 0.
function lineCents(line: Line): number {
  return slotSum(line) ?? line.groupCents ?? 0;
}

export function BuyEngine({ customer }: { customer: CustomerPick }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [openId, setOpenId] = useState<string | null>(null); // auto-close: one dropdown at a time
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [lumpCents, setLumpCents] = useState<number | null>(null); // order-total override (path 1)
  const [showKeypad, setShowKeypad] = useState(false);
  const [idemKey] = useState(uid);
  const [done, setDone] = useState<{ balanceCents: number; method: 'store_credit' | 'cash' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const derivedCents = useMemo(() => lines.reduce((n, l) => n + lineCents(l), 0), [lines]);
  const payoutCents = lumpCents ?? derivedCents;

  function bump(cat: { label: string; itemType: Line['itemType'] }) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.category === cat.label);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i]!, qty: copy[i]!.qty + 1 };
        return copy;
      }
      return [...prev, { id: uid(), category: cat.label, itemType: cat.itemType, qty: 1, groupCents: null, slots: [] }];
    });
  }
  function patchLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function patchSlot(lineId: string, idx: number, patch: Partial<Slot>) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, slots: l.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)) } : l)),
    );
  }
  function addSlot(lineId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, slots: [...l.slots, { name: '', priceCents: null, showAdv: false, showNote: false }] } : l,
      ),
    );
  }
  function toggleOpen(id: string) {
    setOpenId((cur) => (cur === id ? null : id)); // auto-close the previous
  }

  async function commit(method: 'store_credit' | 'cash') {
    setError('');
    if (payoutCents <= 0) return setError('Enter how much you are paying out.');
    setBusy(true);
    const payloadLines: BuyLineInput[] = lines.map((l) => ({
      itemType: l.itemType,
      category: l.category,
      qty: l.qty,
      slots: l.slots.map((s) => ({
        ...(s.name.trim() ? { name: s.name.trim() } : {}),
        ...(s.priceCents != null ? { priceCents: s.priceCents } : {}),
        attributes: {
          ...(s.size ? { size: s.size } : {}),
          ...(s.condition ? { condition: s.condition } : {}),
          ...(s.brand ? { brand: s.brand } : {}),
          ...(s.note?.trim() ? { note: s.note.trim() } : {}),
        },
      })),
    }));
    const res = await buyCreate({ customerId: customer.id, payout: method, payoutCents, lines: payloadLines, idempotencyKey: idemKey });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({ balanceCents: res.balanceCents, method });
  }

  if (done) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 8 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={28} />
        </div>
        <div style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 18, marginTop: 6 }}>
          {done.method === 'store_credit' ? `Loaded ${formatCents(payoutCents)} store credit` : `Logged ${formatCents(payoutCents)} cash buy`}
        </div>
        <div className="sub">{customer.displayName}’s balance is now</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent)' }}>{formatCents(done.balanceCents)}</div>
        <button className="pri" style={{ maxWidth: 240, marginTop: 18 }} onClick={() => router.push('/store')}>Next customer</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* header */}
      <div className="bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 15 }}>Buy from seller</span>
        <button className="link" style={{ fontSize: 13 }} onClick={() => router.push('/store')}>Cancel</button>
      </div>

      {/* scroll area — the receipt */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        <div className="ctx">
          <span className="ini">{initials(customer.displayName)}</span>
          <span className="nm">{customer.displayName}</span>
          <span className="bal">balance<b className="t">{formatCents(customer.balanceCents)}</b></span>
        </div>

        {lines.length === 0 && (
          <p className="hint" style={{ textAlign: 'center', padding: '24px 0' }}>
            Tap a category below to ring it up — or just enter a total with the keypad.
          </p>
        )}

        {lines.map((line) => {
          const open = openId === line.id;
          const lc = lineCents(line);
          return (
            <div key={line.id}>
              <div className={`line${open ? ' open' : ''}`}>
                <button className="lnm" style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => toggleOpen(line.id)}>
                  {line.category}
                </button>
                {editingQty === line.id ? (
                  <input
                    className="qty edit"
                    style={{ width: 58 }}
                    autoFocus
                    inputMode="numeric"
                    defaultValue={String(line.qty)}
                    onBlur={(e) => { patchLine(line.id, { qty: Math.max(1, parseInt(e.target.value || '1', 10) || 1) }); setEditingQty(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <button className="qty" onClick={() => setEditingQty(line.id)}><span className="x">×</span>{line.qty}</button>
                )}
                {/* price cell — group total (path 2), tappable, never auto-split */}
                <PriceCell cents={lc || null} hasSlots={slotSum(line) != null} onSet={(c) => patchLine(line.id, { groupCents: c })} />
                <button onClick={() => toggleOpen(line.id)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
                  <ChevronRight className="chev" size={15} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }} />
                </button>
              </div>

              {open && (
                <div className="drop">
                  <button className="add-slot" onClick={() => addSlot(line.id)}><Plus size={15} /> Add another</button>
                  {line.slots.length === 0 && <p className="hint" style={{ padding: '0 4px 10px' }}>Add items to price or detail them — or tap the line price to set one total for all.</p>}
                  {line.slots.map((slot, i) => (
                    <SlotCard key={i} idx={i} slot={slot} category={line.category}
                      onPatch={(p) => patchSlot(line.id, i, p)} />
                  ))}
                  <div className="batch" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, border: '1px dashed var(--line)', borderRadius: 9, padding: 13 }}>
                    <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)' }}>
                      Or set one total for all {line.qty} on the line price above.
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* bottom action zone — the POS */}
      <div className="payout">
        <div className="cats" style={{ marginBottom: 13 }}>
          {STORE_CATEGORIES.map((c) => (
            <button key={c.label} className="cat" onClick={() => bump(c)}>{c.label}</button>
          ))}
          <button className="cat" style={{ opacity: 0.5 }} title="More categories — Settings-driven (Phase E)" disabled>More</button>
        </div>

        {showKeypad && (
          <div className="card pad" style={{ marginBottom: 12 }}>
            <MoneyKeypad cents={lumpCents ?? derivedCents} onChange={(c) => setLumpCents(c)} />
            <button className="btn sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => setShowKeypad(false)}>Done</button>
          </div>
        )}

        <div className="tot">
          <span className="l">Paying out</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <button className="kp" onClick={() => setShowKeypad((s) => !s)} aria-label="Enter order total"><Calculator size={20} style={{ color: 'var(--ink-soft)' }} /></button>
            <span className="v t">{formatCents(payoutCents)}</span>
          </div>
        </div>
        {error && <div className="err">{error}</div>}
        <button className="pri" disabled={busy} onClick={() => commit('store_credit')}>
          {busy ? 'Loading…' : `Load ${formatCents(payoutCents)} store credit`}
        </button>
        <button className="sec-act" disabled={busy} onClick={() => commit('cash')}>Pay cash instead</button>
      </div>
    </div>
  );
}

function PriceCell({ cents, hasSlots, onSet }: { cents: number | null; hasSlots: boolean; onSet: (c: number) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing && !hasSlots) {
    return (
      <input className="qty edit" style={{ width: 70 }} autoFocus inputMode="decimal" placeholder="$0"
        defaultValue={cents != null ? (cents / 100).toString() : ''}
        onBlur={(e) => { const v = parseFloat(e.target.value); onSet(Number.isFinite(v) ? Math.round(v * 100) : 0); setEditing(false); }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    );
  }
  if (cents == null) return <button className="lpr empty" onClick={() => setEditing(true)}>$ —</button>;
  return <button className="lpr" style={{ background: 'none', border: 0, cursor: hasSlots ? 'default' : 'pointer' }} onClick={() => !hasSlots && setEditing(true)}>{formatCents(cents)}</button>;
}

function SlotCard({ idx, slot, category, onPatch }: { idx: number; slot: Slot; category: string; onPatch: (p: Partial<Slot>) => void }) {
  const opts = ADVANCED_OPTIONS[category] ?? { conditions: [], brands: [] };
  return (
    <div className="slot">
      <div className="sr">
        <span className="snum">{idx + 1}</span>
        <div className="sf">
          <input style={{ border: 0, outline: 'none', font: 'inherit', fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 14, width: '100%', background: 'transparent' }}
            placeholder={`Item ${idx + 1} — add name`} value={slot.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </div>
        <input className="num" style={{ width: 64, textAlign: 'right', border: 0, outline: 'none', font: 'inherit', fontWeight: 800, fontSize: 15, background: 'transparent' }}
          inputMode="decimal" placeholder="$ —" defaultValue={slot.priceCents != null ? (slot.priceCents / 100).toString() : ''}
          onBlur={(e) => { const v = parseFloat(e.target.value); onPatch({ priceCents: Number.isFinite(v) ? Math.round(v * 100) : null }); }} />
        <Camera size={20} style={{ color: 'var(--faint)', flex: 'none' }} aria-label="Add photo (later)" />
      </div>
      <div className="sacts">
        <button onClick={() => onPatch({ showAdv: !slot.showAdv })}>＋ Advanced</button>
        <button onClick={() => onPatch({ showNote: !slot.showNote })}>＋ Note</button>
      </div>
      {slot.showAdv && (
        <div className="advp">
          {opts.sizes && <ChipRow label="Size" options={opts.sizes} value={slot.size} onPick={(v) => onPatch({ size: v })} />}
          <ChipRow label="Condition" options={opts.conditions} value={slot.condition} onPick={(v) => onPatch({ condition: v })} />
          {opts.brands.length > 0 && <ChipRow label="Brand" options={opts.brands} value={slot.brand} onPick={(v) => onPatch({ brand: v })} />}
        </div>
      )}
      {slot.showNote && (
        <div className="notep">
          <StickyNote size={13} style={{ color: 'var(--muted)', marginTop: 2, flex: 'none' }} />
          <input style={{ border: 0, outline: 'none', font: 'inherit', width: '100%', background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600 }}
            placeholder="e.g. box has wear, no lid" value={slot.note ?? ''} onChange={(e) => onPatch({ note: e.target.value })} />
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, options, value, onPick }: { label: string; options: string[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="af" style={{ marginBottom: 9 }}>
      <div className="afl">{label}</div>
      <div className="chips">
        {options.map((o) => (
          <button key={o} className={`chip${value === o ? ' on' : ''}`} onClick={() => onPick(value === o ? '' : o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}
