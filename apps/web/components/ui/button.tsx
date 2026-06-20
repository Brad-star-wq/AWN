import Link from 'next/link';

// Two intents from the mockups:
//  - primary  → emerald, reserved for forward / confirm actions
//  - neutral  → ink-filled, the default action
//  - ghost    → hairline surface button (back, secondary)
type Variant = 'primary' | 'neutral' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-[#0f6b56] border border-accent',
  neutral: 'bg-ink text-white hover:bg-[#222e4b] border border-ink',
  ghost: 'bg-surface text-ink border border-line hover:border-accent-line',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-[13px] font-display font-bold ' +
  'px-6 py-3 text-[15px] cursor-pointer transition-colors disabled:opacity-55 ' +
  'disabled:cursor-not-allowed';

type CommonProps = { variant?: Variant; className?: string; children: React.ReactNode };

export function Button({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${base} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'neutral',
  className = '',
  href,
  children,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={`${base} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}
