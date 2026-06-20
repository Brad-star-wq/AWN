'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  ArrowDownToLine,
  ArrowUpFromLine,
  Files,
  Users,
  Boxes,
  Settings,
  Moon,
  type LucideIcon,
} from 'lucide-react';

type Item = { href: string; label: string; icon: LucideIcon };

// Top group flows from the top; the bottom group pins to the foot (mt-auto).
const TOP: Item[] = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/intake', label: 'Intake', icon: ArrowDownToLine },
  { href: '/redeem', label: 'Redeem', icon: ArrowUpFromLine },
  { href: '/drafts', label: 'Drafts', icon: Files },
  { href: '/customers', label: 'People', icon: Users },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
];
const BOTTOM: Item[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/eod', label: 'End day', icon: Moon },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const item = ({ href, label, icon: Icon }: Item, pinned = false) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        className={`relative flex h-[54px] w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] transition-colors ${
          active
            ? 'text-ink before:absolute before:-left-[10px] before:top-[13px] before:bottom-[13px] before:w-[3px] before:rounded-r-[3px] before:bg-accent before:content-[""]'
            : 'text-faint hover:text-ink-soft'
        } ${pinned ? 'mt-auto' : ''}`}
      >
        <Icon size={20} strokeWidth={1.9} />
        <span className="text-[10.5px] font-semibold">{label}</span>
      </Link>
    );
  };

  return (
    <aside className="flex w-20 flex-none flex-col items-center gap-1 border-r border-line bg-surface py-5">
      <div className="mb-5 flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-ink font-display text-sm font-extrabold tracking-wide text-white">
        AW
      </div>
      {TOP.map((it) => item(it))}
      {BOTTOM.map((it, i) => item(it, i === 0))}
    </aside>
  );
}
