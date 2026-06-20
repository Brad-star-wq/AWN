'use client';

// Numeric keypad from the intake-amount mockup. Purely presentational: it emits
// key presses ('0'–'9', '.', 'back') and the parent owns the value + cents math.
const KEYS: Array<{ label: string; key: string }> = [
  { label: '1', key: '1' },
  { label: '2', key: '2' },
  { label: '3', key: '3' },
  { label: '4', key: '4' },
  { label: '5', key: '5' },
  { label: '6', key: '6' },
  { label: '7', key: '7' },
  { label: '8', key: '8' },
  { label: '9', key: '9' },
  { label: '.', key: '.' },
  { label: '0', key: '0' },
  { label: '⌫', key: 'back' },
];

export function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-[10px]">
      {KEYS.map(({ label, key }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPress(key)}
          className="h-[72px] rounded-[13px] border border-line bg-surface font-display text-2xl font-bold text-ink transition-colors hover:bg-canvas active:bg-accent-soft"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
