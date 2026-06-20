'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Search, LayoutDashboard, UserPlus, ShoppingBag, ArrowUpFromLine } from 'lucide-react';
import { searchCustomersAction, customerCreate } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import type { CustomerPick } from '@/lib/types';

type Recent = { id: string; displayName: string; balanceCents: number; phone?: string };

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function StoreLookup({ recent }: { recent: Recent[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [selected, setSelected] = useState<Recent | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function onQuery(v: string) {
    setQuery(v);
    setSelected(null);
    clearTimeout(timer.current);
    if (!v.trim()) return setResults([]);
    timer.current = setTimeout(async () => setResults(await searchCustomersAction(v)), 180);
  }

  async function createAndSelect() {
    if (!query.trim() || busy) return;
    setBusy(true);
    const res = await customerCreate({ displayName: query.trim() });
    setBusy(false);
    if (res.ok) setSelected({ id: res.customerId, displayName: query.trim(), balanceCents: 0 });
  }

  async function createNamed() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const res = await customerCreate({ displayName: newName.trim() });
    setBusy(false);
    if (res.ok) setSelected({ id: res.customerId, displayName: newName.trim(), balanceCents: 0 });
  }

  const list = query.trim() ? results : recent;

  // A customer is chosen → show their balance + the two explicit actions.
  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <div style={{ flex: 1, padding: '20px 16px' }}>
          <button className="link" onClick={() => setSelected(null)} style={{ fontSize: 13, marginBottom: 18, display: 'inline-block' }}>
            ‹ Back to lookup
          </button>
          <div className="ctx" style={{ marginBottom: 20 }}>
            <span className="ini">{initials(selected.displayName)}</span>
            <span className="nm">{selected.displayName}</span>
            <span className="bal">balance<b className="t">{formatCents(selected.balanceCents)}</b></span>
          </div>
          <button className="pri" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
            onClick={() => router.push(`/store/buy?customer=${selected.id}`)}>
            <ShoppingBag size={18} /> Buy from {selected.displayName.split(' ')[0]}
          </button>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}
            onClick={() => router.push(`/store/redeem?customer=${selected.id}`)}>
            <ArrowUpFromLine size={17} /> Redeem credit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <div style={{ flex: 1, padding: '16px 16px 24px' }}>
        <div className="search" style={{ width: '100%', marginLeft: 0, marginBottom: 16, padding: '11px 13px' }}>
          <Search size={16} style={{ color: 'var(--muted)' }} />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search by name or phone…" autoFocus />
        </div>

        <div className="eyebrow" style={{ marginBottom: 8 }}>{query.trim() ? 'Results' : 'Recent customers'}</div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="rowlist">
            {list.map((r) => (
              <button key={r.id} type="button" className="row" style={{ background: 'none', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setSelected({ id: r.id, displayName: r.displayName, balanceCents: r.balanceCents, ...(r.phone ? { phone: r.phone } : {}) })}>
                <span className="av">{initials(r.displayName)}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 14, display: 'block' }}>{r.displayName}</span>
                  {r.phone ? <span className="sub" style={{ fontSize: 12 }}>{r.phone}</span> : null}
                </span>
                <span className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatCents(r.balanceCents)}</span>
                <ChevronRight size={15} style={{ color: 'var(--faint)' }} />
              </button>
            ))}
            {list.length === 0 && (
              <div className="row" style={{ color: 'var(--muted)', fontSize: 13 }}>
                {query.trim() ? 'No match.' : 'No customers yet — add the first.'}
              </div>
            )}
          </div>
        </div>

        {/* New customer — name only, never gate a buy behind a contact form.
            Works two ways: search-then-add, OR the standalone button below. */}
        {query.trim() && results.length === 0 ? (
          <button className="pri" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={busy} onClick={createAndSelect}>
            <UserPlus size={17} /> Add “{query.trim()}” as new customer
          </button>
        ) : creating ? (
          <div className="card pad" style={{ marginTop: 14 }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>New customer name</label>
              <input autoFocus value={newName} placeholder="Full name" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createNamed()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pri" style={{ flex: 1 }} disabled={busy || !newName.trim()} onClick={createNamed}>{busy ? 'Creating…' : 'Create'}</button>
              <button className="btn" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn" style={{ marginTop: 14, width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => setCreating(true)}>
            <UserPlus size={16} /> New customer
          </button>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 16 }}>AWN — Store</span>
      <Link href="/" className="link" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <LayoutDashboard size={15} /> Dashboard
      </Link>
    </div>
  );
}
