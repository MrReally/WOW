// Tiny pub/sub so non-React code (the React Query cache) can raise toasts that
// the ToastProvider renders. Keeps feedback centralized instead of wiring every
// mutation by hand.

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function onToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(kind: ToastKind, message: string): void {
  const t: Toast = { id: ++seq, kind, message };
  listeners.forEach((fn) => fn(t));
}
