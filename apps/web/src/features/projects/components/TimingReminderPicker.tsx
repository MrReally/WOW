import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../ui-kit/index.ts";

interface TimingReminderOption {
  label: string;
  minutes: number;
}

interface TimingReminderPickerProps {
  options: TimingReminderOption[];
  value: number[];
  disabled?: boolean;
  onSave: (value: number[]) => Promise<void>;
}

export function TimingReminderPicker({ options, value, disabled = false, onSave }: TimingReminderPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [menuStyle, setMenuStyle] = useState<Record<string, number>>({});

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const desiredHeight = 250;
    const below = window.innerHeight - rect.bottom - edge - gap;
    const above = rect.top - edge - gap;
    const placeAbove = below < desiredHeight && above > below;
    setMenuStyle({
      right: Math.max(edge, window.innerWidth - rect.right),
      maxHeight: Math.max(120, Math.min(desiredHeight, placeAbove ? above : below)),
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  };

  const closeWithoutSaving = () => {
    setDraft(value);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) closeWithoutSaving();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeWithoutSaving();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, value]);

  const toggleOpen = () => {
    if (open) {
      closeWithoutSaving();
      return;
    }
    setDraft(value);
    positionMenu();
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setOpen(false);
    } catch {
      // Keep the picker open so the selection can be retried.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="timing-reminder-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn--secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || saving}
        onClick={toggleOpen}
      >
        Когда напомнить · {value.length}
      </button>
      {open && createPortal(
        <div ref={menuRef} className="timing-reminder-picker__menu" style={menuStyle} role="dialog" aria-label="Когда напомнить">
          <div className="stack timing-reminder-picker__options">
            {options.map((option) => (
              <label className="row timing-reminder-picker__option" key={option.minutes}>
                <input
                  type="checkbox"
                  checked={draft.includes(option.minutes)}
                  disabled={saving}
                  onChange={(event) => setDraft(event.target.checked
                    ? [...draft, option.minutes]
                    : draft.filter((minutes) => minutes !== option.minutes))}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <Button block disabled={saving} onClick={() => void save()}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>,
        document.body,
      )}
    </div>
  );
}
