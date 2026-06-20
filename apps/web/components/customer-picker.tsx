'use client';

import { useRef, useState } from 'react';
import { searchCustomersAction } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import type { CustomerPick } from '@/lib/types';

export type CustomerSelection =
  | { kind: 'existing'; pick: CustomerPick }
  | { kind: 'new'; name: string; phone: string }
  | { kind: 'none' };

export function CustomerPicker({
  allowNew = false,
  onChange,
}: {
  allowNew?: boolean;
  onChange: (s: CustomerSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [picked, setPicked] = useState<CustomerPick | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function search(q: string) {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setResults(await searchCustomersAction(q));
      setOpen(true);
    }, 180);
  }

  function onQuery(v: string) {
    setQuery(v);
    setPicked(null);
    if (v.trim()) search(v);
    else {
      setResults([]);
      setOpen(false);
    }
    onChange(allowNew ? { kind: 'new', name: v, phone } : { kind: 'none' });
  }

  function choose(p: CustomerPick) {
    setPicked(p);
    setQuery(p.displayName);
    setOpen(false);
    onChange({ kind: 'existing', pick: p });
  }

  return (
    <div>
      <div className="field" style={{ position: 'relative', marginBottom: 10 }}>
        <label>Customer</label>
        <input
          value={query}
          placeholder="Search by name or phone…"
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {open && results.length > 0 && (
          <div
            className="card"
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 240, overflow: 'auto' }}
          >
            <div className="rowlist">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="row"
                  style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={() => choose(r)}
                >
                  <span>
                    <b>{r.displayName}</b>
                    {r.phone ? <span className="sub"> · {r.phone}</span> : null}
                  </span>
                  <span className="amt num">{formatCents(r.balanceCents)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {picked && (
        <p className="hint" style={{ marginTop: -2, marginBottom: 12 }}>
          Selected <b>{picked.displayName}</b> · balance {formatCents(picked.balanceCents)}
        </p>
      )}

      {allowNew && !picked && (
        <div className="field">
          <label>Phone (new customer — optional)</label>
          <input
            value={phone}
            placeholder="(662) 555-0100"
            onChange={(e) => {
              setPhone(e.target.value);
              onChange({ kind: 'new', name: query, phone: e.target.value });
            }}
          />
        </div>
      )}
    </div>
  );
}
