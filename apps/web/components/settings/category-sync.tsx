'use client';

import { useState, useTransition } from 'react';
import { syncCategoryToSquare } from '@/lib/actions';
import { FINISH_CATEGORIES } from '@/lib/categories';

// Settings is the master for categories: edit once → push to Square as a
// CatalogCategory (full-object upsert, ITEMS_WRITE) via the dedicated catalog
// adapter. (Adds are in-session for now; persistent settings tables are the
// remaining Phase E piece.)
export function CategorySync() {
  const [items, setItems] = useState<string[]>([...FINISH_CATEGORIES]);
  const [newCat, setNewCat] = useState('');
  const [status, setStatus] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [pending, start] = useTransition();

  function sync(name: string) {
    start(async () => {
      const res = await syncCategoryToSquare(name);
      setStatus((s) => ({ ...s, [name]: { ok: res.ok, msg: res.ok ? 'Synced ✓' : res.error } }));
    });
  }
  function add() {
    const n = newCat.trim();
    if (!n || items.includes(n)) return;
    setItems((i) => [...i, n]);
    setNewCat('');
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="sect-title">Categories → Square</span>
      </div>
      <div className="rowlist">
        {items.map((c) => (
          <div className="row" key={c}>
            <span style={{ flex: 1, fontWeight: 600 }}>{c}</span>
            {status[c] && (
              <span className="sub" style={{ marginRight: 10, color: status[c]!.ok ? 'var(--accent)' : 'var(--danger)' }}>{status[c]!.msg}</span>
            )}
            <button className="btn sm" disabled={pending} onClick={() => sync(c)}>Push to Square</button>
          </div>
        ))}
      </div>
      <div className="pad" style={{ borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
        <input className="finp" value={newCat} placeholder="Add a category…" onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>Add</button>
      </div>
      <p className="hint" style={{ padding: '0 18px 14px' }}>
        Full-object upsert with 429 retry, version-pinned. Needs a Square token with ITEMS_WRITE; persistent editable lists land with the settings tables.
      </p>
    </div>
  );
}
