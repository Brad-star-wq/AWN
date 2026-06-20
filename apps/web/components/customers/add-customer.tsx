'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { customerCreate } from '@/lib/actions';
import { FocusFlow } from '@/components/forms/focus-flow';

export function AddCustomer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  function save() {
    setErr(undefined);
    start(async () => {
      const res = await customerCreate({ displayName: name, phone: phone.trim() || undefined });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setOpen(false);
      setName('');
      setPhone('');
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(true)}>
        + Add customer
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,42,.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}
        >
          <FocusFlow order={['name', 'phone', 'submit']} className="card" >
            <div style={{ width: 380, maxWidth: '90vw', padding: 20 }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Add customer</h2>
              {err && <div className="err">{err}</div>}
              <div className="field">
                <label>Name</label>
                <input data-stop="name" enterKeyHint="next" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Phone (optional)</label>
                <input data-stop="phone" enterKeyHint="done" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" data-stop="submit" data-primary="true" className="btn primary" disabled={pending} onClick={save}>
                  {pending ? 'Saving…' : 'Add customer'}
                </button>
                <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </FocusFlow>
        </div>
      )}
    </>
  );
}
