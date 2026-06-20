'use client';

import { useRef, useState } from 'react';
import { searchCustomersAction } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { useFocusFlow } from '@/components/forms/focus-flow';
import type { CustomerPick } from '@/lib/types';
import type { CustomerSelection } from '@/components/customer-picker';

// Keyboard-first customer combobox: type filters; ArrowUp/Down move the
// highlight; Enter selects the highlighted result (or the "Use new customer"
// row) and advances. No mouse required; tapping a row works too.
export function CustomerCombobox({
  value,
  stopId = 'customer',
  onChange,
}: {
  value: CustomerSelection;
  stopId?: string;
  onChange: (s: CustomerSelection) => void;
}) {
  const flow = useFocusFlow();
  const [query, setQuery] = useState(value.kind === 'existing' ? value.pick.displayName : value.kind === 'new' ? value.name : '');
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showCreate = query.trim().length > 0;
  const rowCount = results.length + (showCreate ? 1 : 0);

  function search(q: string) {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setResults(await searchCustomersAction(q));
      setOpen(true);
      setHi(0);
    }, 160);
  }
  function onInput(v: string) {
    setQuery(v);
    onChange(v.trim() ? { kind: 'new', name: v, phone: value.kind === 'new' ? value.phone : '' } : { kind: 'none' });
    if (v.trim()) search(v);
    else { setResults([]); setOpen(false); }
  }
  function chooseExisting(p: CustomerPick) {
    setQuery(p.displayName);
    onChange({ kind: 'existing', pick: p });
    setOpen(false);
    flow?.advance(stopId);
  }
  function chooseCreate() {
    onChange({ kind: 'new', name: query.trim(), phone: '' });
    setOpen(false);
    flow?.advance(stopId);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(0, rowCount - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && hi < results.length) chooseExisting(results[hi]!);
      else if (showCreate) chooseCreate();
      else flow?.advance(stopId); // empty → skip
    }
  }

  return (
    <div className="field" style={{ position: 'relative', marginBottom: 14 }}>
      <label>Customer</label>
      <input
        data-stop={stopId}
        data-combobox="true"
        value={query}
        placeholder="Search by name or phone…"
        enterKeyHint="next"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && rowCount > 0 && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, maxHeight: 240, overflow: 'auto' }}>
          <div className="rowlist">
            {results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className="row"
                style={{ width: '100%', textAlign: 'left', background: hi === i ? 'var(--accent-soft)' : 'none', border: 0, cursor: 'pointer' }}
                onMouseEnter={() => setHi(i)}
                onClick={() => chooseExisting(r)}
              >
                <span style={{ flex: 1 }}><b>{r.displayName}</b>{r.phone ? <span className="sub"> · {r.phone}</span> : null}</span>
                <span className="num" style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatCents(r.balanceCents)}</span>
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                className="row"
                style={{ width: '100%', textAlign: 'left', background: hi === results.length ? 'var(--accent-soft)' : 'none', border: 0, cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}
                onMouseEnter={() => setHi(results.length)}
                onClick={chooseCreate}
              >
                + Use new customer “{query.trim()}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
