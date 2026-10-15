import { Button } from "./primitives.tsx";
import { Input } from "./forms.tsx";

interface ProjectSearchProps {
  open: boolean;
  query: string;
  onToggle: () => void;
  onQueryChange: (value: string) => void;
  alwaysOpen?: boolean;
}

export function ProjectSearch({ open, query, onToggle, onQueryChange, alwaysOpen = false }: ProjectSearchProps) {
  const shown = alwaysOpen || open;
  return (
    <div className={`project-search ${shown ? "project-search--open" : ""} ${alwaysOpen ? "project-search--always" : ""}`}>
      <Button
        type="button"
        variant="secondary"
        className="project-search__toggle"
        aria-expanded={shown}
        aria-controls="project-search-field"
        onClick={onToggle}
      >
        🔍 Поиск
      </Button>
      {shown && (
        <div id="project-search-field" className="project-search__field">
          <Input
            type="search"
            autoFocus={!alwaysOpen}
            aria-label="Поиск мероприятия"
            placeholder="Название, клиент, площадка или дата"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
