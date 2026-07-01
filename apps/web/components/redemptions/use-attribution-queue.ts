'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { getAttributionQueueAction } from '@/lib/actions';
import type { RedemptionQueueItem } from '@/lib/types';

/** Poll cadence — the fallback if Realtime isn't wired (walkthrough Phase D). */
const POLL_MS = 10_000;

function rowToItem(row: Record<string, unknown>): RedemptionQueueItem | null {
  const id = row['id'];
  if (typeof id !== 'string') return null;
  const createdAt = row['created_at'];
  return {
    id,
    amountCents: Number(row['amount_cents']),
    locationId: (row['location_id'] as string | null) ?? null,
    squarePaymentId: (row['square_payment_id'] as string | null) ?? null,
    createdAt:
      typeof createdAt === 'string' ? createdAt : new Date(createdAt as string).toISOString(),
  };
}

/**
 * Live attribution queue: seeded from the server, kept current by Supabase
 * Realtime, and reconciled every 10s by a poll (belt-and-suspenders, so the
 * queue is correct even where Realtime isn't delivering). Subscribes to ALL
 * redemption changes and derives the visible set, so a row leaving
 * awaiting_attribution (finalized elsewhere) is removed too.
 */
export function useAttributionQueue(initial: RedemptionQueueItem[]): RedemptionQueueItem[] {
  const [map, setMap] = useState<Map<string, RedemptionQueueItem>>(
    () => new Map(initial.map((i) => [i.id, i])),
  );

  const refresh = useCallback(async () => {
    try {
      const rows = await getAttributionQueueAction();
      setMap(new Map(rows.map((i) => [i.id, i])));
    } catch {
      // Keep the last known queue; the next poll / realtime event recovers.
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('redemptions-attribution')
      .on(
        // Cast: the typed overload wants a generated DB schema; we read raw rows.
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'redemptions' } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setMap((prev) => {
            const next = new Map(prev);
            const isDelete = payload.eventType === 'DELETE';
            const raw = (isDelete ? payload.old : payload.new) as Record<string, unknown>;
            const item = rowToItem(raw);
            if (!item) return prev;
            if (isDelete || raw['status'] !== 'awaiting_attribution') next.delete(item.id);
            else next.set(item.id, item);
            return next;
          });
        },
      )
      .subscribe();

    void refresh(); // reconcile anything missed before the subscription opened
    const poll = setInterval(refresh, POLL_MS);

    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
