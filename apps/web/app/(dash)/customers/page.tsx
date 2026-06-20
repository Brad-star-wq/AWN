import Link from 'next/link';
import { listCustomers } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';
import { lastActivityLabel } from '@/lib/format';
import { AddCustomer } from '@/components/customers/add-customer';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const filter = searchParams.filter === 'withCredit' ? 'withCredit' : 'all';
  let rows = await listCustomers(filter);

  const q = (searchParams.q ?? '').trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.displayName.toLowerCase().includes(q) || (r.phone ?? '').toLowerCase().includes(q));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div className="tabs">
          <Link href="/customers" className={filter === 'all' ? 'on' : undefined}>
            All
          </Link>
          <Link href="/customers?filter=withCredit" className={filter === 'withCredit' ? 'on' : undefined}>
            With credit
          </Link>
        </div>
        <AddCustomer />
      </div>

      {q && (
        <p className="hint" style={{ marginBottom: 12 }}>
          Showing results for “{searchParams.q}”. <Link className="link" href="/customers">Clear</Link>
        </p>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Store credit</th>
              <th>Last activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="sub" style={{ padding: 18 }}>
                  No customers yet — add one, or take an intake.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="link" href={`/customers/${c.id}`}>
                    <b>{c.displayName}</b>
                  </Link>
                </td>
                <td className="sub">{c.phone ?? '—'}</td>
                <td className="bal">{formatCents(c.balanceCents)}</td>
                <td className="sub">{lastActivityLabel(c.lastActivity)}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link className="btn sm" href={`/redeem?customer=${c.id}`}>
                    Redeem
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
