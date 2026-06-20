import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { getEndOfDay } from '@/lib/server/queries';
import { formatCentsShort, formatCents } from '@/lib/money';
import { MarkReviewed } from '@/components/eod/mark-reviewed';

export default async function EndOfDayPage() {
  const eod = await getEndOfDay();
  const attention = eod.unmatched.length + eod.negativeBalances.length;

  return (
    <>
      <div className="grid4">
        <div className="stat">
          <div className="k">Credit given</div>
          <div className="v num">{formatCentsShort(eod.givenCents)}</div>
        </div>
        <div className="stat">
          <div className="k">Credit used</div>
          <div className="v num pos">{formatCentsShort(eod.usedCents)}</div>
        </div>
        <div className="stat">
          <div className="k">Sales</div>
          <div className="v num">{formatCentsShort(eod.salesCents)}</div>
        </div>
        <div className="stat">
          <div className="k">Outstanding credit</div>
          <div className="v num teal">{formatCentsShort(eod.outstandingLiabilityCents)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="pad" style={{ borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center' }}>
          <span className="sect-title">Needs attention</span>
          <span className="badge draft" style={{ marginLeft: 8 }}>{attention}</span>
        </div>
        {attention === 0 ? (
          <div className="pad sub">Nothing to clear — the books agree.</div>
        ) : (
          <div className="rowlist">
            {eod.unmatched.map((u) => (
              <div className="row" key={u.orderRef}>
                <TriangleAlert size={15} style={{ color: 'var(--warn)' }} />
                Sale {u.orderRef} · {u.reason.replace(/-/g, ' ')}
                <span className="amt neg">{formatCents(u.amountCents)}</span>
                <button className="btn sm" style={{ marginLeft: 12 }} disabled title="Customer matching arrives with the Square sync (Phase 5)">
                  Match
                </button>
              </div>
            ))}
            {eod.negativeBalances.map((n) => (
              <div className="row" key={n.customerId}>
                <TriangleAlert size={15} style={{ color: 'var(--warn)' }} />
                {n.displayName} · balance went negative
                <span className="amt neg">{formatCents(n.balanceCents)}</span>
                <Link className="btn sm" style={{ marginLeft: 12 }} href={`/customers/${n.customerId}`}>
                  Review
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Clear these and the day reconciles. Most days this list is empty. (Unmatched sales appear once Square sync is wired.)
      </p>
      <MarkReviewed />
    </>
  );
}
