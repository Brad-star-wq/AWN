'use client';

import { useEffect, useRef, useState } from 'react';

// Roving-tabindex helper: a button group is ONE Tab stop; Left/Right/Up/Down
// move focus across the buttons inside; Enter/Space select the focused one
// (native button click). Tab/Shift+Tab continue between groups untouched.
function useRoving(count: number, activeIndex: number) {
  const [idx, setIdx] = useState(activeIndex >= 0 ? activeIndex : 0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (idx > count - 1) setIdx(Math.max(0, count - 1));
  }, [count, idx]);

  function onKeyDown(e: React.KeyboardEvent) {
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') d = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') d = -1;
    else return;
    if (count === 0) return;
    e.preventDefault();
    const next = (idx + d + count) % count;
    setIdx(next);
    refs.current[next]?.focus();
  }

  function itemProps(i: number) {
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el;
      },
      tabIndex: i === idx ? 0 : -1,
      onFocus: () => setIdx(i),
    };
  }

  return { onKeyDown, itemProps };
}

// Single- or multi-select chip group (Category, Brand, Size, Condition, Color).
export function ChipGroup({
  options,
  value,
  values,
  multi = false,
  allowMore = false,
  ariaLabel,
  stopId,
  onSelect,
}: {
  options: string[];
  value?: string;
  values?: string[];
  multi?: boolean;
  allowMore?: boolean;
  ariaLabel?: string;
  /** Marks this group as one stop in the Enter-advance sequence. */
  stopId?: string;
  onSelect: (v: string) => void;
}) {
  const active = !multi && value ? options.indexOf(value) : 0;
  const r = useRoving(options.length, active);
  return (
    <div className="chips" role={multi ? 'group' : 'radiogroup'} aria-label={ariaLabel} data-stop={stopId} onKeyDown={r.onKeyDown}>
      {options.map((o, i) => {
        const on = multi ? !!values?.includes(o) : value === o;
        return (
          <button
            key={o}
            type="button"
            data-select="true"
            {...r.itemProps(i)}
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            className={`chip${on ? ' on' : ''}`}
            onClick={() => onSelect(o)}
          >
            {o}
          </button>
        );
      })}
      {allowMore && (
        <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--muted)', cursor: 'default' }}>
          More…
        </span>
      )}
    </div>
  );
}

// Segmented toggle (Payout, Men's/Women's) — same roving model, .seg styling.
export function SegGroup<T extends string>({
  options,
  value,
  ariaLabel,
  stopId,
  onSelect,
}: {
  options: { label: string; value: T }[];
  value: T;
  ariaLabel?: string;
  stopId?: string;
  onSelect: (v: T) => void;
}) {
  const active = options.findIndex((o) => o.value === value);
  const r = useRoving(options.length, active);
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel} data-stop={stopId} onKeyDown={r.onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          data-select="true"
          {...r.itemProps(i)}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : undefined}
          onClick={() => onSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Roving group for an action row of arbitrary buttons (e.g. the POS category
// pad): one Tab stop, arrows move, Enter/Space fires the focused button.
export function RovingRow({
  count,
  className,
  ariaLabel,
  children,
}: {
  count: number;
  className?: string;
  ariaLabel?: string;
  children: (itemProps: (i: number) => { ref: (el: HTMLButtonElement | null) => void; tabIndex: number; onFocus: () => void }) => React.ReactNode;
}) {
  const r = useRoving(count, 0);
  return (
    <div className={className} role="group" aria-label={ariaLabel} onKeyDown={r.onKeyDown}>
      {children(r.itemProps)}
    </div>
  );
}
