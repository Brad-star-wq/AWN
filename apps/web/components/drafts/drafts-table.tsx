'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { draftEdit, draftMarkReady, draftPush, draftSetOnline, draftsBulkPush } from '@/lib/actions';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { ageDays, itemEmoji } from '@/lib/format';
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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div className="tabs">
          <button className={tab === 'all' ? 'on' : undefined} onClick={() => setTab('all')}>
            All ({counts.all})
          </button>
          <button className={tab === 'toFinish' ? 'on' : undefined} onClick={() => setTab('toFinish')}>
            To finish ({counts.toFinish})
          </button>
          <button className={tab === 'ready' ? 'on' : undefined} onClick={() => setTab('ready')}>
            Ready ({counts.ready})
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sub">{selected.size} selected</span>
          <button
            className="btn primary sm"
            disabled={selected.size === 0 || pending}
            onClick={() =>
              run(async () => {
                await draftsBulkPush([...selected]);
                setSelected(new Set());
              })
            }
          >
            Push selected to catalog
          </button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Item</th>
              <th>Type</th>
              <th>Source</th>
              <th>Price</th>
              <th>Online</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="sub" style={{ padding: 18 }}>
                  Nothing here. Take something in from Intake.
                </td>
              </tr>
            )}
            {rows.map((d) => {
              const age = ageDays(d.createdAt);
              return (
                <tr key={d.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSel(d.id)} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="thumb">{itemEmoji[d.itemType]}</span>
                      {d.title}
                      {age >= 2 && <span className="age">{age} days</span>}
                    </div>
                  </td>
                  <td className="sub">{d.itemType[0] + d.itemType.slice(1).toLowerCase()}</td>
                  <td>{d.sourceName}</td>
                  <td className="bal">{d.priceCents !== undefined ? formatCents(d.priceCents) : <span className="sub">—</span>}</td>
                  <td>
                    <button
                      className={`toggle ${d.online ? 'on' : 'off'}`}
                      disabled={pending}
                      onClick={() => run(() => draftSetOnline(d.id, !d.online))}
                    >
                      {d.online ? 'Online' : 'Store only'}
                    </button>
                  </td>
                  <td>
                    <span className={`chip ${STATUS_CHIP[d.status]}`}>
                      {d.status[0] + d.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setEditing(d)}>
                        Edit
                      </button>
                      {d.status === 'READY' && (
                        <button className="btn primary sm" disabled={pending} onClick={() => run(() => draftPush(d.id))}>
                          Push
                        </button>
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
        Edit sets the listing price &amp; details, then mark ready and push to the catalog. Drafts aging past 2 days are flagged.
      </p>

      {editing && (
        <DraftEditModal
          draft={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(priceCents, notes) =>
            run(async () => {
              await draftEdit({
                id: editing.id,
                ...(priceCents !== undefined ? { priceCents } : {}),
                ...(notes ? { attributes: { notes } } : {}),
              });
              setEditing(null);
            })
          }
          onMarkReady={() =>
            run(async () => {
              await draftMarkReady(editing.id);
              setEditing(null);
            })
          }
        />
      )}
    </>
  );
}

function DraftEditModal({
  draft,
  pending,
  onClose,
  onSave,
  onMarkReady,
}: {
  draft: DraftRow;
  pending: boolean;
  onClose: () => void;
  onSave: (priceCents: number | undefined, notes: string) => void;
  onMarkReady: () => void;
}) {
  const [price, setPrice] = useState(draft.priceCents !== undefined ? (draft.priceCents / 100).toFixed(2) : '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string>();

  function save() {
    let cents: number | undefined;
    if (price.trim()) {
      const parsed = parseDollarsToCents(price);
      if (parsed === null) {
        setErr('Enter a valid price.');
        return;
      }
      cents = parsed;
    }
    onSave(cents, notes.trim());
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,42,.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}
    >
      <div className="card" style={{ width: 420, padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="thumb">{itemEmoji[draft.itemType]}</span>
          <b>{draft.title}</b>
          <span className={`chip ${STATUS_CHIP[draft.status]}`} style={{ marginLeft: 'auto' }}>
            {draft.status[0] + draft.status.slice(1).toLowerCase()}
          </span>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="field">
          <label>Listing price</label>
          <input value={price} placeholder="$0.00" inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field">
          <label>Details / notes</label>
          <input value={notes} placeholder="Condition notes, flaws, etc." onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>
          Photos &amp; richer attributes come in a later pass. Set the price, then mark ready to push.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" disabled={pending} onClick={save}>
            Save
          </button>
          {draft.status === 'DRAFT' && (
            <button className="btn" disabled={pending} onClick={onMarkReady}>
              Mark ready
            </button>
          )}
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
