import { useMemo, useRef, useState } from "react";
import type { Equipment } from "@sever/contracts";

interface Props {
  units: Equipment.EquipmentUnitDTO[];
  models: Equipment.EquipmentModelDTO[];
  onSelect: (unit: Equipment.EquipmentUnitDTO) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase();
const SCANNER_MAX_KEY_INTERVAL_MS = 35;
const SCANNER_MAX_BURST_MS = 500;
const SCANNER_MIN_CODE_LENGTH = 4;

export function EquipmentUnitSearch({ units, models, onSelect, disabled = false, ariaLabel, placeholder = "Производитель, модель или номер" }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const burst = useRef({ startedAt: 0, lastAt: 0, characters: 0 });
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const needle = normalize(query);
  const matches = useMemo(() => {
    if (!needle) return [];
    return units.filter((unit) => {
      const model = modelById.get(unit.modelId);
      return [unit.assetTag, unit.serial, model?.manufacturer, model?.name].some((value) => normalize(value).includes(needle));
    }).slice(0, 8);
  }, [modelById, needle, units]);

  const choose = (unit: Equipment.EquipmentUnitDTO) => {
    onSelect(unit);
    setQuery("");
    setActiveIndex(0);
  };

  const exactMatch = (value: string) => {
    const exactNeedle = normalize(value);
    if (!exactNeedle) return undefined;
    const exact = units.filter((unit) => normalize(unit.assetTag) === exactNeedle || normalize(unit.serial) === exactNeedle);
    return exact.length === 1 ? exact[0] : undefined;
  };

  const change = (value: string) => {
    const now = Date.now();
    const appendedOneCharacter = value.startsWith(query) && value.length === query.length + 1;
    const gap = now - burst.current.lastAt;
    if (!appendedOneCharacter || burst.current.characters === 0 || gap > SCANNER_MAX_KEY_INTERVAL_MS) {
      burst.current = { startedAt: now, lastAt: now, characters: 1 };
    } else {
      burst.current = { ...burst.current, lastAt: now, characters: burst.current.characters + 1 };
    }
    setQuery(value);
    setActiveIndex(0);
    const looksLikeScanner = burst.current.characters >= SCANNER_MIN_CODE_LENGTH
      && now - burst.current.startedAt <= SCANNER_MAX_BURST_MS;
    const exact = looksLikeScanner ? exactMatch(value) : undefined;
    if (exact) choose(exact);
  };

  return <div className="bo-equipment-search">
    <input
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-controls={`${ariaLabel.replaceAll(" ", "-")}-results`}
      aria-expanded={matches.length > 0}
      autoComplete="off"
      disabled={disabled}
      value={query}
      onChange={(event) => change(event.target.value)}
      onPaste={(event) => {
        const exact = exactMatch(event.clipboardData.getData("text"));
        if (!exact) return;
        event.preventDefault();
        choose(exact);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
        if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
        if (event.key === "Enter") {
          const selected = exactMatch(query) ?? matches[activeIndex];
          if (selected) { event.preventDefault(); choose(selected); }
        }
        if (event.key === "Escape") setQuery("");
      }}
      placeholder={placeholder}
    />
    {matches.length > 0 && <div className="bo-equipment-search__results" id={`${ariaLabel.replaceAll(" ", "-")}-results`} role="listbox">
      {matches.map((unit, index) => {
        const model = modelById.get(unit.modelId);
        return <button
          className={index === activeIndex ? "is-active" : ""}
          key={unit.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(unit)}
          role="option"
          aria-selected={index === activeIndex}
          type="button"
        >
          <span><strong>{model?.manufacturer ? `${model.manufacturer} · ` : ""}{model?.name ?? "Неизвестная модель"}</strong><small>{unit.assetTag}{unit.serial ? ` · серийный ${unit.serial}` : ""}</small></span>
        </button>;
      })}
    </div>}
  </div>;
}
