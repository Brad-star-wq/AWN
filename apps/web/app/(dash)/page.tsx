import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRight, ChevronRight } from 'lucide-react';
import { getToday } from '@/lib/server/queries';
import { greeting, dateTimeLong, activityTime } from '@/lib/format';
import { Money } from '@/components/ui/money';
import { Avatar } from '@/components/ui/avatar';
import { StatCard } from '@/components/ui/stat-card';
import type { ActivityRow } from '@/lib/types';

// Placeholder until an owner profile exists; the logo + greeting use the shop owner.
const OWNER_FIRST_NAME = 'Win';
const OWNER_FULL_NAME = 'A Win Nguyen';

const ACTIVITY_LABEL: Record<ActivityRow['kind'], string> = {
  ISSUE: 'Store credit issued',
  REDEEM: 'Redeemed credit',
  ADJUST: 'Adjustment',
  REVERSAL: 'Reversal',
};

export default async function TodayPage() {
  const t = await getToday();

  return (
    <div className="mx-auto w-full max-w-[1160px] px-11 pb-12 pt-9">
      {/* Header */}
      <div className="mb-[30px] flex items-start justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
            {OWNER_FULL_NAME}
          </div>
          <h1 className="mt-[9px] font-display text-[32px] font-extrabold -tracking-[0.02em]">
            {greeting()}, {OWNER_FIRST_NAME}
          </h1>
          <div className="mt-[7px] text-sm font-medium text-muted">{dateTimeLong()}</div>
        </div>
        <div className="flex items-center gap-[9px] rounded-full border border-line bg-surface px-[15px] py-[9px]">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-[12.5px] font-semibold text-ink-soft">Square POS connected</span>
        </div>
      </div>

      {/* Hero actions */}
      <div className="mb-[14px] grid grid-cols-2 gap-[14px]">
        <Link
          href="/intake"
          className="group rounded-[18px] bg-accent p-[22px_24px] text-white transition-colors hover:bg-[#0f6b56]"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-white/[0.16]">
              <ArrowDownToLine size={24} strokeWidth={2} />
            </span>
            <ArrowRight size={24} strokeWidth={2.2} className="text-white/80" />
          </div>
          <div className="mt-[18px] font-display text-[21px] font-bold">New intake</div>
          <div className="mt-[6px] text-[13.5px] font-medium opacity-85">
            Buy from a walk-in · pay out credit or cash
          </div>
        </Link>

        <Link
          href="/redeem"
          className="group rounded-[18px] border border-line bg-surface p-[22px_24px] text-ink transition-colors hover:border-accent-line"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-accent-soft">
              <ArrowUpFromLine size={24} strokeWidth={2} className="text-accent" />
            </span>
            <ArrowRight size={24} strokeWidth={2.2} className="text-faint" />
          </div>
          <div className="mt-[18px] font-display text-[21px] font-bold">Redeem credit</div>
          <div className="mt-[6px] text-[13.5px] font-medium text-muted">
            Customer is spending their store credit
          </div>
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-[14px] grid grid-cols-3 gap-[14px]">
        <StatCard label="Credit given today" tone="green" value={<Money cents={t.givenTodayCents} short />} />
        <StatCard label="Credit used today" tone="ink" value={<Money cents={t.usedTodayCents} short />} />
        <StatCard label="Outstanding liability" dark value={<Money cents={t.outstandingLiabilityCents} short />} />
      </div>

      {/* Attention banners */}
      {t.draftsToFinish > 0 && (
        <AttnBanner
          href="/drafts"
          count={t.draftsToFinish}
          text="drafts need finishing before they hit inventory"
        />
      )}
      {t.needsAttentionCount > 0 && (
        <AttnBanner
          href="/eod"
          count={t.needsAttentionCount}
          text="items need attention before the day reconciles"
        />
      )}

      {/* Recent activity */}
      <div className="mb-[13px] mt-[26px] font-display text-base font-bold">Recent activity</div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {t.recent.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted">No activity yet — start with a new intake.</div>
        ) : (
          t.recent.map((r) => {
            const neg = r.deltaCents < 0;
            return (
              <div
                key={r.id}
                className="flex items-center gap-[14px] border-b border-line px-5 py-[15px] last:border-b-0"
              >
                <Avatar name={r.customerName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{r.customerName}</div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {ACTIVITY_LABEL[r.kind]} · {activityTime(r.createdAt)}
                  </div>
                </div>
                <Money
                  cents={r.deltaCents}
                  signed
                  className={`font-display text-base font-extrabold ${neg ? 'text-ink-soft' : 'text-accent'}`}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AttnBanner({ href, count, text }: { href: string; count: number; text: string }) {
  return (
    <Link
      href={href}
      className="mb-[14px] flex w-full items-center gap-[13px] rounded-[14px] border border-line border-l-[3px] border-l-warn bg-surface px-[18px] py-[15px] last:mb-0"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-warn-soft font-display text-[15px] font-extrabold text-[#a9762a]">
        {count}
      </span>
      <span className="flex-1 text-[14.5px] font-semibold text-ink-soft">{text}</span>
      <ChevronRight size={20} strokeWidth={2.2} className="text-faint" />
    </Link>
  );
}
