'use client';

import { useState, useTransition } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const res = await login(formData);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="err">{error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn primary" type="submit" disabled={pending} style={{ width: '100%', padding: 11, justifyContent: 'center' }}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
