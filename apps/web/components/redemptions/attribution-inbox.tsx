'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCents } from '@/lib/money';
import { activityTime } from '@/lib/format';
import { useAttributionQueue } from '@/components/redemptions/use-attribution-queue';
import { AssignModal } from '@/components/redemptions/assign-modal';
import type { RedemptionQueueItem } from '@/lib/types';

/**
 * The live "Redemptions to assign (N)" affordance (Phase D). Unmissable, and it
 * updates without a refresh (Realtime + a 10s poll fallback). Two shells:
 *  • banner — the dashboard Today screen (expands inline to the queue).
 *  • badge  — the compact in-store shell (opens the same queue panel).
 * Each item shows amount + time + location; the primary action is Assign.
 */
export function AttributionInbox({
  initial,
  variant = 'banner',
}: {
  initial: RedemptionQueueItem[];
  variant?: 'banner' | 'badge';
}) {
  const items = useAttributionQueue(initial);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState<RedemptionQueueItem | null>(null);

  const count = items.length;

  function onAssigned() {
    setAssigning(null);
    router.refresh(); // pull fresh balances/activity into the server-rendered view
  }

  const list =
    count === 0 ? null : (
      <div className="rowlist" style={{ marginTop: 10 }}>
        {items.map((it) => (
          <div key={it.id} className="row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="num" style={{ fontWeight: 800, color: 'var(--accent)', minWidth: 72 }}>
              {formatCents(it.amountCents)}
            </span>
            <span className="sub" style={{ flex: 1 }}>
              {activityTime(it.createdAt)}
              {it.locationId ? ` · ${it.locationId}` : ''}
            </span>
            <button className="pri" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setAssigning(it)}>
              Assign to customer
            </button>
          </div>
        ))}
      </div>
    );

  const modal = assigning ? (
    <AssignModal item={assigning} onClose={() => setAssigning(null)} onDone={onAssigned} />
  ) : null;

  if (variant === 'badge') {
    if (count === 0) return null;
    return (
      <>
        <button
          className="card"
          onClick={() => setOpen((v) => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--accent)', background: 'var(--accent-soft)', cursor: 'pointer' }}
        >
          <Bell size={16} className="text-accent" />
          <span style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 14 }}>
            {count} redemption{count === 1 ? '' : 's'} to assign
          </span>
          <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>
        {open && list}
        {modal}
      </>
    );
  }

  // banner variant (dashboard). Hidden entirely when the queue is empty.
  if (count === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 20, padding: 16, border: '1px solid var(--accent)', background: 'var(--accent-soft)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <Bell size={18} className="text-accent" />
        <span style={{ fontFamily: 'var(--ui)', fontWeight: 800, fontSize: 15 }}>
          {count} redemption{count === 1 ? '' : 's'} to assign
        </span>
        <span className="sub" style={{ marginLeft: 6 }}>rung on Square — tap to assign a customer</span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </button>
      {open && list}
      {modal}
    </div>
  );
}
