'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight, Smartphone } from 'lucide-react';
import { NAV, isNavActive } from './nav-items';

// Mobile top app-bar + slide-in drawer (shown only below md). Gives full nav
// access on a phone where the desktop rail is hidden.
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-line text-ink-soft">
          <Menu size={18} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-ink font-display text-[11px] font-bold text-white">AW</div>
          <span className="font-display text-sm font-semibold">AWN</span>
        </div>
        <Link href="/store" className="ml-auto flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-2 font-display text-[12.5px] font-semibold text-ink">
          <Smartphone size={14} /> Store
        </Link>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/35" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[260px] flex-col border-r border-line bg-surface px-[14px] py-5">
            <div className="flex items-center justify-between px-2 pb-5">
              <div className="flex items-center gap-[10px]">
                <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-ink font-display text-[13px] font-bold text-white">AW</div>
                <div className="font-display text-sm font-semibold">A Win Nguyen</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-ink-soft"><X size={20} /></button>
            </div>
            <nav className="flex flex-col gap-[2px]">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-[11px] rounded-[7px] px-[10px] py-[11px] font-display text-[14px] transition-colors ${
                    isNavActive(pathname, href) ? 'bg-accent-soft font-semibold text-ink' : 'font-medium text-ink-soft'
                  }`}
                >
                  <Icon size={18} strokeWidth={1.8} /> {label}
                </Link>
              ))}
            </nav>
            <Link href="/store" onClick={() => setOpen(false)} className="mt-auto flex items-center justify-between rounded-[8px] border border-line px-3 py-[12px] font-display text-[13px] font-semibold text-ink">
              Store mode <ArrowRight size={15} strokeWidth={2} className="text-ink-soft" />
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
