import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

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
      if (!rootRef.current?.contains(event.target as Node)) closeWithoutSaving();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeWithoutSaving();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, value]);

  const toggleOpen = () => {
    if (open) {
      closeWithoutSaving();
      return;
    }
    setDraft(value);
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
        type="button"
        className="btn btn--secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || saving}
        onClick={toggleOpen}
      >
        Когда напомнить · {value.length}
      </button>
      {open && (
        <div className="timing-reminder-picker__menu" role="dialog" aria-label="Когда напомнить">
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
        </div>
      )}
    </div>
  );
}
