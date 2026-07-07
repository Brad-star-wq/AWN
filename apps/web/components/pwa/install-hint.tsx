'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

// Subtle, dismissible install affordance — a convenience, not core.
//  • Android / desktop Chrome: capture beforeinstallprompt and offer an "Install"
//    button that fires the real prompt.
//  • iOS Safari: no prompt event exists, so show a one-time hint pointing at
//    Share → Add to Home Screen.
// Hidden entirely once installed (standalone) or dismissed (persisted).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'awn-install-hint-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.('(display-mode: standalone)').matches || iosStandalone;
}
function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    setHidden(false);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser's mini-infobar from showing
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (isIos()) setShowIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore storage errors */
    }
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    dismiss();
  }

  if (hidden || (!deferred && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-[440px] items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 shadow-none md:left-auto md:right-4 md:mx-0">
      {deferred ? (
        <>
          <Download size={18} className="flex-none text-accent" />
          <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
            Install AWN Resale for one-tap, full-screen access.
          </span>
          <button
            type="button"
            onClick={install}
            className="flex-none rounded-[8px] bg-accent px-[14px] py-[8px] font-display text-[13px] font-semibold text-white"
          >
            Install
          </button>
        </>
      ) : (
        <>
          <Share size={18} className="flex-none text-accent" />
          <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
            Install this app: tap <b>Share</b>, then <b>Add to Home Screen</b>.
          </span>
        </>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-none text-ink-soft hover:text-ink"
      >
        <X size={18} />
      </button>
    </div>
  );
}
