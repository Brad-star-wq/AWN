import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

// The persistent dashboard page header (dashboard mockups): eyebrow + title +
// subtitle on the left, the always-available Intake / Redeem actions on the
// right. Used by every dashboard screen so a buy or redemption is one tap away.
export function DashHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:mb-7 md:flex-row md:items-start md:justify-between md:gap-6">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 0 }}>{eyebrow}</div> : null}
        <h1 className="mt-[5px] font-display text-[18px] font-semibold -tracking-[0.02em] md:text-[20px]">{title}</h1>
        {sub ? <div className="mt-[4px] text-[12.5px] font-medium text-muted">{sub}</div> : null}
      </div>
      <div className="flex flex-none items-center gap-[10px]">
        <Link
          href="/redeem"
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] border border-line bg-surface px-[18px] py-[11px] font-display text-[13.5px] font-semibold text-ink transition-colors hover:bg-canvas md:flex-none"
        >
          <ArrowUpFromLine size={16} strokeWidth={2.2} className="text-ink-soft" /> Redeem
        </Link>
        <Link
          href="/intake"
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-accent px-[18px] py-[11px] font-display text-[13.5px] font-semibold text-white transition-colors hover:bg-[#354a61] md:flex-none"
        >
          <ArrowDownToLine size={16} strokeWidth={2.2} /> Intake
        </Link>
      </div>
    </div>
  );
}
