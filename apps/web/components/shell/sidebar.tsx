'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { NAV, isNavActive } from './nav-items';

// Desktop rail — hidden on mobile (the MobileNav drawer takes over there).
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[212px] flex-none flex-col border-r border-line bg-surface px-[14px] py-5 md:flex">
      <div className="flex items-center gap-[10px] px-2 pb-[22px] pt-[6px]">
        <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-ink font-display text-[13px] font-bold text-white">AW</div>
        <div className="font-display text-sm font-semibold">A Win Nguyen</div>
      </div>

      <nav className="flex flex-col gap-[2px]">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-[11px] rounded-[7px] px-[10px] py-[9px] font-display text-[13.5px] transition-colors ${
              isNavActive(pathname, href) ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-canvas'
            }`}
          >
            <Icon size={17} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-[10px]">
        <Link
          href="/store"
          className="flex items-center justify-between rounded-[8px] border border-line px-3 py-[11px] font-display text-[13px] font-semibold text-ink transition-colors hover:bg-canvas"
        >
          Store mode <ArrowRight size={15} strokeWidth={2} className="text-ink-soft" />
        </Link>
        <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-muted">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: '#5e9a86' }} />
          Square connected
        </div>
      </div>
    </aside>
  );
}
