import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { listCustomers } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';
import { lastActivityLabel } from '@/lib/format';
import { DashHeader } from '@/components/shell/dash-header';
import { Avatar } from '@/components/ui/avatar';
import { AddCustomer } from '@/components/customers/add-customer';

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string; filter?: string } }) {
  const filter = searchParams.filter === 'withCredit' ? 'withCredit' : 'all';
  let rows = await listCustomers(filter);
  const q = (searchParams.q ?? '').trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.displayName.toLowerCase().includes(q) || (r.phone ?? '').toLowerCase().includes(q));

  return (
    <div className="mx-auto w-full max-w-[1080px] px-12 pb-14 pt-10">
      <DashHeader eyebrow="Dashboard" title="People" sub={`${rows.length} customer${rows.length === 1 ? '' : 's'}`} />

      <div className="mb-4 flex items-center gap-3">
        <form className="flex-1">
          <div className="search" style={{ width: '100%', marginLeft: 0 }}>
            <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search people by name or phone…" />
          </div>
        </form>
        <div className="tabs">
          <Link href="/customers" className={filter === 'all' ? 'on' : undefined}>All</Link>
          <Link href="/customers?filter=withCredit" className={filter === 'withCredit' ? 'on' : undefined}>With credit</Link>
        </div>
        <AddCustomer />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="rowlist">
          {rows.length === 0 && <div className="row sub">No customers yet — add one, or take an intake.</div>}
          {rows.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar name={c.displayName} size="md" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="font-display" style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>{c.displayName}</span>
                <span className="sub" style={{ fontSize: 12.5 }}>{c.phone ?? 'No phone'} · {lastActivityLabel(c.lastActivity)}</span>
              </span>
              <span className="num" style={{ fontWeight: 700, color: c.balanceCents > 0 ? 'var(--accent)' : 'var(--ink-soft)' }}>{formatCents(c.balanceCents)}</span>
              <ChevronRight size={15} style={{ color: 'var(--faint)' }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
