import { useNavigate } from "react-router-dom";
import type { People } from "@sever/contracts";
import { Sheet, WSChip, Avatar, Chip, SectionHead } from "../../ui-kit/index.ts";
import { roleLabel } from "../../lib/labels.ts";
import { workspacesFor, initialsOf, type Workspace } from "../workspaces.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  user: People.UserDTO;
  current: Workspace;
}

export function WorkspaceSwitcher({ open, onClose, user, current }: Props) {
  const navigate = useNavigate();
  const all = workspacesFor(user.role);
  const others = all.filter((w) => w.id !== current.id);

  const go = (w: Workspace) => {
    navigate(w.route);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {/* Account */}
      <div className="row" style={{ padding: "4px 4px 16px", gap: 13 }}>
        <Avatar initials={initialsOf(user.displayName)} size={46} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{user.displayName}</div>
          <div className="t-label" style={{ marginTop: 2, letterSpacing: "0.06em" }}>
            {roleLabel[user.role]} · {all.length} workspaces
          </div>
        </div>
      </div>

      <SectionHead label="Текущий workspace" />
      <div
        className="card card--tappable"
        onClick={() => go(current)}
        style={{ padding: 0, overflow: "hidden" }}
      >
        <div className="row" style={{ padding: "16px 16px 14px", gap: 13 }}>
          <WSChip glyph={current.glyph} tone={current.tone} size={50} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ws-bar__name" style={{ fontSize: 21 }}>{current.name}</div>
            <div className="card__subtitle">{current.sub}</div>
          </div>
          <Chip label="LIVE" tone="ok" />
        </div>
      </div>

      <SectionHead label="Другие workspaces" meta={`${others.length} ДОСТУПНО`} />
      <div>
        {others.map((w) => (
          <div key={w.id} className="lrow card--tappable" style={{ padding: "13px 4px" }} onClick={() => go(w)}>
            <WSChip glyph={w.glyph} tone={w.tone} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lrow__title">{w.name}</div>
              <div className="lrow__detail" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {w.sub}
              </div>
            </div>
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
              <path d="M1.5 1.5L6.5 6.5L1.5 11.5" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
