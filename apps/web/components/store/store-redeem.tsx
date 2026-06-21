'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { redeemCredit } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { MoneyKeypad } from '@/components/store/money-keypad';
import type { CustomerPick } from '@/lib/types';

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

// App-first redeem: the flow starts here in the app (customer + amount), the
// keypad is hard-capped at the balance so an overdraw is impossible, and on
// confirm we post the negative ledger entry and show the new balance. The owner
// then rings the matching Store Credit tender on Square — we never assume Square
// started it (that reconciliation is the separate Phase 5 seam).
export function StoreRedeem({ customer }: { customer: CustomerPick }) {
  const router = useRouter();
  const [cents, setCents] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ amountCents: number; balanceCents: number } | null>(null);

  async function confirm() {
    if (cents <= 0) return;
    setError('');
    setBusy(true);
    const res = await redeemCredit({ customerId: customer.id, amountCents: cents });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({ amountCents: cents, balanceCents: res.balanceCents });
  }

  if (done) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 8 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={28} />
        </div>
        <div style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 18, marginTop: 6 }}>Redeemed {formatCents(done.amountCents)}</div>
        <div className="sub">{customer.displayName}’s balance is now</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>{formatCents(done.balanceCents)}</div>
        <div className="instruction" style={{ maxWidth: 320, marginTop: 16, textAlign: 'left' }}>
          On Square, ring this sale and take <b>{formatCents(done.amountCents)}</b> as the <b>“Other Gift Card or Certificate”</b> (Store Credit) tender.
        </div>
        <button className="pri" style={{ maxWidth: 240, marginTop: 8 }} onClick={() => router.push('/store')}>Done</button>
      </div>
    );
  }

  const balance = customer.balanceCents;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 15 }}>Redeem credit</span>
        <button className="link" style={{ fontSize: 13 }} onClick={() => router.push('/store')}>Cancel</button>
      </div>

      <div style={{ flex: 1, padding: '16px 16px 0' }}>
        <div className="ctx" style={{ marginBottom: 16 }}>
          <span className="ini">{initials(customer.displayName)}</span>
          <span className="nm">{customer.displayName}</span>
          <span className="bal">balance<b className="t">{formatCents(balance)}</b></span>
        </div>

        {balance <= 0 ? (
          <p className="hint" style={{ textAlign: 'center', padding: 24 }}>No store credit to redeem.</p>
        ) : (
          <MoneyKeypad cents={cents} onChange={setCents} maxCents={balance} />
        )}
      </div>

      {balance > 0 && (
        <div className="payout">
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 10, padding: 12 }} onClick={() => setCents(balance)}>
            Redeem all · {formatCents(balance)}
          </button>
          {error && <div className="err">{error}</div>}
          <button className="pri" disabled={busy || cents <= 0} onClick={confirm}>
            {busy ? 'Redeeming…' : `Redeem ${formatCents(cents)}`}
          </button>
        </div>
      )}
    </div>
  );
}
