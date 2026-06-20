import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomerDetail } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';
import { itemEmoji } from '@/lib/format';
import { ActivityRowView } from '@/components/activity-row';
import { IssueAdjustCredit } from '@/components/customers/issue-adjust';

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const c = await getCustomerDetail(params.id);
  if (!c) notFound();

  return (
    <>
      <Link className="btn sm" href="/customers" style={{ marginBottom: 16 }}>
        ← Customers
      </Link>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {c.displayName} <span className="badge tracked" style={{ marginLeft: 6 }}>Tracked</span>
            </div>
            <div className="sub" style={{ marginTop: 4 }}>{c.phone ?? 'No phone on file'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="sub" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.05em' }}>Store credit</div>
            <div
              className="num"
              style={{ fontSize: 24, fontWeight: 600, color: c.balanceCents < 0 ? 'var(--warn)' : 'var(--teal-d)' }}
            >
              {formatCents(c.balanceCents)}
            </div>
          </div>
        </div>
        <div className="pad" style={{ borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
          <Link className="btn primary sm" href={`/redeem?customer=${c.id}`}>
            Redeem credit
          </Link>
          <IssueAdjustCredit customerId={c.id} />
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="sect-title">Credit history</span>
          </div>
          {c.history.length === 0 ? (
            <div className="pad sub">No credit activity yet.</div>
          ) : (
            <div className="rowlist">
              {c.history.map((row) => (
                <ActivityRowView key={row.id} row={row} showName={false} showDetail />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="sect-title">Items sold to you</span>
          </div>
          {c.itemsSold.length === 0 ? (
            <div className="pad sub">No items recorded.</div>
          ) : (
            <div className="rowlist">
              {c.itemsSold.map((it) => (
                <div className="row" key={it.id}>
                  <span className="thumb">{itemEmoji[it.itemType]}</span>
                  {it.title}
                  <span className="amt num">{it.priceCents !== undefined ? formatCents(it.priceCents) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
