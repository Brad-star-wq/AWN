import { redirect } from 'next/navigation';
import { getCustomerPick } from '@/lib/server/queries';
import { StoreRedeem } from '@/components/store/store-redeem';

export const dynamic = 'force-dynamic';

export default async function StoreRedeemPage({ searchParams }: { searchParams: { customer?: string } }) {
  const id = searchParams.customer;
  if (!id) redirect('/store');
  const customer = await getCustomerPick(id);
  if (!customer) redirect('/store');
  return <StoreRedeem customer={customer} />;
}
