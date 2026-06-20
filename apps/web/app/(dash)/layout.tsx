import { requireOwner } from '@/lib/server/auth';
import { Sidebar } from '@/components/shell/sidebar';

// Every dashboard page is dynamic (reads live DB state) and owner-gated.
// Header chrome is per-screen now (see the mockups): Today owns its greeting,
// the step screens render their own <Topbar>. The layout is just sidebar + canvas.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
