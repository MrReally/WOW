import { useNavigate } from "react-router-dom";
import { Sheet, WSChip, Chip } from "../../ui-kit/index.ts";
import { useSession } from "../session.ts";
import { workspacesFor, WORKSPACE_COPY, type Workspace } from "../workspaces.ts";
import { useI18n } from "../i18n.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  current: Workspace;
  crewApplicationsCount: number;
}

export function WorkspaceSwitcher({ open, onClose, current, crewApplicationsCount }: Props) {
  const navigate = useNavigate();
  const { can } = useSession();
  const { locale, t } = useI18n();
  const all = workspacesFor(can);
  const others = all.filter((workspace) => workspace.id !== current.id);
  const copy = (workspace: Workspace) => WORKSPACE_COPY[workspace.id]?.[locale] ?? workspace;

  const go = (workspace: Workspace) => {
    navigate(workspace.route);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="workspace-switcher">
        <section className="workspace-switcher__section">
          <div className="workspace-switcher__heading">{t("workspace.current")}</div>
          <div className="workspace-switcher__group">
            <div className="workspace-switcher__row workspace-switcher__row--current">
              <WSChip glyph={current.glyph} tone={current.tone} size={30} />
              <span className="workspace-switcher__copy">
                <strong>{copy(current).name}</strong>
                <small>{copy(current).sub}</small>
              </span>
              <svg className="workspace-switcher__check" viewBox="0 0 24 24" aria-label="Выбран">
                <path d="M5 12.5 9.2 17 19 7" />
              </svg>
            </div>
          </div>
        </section>

        <section className="workspace-switcher__section">
          <div className="workspace-switcher__heading">{t("workspace.other")}</div>
          <div className="workspace-switcher__group">
            {others.map((workspace, index) => (
              <button key={workspace.id} type="button" className="workspace-switcher__row" data-last={index === others.length - 1 || undefined} onClick={() => go(workspace)}>
                <WSChip glyph={workspace.glyph} tone={workspace.tone} size={30} />
                <span className="workspace-switcher__copy">
                  <strong>{copy(workspace).name}</strong>
                  <small>{copy(workspace).sub}</small>
                </span>
                {workspace.id === "crew" && crewApplicationsCount > 0 && <Chip label={String(crewApplicationsCount)} tone="warn" />}
                <span className="workspace-switcher__chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
