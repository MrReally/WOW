import { useEffect, useRef } from "react";

interface Props {
  selectedIds: string[];
  rowIds: string[];
  onChange: (selectedIds: string[]) => void;
  ariaLabel?: string;
}

export function TableSelectAllCheckbox({ selectedIds, rowIds, onChange, ariaLabel = "Выбрать все строки" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const selected = new Set(selectedIds);
  const selectedCount = rowIds.reduce((count, id) => count + Number(selected.has(id)), 0);
  const allSelected = rowIds.length > 0 && selectedCount === rowIds.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  return <input
    ref={ref}
    type="checkbox"
    aria-label={ariaLabel}
    checked={allSelected}
    disabled={rowIds.length === 0}
    onChange={() => onChange(allSelected ? [] : rowIds)}
  />;
}
