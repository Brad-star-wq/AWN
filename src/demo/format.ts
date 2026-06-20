/** Shared console formatting for the demos. */

export const RULE = '═'.repeat(64);

/** Integer cents → "$12.34" / "-$5.00". */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function heading(label: string): void {
  console.log(`\n▸ ${label}`);
}
