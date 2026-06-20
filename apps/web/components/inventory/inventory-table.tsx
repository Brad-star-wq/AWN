'use client';

import { useState } from 'react';
import { formatCents } from '@/lib/money';
import { FinishIntakeForm } from '@/components/drafts/finish-intake-form';
import type { DraftRow } from '@/lib/types';

const STOCK: Record<DraftRow['status'], { cls: string; label: string }> = {
  DRAFT: { cls: 'draft', label: 'Draft' },
  READY: { cls: 'ready', label: 'Ready' },
  PUSHED: { cls: 'pushed', label: 'Listed' },
};

// Inventory list — the Edit button opens the SAME canonical form as Drafts.
export function InventoryTable({ items }: { items: DraftRow[] }) {
  const [editing, setEditing] = useState<DraftRow | null>(null);
  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Source</th>
            <th>Cost</th>
            <th>List price</th>
            <th>Channel</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={7} className="sub" style={{ padding: 18 }}>No inventory yet.</td></tr>}
          {items.map((d) => {
            const stock = STOCK[d.status];
            return (
              <tr key={d.id}>
                <td data-label="Item">{d.title}</td>
                <td data-label="Source" className="sub">Buy-in · {d.sourceName}</td>
                <td data-label="Cost" className="sub">{d.costCents !== undefined ? formatCents(d.costCents) : '—'}</td>
                <td data-label="List price" className="bal">{d.priceCents !== undefined ? formatCents(d.priceCents) : <span className="sub">—</span>}</td>
                <td data-label="Channel"><span className={`toggle ${d.online ? 'on' : 'off'}`}>{d.online ? 'Online' : 'Store only'}</span></td>
                <td data-label="Status"><span className={`badge ${stock.cls}`}>{stock.label}</span></td>
                <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => setEditing(d)}>Edit</button></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && <FinishIntakeForm draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
