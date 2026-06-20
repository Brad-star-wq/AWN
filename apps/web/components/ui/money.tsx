import { formatCents, formatCentsShort } from '@/lib/money';

// Money is always rendered tabular so columns of figures align. `signed` shows a
// leading + / − (used in the activity feed); color is left to the caller via
// className so each surface can pick accent / ink-soft / etc.
export function Money({
  cents,
  short = false,
  signed = false,
  className = '',
}: {
  cents: number;
  short?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const magnitude = Math.abs(cents);
  const text = short ? formatCentsShort(magnitude) : formatCents(magnitude);
  const prefix = signed ? (cents < 0 ? '−' : '+') : cents < 0 ? '−' : '';
  return <span className={`tabular-nums ${className}`}>{prefix}{text}</span>;
}
