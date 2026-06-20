import { requireOwner } from '@/lib/server/auth';
import { IntakeForm } from '@/components/intake/intake-form';

export default async function IntakePage() {
  await requireOwner();
  return <IntakeForm />;
}
