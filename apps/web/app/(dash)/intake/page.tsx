import Link from 'next/link';
import { Zap } from 'lucide-react';
import { requireOwner } from '@/lib/server/auth';
import { DashHeader } from '@/components/shell/dash-header';
import { FinishIntakeForm } from '@/components/drafts/finish-intake-form';

export const dynamic = 'force-dynamic';

// Regular intake — the full canonical item form (same component as Drafts'
// Finish). The other dashboard entry point, Quick intake (the tap-to-increment
// flow), is one tap away below.
export default async function IntakePage() {
  await requireOwner();
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="New intake" sub="Take in one item with full detail" />
      <Link
        href="/store"
        className="mb-4 inline-flex items-center gap-2 rounded-[8px] bg-accent-soft px-[14px] py-[10px] font-display text-[13px] font-semibold text-accent"
      >
        <Zap size={15} /> Quick intake — fast tap flow for multiple items →
      </Link>
      <FinishIntakeForm asPage />
    </div>
  );
}
