import { getCustomerPick } from '@/lib/server/queries';
import { RedeemFlow } from '@/components/redeem/redeem-flow';

export default async function RedeemPage({ searchParams }: { searchParams: { customer?: string } }) {
  const initial = searchParams.customer ? await getCustomerPick(searchParams.customer) : null;
  return <RedeemFlow initial={initial} />;
}
