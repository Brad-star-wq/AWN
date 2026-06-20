import { listCustomers } from '@/lib/server/queries';
import { StoreLookup } from '@/components/store/lookup';

// In-store home — customer lookup (instore-lookup-clean.html). Recent sellers
// first (most buys are repeat). Reads the existing customer list; selection and
// search are client-side against the same data layer.
export const dynamic = 'force-dynamic';

export default async function StoreHomePage() {
  const customers = await listCustomers('all');
  // Recency-ordered: most recent activity first, then name.
  const recent = [...customers]
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.displayName.localeCompare(b.displayName))
    .slice(0, 12)
    .map((c) => ({ id: c.id, displayName: c.displayName, balanceCents: c.balanceCents, ...(c.phone ? { phone: c.phone } : {}) }));

  return <StoreLookup recent={recent} />;
}
