import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
}

const FieldLabelContext = createContext<string | undefined>(undefined);

export function Field({ label, children }: FieldProps) {
  const labelId = useId();
  return (
    <label className="field">
      <span id={labelId} className="field__label">{label}</span>
      <FieldLabelContext.Provider value={labelId}>{children}</FieldLabelContext.Provider>
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input" rows={3} style={{ resize: "vertical", minHeight: 64 }} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export function Select({ options, value, defaultValue, onChange, disabled, className, ...rest }: SelectProps) {
  const fieldLabelId = useContext(FieldLabelContext);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<Record<string, string | number>>({});
  const selectedValue = String(controlled ? value ?? "" : internalValue);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const searchable = options.length > 8;
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("ru-RU").includes(normalized));
  }, [options, query]);

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const maxHeight = Math.min(360, window.innerHeight - edge * 2);
    const below = window.innerHeight - rect.bottom - edge - gap;
    const above = rect.top - edge - gap;
    const placeAbove = below < 220 && above > below;
    const height = Math.min(maxHeight, Math.max(180, placeAbove ? above : below));
    setMenuStyle({
      left: Math.max(edge, Math.min(rect.left, window.innerWidth - rect.width - edge)),
      width: Math.min(rect.width, window.innerWidth - edge * 2),
      maxHeight: height,
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  };

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const reposition = () => positionMenu();
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, searchable]);

  const choose = (nextValue: string) => {
    if (!controlled) setInternalValue(nextValue);
    const native = nativeRef.current;
    if (native && onChange) {
      native.value = nextValue;
      onChange({ target: native, currentTarget: native } as ChangeEvent<HTMLSelectElement>);
    }
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if ((event.key === "Enter" || event.key === " ") && !disabled) {
      event.preventDefault();
      setQuery("");
      setOpen((current) => !current);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const ariaLabel = rest["aria-label"];
  const ariaLabelledBy = rest["aria-labelledby"] ?? fieldLabelId;
  return (
    <span className={`select-shell${open ? " select-shell--open" : ""}${disabled ? " select-shell--disabled" : ""}${className ? ` ${className}` : ""}`}>
      <select
        {...rest}
        ref={nativeRef}
        className="select-native"
        value={selectedValue}
        disabled={disabled}
        tabIndex={-1}
        aria-labelledby={ariaLabelledBy}
        onChange={(event) => {
          if (!controlled) setInternalValue(event.target.value);
          onChange?.(event);
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span
        ref={triggerRef}
        className="select"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) return;
          setQuery("");
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select__value">{selected?.label ?? ""}</span>
        <span className="select__chevron" aria-hidden="true" />
      </span>
      {open && createPortal(
        <div ref={menuRef} className="select-popover" style={menuStyle}>
          {searchable && <div className="select-popover__search-wrap"><input ref={searchRef} className="select-popover__search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" aria-label="Поиск в списке" /></div>}
          <div className="select-options" role="listbox" aria-label={ariaLabel}>
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                className={`select-option${option.value === selectedValue ? " select-option--selected" : ""}`}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {option.value === selectedValue && <span className="select-option__check" aria-hidden="true">✓</span>}
              </button>
            ))}
            {visibleOptions.length === 0 && <p className="select-options__empty">Ничего не найдено</p>}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
