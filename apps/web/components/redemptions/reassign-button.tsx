'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reassignRedemptionAction } from '@/lib/actions';

/**
 * "Reassign" on a finalized redemption (wrong-customer fix). Appends a reversal
 * and re-queues the redemption for attribution — the credit returns to this
 * customer and the row reappears in "Redemptions to assign". Append-only.
 */
export function ReassignButton({ redemptionId }: { redemptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await reassignRedemptionAction(redemptionId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button className="link" style={{ fontSize: 12 }} onClick={run} disabled={busy} title="Wrong customer? Return the credit and re-queue">
        {busy ? 'Reassigning…' : 'Reassign'}
      </button>
      {error ? <span className="err" style={{ fontSize: 11 }}>{error}</span> : null}
    </span>
  );
}
