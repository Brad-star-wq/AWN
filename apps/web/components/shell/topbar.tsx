'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Stepper } from '@/components/ui/stepper';

// Per-screen header from the inner mockups (intake / redeem / finish-draft):
// a hairline back button, the title, optional context line, and an optional
// right-aligned text stepper. Today does not use this — it owns its own header.
export function Topbar({
  title,
  ctx,
  backHref,
  steps,
  current,
}: {
  title: string;
  ctx?: string;
  backHref?: string;
  steps?: string[];
  current?: number;
}) {
  const router = useRouter();
  return (
    <header className="flex items-center gap-[18px] border-b border-line bg-surface px-9 py-5">
      <button
        type="button"
        onClick={() => (backHref ? router.push(backHref) : router.back())}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] border border-line bg-surface text-ink-soft transition-colors hover:border-accent-line"
        aria-label="Back"
      >
        <ArrowLeft size={20} strokeWidth={2} />
      </button>
      <span className="font-display text-lg font-bold">{title}</span>
      {ctx ? <span className="text-[13px] font-semibold text-muted">{ctx}</span> : null}
      {steps && current !== undefined ? <Stepper steps={steps} current={current} /> : null}
    </header>
  );
}
