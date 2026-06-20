// Stat tile from the Today / End-of-day mockups. `dark` is the ink-filled
// liability card; `tone` colors the value (green for credit-given, etc.).
type Tone = 'ink' | 'green';

export function StatCard({
  label,
  value,
  dark = false,
  tone = 'ink',
}: {
  label: string;
  value: React.ReactNode;
  dark?: boolean;
  tone?: Tone;
}) {
  const valueColor = dark ? 'text-white' : tone === 'green' ? 'text-accent' : 'text-ink';
  return (
    <div
      className={`rounded-2xl border p-[18px_20px] ${
        dark ? 'border-ink bg-ink' : 'border-line bg-surface'
      }`}
    >
      <div className={`text-[12.5px] font-semibold ${dark ? 'text-[#9aa6c2]' : 'text-muted'}`}>
        {label}
      </div>
      <div className={`mt-[11px] font-display text-[30px] font-extrabold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
