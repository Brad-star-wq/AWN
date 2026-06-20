// Date/label + draft-title helpers shared by server and client components.

/** "2:14p" if today, otherwise "Jun 18". */
export function activityTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) {
    let h = d.getHours();
    const ampm = h < 12 ? 'a' : 'p';
    h = h % 12 || 12;
    return `${h}:${String(d.getMinutes()).padStart(2, '0')}${ampm}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Thursday, June 18". */
export function dateLong(now: Date = new Date()): string {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Thursday, June 19 · 3:14 PM" — the Today header line. */
export function dateTimeLong(now: Date = new Date()): string {
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateLong(now)} · ${time}`;
}

/** Time-of-day greeting for the Today header. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Today · 2:14p" if today, else "Jun 14", or "—" when absent. */
export function lastActivityLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return `Today · ${activityTime(iso, now)}`;
  return activityTime(iso, now);
}

/** Whole days since `iso`. */
export function ageDays(iso: string | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A readable title from a draft's type + attributes. */
export function draftTitle(itemType: 'SHOE' | 'CARD' | 'OTHER', attributes: Record<string, unknown>): string {
  if (itemType === 'SHOE') {
    const head = [str(attributes.brand), str(attributes.model)].filter(Boolean).join(' ');
    const size = str(attributes.size);
    return [head, size && `· ${size}`].filter(Boolean).join(' ') || 'Shoe';
  }
  if (itemType === 'CARD') {
    const head = str(attributes.name) || str(attributes.player);
    const set = str(attributes.set);
    return [head, set && `· ${set}`].filter(Boolean).join(' ') || 'Card';
  }
  return str(attributes.description) || str(attributes.name) || 'Other item';
}

export const itemEmoji: Record<'SHOE' | 'CARD' | 'OTHER', string> = {
  SHOE: '👟',
  CARD: '🃏',
  OTHER: '📦',
};
