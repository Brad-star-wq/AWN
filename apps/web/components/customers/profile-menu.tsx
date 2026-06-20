'use client';

import { useState } from 'react';
import { MoreVertical, GitMerge } from 'lucide-react';

// The profile "⋯" menu. Merge is specified (walkthrough §5.4) but combining two
// customers' append-only ledgers + histories as one auditable event is a new
// ENGINE operation that doesn't exist yet — so it's surfaced here as disabled,
// not faked, and flagged for the engine. (Don't reach into the ledger from UI.)
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginLeft: 'auto', position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Customer actions"
        style={{ width: 36, height: 36, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <MoreVertical size={18} style={{ color: 'var(--ink-soft)' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, width: 230, padding: 6 }}>
            <button
              disabled
              title="Merge needs the ledger merge operation (engine — flagged)"
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '9px 10px', borderRadius: 7, color: 'var(--muted)', cursor: 'not-allowed', fontFamily: 'var(--ui)', fontSize: 13 }}
            >
              <GitMerge size={15} /> Merge customer
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>soon</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
