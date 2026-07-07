import { getCustomerPick } from '@/lib/server/queries';
import { DashHeader } from '@/components/shell/dash-header';
import { RedeemFlow } from '@/components/redeem/redeem-flow';

export const dynamic = 'force-dynamic';

export default async function RedeemPage({ searchParams }: { searchParams: { customer?: string } }) {
  const initial = searchParams.customer ? await getCustomerPick(searchParams.customer) : null;
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader
        eyebrow="Dashboard"
        title="Redeem store credit"
        sub="Take a customer’s credit as a Store Credit tender"
      />
      <RedeemFlow initial={initial} />
    </div>
  );
}
