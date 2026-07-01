import { formatCents } from '@/lib/money';
import { activityTime } from '@/lib/format';
import { ReassignButton } from '@/components/redemptions/reassign-button';
import type { ActivityRow } from '@/lib/types';

const LABEL: Record<ActivityRow['kind'], string> = {
  ISSUE: 'Intake · store credit',
  REDEEM: 'Redeemed credit',
  ADJUST: 'Adjustment',
  REVERSAL: 'Reversal',
};

export function ActivityRowView({
  row,
  showName = true,
  showDetail = false,
}: {
  row: ActivityRow;
  showName?: boolean;
  showDetail?: boolean;
}) {
  const neg = row.deltaCents < 0;
  return (
    <div className="row">
      <span className="time">{activityTime(row.createdAt)}</span>
      <span>
        {LABEL[row.kind]}
        {showName && row.customerName ? (
          <>
            {' · '}
            <b>{row.customerName}</b>
          </>
        ) : null}
        {showDetail && row.note ? <span className="sub"> · {row.note}</span> : null}
        {row.redemptionId ? (
          <>
            {' · '}
            <ReassignButton redemptionId={row.redemptionId} />
          </>
        ) : null}
      </span>
      <span className={`amt ${neg ? 'neg' : 'pos'}`}>
        {neg ? '– ' : '+ '}
        {formatCents(Math.abs(row.deltaCents))}
      </span>
    </div>
  );
}
