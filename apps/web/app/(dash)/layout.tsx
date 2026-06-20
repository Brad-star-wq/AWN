import { requireOwner } from '@/lib/server/auth';
import { Sidebar } from '@/components/shell/sidebar';
import { MobileNav } from '@/components/shell/mobile-nav';

// Every dashboard page is dynamic (reads live DB state) and owner-gated.
// Desktop: left rail + canvas. Mobile: the rail is hidden and a top app-bar +
// drawer (MobileNav) takes over. Pages own their own header (DashHeader).
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</main>
      </div>
    </div>
  );
}
