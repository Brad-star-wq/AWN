'use client';

import { createContext, useCallback, useContext, useRef } from 'react';

// Enter-to-advance engine. A form wraps its controls in <FocusFlow order={...}>,
// each control carries data-stop="<id>", and an explicit ORDER array defines the
// logical fill sequence (not DOM order). Enter (or the keypad "Next") advances to
// the next *rendered* stop; unrendered stops are skipped. Native Tab/Shift+Tab
// keep working alongside.
//
// Money safety: Enter never fires the primary action unless it is focused. The
// primary button is marked data-primary; Enter elsewhere is intercepted here and
// turned into an advance, so blasting Enter lands ON the (focusable) primary
// button without submitting.

type FlowCtx = { advance: (fromId: string) => void };
const Ctx = createContext<FlowCtx | null>(null);
export const useFocusFlow = () => useContext(Ctx);

export function FocusFlow({
  order,
  className,
  children,
}: {
  order: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const focusStop = useCallback((id: string): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const el = root.querySelector<HTMLElement>(`[data-stop="${id}"]`);
    if (!el) return false;
    const focusable = el.matches('input,select,textarea,button,[tabindex]')
      ? el
      : el.querySelector<HTMLElement>('[tabindex="0"], button, input, select, textarea');
    (focusable ?? el).focus();
    return true;
  }, []);

  const advance = useCallback(
    (fromId: string) => {
      const i = order.indexOf(fromId);
      for (let j = i + 1; j < order.length; j++) {
        if (focusStop(order[j]!)) return;
      }
    },
    [order, focusStop],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target as HTMLElement;
    const stopEl = t.closest<HTMLElement>('[data-stop]');
    if (!stopEl) return;
    const stopId = stopEl.getAttribute('data-stop')!;

    // Textarea: Enter = newline; advance only on Shift+Enter.
    if (t.tagName === 'TEXTAREA') {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        advance(stopId);
      }
      return;
    }
    // Combobox owns its own Enter (select/create + advance).
    if (t.closest('[data-combobox="true"]')) return;
    // Primary action: let it activate natively (it guards its own validity).
    if (t.closest('[data-primary="true"]')) return;

    // Selectable button (chip / segmented): select the focused one, then advance.
    if (t.tagName === 'BUTTON' && t.getAttribute('data-select') === 'true') {
      e.preventDefault();
      t.click();
      advance(stopId);
      return;
    }
    // Space inside a text input types a space — don't hijack it.
    if (e.key === ' ') return;
    // Plain field (text / money input): Enter advances.
    e.preventDefault();
    advance(stopId);
  }

  return (
    <Ctx.Provider value={{ advance }}>
      <div ref={rootRef} className={className} onKeyDown={onKeyDown}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** True on touch / coarse-pointer devices (use the keypad, not the OS keyboard). */
export function useCoarsePointer(): boolean {
  const ref = useRef<boolean | null>(null);
  if (ref.current === null) {
    ref.current = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  }
  return ref.current;
}
