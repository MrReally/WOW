import { useEffect, useState } from "react";
import { onToast, type Toast } from "../lib/toastBus.ts";
import "./toasts.css";

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    return onToast((t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200);
    });
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
