import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCustomerDetail } from '@/lib/server/queries';
import { formatCents } from '@/lib/money';
import { itemEmoji, txnDateLabel, memberSince } from '@/lib/format';
import { ActivityRowView } from '@/components/activity-row';
import { IssueAdjustCredit } from '@/components/customers/issue-adjust';
import { ProfileMenu } from '@/components/customers/profile-menu';
import type { TxnItem } from '@/lib/types';

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS: Record<TxnItem['status'], { label: string; bg: string; color: string }> = {
  pending: { label: 'pending', bg: 'var(--warn-soft)', color: 'var(--warn)' },
  in_stock: { label: 'in stock', bg: 'var(--accent-soft)', color: 'var(--accent)' },
  sold: { label: 'sold', bg: 'var(--surface2)', color: 'var(--muted)' },
};

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const c = await getCustomerDetail(params.id);
  if (!c) notFound();

  return (
    <>
      {/* back bar */}
      <div className="flex items-center gap-[14px] border-b border-line bg-surface px-4 py-[18px] md:px-8">
        <Link href="/customers" className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-line" aria-label="Back to People">
          <ArrowLeft size={18} strokeWidth={2} className="text-ink-soft" />
        </Link>
        <span className="font-display text-[15px] font-semibold">People</span>
      </div>

      <div className="w-full max-w-[920px] px-4 py-6 md:px-10 md:py-9">
        {/* profile head */}
        <div className="mb-[20px] flex items-center gap-4">
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[11px] bg-surface2 font-display text-base font-semibold text-ink-soft">{initials(c.displayName)}</span>
          <div>
            <h1 className="flex items-center gap-[10px] font-display text-[19px] font-semibold -tracking-[0.01em]">
              {c.displayName}
              <span className="rounded-[6px] bg-accent-soft px-[9px] py-[3px] font-display text-[11px] font-semibold text-accent">Walk-in</span>
            </h1>
            <div className="mt-[5px] text-[13px] font-medium text-muted">
              {c.phone ?? 'No phone on file'}{c.memberSinceIso ? ` · ${memberSince(c.memberSinceIso)}` : ''}
            </div>
          </div>
          <ProfileMenu />
        </div>

        {/* dark balance block */}
        <div className="mb-[26px] flex items-center justify-between rounded-[11px] bg-ink px-[20px] py-[16px]">
          <div>
            <div className="font-display text-[11px] font-medium" style={{ color: '#9aa6b4' }}>Store credit balance</div>
            <div className="num mt-[5px] text-[26px] font-extrabold -tracking-[0.01em] text-white">{formatCents(c.balanceCents)}</div>
          </div>
          <div className="flex gap-[10px]">
            <IssueAdjustCredit customerId={c.id} triggerLabel="Issue credit" triggerClassName="store-issue-btn" />
            <Link href={`/redeem?customer=${c.id}`} className="store-redeem-btn">Redeem</Link>
          </div>
        </div>

        {/* credit history */}
        <div className="mb-[30px]">
          <div className="mb-[6px] flex items-center font-display text-[13px] font-semibold text-ink-soft">
            Credit history <span className="ml-auto font-medium text-muted">append-only</span>
          </div>
          {c.history.length === 0 ? (
            <p className="border-t border-line py-5 text-sm text-muted">No credit activity yet.</p>
          ) : (
            <div className="rowlist border-t border-line">
              {c.history.map((row) => (
                <ActivityRowView key={row.id} row={row} showName={false} showDetail />
              ))}
            </div>
          )}
        </div>

        {/* items grouped by transaction — the non-negotiable, off our own data */}
        <div className="mb-[6px] flex items-center font-display text-[13px] font-semibold text-ink-soft">
          Items from {c.displayName.split(' ')[0]} <span className="ml-auto font-medium text-muted">by transaction</span>
        </div>
        {c.transactions.length === 0 ? (
          <p className="border-t border-line py-5 text-sm text-muted">No items taken in yet.</p>
        ) : (
          c.transactions.map((txn) => (
            <div key={txn.id} className="mb-[11px] overflow-hidden rounded-[10px] border border-line">
              <div className="flex items-center gap-[10px] px-4 py-[13px]" style={{ background: '#fafbfc' }}>
                <span className="font-display text-[13.5px] font-semibold">{txnDateLabel(txn.dateIso)}</span>
                <span className="ml-auto text-[12.5px] font-semibold text-muted">
                  {txn.payout === 'unknown'
                    ? 'recorded'
                    : <>paid <b className="num font-extrabold text-accent">{formatCents(txn.amountCents)}</b> {txn.payout === 'cash' ? 'cash' : 'credit'}</>}
                </span>
              </div>
              {txn.items.map((it) => {
                const s = STATUS[it.status];
                return (
                  <div key={it.id} className="flex items-center gap-3 border-t border-line px-4 py-3">
                    <span className="thumb">{itemEmoji[it.itemType]}</span>
                    <div className="min-w-0 flex-1">
                      <b className="font-display text-[13.5px] font-semibold">{it.title}</b>
                      {it.detail ? <div className="text-[12px] text-muted">{it.detail}</div> : null}
                    </div>
                    <span className="font-display" style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 5, background: s.bg, color: s.color }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}
