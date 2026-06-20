// Type tile from the intake-items mockup: icon over a bold label, hover lifts to
// accent-soft. Used to pick an item type before choosing how many.
export function Tile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-[9px] rounded-[14px] border border-line bg-surface px-2 py-4 text-ink-soft transition-colors hover:border-accent-line hover:bg-accent-soft"
    >
      <span className="[&_svg]:h-6 [&_svg]:w-6 [&_svg]:stroke-[1.9]">{icon}</span>
      <span className="text-[13px] font-bold">{label}</span>
    </button>
  );
}
