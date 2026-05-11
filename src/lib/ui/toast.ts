/**
 * Lightweight toast store — vanilla pub/sub so non-React modules
 * (e.g. lib/music/* helpers) can fire toasts without dragging React
 * context through the call site. The host component subscribes once
 * and renders a stack at the bottom-center of the viewport.
 *
 * Why not a library: a single auto-dismissing string banner doesn't
 * justify the bundle weight of react-hot-toast / sonner / etc. The
 * 30-line implementation below covers the only behavior we need
 * (queue, auto-dismiss, ESC-clear) and matches the rest of the
 * design system's typography/tokens.
 */
import { useEffect, useState } from 'react';

export type ToastItem = {
  id: number;
  message: string;
  /** Auto-dismiss after this many ms. Default 2400. */
  duration: number;
};

let _id = 0;
let _items: ToastItem[] = [];
const _listeners = new Set<() => void>();

function notify() {
  for (const fn of _listeners) fn();
}

/** Fire a toast. Returns the toast id so the caller can dismiss it
 *  early if needed (e.g. user took the followup action). */
export function showToast(message: string, opts?: { duration?: number }): number {
  const id = ++_id;
  const duration = opts?.duration ?? 2400;
  const item: ToastItem = { id, message, duration };
  // De-duplicate consecutive identical messages so a rapid double-tap
  // doesn't stack two copies of "Already in your playlist." on top of
  // each other.
  const tail = _items[_items.length - 1];
  if (tail && tail.message === message) {
    // Reset the existing toast's timer instead of pushing a new one.
    dismissToast(tail.id);
  }
  _items = [..._items, item];
  notify();
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: number): void {
  const next = _items.filter((t) => t.id !== id);
  if (next.length === _items.length) return;
  _items = next;
  notify();
}

export function clearToasts(): void {
  if (_items.length === 0) return;
  _items = [];
  notify();
}

/** Subscribe to toast changes. Returns an unsubscribe handle. */
export function subscribeToasts(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** React hook → live snapshot of the current toast list. */
export function useToasts(): ToastItem[] {
  const [snap, setSnap] = useState<ToastItem[]>(_items);
  useEffect(() => {
    const unsub = subscribeToasts(() => setSnap([..._items]));
    return unsub;
  }, []);
  return snap;
}
