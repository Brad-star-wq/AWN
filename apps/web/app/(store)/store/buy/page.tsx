import { redirect } from 'next/navigation';
import { getCustomerPick } from '@/lib/server/queries';
import { BuyEngine } from '@/components/store/buy-engine';

export const dynamic = 'force-dynamic';

export default async function StoreBuyPage({ searchParams }: { searchParams: { customer?: string } }) {
  const id = searchParams.customer;
  if (!id) redirect('/store');
  const customer = await getCustomerPick(id);
  if (!customer) redirect('/store');
  return <BuyEngine customer={customer} />;
}
