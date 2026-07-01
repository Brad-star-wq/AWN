import Link from 'next/link';
import { Files, ArrowRight } from 'lucide-react';
import { getToday, getAttributionQueue } from '@/lib/server/queries';
import { dateTimeLong, activityTime, itemEmoji } from '@/lib/format';
import { formatCentsShort, formatCents } from '@/lib/money';
import { DashHeader } from '@/components/shell/dash-header';
import { AttributionInbox } from '@/components/redemptions/attribution-inbox';
import { Avatar } from '@/components/ui/avatar';
import type { ActivityRow } from '@/lib/types';

function addedSummary(items: NonNullable<ActivityRow['addedItems']>): string {
  const shown = items.slice(0, 2).map((it) => `${itemEmoji[it.itemType]} ${it.title}`).join(', ');
  const rest = items.length - 2;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

const ACTIVITY_LABEL: Record<ActivityRow['kind'], string> = {
  ISSUE: 'Store credit issued',
  REDEEM: 'Redeemed credit',
  ADJUST: 'Adjustment',
  REVERSAL: 'Refund reversal',
};

export default async function TodayPage() {
  const [t, queue] = await Promise.all([getToday(), getAttributionQueue()]);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 md:px-12 md:pb-14 md:pt-10">
      <DashHeader eyebrow="Dashboard" title="Today" sub={dateTimeLong()} />

      {/* Live "redemptions to assign" queue — attribute-on-arrival (v2). */}
      <AttributionInbox initial={queue} variant="banner" />

      {/* Flat hairline overview — only the liability cell is the dark money block. */}
      <div className="ov">
        <div className="cell"><div className="l">Credit given today</div><div className="v credit num">{formatCentsShort(t.givenTodayCents)}</div></div>
        <div className="cell"><div className="l">Credit used today</div><div className="v num">{formatCentsShort(t.usedTodayCents)}</div></div>
        <div className="cell liab"><div className="l">Outstanding liability</div><div className="v num">{formatCentsShort(t.outstandingLiabilityCents)}</div></div>
      </div>

      {/* Pending bridge — impossible to ignore. */}
      <Link href="/drafts" className="mb-[34px] flex items-center gap-[10px] px-1 py-1 font-display text-[13px] font-medium text-ink-soft">
        <Files size={15} strokeWidth={2} className="text-muted" />
        <span><b className="font-bold text-ink">{t.draftsToFinish} item{t.draftsToFinish === 1 ? '' : 's'}</b> pending — finish in Drafts</span>
        <ArrowRight size={15} strokeWidth={2} className="text-muted" />
      </Link>

      <div className="mb-2 font-display text-[13px] font-semibold text-ink-soft">Recent activity</div>
      <div className="card overflow-hidden">
        {t.recent.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">No activity yet — start with an intake.</div>
        ) : (
          <table style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Customer</th>
                <th style={{ width: '24%' }}>Activity</th>
                <th>Added items</th>
                <th style={{ width: 96, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {t.recent.map((r) => {
                const neg = r.deltaCents < 0;
                return (
                  <tr key={r.id}>
                    <td data-label="Customer">
                      <Link href={`/customers/${r.customerId}`} className="flex min-w-0 items-center gap-[10px]" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <Avatar name={r.customerName} size="md" />
                        <span className="truncate font-display text-sm font-semibold">{r.customerName}</span>
                      </Link>
                    </td>
                    <td data-label="Activity" className="sub">
                      <span className="block font-display font-semibold text-ink-soft">{ACTIVITY_LABEL[r.kind]}</span>
                      <span className="text-[12px]">{activityTime(r.createdAt)}</span>
                    </td>
                    <td data-label="Added items" className="min-w-0">
                      {r.addedItems?.length ? (
                        <span className="block truncate text-[13px] text-ink-soft">{addedSummary(r.addedItems)}</span>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td data-label="Amount" style={{ textAlign: 'right' }}>
                      <span className={`num font-extrabold ${neg ? 'text-ink-soft' : 'text-accent'}`}>
                        {neg ? '−' : '+'}{formatCents(Math.abs(r.deltaCents))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
