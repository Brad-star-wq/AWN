'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Files, Users, Moon, Settings, ArrowRight, type LucideIcon } from 'lucide-react';

type Item = { href: string; label: string; icon: LucideIcon };

// Labeled back-office rail (dashboard mockups). Intake/Redeem are NOT here —
// they live as the persistent actions in each page header (DashHeader).
const NAV: Item[] = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/drafts', label: 'Drafts', icon: Files },
  { href: '/customers', label: 'People', icon: Users },
  { href: '/eod', label: 'End of day', icon: Moon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className="flex w-[212px] flex-none flex-col border-r border-line bg-surface px-[14px] py-5">
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
              isActive(href) ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-canvas'
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
