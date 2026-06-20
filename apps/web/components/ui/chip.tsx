'use client';

// Selectable chip (drafts-finish + items mockups). Neutral by default,
// ink-filled when selected. `dashed` is the "More…" affordance.
export function Chip({
  children,
  selected = false,
  dashed = false,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  selected?: boolean;
  dashed?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const state = selected
    ? 'bg-ink border-ink text-white'
    : dashed
      ? 'bg-surface border-line border-dashed text-muted hover:border-accent-line'
      : 'bg-surface border-line text-ink-soft hover:border-accent-line';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] border-[1.5px] px-4 py-[9px] text-sm font-bold transition-colors ${state} ${className}`}
    >
      {children}
    </button>
  );
}
