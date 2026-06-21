// Quiet initials avatar — one neutral tone for everyone. A money log should read
// calm, not colorful, so no per-name swatches.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const SIZES = { sm: 28, md: 32, lg: 44, xl: 54 } as const;
const RADII = { sm: 7, md: 8, lg: 11, xl: 14 } as const;

export function Avatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <span
      className={`flex flex-none items-center justify-center font-display font-semibold ${className}`}
      style={{
        width: px,
        height: px,
        borderRadius: RADII[size],
        background: 'var(--surface2)',
        color: 'var(--ink-soft)',
        fontSize: Math.round(px * 0.34),
      }}
    >
      {initials(name)}
    </span>
  );
}
