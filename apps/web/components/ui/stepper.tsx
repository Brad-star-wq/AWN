// Minimal text stepper from the intake mockups: uppercase labels, the active
// step underlined in accent, earlier steps muted, later steps faint.
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="ml-auto flex items-center gap-5">
      {steps.map((label, i) => {
        const tone =
          i === current
            ? 'text-ink border-b-2 border-accent pb-[3px]'
            : i < current
              ? 'text-muted'
              : 'text-faint';
        return (
          <span
            key={label}
            className={`text-xs font-semibold uppercase tracking-[0.13em] ${tone}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
