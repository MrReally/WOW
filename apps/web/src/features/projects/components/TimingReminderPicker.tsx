import { useEffect, useState } from "react";
import { Button, Sheet } from "../../../ui-kit/index.ts";

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
    <div className="timing-reminder-picker">
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
      <Sheet open={open} onClose={closeWithoutSaving} title="Когда напомнить">
        <div className="timing-reminder-sheet">
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
      </Sheet>
    </div>
  );
}
