import { Button } from "./primitives.tsx";
import { Input } from "./forms.tsx";

interface ProjectSearchProps {
  open: boolean;
  query: string;
  onToggle: () => void;
  onQueryChange: (value: string) => void;
}

export function ProjectSearch({ open, query, onToggle, onQueryChange }: ProjectSearchProps) {
  return (
    <div className={`project-search ${open ? "project-search--open" : ""}`}>
      <Button
        type="button"
        variant="secondary"
        className="project-search__toggle"
        aria-expanded={open}
        aria-controls="project-search-field"
        onClick={onToggle}
      >
        🔍 Поиск
      </Button>
      {open && (
        <div id="project-search-field" className="project-search__field">
          <Input
            type="search"
            autoFocus
            aria-label="Поиск мероприятия"
            placeholder="Название, локация или дата"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
