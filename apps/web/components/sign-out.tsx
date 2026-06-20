'use client';

import { useTransition } from 'react';
import { logout } from '@/app/login/actions';

export function SignOut() {
  const [pending, start] = useTransition();
  return (
    <button className="btn sm" disabled={pending} onClick={() => start(() => logout())}>
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
