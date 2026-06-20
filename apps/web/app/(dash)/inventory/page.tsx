import { listInventory } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';
import { DashHeader } from '@/components/shell/dash-header';

const STOCK_CHIP: Record<'DRAFT' | 'READY' | 'PUSHED', { cls: string; label: string }> = {
  DRAFT: { cls: 'draft', label: 'Draft' },
  READY: { cls: 'ready', label: 'Ready' },
  PUSHED: { cls: 'pushed', label: 'Listed' },
};

export default async function InventoryPage() {
  const items = await listInventory();

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="Inventory" sub="Everything taken in, with its listing price and channel" />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Source</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Channel</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="sub" style={{ padding: 18 }}>
                  No inventory yet.
                </td>
              </tr>
            )}
            {items.map((d) => {
              const stock = STOCK_CHIP[d.status];
              return (
                <tr key={d.id}>
                  <td data-label="Item">{d.title}</td>
                  <td data-label="Source" className="sub">Buy-in · {d.sourceName}</td>
                  <td data-label="Cost" className="sub">{d.costCents !== undefined ? formatCents(d.costCents) : '—'}</td>
                  <td data-label="Price" className="bal">{d.priceCents !== undefined ? formatCents(d.priceCents) : <span className="sub">—</span>}</td>
                  <td data-label="Channel">
                    <span className={`toggle ${d.online ? 'on' : 'off'}`}>{d.online ? 'Online' : 'Store only'}</span>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${stock.cls}`}>{stock.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Per-item cost and sold/in-stock tracking arrive with the Square sync.
      </p>
    </div>
  );
}
