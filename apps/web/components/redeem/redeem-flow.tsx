'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { redeemCredit } from '@/lib/actions';
import { CustomerPicker, type CustomerSelection } from '@/components/customer-picker';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import type { CustomerPick } from '@/lib/types';

export function RedeemFlow({ initial }: { initial: CustomerPick | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerPick | null>(initial);
  const [amount, setAmount] = useState(initial && initial.balanceCents > 0 ? (initial.balanceCents / 100).toFixed(2) : '');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  function onPick(s: CustomerSelection) {
    setError(undefined);
    setDone(undefined);
    if (s.kind === 'existing') {
      setCustomer(s.pick);
      setAmount(s.pick.balanceCents > 0 ? (s.pick.balanceCents / 100).toFixed(2) : '');
    } else {
      setCustomer(null);
    }
  }

  if (!customer) {
    return (
      <div className="redeem-wrap">
        <p className="hint" style={{ marginBottom: 12 }}>Pick the customer redeeming credit.</p>
        <CustomerPicker onChange={onPick} />
      </div>
    );
  }

  const cents = parseDollarsToCents(amount);
  const balance = customer.balanceCents;
  const valid = cents !== null && cents > 0 && cents <= balance;
  const over = cents !== null && cents > balance;

  function confirm() {
    setError(undefined);
    if (cents === null || cents <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    start(async () => {
      const res = await redeemCredit({ customerId: customer!.id, amountCents: cents });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCustomer({ ...customer!, balanceCents: res.balanceCents });
      setDone(`Deducted. New balance ${formatCents(res.balanceCents)}.`);
      setAmount('');
      router.refresh();
    });
  }

  return (
    <div className="redeem-wrap">
      <div className="balance-card">
        <div className="who">
          {customer.displayName}
          <span className="badge tracked" style={{ marginLeft: 6 }}>Tracked</span>
          {customer.phone && (
            <div className="sub" style={{ marginTop: 3 }}>{customer.phone}</div>
          )}
        </div>
        <div className="b">
          <div className="k">Balance</div>
          <div className="v">{formatCents(customer.balanceCents)}</div>
        </div>
      </div>

      <button className="btn sm" onClick={() => setCustomer(null)} style={{ marginBottom: 14 }}>
        ← Pick a different customer
      </button>

      {done && <div className="instruction">{done}</div>}
      {error && <div className="err">{error}</div>}

      {balance <= 0 ? (
        <p className="hint">This customer has no credit to redeem.</p>
      ) : (
        <>
          <div className="field">
            <label>Amount to use</label>
            <input value={amount} inputMode="decimal" placeholder="$0.00" onChange={(e) => setAmount(e.target.value)} />
            <p className="hint" style={{ color: over ? 'var(--warn)' : undefined }}>
              {over ? `Capped at ${formatCents(balance)} — that is more than the balance.` : `Partial is fine. Capped at ${formatCents(balance)}.`}
            </p>
          </div>

          <div className="instruction">
            At the register, take <b>{formatCents(cents && cents > 0 ? cents : 0)} as a “Store Credit” tender</b>, then put the rest on card.
            <br />
            The sale rings at full price, so tax stays correct.
          </div>

          <button className="btn primary" style={{ width: '100%', padding: 11, justifyContent: 'center' }} disabled={!valid || pending} onClick={confirm}>
            {pending ? 'Deducting…' : `Confirm & deduct ${formatCents(cents && cents > 0 ? cents : 0)}`}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>
            App-first: the amount is capped at the balance, so it can never overdraw.
          </p>
        </>
      )}
    </div>
  );
}
