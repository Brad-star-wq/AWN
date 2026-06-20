'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { intakeCreate, type IntakeItemInput } from '@/lib/actions';
import { CustomerPicker, type CustomerSelection } from '@/components/customer-picker';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { draftTitle, itemEmoji } from '@/lib/format';
import type { ItemType } from '@/lib/types';

type LineItem = IntakeItemInput & { title: string };

const TYPES: ItemType[] = ['SHOE', 'CARD', 'OTHER'];
const TYPE_LABEL: Record<ItemType, string> = { SHOE: 'Shoe', CARD: 'Card', OTHER: 'Other' };
const FIELDS: Record<ItemType, { key: string; label: string }[]> = {
  SHOE: [
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'size', label: 'Size' },
  ],
  CARD: [
    { key: 'name', label: 'Name' },
    { key: 'set', label: 'Set' },
    { key: 'number', label: 'Card #' },
  ],
  OTHER: [{ key: 'description', label: 'Description' }],
};

export function IntakeForm() {
  const router = useRouter();
  const [sel, setSel] = useState<CustomerSelection>({ kind: 'none' });
  const [itemType, setItemType] = useState<ItemType>('SHOE');
  const [fields, setFields] = useState<Record<string, string>>({ condition: 'Good' });
  const [price, setPrice] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [payout, setPayout] = useState<'store_credit' | 'cash'>('store_credit');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const hasCondition = itemType !== 'OTHER';
  const committedCents = items.reduce((s, i) => s + i.payoutCents, 0);
  const currentCents = parseDollarsToCents(price) ?? 0;
  const totalCents = committedCents + currentCents;

  function buildCurrent(): LineItem | null {
    const cents = parseDollarsToCents(price);
    if (cents === null || cents <= 0) return null;
    const attributes: Record<string, unknown> = {};
    for (const f of FIELDS[itemType]) {
      const v = fields[f.key]?.trim();
      if (v) attributes[f.key] = v;
    }
    if (hasCondition && fields.condition) attributes.condition = fields.condition;
    return { itemType, attributes, payoutCents: cents, title: draftTitle(itemType, attributes) };
  }

  function addItem() {
    const current = buildCurrent();
    if (!current) {
      setError('Enter a price for this item before adding another.');
      return;
    }
    setItems((xs) => [...xs, current]);
    setFields({ condition: fields.condition ?? 'Good' });
    setPrice('');
    setError(undefined);
  }

  async function save() {
    setError(undefined);

    const all = [...items];
    const current = buildCurrent();
    if (current) all.push(current);
    if (all.length === 0) {
      setError('Add at least one item with a price.');
      return;
    }

    let customerArg: { customerId?: string; displayName?: string; phone?: string };
    if (sel.kind === 'existing') customerArg = { customerId: sel.pick.id };
    else if (sel.kind === 'new' && sel.name.trim())
      customerArg = { displayName: sel.name.trim(), phone: sel.phone.trim() || undefined };
    else {
      setError('Pick an existing customer or enter a name.');
      return;
    }

    setPending(true);
    const res = await intakeCreate({
      ...customerArg,
      payout,
      items: all.map(({ itemType, attributes, payoutCents }) => ({ itemType, attributes, payoutCents })),
    });
    setPending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/customers/${res.customerId}`);
    router.refresh();
  }

  return (
    <div className="formwrap">
      {error && <div className="err">{error}</div>}

      <CustomerPicker allowNew onChange={setSel} />

      <div className="eyebrow" style={{ margin: '18px 0 8px' }}>
        Item
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TYPES.map((t) => (
          <button key={t} type="button" className={t === itemType ? 'on' : undefined} onClick={() => setItemType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {itemType === 'OTHER' ? (
        <div className="field">
          <label>Description</label>
          <input
            value={fields.description ?? ''}
            onChange={(e) => setFields({ ...fields, description: e.target.value })}
          />
        </div>
      ) : (
        <div className="field-row">
          {FIELDS[itemType].map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
            </div>
          ))}
          <div className="field">
            <label>Condition</label>
            <select value={fields.condition ?? 'Good'} onChange={(e) => setFields({ ...fields, condition: e.target.value })}>
              <option>Good</option>
              <option>Like new</option>
              <option>Worn</option>
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label>Price you&apos;re paying</label>
        <input value={price} placeholder="$0.00" inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn sm" onClick={addItem}>
          + Add another item
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Add each item with its payout price. Photos &amp; listing price come later in Drafts.
      </p>

      {items.length > 0 && (
        <div className="added" style={{ marginTop: 16 }}>
          {items.map((it, i) => (
            <div className="ai" key={i}>
              <span className="thumb">{itemEmoji[it.itemType]}</span>
              {it.title}
              <span className="num" style={{ marginLeft: 'auto' }}>
                {formatCents(it.payoutCents)}
              </span>
              <button className="x" type="button" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="eyebrow" style={{ margin: '6px 0 8px' }}>
        Payout
      </div>
      <div className="seg">
        <button type="button" className={payout === 'store_credit' ? 'on' : undefined} onClick={() => setPayout('store_credit')}>
          Store credit
        </button>
        <button type="button" className={payout === 'cash' ? 'on' : undefined} onClick={() => setPayout('cash')}>
          Cash
        </button>
      </div>

      <div className="total-row">
        <span className="lbl">{payout === 'store_credit' ? 'Issuing as store credit' : 'Paying in cash'}</span>
        <span className="amt num">{formatCents(totalCents)}</span>
      </div>

      <button className="btn primary" style={{ marginTop: 16, width: '100%', padding: 11, justifyContent: 'center' }} onClick={save} disabled={pending}>
        {pending ? 'Saving…' : payout === 'store_credit' ? 'Save & issue credit' : 'Save intake'}
      </button>
      <p className="hint" style={{ textAlign: 'center' }}>
        {payout === 'store_credit'
          ? 'Credit posts now. Finish photos & details later in Drafts.'
          : 'Items go to Drafts. No store credit is issued for a cash payout.'}
      </p>
    </div>
  );
}
