// Money helpers — formatting and parsing live ONLY at the UI edge. Across the
// server-action boundary money is always integer cents.

/** 4000 → "$40.00", -1000 → "-$10.00". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const dollars = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${dollars}`;
}

/** Compact, whole-dollar form for stat cards: 18000 → "$180". */
export function formatCentsShort(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

/** Parse a dollar string ("$60", "60.00", "1,250.5") to integer cents, or null if invalid. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}
