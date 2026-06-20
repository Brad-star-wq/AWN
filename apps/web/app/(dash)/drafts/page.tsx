import { listDrafts } from '@/lib/server/queries';
import { DraftsTable } from '@/components/drafts/drafts-table';
import { DashHeader } from '@/components/shell/dash-header';

export default async function DraftsPage() {
  const drafts = await listDrafts('all');
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="Drafts" sub="Finish each item, then push it to the catalog" />
      <DraftsTable drafts={drafts} />
    </div>
  );
}
