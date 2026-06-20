// Muted initials avatar. Color is derived from the name so a given customer
// always gets the same swatch — no stored color needed.
const SWATCHES = ['#2b3a5e', '#5b6691', '#3f8a78', '#4a5a7a', '#2c8295', '#6a5b8e'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function swatch(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

const SIZES = { sm: 32, md: 40, lg: 50, xl: 66 } as const;
const RADII = { sm: 9, md: 11, lg: 13, xl: 18 } as const;

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
      className={`flex flex-none items-center justify-center font-display font-bold text-white ${className}`}
      style={{
        width: px,
        height: px,
        borderRadius: RADII[size],
        background: swatch(name),
        fontSize: Math.round(px * 0.32),
      }}
    >
      {initials(name)}
    </span>
  );
}
