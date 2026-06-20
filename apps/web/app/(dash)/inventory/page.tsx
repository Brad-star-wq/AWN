import { listInventory } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';

const STOCK_CHIP: Record<'DRAFT' | 'READY' | 'PUSHED', { cls: string; label: string }> = {
  DRAFT: { cls: 'draft', label: 'Draft' },
  READY: { cls: 'ready', label: 'Ready' },
  PUSHED: { cls: 'pushed', label: 'Listed' },
};

export default async function InventoryPage() {
  const items = await listInventory();

  return (
    <>
      <p className="hint" style={{ marginBottom: 16 }}>
        Everything taken in, with its listing price and channel. Per-item cost and sold/in-stock tracking arrive with the Square sync.
      </p>
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
                  <td>{d.title}</td>
                  <td className="sub">Buy-in · {d.sourceName}</td>
                  <td className="sub">—</td>
                  <td className="bal">{d.priceCents !== undefined ? formatCents(d.priceCents) : <span className="sub">—</span>}</td>
                  <td>
                    <span className={`toggle ${d.online ? 'on' : 'off'}`}>{d.online ? 'Online' : 'Store only'}</span>
                  </td>
                  <td>
                    <span className={`chip ${stock.cls}`}>{stock.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
