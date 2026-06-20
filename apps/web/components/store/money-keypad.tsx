'use client';

import { formatCents } from '@/lib/money';

// Terminal-style money entry: each digit appends to the cents value (type
// "6","0","0" -> $6.00), backspace drops the last digit. Optionally hard-capped
// (the redeem keypad cannot exceed the balance — prevention over validation).
export function MoneyKeypad({
  cents,
  onChange,
  maxCents,
  onNext,
  nextLabel = 'Next',
}: {
  cents: number;
  onChange: (cents: number) => void;
  maxCents?: number;
  /** Commit + advance — shown as a prominent key (last money field = "Done"). */
  onNext?: () => void;
  nextLabel?: string;
}) {
  function press(k: string) {
    let next: number;
    if (k === 'back') next = Math.floor(cents / 10);
    else if (k === '00') next = cents * 100;
    else next = cents * 10 + Number(k);
    if (maxCents !== undefined) next = Math.min(next, maxCents);
    onChange(next);
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];
  const capped = maxCents !== undefined && cents >= maxCents;

  // Keyboard: digits type, Backspace deletes — no mouse needed.
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
  }

  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ outline: 'none' }} aria-label="Amount keypad">
      <div
        className="num"
        style={{ textAlign: 'center', fontSize: 40, fontWeight: 800, padding: '8px 0 14px', color: cents > 0 ? 'var(--ink)' : 'var(--faint)' }}
      >
        {formatCents(cents)}
      </div>
      {capped && <p className="hint" style={{ textAlign: 'center', color: 'var(--accent)', marginTop: -8, marginBottom: 8 }}>At the full balance</p>}
      <div className="keypad">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k}>
            {k === 'back' ? '⌫' : k}
          </button>
        ))}
      </div>
      {onNext && (
        <button type="button" className="pri" style={{ marginTop: 10 }} onClick={onNext}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}
