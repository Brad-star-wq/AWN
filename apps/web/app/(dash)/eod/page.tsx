import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { getEndOfDay } from '@/lib/server/queries';
import { formatCentsShort, formatCents } from '@/lib/money';
import { MarkReviewed } from '@/components/eod/mark-reviewed';
import { DashHeader } from '@/components/shell/dash-header';
import { dateLong } from '@/lib/format';

export default async function EndOfDayPage() {
  const eod = await getEndOfDay();
  const attention = eod.unmatched.length + eod.negativeBalances.length;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="End of day" sub={dateLong()} />
      <div className="grid4">
        <div className="stat"><div className="k">Credit given</div><div className="v num">{formatCentsShort(eod.givenCents)}</div></div>
        <div className="stat"><div className="k">Credit redeemed</div><div className="v num pos">{formatCentsShort(eod.usedCents)}</div></div>
        <div className="stat"><div className="k">Cash paid to sellers</div><div className="v num">{formatCentsShort(eod.cashCents)}</div></div>
        <div className="stat"><div className="k">Items bought</div><div className="v num">{eod.itemsBought}</div></div>
      </div>

      <div className="moneyblock" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div><div className="l">Outstanding store-credit liability</div><div className="v num">{formatCentsShort(eod.outstandingLiabilityCents)}</div></div>
        <p className="hint" style={{ color: '#9aa6b4', maxWidth: 320, margin: 0 }}>
          Cross-check <b style={{ color: '#fff' }}>{formatCentsShort(eod.cashCents)}</b> cash paid against Square’s drawer report before closing.
        </p>
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
    </div>
  );
}
