import { Home, Files, Users, Moon, Settings, type LucideIcon } from 'lucide-react';

// Shared dashboard nav — used by the desktop sidebar and the mobile drawer so
// the two never drift. Intake/Redeem are NOT here; they're the persistent
// header actions (DashHeader).
export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/drafts', label: 'Drafts', icon: Files },
  { href: '/customers', label: 'People', icon: Users },
  { href: '/eod', label: 'End of day', icon: Moon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const isNavActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);
