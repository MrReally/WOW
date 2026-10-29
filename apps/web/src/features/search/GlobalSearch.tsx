import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, Input, Loading, Sheet, StatusBadge } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { useI18n } from "../../app/i18n.tsx";
import { projectStatusTone } from "../../lib/labels.ts";
import { useGlobalSearchData } from "./hooks.ts";
import { filterProjectsBySearch } from "../../lib/useProjectSearch.ts";

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { can } = useSession();
  const { dateRange, projectStatusLabel } = useI18n();
  const canSearchProjects = can("projects.view");
  const data = useGlobalSearchData(open && canSearchProjects);

  const rows = useMemo(() => {
    if (!query.trim()) return [];
    return filterProjectsBySearch(data.projects.data ?? [], data.venues.data ?? [], data.clients.data ?? [], query).slice(0, 30);
  }, [data.clients.data, data.projects.data, data.venues.data, query]);

  const loading = data.projects.isLoading || data.clients.isLoading || data.venues.isLoading;

  return (
    <Sheet open={open} onClose={onClose} title="Поиск">
      <div className="global-search">
        <div className="global-search__field">
          <span aria-hidden="true">⌕</span>
          <Input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, клиент, площадка или дата"
            aria-label="Глобальный поиск"
          />
        </div>

        {!canSearchProjects ? (
          <EmptyState title="Поиск проектов недоступен" hint="Для вашей роли раздел Planning скрыт" />
        ) : loading ? (
          <Loading />
        ) : !query.trim() ? (
          <EmptyState title="Найдите проект" hint="Введите название, клиента, площадку или дату" />
        ) : rows.length === 0 ? (
          <EmptyState title="Ничего не найдено" />
        ) : (
          <div className="global-search__results">
            {rows.map((project) => (
              <button
                key={project.id}
                className="global-search__row"
                onClick={() => {
                  onClose();
                  setQuery("");
                  navigate(`/projects/${project.id}`);
                }}
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>{dateRange(project.startsAt, project.endsAt)}</small>
                </span>
                <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabel[project.status]}</StatusBadge>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
