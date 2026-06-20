import Link from 'next/link';
import { Files, ArrowRight } from 'lucide-react';
import { getToday } from '@/lib/server/queries';
import { dateTimeLong, activityTime } from '@/lib/format';
import { formatCentsShort, formatCents } from '@/lib/money';
import { DashHeader } from '@/components/shell/dash-header';
import { Avatar } from '@/components/ui/avatar';
import type { ActivityRow } from '@/lib/types';

const ACTIVITY_LABEL: Record<ActivityRow['kind'], string> = {
  ISSUE: 'Store credit issued',
  REDEEM: 'Redeemed credit',
  ADJUST: 'Adjustment',
  REVERSAL: 'Refund reversal',
};

export default async function TodayPage() {
  const t = await getToday();

  return (
    <div className="mx-auto w-full max-w-[1080px] px-12 pb-14 pt-10">
      <DashHeader eyebrow="Dashboard" title="Today" sub={dateTimeLong()} />

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

      <div className="mb-1 font-display text-[13px] font-semibold text-ink-soft">Recent activity</div>
      <div className="border-t border-line">
        {t.recent.length === 0 ? (
          <div className="py-6 text-sm text-muted">No activity yet — start with an intake.</div>
        ) : (
          t.recent.map((r) => {
            const neg = r.deltaCents < 0;
            return (
              <div key={r.id} className="flex items-center gap-[14px] border-b border-line py-[15px]">
                <Avatar name={r.customerName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-sm font-semibold">{r.customerName}</div>
                  <div className="mt-[2px] text-[12.5px] font-medium text-muted">{ACTIVITY_LABEL[r.kind]} · {activityTime(r.createdAt)}</div>
                </div>
                <span className={`num text-[15px] font-extrabold ${neg ? 'text-ink-soft' : 'text-accent'}`}>
                  {neg ? '−' : '+'}{formatCents(Math.abs(r.deltaCents)).replace('$', '$')}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
