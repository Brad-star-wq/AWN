import { listInventory } from '@/lib/server/queries';
import { DashHeader } from '@/components/shell/dash-header';
import { InventoryTable } from '@/components/inventory/inventory-table';

export default async function InventoryPage() {
  const items = await listInventory();

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="Inventory" sub="Everything taken in, with its listing price and channel" />
      <InventoryTable items={items} />
      <p className="hint" style={{ marginTop: 12 }}>
        Edit opens the full item form. Sold/in-stock tracking arrives with the Square sync.
      </p>
    </div>
  );
}
