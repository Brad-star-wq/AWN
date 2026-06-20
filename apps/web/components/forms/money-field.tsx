'use client';

import { useState } from 'react';
import { parseDollarsToCents } from '@/lib/money';
import { MoneyKeypad } from '@/components/store/money-keypad';
import { useFocusFlow, useCoarsePointer } from '@/components/forms/focus-flow';

// One money input, two surfaces. Desktop: type digits, Enter advances (handled
// by FocusFlow). Mobile/touch: inputMode none + readOnly so the OS keyboard
// never opens — tap opens the custom keypad whose "Next/Done" commits + advances.
export function MoneyField({
  cents,
  onCents,
  stopId,
  isLast = false,
}: {
  cents: number | null;
  onCents: (cents: number | null) => void;
  stopId?: string;
  isLast?: boolean;
}) {
  const coarse = useCoarsePointer();
  const flow = useFocusFlow();
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState(cents != null ? String(cents / 100) : '');

  if (coarse) {
    return (
      <>
        <button
          type="button"
          data-stop={stopId}
          onClick={() => setOpen(true)}
          className="flex w-full max-w-[180px] items-center gap-1.5 border-b border-line py-[9px] text-left"
          style={{ outline: 'none' }}
          aria-label="Enter amount"
        >
          <span className="font-extrabold text-faint">$</span>
          <span className="num text-[17px] font-extrabold" style={{ color: cents != null ? 'var(--ink)' : 'var(--faint)' }}>
            {cents != null ? (cents / 100).toFixed(2) : '—'}
          </span>
        </button>
        {open && (
          <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-surface p-4 shadow-none">
            <MoneyKeypad
              cents={cents ?? 0}
              onChange={onCents}
              nextLabel={isLast ? 'Done' : 'Next'}
              onNext={() => { setOpen(false); if (stopId) flow?.advance(stopId); }}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex w-full max-w-[180px] items-center gap-1.5 border-b border-line focus-within:border-accent">
      <span className="font-extrabold text-faint">$</span>
      <input
        data-stop={stopId}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder="0"
        className="num w-full border-0 bg-transparent py-[9px] text-[17px] font-extrabold text-ink outline-none"
        value={txt}
        onChange={(e) => { setTxt(e.target.value); onCents(parseDollarsToCents(e.target.value)); }}
      />
    </div>
  );
}
