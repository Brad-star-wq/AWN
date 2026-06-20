import { listDrafts } from '@/lib/server/queries';
import { DraftsTable } from '@/components/drafts/drafts-table';

export default async function DraftsPage() {
  const drafts = await listDrafts('all');
  return <DraftsTable drafts={drafts} />;
}
