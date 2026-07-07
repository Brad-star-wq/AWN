'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { addIntakeOptionAction, removeIntakeOptionAction, getIntakeOptionsAction } from '@/lib/actions';
import type { IntakeOptions } from '@/lib/categories';

type OptKind = 'category' | 'brand' | 'condition' | 'size' | 'color';

// Settings CRUD for the intake pick-lists (persisted in intake_options). Adds /
// removes go through server actions, then we re-read the live set and refresh so
// the intake & finish forms reflect the change immediately.
export function IntakeOptionsEditor({ initial }: { initial: IntakeOptions }) {
  const router = useRouter();
  const [opts, setOpts] = useState<IntakeOptions>(initial);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function mutate(run: () => Promise<{ ok: boolean; error?: string }>) {
    setErr('');
    start(async () => {
      const res = await run();
      if (!res.ok) {
        setErr(res.error ?? 'Something went wrong.');
        return;
      }
      setOpts(await getIntakeOptionsAction());
      router.refresh(); // intake/finish forms pick up the change
    });
  }
  const add = (kind: OptKind, category: string, value: string) =>
    mutate(() => addIntakeOptionAction({ kind, category, value }));
  const remove = (kind: OptKind, category: string, value: string) =>
    mutate(() => removeIntakeOptionAction({ kind, category, value }));

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="sect-title">Intake options</span>
      </div>
      <div className="pad">
        <p className="sub" style={{ marginBottom: 12 }}>
          These drive the pick-lists on the intake &amp; finish forms. Changes appear there immediately.
        </p>
        {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}

        <OptionList
          label="Categories"
          values={opts.categories}
          pending={pending}
          onAdd={(v) => add('category', '', v)}
          onRemove={(v) => remove('category', '', v)}
        />

        {opts.categories.map((cat) => {
          const c = opts.byCategory[cat] ?? { brands: [], conditions: [], sizes: [], colors: [] };
          return (
            <div key={cat} className="rounded-[10px] border border-line p-4" style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{cat}</div>
              <OptionList label="Brands" values={c.brands} pending={pending} onAdd={(v) => add('brand', cat, v)} onRemove={(v) => remove('brand', cat, v)} />
              <OptionList label="Conditions" values={c.conditions} pending={pending} onAdd={(v) => add('condition', cat, v)} onRemove={(v) => remove('condition', cat, v)} />
              <OptionList label="Sizes" values={c.sizes} pending={pending} onAdd={(v) => add('size', cat, v)} onRemove={(v) => remove('size', cat, v)} />
              <OptionList label="Colors" values={c.colors} pending={pending} onAdd={(v) => add('color', cat, v)} onRemove={(v) => remove('color', cat, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptionList({
  label,
  values,
  pending,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  pending: boolean;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState('');
  function submit() {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flabel" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {values.length === 0 && <span className="sub">None yet.</span>}
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-[8px] border border-line px-[10px] py-[5px] text-[13px] font-medium">
            {v}
            <button type="button" aria-label={`Remove ${v}`} disabled={pending} onClick={() => onRemove(v)} className="text-ink-soft hover:text-ink">
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="finp"
          style={{ maxWidth: 220 }}
          value={draft}
          placeholder={`Add ${label.toLowerCase().replace(/s$/, '')}…`}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn sm" disabled={pending} onClick={submit}>Add</button>
      </div>
    </div>
  );
}
