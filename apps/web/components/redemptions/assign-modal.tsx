'use client';

import { useState } from 'react';
import { attributeRedemption } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { CustomerPicker, type CustomerSelection } from '@/components/customer-picker';
import type { RedemptionQueueItem } from '@/lib/types';

/**
 * Assign one unattributed redemption to a customer (Phase E's action, opened
 * from the Phase D queue). Over-balance surfaces an explicit confirm showing the
 * customer's available credit; confirming finalizes with a negative_balance flag.
 */
export function AssignModal({
  item,
  onClose,
  onDone,
}: {
  item: RedemptionQueueItem;
  onClose: () => void;
  onDone: (result: { balanceCents: number; negativeBalance: boolean }) => void;
}) {
  const [sel, setSel] = useState<CustomerSelection>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ available: number } | null>(null);

  const hasCustomer =
    sel.kind === 'existing' || (sel.kind === 'new' && sel.name.trim().length > 0);

  function customerInput() {
    if (sel.kind === 'existing') return { customerId: sel.pick.id };
    if (sel.kind === 'new') return { displayName: sel.name, phone: sel.phone };
    return {};
  }

  async function submit(confirmNegative = false) {
    if (!hasCustomer) return;
    setBusy(true);
    setError('');
    const res = await attributeRedemption({
      redemptionId: item.id,
      confirmNegative,
      ...customerInput(),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if ('needsConfirm' in res && res.needsConfirm) {
      setConfirm({ available: res.available });
      return;
    }
    if ('balanceCents' in res) onDone({ balanceCents: res.balanceCents, negativeBalance: res.negativeBalance });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,28,38,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 17 }}>Assign redemption</h3>
          <button className="link" style={{ fontSize: 13 }} onClick={onClose}>Cancel</button>
        </div>
        <p className="sub" style={{ marginBottom: 14 }}>
          <b className="num" style={{ color: 'var(--accent)' }}>{formatCents(item.amountCents)}</b> rung on Square — who redeemed it?
        </p>

        {confirm ? (
          <div>
            <p className="hint" style={{ marginBottom: 14 }}>
              This is <b>{formatCents(item.amountCents - confirm.available)}</b> over their{' '}
              <b>{formatCents(confirm.available)}</b> available balance. Assign anyway? It will be flagged as a negative balance.
            </p>
            {error && <div className="err" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirm(null)} disabled={busy}>Back</button>
              <button className="pri" style={{ flex: 1 }} onClick={() => submit(true)} disabled={busy}>
                {busy ? 'Assigning…' : 'Assign anyway'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <CustomerPicker allowNew onChange={setSel} />
            {error && <div className="err" style={{ marginTop: 8, marginBottom: 10 }}>{error}</div>}
            <button className="pri" style={{ marginTop: 8 }} disabled={busy || !hasCustomer} onClick={() => submit(false)}>
              {busy ? 'Assigning…' : `Assign ${formatCents(item.amountCents)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
