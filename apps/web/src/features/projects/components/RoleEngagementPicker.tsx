import { useEffect, useRef, useState } from "react";
import { Button, Field, Input } from "../../../ui-kit/index.ts";
import { isoFromLocal, toLocalInput } from "../../../lib/datetime.ts";

interface RoleEngagementPickerProps {
  startsAt: string | null;
  endsAt: string | null;
  fallbackStartsAt?: string | null;
  fallbackEndsAt?: string | null;
  disabled?: boolean;
  onSave: (startsAt: string | null, endsAt: string | null) => Promise<unknown> | unknown;
}

export function engagementDuration(startsAt: string, endsAt: string): string | null {
  const durationMinutes = Math.floor((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const days = Math.floor(durationMinutes / (24 * 60));
  const hours = Math.floor((durationMinutes % (24 * 60)) / 60);
  const minutes = durationMinutes % 60;
  return [days ? `${days} сут.` : "", hours ? `${hours} ч` : "", minutes ? `${minutes} мин` : ""].filter(Boolean).join(" ");
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v5l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RoleEngagementPicker({
  startsAt,
  endsAt,
  fallbackStartsAt = null,
  fallbackEndsAt = null,
  disabled = false,
  onSave,
}: RoleEngagementPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftStartsAt, setDraftStartsAt] = useState("");
  const [draftEndsAt, setDraftEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const active = !!startsAt && !!endsAt;
  const duration = engagementDuration(draftStartsAt, draftEndsAt);

  const resetDraft = () => {
    setDraftStartsAt(toLocalInput(startsAt ?? fallbackStartsAt));
    setDraftEndsAt(toLocalInput(endsAt ?? fallbackEndsAt));
  };

  const close = () => {
    resetDraft();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) resetDraft();
  }, [open, startsAt, endsAt, fallbackStartsAt, fallbackEndsAt]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, startsAt, endsAt, fallbackStartsAt, fallbackEndsAt]);

  const toggle = () => {
    if (open) close();
    else {
      resetDraft();
      setOpen(true);
    }
  };

  const persist = async (nextStartsAt: string | null, nextEndsAt: string | null) => {
    setSaving(true);
    try {
      await onSave(nextStartsAt, nextEndsAt);
      setOpen(false);
    } catch {
      // Keep the menu open so the user can retry after the request error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="role-engagement-picker" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn ${active ? "icon-btn--active" : ""}`}
        aria-label={active ? "Изменить время занятости" : "Указать время занятости"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? "Время занятости указано" : "Указать время занятости"}
        disabled={disabled || saving}
        onClick={toggle}
      >
        <ClockIcon />
      </button>
      {open && (
        <div className="role-engagement-picker__menu" role="dialog" aria-label="Время занятости">
          <Field label="Начало работы">
            <Input type="datetime-local" value={draftStartsAt} disabled={saving} onChange={(event) => setDraftStartsAt(event.target.value)} />
          </Field>
          <Field label="Конец работы">
            <Input type="datetime-local" value={draftEndsAt} disabled={saving} onChange={(event) => setDraftEndsAt(event.target.value)} />
          </Field>
          <div className={`role-engagement-picker__duration ${duration ? "is-valid" : ""}`}>
            {duration ? `Продолжительность · ${duration}` : "Укажите корректный интервал"}
          </div>
          <div className="role-engagement-picker__actions">
            <Button variant="ghost" disabled={saving} onClick={() => void persist(null, null)}>Очистить</Button>
            <Button disabled={!duration || saving} onClick={() => void persist(isoFromLocal(draftStartsAt), isoFromLocal(draftEndsAt))}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
