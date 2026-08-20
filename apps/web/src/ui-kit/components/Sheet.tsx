import type { FocusEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface SheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  if (!open) return null;
  const beginDrag = (clientY: number) => {
    startY.current = clientY;
    setDragY(0);
  };
  const moveDrag = (clientY: number) => {
    if (startY.current == null) return;
    setDragY(Math.max(0, clientY - startY.current));
  };
  const endDrag = () => {
    if (dragY > 80) onClose();
    startY.current = null;
    setDragY(0);
  };

  const keepDatePickerInView = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !["date", "datetime-local", "time"].includes(target.type)) return;

    // Native date pickers open outside the document flow. Centre their anchor
    // before the browser opens the popup so the calendar is not clipped by the viewport.
    target.scrollIntoView({ block: "center", inline: "nearest" });
  };

  return createPortal(
    <div className="sheet__backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onFocusCapture={keepDatePickerInView}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="sheet__drag"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag(e.clientY);
          }}
          onPointerMove={(e) => moveDrag(e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="sheet__handle" />
          {title && <h2 className="sheet__title">{title}</h2>}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
