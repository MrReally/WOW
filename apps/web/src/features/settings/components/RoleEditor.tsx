import { useMemo, useState } from "react";
import type { People, Permission } from "@sever/contracts";
import { PERMISSIONS } from "@sever/contracts";
import { Card, Button, SectionHead, Chip, Input, Field, Loading } from "../../../ui-kit/index.ts";
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from "../hooks.ts";

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

export function RoleEditor() {
  const roles = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<Permission>>(new Set());
  const [newRoleName, setNewRoleName] = useState("");

  const selected = (roles.data ?? []).find((r) => r.id === selectedId) ?? null;

  const select = (role: People.RoleDTO) => {
    setSelectedId(role.id);
    setName(role.name);
    setPerms(new Set(role.permissions));
  };

  const toggle = (p: Permission) =>
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  const grouped = useMemo(() => GROUPS.map((g) => ({ group: g, items: PERMISSIONS.filter((p) => p.group === g) })), []);

  if (roles.isLoading) return <Loading />;

  return (
    <div>
      <SectionHead label="Роли и права" meta={`${(roles.data ?? []).length}`} />
      <div className="stack">
        {(roles.data ?? []).map((r) => (
          <Card key={r.id} onClick={() => (r.isOwner ? undefined : select(r))}>
            <div className="row row--between">
              <div>
                <p className="card__title">{r.name}</p>
                <p className="card__subtitle">
                  {r.isOwner ? "все права" : `${r.permissions.length} прав`}
                  {r.isSystem ? " · системная (по умолчанию)" : ""}
                </p>
              </div>
              {r.isOwner ? <Chip label="OWNER" tone="accent" /> : r.isSystem ? <Chip label="системная" tone="neutral" /> : selectedId === r.id ? <Chip label="редактируется" tone="info" /> : null}
            </div>
          </Card>
        ))}
      </div>

      {/* Create new role */}
      <Card style={{ marginTop: 12 }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Новая роль (Логист, Бухгалтер…)" />
          </div>
          <Button
            disabled={!newRoleName || createRole.isPending}
            onClick={() => createRole.mutate({ name: newRoleName, permissions: [] }, { onSuccess: (r) => { setNewRoleName(""); select(r); } })}
          >
            + Роль
          </Button>
        </div>
      </Card>

      {/* Permission editor for the selected role. Owner stays implicit-all. */}
      {selected && !selected.isOwner && (
        <Card style={{ marginTop: 12 }}>
          {!selected.isSystem && (
            <Field label="Название роли">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          {selected.isSystem && <SectionHead label={selected.name} meta="системная роль" />}
          {grouped.map(({ group, items }) => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div className="t-label" style={{ marginBottom: 6 }}>{group}</div>
              {items.map((p) => (
                <label key={p.key} className="row" style={{ padding: "7px 0", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={perms.has(p.key)} onChange={() => toggle(p.key)} />
                  <span style={{ fontSize: 14, color: "var(--text)" }}>{p.label}</span>
                </label>
              ))}
            </div>
          ))}
          <div className="row">
            <Button
              block
              disabled={updateRole.isPending}
              onClick={() => updateRole.mutate({ id: selected.id, input: { ...(selected.isSystem ? {} : { name }), permissions: [...perms] } })}
            >
              Сохранить
            </Button>
            {!selected.isSystem && (
              <Button
                variant="danger"
                disabled={deleteRole.isPending}
                onClick={() => {
                  if (confirm(`Удалить роль «${selected.name}»?`)) {
                    deleteRole.mutate(selected.id, { onSuccess: () => setSelectedId(null) });
                  }
                }}
              >
                Удалить
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
