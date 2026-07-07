'use client';

import { useEffect } from 'react';

// Registers the static-shell service worker (/sw.js) after load. Production only:
// a dev service worker fights Next's HMR and caches stale chunks. Failures are
// swallowed — the SW is a progressive enhancement; the app works without it.
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
