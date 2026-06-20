'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustCredit } from '@/lib/actions';
import { parseDollarsToCents } from '@/lib/money';
import { FocusFlow } from '@/components/forms/focus-flow';
import { SegGroup } from '@/components/forms/button-group';

export function IssueAdjustCredit({
  customerId,
  triggerLabel = 'Issue / adjust credit',
  triggerClassName = 'btn sm',
}: {
  customerId: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'issue' | 'deduct'>('issue');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  function save() {
    setErr(undefined);
    const cents = parseDollarsToCents(amount);
    if (cents === null || cents <= 0) {
      setErr('Enter an amount greater than zero.');
      return;
    }
    const signed = mode === 'deduct' ? -cents : cents;
    start(async () => {
      const res = await adjustCredit({ customerId, amountCents: signed, note: note.trim() || undefined });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setAmount('');
      setNote('');
      router.refresh();
    });
  }

  return (
    <>
      <button className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,42,.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}
        >
          <FocusFlow order={['mode', 'amount', 'note', 'submit']} className="card">
            <div style={{ width: 380, maxWidth: '90vw', padding: 20 }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Issue / adjust credit</h2>
              {err && <div className="err">{err}</div>}
              <div style={{ marginBottom: 14 }}>
                <SegGroup stopId="mode" ariaLabel="Adjustment type" value={mode} onSelect={setMode}
                  options={[{ label: 'Issue (+)', value: 'issue' }, { label: 'Deduct (−)', value: 'deduct' }]} />
              </div>
              <div className="field">
                <label>Amount</label>
                <input data-stop="amount" enterKeyHint="next" value={amount} placeholder="$0.00" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input data-stop="note" enterKeyHint="done" value={note} placeholder="Reason for the adjustment" onChange={(e) => setNote(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" data-stop="submit" data-primary="true" className="btn primary" disabled={pending} onClick={save}>
                  {pending ? 'Saving…' : 'Apply'}
                </button>
                <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </FocusFlow>
        </div>
      )}
    </>
  );
}
