'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { draftPush, draftSetOnline, draftsBulkPush } from '@/lib/actions';
import { formatCents } from '@/lib/money';
import { ageDays, itemEmoji } from '@/lib/format';
import { FinishItemForm } from '@/components/drafts/finish-item-form';
import type { DraftRow } from '@/lib/types';

type Tab = 'all' | 'toFinish' | 'ready';

const STATUS_CHIP: Record<DraftRow['status'], string> = { DRAFT: 'draft', READY: 'ready', PUSHED: 'pushed' };

export function DraftsTable({ drafts }: { drafts: DraftRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DraftRow | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: drafts.length,
      toFinish: drafts.filter((d) => d.status === 'DRAFT').length,
      ready: drafts.filter((d) => d.status === 'READY').length,
    }),
    [drafts],
  );

  const rows = drafts.filter((d) =>
    tab === 'toFinish' ? d.status === 'DRAFT' : tab === 'ready' ? d.status === 'READY' : true,
  );

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="tabs">
          <button className={tab === 'all' ? 'on' : undefined} onClick={() => setTab('all')}>All ({counts.all})</button>
          <button className={tab === 'toFinish' ? 'on' : undefined} onClick={() => setTab('toFinish')}>To finish ({counts.toFinish})</button>
          <button className={tab === 'ready' ? 'on' : undefined} onClick={() => setTab('ready')}>Ready ({counts.ready})</button>
        </div>
        <div className="ml-auto flex items-center gap-[10px]">
          <span className="sub">{selected.size} selected</span>
          <button
            className="btn primary sm"
            disabled={selected.size === 0 || pending}
            onClick={() => run(async () => { await draftsBulkPush([...selected]); setSelected(new Set()); })}
          >
            Push selected
          </button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Item</th>
              <th>Source</th>
              <th>Cost</th>
              <th>List price</th>
              <th>Online</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="sub" style={{ padding: 18 }}>Nothing here. Take something in from Intake.</td></tr>
            )}
            {rows.map((d) => {
              const age = ageDays(d.createdAt);
              return (
                <tr key={d.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSel(d.id)} aria-label={`Select ${d.title}`} />
                  </td>
                  <td data-label="Item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="thumb">{itemEmoji[d.itemType]}</span>
                      {d.title}
                      {age >= 2 && d.status !== 'PUSHED' && <span className="age">{age}d</span>}
                    </div>
                  </td>
                  <td data-label="Source">{d.sourceName}</td>
                  <td data-label="Cost" className="sub">{d.costCents !== undefined ? formatCents(d.costCents) : '—'}</td>
                  <td data-label="List price" className="bal">{d.priceCents !== undefined ? formatCents(d.priceCents) : <span className="sub">needs price</span>}</td>
                  <td data-label="Online">
                    <button className={`toggle ${d.online ? 'on' : 'off'}`} disabled={pending} onClick={() => run(() => draftSetOnline(d.id, !d.online))}>
                      {d.online ? 'Online' : 'Store only'}
                    </button>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${STATUS_CHIP[d.status]}`}>{d.status[0] + d.status.slice(1).toLowerCase()}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setEditing(d)}>{d.status === 'PUSHED' ? 'View' : 'Finish'}</button>
                      {d.status === 'READY' && (
                        <button className="btn primary sm" disabled={pending} onClick={() => run(() => draftPush(d.id))}>Push</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Finish opens the full item form — set the list price &amp; details, then push to the catalog. Drafts aging past 2 days are flagged.
      </p>

      {editing && <FinishItemForm draft={editing} onClose={() => setEditing(null)} saveLabel="Save draft" />}
    </>
  );
}
