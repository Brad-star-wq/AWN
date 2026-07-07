'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { redeemCredit } from '@/lib/actions';
import { CustomerCombobox } from '@/components/forms/customer-combobox';
import { MoneyField } from '@/components/forms/money-field';
import type { CustomerSelection } from '@/components/customer-picker';
import { formatCents } from '@/lib/money';
import type { CustomerPick } from '@/lib/types';

export function RedeemFlow({ initial }: { initial: CustomerPick | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerPick | null>(initial);
  const [sel, setSel] = useState<CustomerSelection>(
    initial ? { kind: 'existing', pick: initial } : { kind: 'none' },
  );
  const [cents, setCents] = useState<number | null>(
    initial && initial.balanceCents > 0 ? initial.balanceCents : null,
  );
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  function onPick(s: CustomerSelection) {
    setSel(s);
    setError(undefined);
    setDone(undefined);
    if (s.kind === 'existing') {
      setCustomer(s.pick);
      setCents(s.pick.balanceCents > 0 ? s.pick.balanceCents : null);
    } else {
      setCustomer(null);
    }
  }

  // "← Pick a different customer": reset the whole flow to a fresh picker.
  // Root cause of the old glitch was leftover step state — the prior selection,
  // the entered amount, and any success/error message all lingered. Clear them
  // all so step 1 re-mounts a blank CustomerCombobox (empty search) every time.
  function pickDifferent() {
    setCustomer(null);
    setSel({ kind: 'none' });
    setCents(null);
    setError(undefined);
    setDone(undefined);
  }

  // ----- Step 1: choose a customer -----
  if (!customer) {
    return (
      <div className="card p-4 md:p-6">
        <div className="rounded-[10px] border border-line p-4">
          <p className="sub mb-3">Pick the customer redeeming credit.</p>
          <CustomerCombobox value={sel} onChange={onPick} />
          {sel.kind === 'new' && (
            <p className="hint mt-1">Only an existing customer with a tracked balance can redeem credit.</p>
          )}
        </div>
      </div>
    );
  }

  // ----- Step 2: amount + confirm -----
  const balance = customer.balanceCents;
  const valid = cents !== null && cents > 0 && cents <= balance;
  const over = cents !== null && cents > balance;
  const draw = cents && cents > 0 ? cents : 0;

  function confirm() {
    setError(undefined);
    if (cents === null || cents <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    start(async () => {
      const res = await redeemCredit({ customerId: customer!.id, amountCents: cents! });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const updated = { ...customer!, balanceCents: res.balanceCents };
      setCustomer(updated);
      setSel({ kind: 'existing', pick: updated });
      setDone(`Deducted. New balance ${formatCents(res.balanceCents)}.`);
      setCents(null);
      router.refresh();
    });
  }

  return (
    <div className="card p-4 md:p-6">
      {/* balance header */}
      <div className="flex items-center justify-between rounded-[10px] border border-line p-4">
        <div>
          <div className="font-display text-[15px] font-semibold">
            {customer.displayName}
            <span className="badge tracked" style={{ marginLeft: 6 }}>Tracked</span>
          </div>
          {customer.phone && <div className="sub mt-[3px]">{customer.phone}</div>}
        </div>
        <div className="text-right">
          <div className="flabel">Balance</div>
          <div className="num text-[22px] font-extrabold text-accent">{formatCents(balance)}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={pickDifferent}
        className="mt-3 inline-flex items-center gap-1 rounded-[8px] px-[10px] py-[7px] font-display text-[13px] font-semibold text-ink-soft hover:bg-accent-soft"
      >
        ← Pick a different customer
      </button>

      {done && <div className="mt-3 rounded-[10px] bg-accent-soft p-4 text-[13px] font-medium text-accent">{done}</div>}
      {error && <div className="err mt-3">{error}</div>}

      {balance <= 0 ? (
        <p className="hint mt-4">This customer has no credit to redeem.</p>
      ) : (
        <div className="mt-5 max-w-[520px]">
          <div className="mb-[13px]">
            <div className="flabel mb-[5px]">Amount to use</div>
            <MoneyField cents={cents} onCents={setCents} stopId="amount" isLast />
            <p className="hint mt-2" style={{ color: over ? 'var(--warn)' : undefined }}>
              {over
                ? `Capped at ${formatCents(balance)} — that is more than the balance.`
                : `Partial is fine. Capped at ${formatCents(balance)}.`}
            </p>
          </div>

          <div className="my-4 rounded-[10px] bg-accent-soft p-4 text-[13px] leading-[1.55] text-accent">
            At the register, take <b className="text-ink">{formatCents(draw)} as a “Store Credit” tender</b>, then put the rest on card.
            <br />
            The sale rings at full price, so tax stays correct.
          </div>

          <button
            type="button"
            disabled={!valid || pending}
            onClick={confirm}
            className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-accent p-[14px] font-display text-[14.5px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Deducting…' : `Confirm & deduct ${formatCents(draw)}`}
          </button>
          <p className="hint mt-2 text-center">
            App-first: the amount is capped at the balance, so it can never overdraw.
          </p>
        </div>
      )}
    </div>
  );
}
