import { useState } from "react";
import type { Venues } from "@sever/contracts";
import { Input } from "../../ui-kit/index.ts";
import { resolveAddress, useAddressSuggestions } from "./hooks.ts";

export function AddressInput({ value, onChange, placeholder = "Адрес", onResolved }: { value: string; onChange: (value: string) => void; placeholder?: string; onResolved?: (address: Venues.ResolvedAddressDTO) => void }) {
  const [focused, setFocused] = useState(false);
  const suggestions = useAddressSuggestions(value);
  const choose = async (placeId: string) => {
    const resolved = await resolveAddress(placeId);
    onChange(resolved.address);
    onResolved?.(resolved);
    setFocused(false);
  };
  return (
    <div className="address-input">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="street-address"
        inputMode="text"
      />
      {focused && (suggestions.data?.length ?? 0) > 0 && (
        <div className="address-input__suggestions" role="listbox" aria-label="Подсказки адреса">
          {suggestions.data!.map((suggestion) => (
            <button type="button" key={suggestion.placeId} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(suggestion.placeId)}>
              {suggestion.label}
            </button>
          ))}
          <span>Powered by Google</span>
        </div>
      )}
    </div>
  );
}
