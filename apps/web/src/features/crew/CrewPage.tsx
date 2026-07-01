import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Equipment, People, Projects } from "@sever/contracts";
import { Card, Button, SectionHead, Field, Input, Select, Textarea, Loading, EmptyState, Chip } from "../../ui-kit/index.ts";
import { useSession } from "../../app/session.ts";
import { api } from "../../lib/api.ts";
import { getToken } from "../../lib/api.ts";
import { dateRange, dateTime } from "../../lib/labels.ts";
import { useArchiveUser, useDeleteUserPermanently, usePeople, useRoles, useUpdateUser } from "../settings/hooks.ts";
import { useProjectsForFinance } from "../finance/hooks.ts";
import { personName } from "../../lib/people.ts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const actionLabel: Record<Equipment.JournalAction, string> = {
  created: "Создано",
  reserved: "Бронь",
  issued: "Выдача",
  returned: "Возврат",
  return_incomplete: "Некомплект",
  sent_to_repair: "В ремонт",
  back_from_repair: "Из ремонта",
  sent_to_contractor: "Подрядчику",
  back_from_contractor: "От подрядчика",
  marked_lost: "Утеря",
  transferred: "Перемещение",
  status_changed: "Статус",
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function fullName(draft: People.UpdateUserInput): string {
  const parts = [draft.firstName, draft.lastName, draft.patronymic].map((p) => p?.trim()).filter(Boolean);
  return parts.join(" ") || draft.displayName?.trim() || "";
}

function displayImageUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith("telegram-file:")) return null;
  return value;
}

function formatBirthDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "—";
}

type CrewTab = "people" | "applications" | "deleted";

function CrewTabIcon({ type }: { type: CrewTab }) {
  if (type === "applications") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "deleted") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14M10 11v6M14 11v6M9 7l.7-2h4.6L15 7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM15.5 12.5a3 3 0 1 0 0-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.5 20a5 5 0 0 1 10 0M14.5 18.5a4.5 4.5 0 0 1 6 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CrewApplicationCard({
  application,
  roleId,
  roles,
  isAccepting,
  isRejecting,
  onRoleChange,
  onAccept,
  onReject,
}: {
  application: People.CrewApplicationDTO;
  roleId: string;
  roles: People.RoleDTO[];
  isAccepting: boolean;
  isRejecting: boolean;
  onRoleChange: (roleId: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    const token = getToken();
    if (!token) return;
    void fetch(`${API_BASE}/api/crew-applications/${application.id}/photo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => {
        if (alive) setPhotoUrl(null);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [application.id]);

  const full = [application.firstName, application.lastName, application.patronymic].filter(Boolean).join(" ");

  return (
    <Card>
      <div className="row row--between" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ minWidth: 0 }}>
          {photoUrl ? (
            <img src={photoUrl} alt="" className="crew-photo crew-photo--large" />
          ) : (
            <span className="crew-photo crew-photo--large crew-photo--empty">{application.nickname.slice(0, 2).toUpperCase()}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{application.nickname}</p>
            <p className="card__subtitle">{full}</p>
          </div>
        </div>
        <Chip label="анкета" tone="warn" />
      </div>

      <div className="crew-dossier">
        <div className="crew-dossier__item">
          <span>Email</span>
          <b>{application.email}</b>
        </div>
        <div className="crew-dossier__item">
          <span>Дата рождения</span>
          <b>{formatBirthDate(application.birthDate)}</b>
        </div>
        <div className="crew-dossier__item">
          <span>Telegram</span>
          <b>{application.telegramUsername ? `@${application.telegramUsername}` : application.telegramId}</b>
        </div>
        <div className="crew-dossier__item">
          <span>Источник</span>
          <b>{application.source}</b>
        </div>
      </div>

      <div className="crew-text-block">
        <span>Языки</span>
        <p>{application.languages}</p>
      </div>
      <div className="crew-text-block">
        <span>О себе</span>
        <p>{application.about}</p>
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        <Field label="Роль">
          <Select
            value={roleId}
            onChange={(e) => onRoleChange(e.target.value)}
            options={[
              { value: "", label: "Выбрать" },
              ...roles.filter((role) => !role.isOwner).map((role) => ({ value: role.id, label: role.name })),
            ]}
          />
        </Field>
        <Button disabled={!roleId || isAccepting} onClick={onAccept}>✓</Button>
        <Button variant="ghost" disabled={isRejecting} onClick={onReject}>×</Button>
      </div>
    </Card>
  );
}

export function CrewPage() {
  const { can, isOwner } = useSession();
  const qc = useQueryClient();
  const canReviewApplications = can("people.applications.review", "people.manage");
  const canManagePeople = can("people.manage");
  const people = usePeople();
  const deletedPeople = usePeople("deleted", canManagePeople);
  const roles = useRoles();
  const projects = useProjectsForFinance();
  const updateUser = useUpdateUser();
  const archiveUser = useArchiveUser();
  const deleteUserPermanently = useDeleteUserPermanently();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<People.UpdateUserInput>({});
  const [historyMode, setHistoryMode] = useState<"projects" | "actions">("projects");
  const [applicationRoleIds, setApplicationRoleIds] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<CrewTab>("people");

  const list = people.data ?? [];
  const applications = useQuery({
    enabled: canReviewApplications,
    queryKey: ["crew-applications", "pending"],
    queryFn: () => api.get<People.CrewApplicationDTO[]>("/api/crew-applications?status=pending"),
  });
  const acceptApplication = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => api.post<People.CreatedUserDTO>(`/api/crew-applications/${id}/accept`, { roleId }),
    meta: { successMessage: "Человек добавлен" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-applications"] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
  });
  const rejectApplication = useMutation({
    mutationFn: (id: string) => api.post<People.CrewApplicationDTO>(`/api/crew-applications/${id}/reject`, {}),
    meta: { successMessage: "Анкета отклонена" },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-applications"] }),
  });
  const selected = list.find((u) => u.id === selectedId) ?? list[0] ?? null;
  const actionHistory = useQuery({
    enabled: !!selected,
    queryKey: ["people", selected?.id, "equipment-journal"],
    queryFn: () => api.get<Equipment.JournalEntryDTO[]>(`/api/people/${selected!.id}/equipment-journal`),
  });
  const units = useQuery({ queryKey: ["equipment", "units"], queryFn: () => api.get<Equipment.EquipmentUnitDTO[]>("/api/equipment/units") });
  const models = useQuery({ queryKey: ["equipment", "models"], queryFn: () => api.get<Equipment.EquipmentModelDTO[]>("/api/equipment/models") });
  const warehouses = useQuery({ queryKey: ["equipment", "warehouses"], queryFn: () => api.get<Equipment.WarehouseDTO[]>("/api/equipment/warehouses") });

  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      displayName: selected.displayName,
      firstName: selected.firstName,
      lastName: selected.lastName,
      patronymic: selected.patronymic,
      nickname: selected.nickname,
      email: selected.email,
      telegramId: selected.telegramId,
      hourlyRateEUR: selected.hourlyRateEUR,
      documentNumber: selected.documentNumber,
      documentPhotoUrl: selected.documentPhotoUrl,
      languages: selected.languages,
      about: selected.about,
      source: selected.source,
      photoUrl: selected.photoUrl,
      usePhotoAsAvatar: selected.usePhotoAsAvatar,
      birthDate: selected.birthDate,
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignmentQueries = useQueries({
    queries: can("projects.view")
      ? (projects.data ?? []).map((p) => ({
          queryKey: ["projects", "assignments", p.id],
          queryFn: () => api.get<Projects.AssignmentDTO[]>(`/api/projects/${p.id}/assignments`),
          enabled: !!selected,
        }))
      : [],
  });

  const history = useMemo(() => {
    if (!selected) return [];
    return (projects.data ?? [])
      .flatMap((project, index) =>
        (assignmentQueries[index]?.data ?? [])
          .filter((a) => a.userId === selected.id)
          .map((assignment) => ({ project, assignment }))
      )
      .sort((a, b) => Date.parse(b.project.startsAt) - Date.parse(a.project.startsAt));
  }, [assignmentQueries, projects.data, selected]);

  if (people.isLoading || roles.isLoading) return <Loading />;

  const save = () => {
    if (!selected) return;
    const name = fullName(draft);
    updateUser.mutate({
      id: selected.id,
      input: {
        ...draft,
        displayName: name || selected.displayName,
        firstName: draft.firstName || null,
        lastName: draft.lastName || null,
        patronymic: draft.patronymic || null,
        nickname: draft.nickname || null,
        email: draft.email || null,
        telegramId: draft.telegramId || null,
        hourlyRateEUR: draft.hourlyRateEUR == null || Number.isNaN(Number(draft.hourlyRateEUR)) ? null : Number(draft.hourlyRateEUR),
        documentNumber: draft.documentNumber || null,
        documentPhotoUrl: draft.documentPhotoUrl || null,
        languages: draft.languages || null,
        about: draft.about || null,
        source: draft.source || null,
        photoUrl: draft.photoUrl || null,
        usePhotoAsAvatar: !!draft.usePhotoAsAvatar,
        birthDate: draft.birthDate || null,
      },
    });
  };
  const attach = async (field: "photoUrl" | "documentPhotoUrl", file: File | undefined) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    setDraft((d) => ({ ...d, [field]: url }));
  };
  const avatarSrc = displayImageUrl(draft.usePhotoAsAvatar ? draft.photoUrl : null);
  const pendingApplications = applications.data ?? [];
  const deletedList = deletedPeople.data ?? [];
  const currentTab =
    activeTab === "applications" && !canReviewApplications ? "people" :
    activeTab === "deleted" && !canManagePeople ? "people" :
    canReviewApplications || canManagePeople ? activeTab : "people";

  return (
    <div className="stack">
      <SectionHead label="Crew" meta={pendingApplications.length > 0 ? `${list.length} · ${pendingApplications.length} анкет` : `${list.length}`} />
      {currentTab === "applications" ? (
        <>
          <SectionHead label="Анкеты" meta={`${pendingApplications.length}`} />
          {applications.isLoading ? (
            <Loading />
          ) : pendingApplications.length === 0 ? (
            <EmptyState title="Новых анкет нет" />
          ) : (
            <div className="stack">
              {pendingApplications.map((application) => {
                const roleId = applicationRoleIds[application.id] ?? "";
                return (
                  <CrewApplicationCard
                    key={application.id}
                    application={application}
                    roleId={roleId}
                    roles={roles.data ?? []}
                    isAccepting={acceptApplication.isPending}
                    isRejecting={rejectApplication.isPending}
                    onRoleChange={(next) => setApplicationRoleIds((prev) => ({ ...prev, [application.id]: next }))}
                    onAccept={() => acceptApplication.mutate({ id: application.id, roleId })}
                    onReject={() => rejectApplication.mutate(application.id)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : currentTab === "deleted" ? (
        <>
          <SectionHead label="Удалённые" meta={`${deletedList.length}`} />
          {deletedPeople.isLoading ? (
            <Loading />
          ) : deletedList.length === 0 ? (
            <EmptyState title="Удалённых нет" />
          ) : (
            <div className="stack">
              {deletedList.map((person) => (
                <Card key={person.id}>
                  <div className="row row--between" style={{ alignItems: "flex-start" }}>
                    <div className="row" style={{ minWidth: 0 }}>
                      {displayImageUrl(person.photoUrl) ? (
                        <img src={displayImageUrl(person.photoUrl)!} alt="" className="crew-photo" />
                      ) : (
                        <span className="crew-photo crew-photo--empty">{personName(person).slice(0, 2).toUpperCase()}</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{personName(person)}</p>
                        <p className="card__subtitle">{person.email ?? person.telegramId ?? "без контакта"}</p>
                      </div>
                    </div>
                    <Chip label="удалён" tone="neutral" />
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <Button
                      variant="secondary"
                      disabled={updateUser.isPending}
                      onClick={() => updateUser.mutate({ id: person.id, input: { active: true } })}
                    >
                      ↩
                    </Button>
                    {isOwner && (
                      <Button
                        variant="danger"
                        disabled={deleteUserPermanently.isPending}
                        onClick={() => confirm(`Удалить «${personName(person)}» окончательно? Это действие нельзя отменить.`) && deleteUserPermanently.mutate(person.id)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
      {!selected && <EmptyState title="Crew пуст" />}
      {selected && (
        <>
      <div className="row" style={{ gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {list.map((person) => (
          <button
            key={person.id}
            className={`chip ${selected.id === person.id ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ border: "none", cursor: "pointer" }}
            onClick={() => setSelectedId(person.id)}
          >
            {personName(person)}
          </button>
        ))}
      </div>

      <Card>
        <div className="row row--between" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ minWidth: 0 }}>
            {displayImageUrl(draft.photoUrl) ? (
              <img src={avatarSrc || displayImageUrl(draft.photoUrl)!} alt="" className="crew-photo" />
            ) : (
              <span className="crew-photo crew-photo--empty">{personName(selected).slice(0, 2).toUpperCase()}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{personName(selected)}</p>
              <p className="card__subtitle">{selected.roleName}{selected.hourlyRateEUR != null ? ` · ${selected.hourlyRateEUR} €` : ""}</p>
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            {!selected.active && <Chip label="выкл" tone="neutral" />}
            {canManagePeople && (
              <Button
                variant="ghost"
                disabled={archiveUser.isPending}
                onClick={() => confirm(`Переместить «${personName(selected)}» в удалённые?`) && archiveUser.mutate(selected.id, { onSuccess: () => setSelectedId("") })}
              >
                ×
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHead label="Досье" />
        <div className="row">
          <Field label="Имя">
            <Input value={draft.firstName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} />
          </Field>
          <Field label="Фамилия">
            <Input value={draft.lastName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} />
          </Field>
        </div>
        <div className="row">
          <Field label="Отчество">
            <Input value={draft.patronymic ?? ""} onChange={(e) => setDraft((d) => ({ ...d, patronymic: e.target.value }))} />
          </Field>
          <Field label="Ник">
            <Input value={draft.nickname ?? ""} onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))} placeholder="для таймингов" />
          </Field>
        </div>
        <div className="row">
          <Field label="Email">
            <Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
          </Field>
          <Field label="Telegram">
            <Input value={draft.telegramId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, telegramId: e.target.value }))} />
          </Field>
        </div>
        <div className="row">
          <Field label="Дата рождения">
            <Input type="date" value={draft.birthDate ?? ""} onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))} />
          </Field>
          <Field label="Ставка, €">
            <Input type="number" value={draft.hourlyRateEUR ?? ""} onChange={(e) => setDraft((d) => ({ ...d, hourlyRateEUR: e.target.value ? Number(e.target.value) : null }))} />
          </Field>
        </div>
        <Field label="Документ">
          <Input value={draft.documentNumber ?? ""} onChange={(e) => setDraft((d) => ({ ...d, documentNumber: e.target.value }))} />
        </Field>
        <div className="crew-attach">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">Фото документа</p>
            <p className="card__subtitle">{draft.documentPhotoUrl ? "Файл приложен" : "Фото или скриншот"}</p>
          </div>
          {draft.documentPhotoUrl && <img src={draft.documentPhotoUrl} alt="" className="crew-attach__thumb" />}
          <label className="btn btn--secondary" style={{ height: 38, padding: "0 12px" }}>
            +
            <input type="file" accept="image/*" hidden onChange={(e) => attach("documentPhotoUrl", e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Языки">
          <Textarea value={draft.languages ?? ""} onChange={(e) => setDraft((d) => ({ ...d, languages: e.target.value }))} placeholder="RU C2, EN B2, SR A2" />
        </Field>
        <Field label="О себе">
          <Textarea value={draft.about ?? ""} onChange={(e) => setDraft((d) => ({ ...d, about: e.target.value }))} />
        </Field>
        <Field label="Источник">
          <Input value={draft.source ?? ""} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} />
        </Field>
        <div className="crew-attach">
          <div style={{ minWidth: 0 }}>
            <p className="card__title">Фото человека</p>
            <p className="card__subtitle">{draft.photoUrl ? "Файл приложен" : "Для досье или аватарки"}</p>
          </div>
          {displayImageUrl(draft.photoUrl) && <img src={displayImageUrl(draft.photoUrl)!} alt="" className="crew-attach__thumb" />}
          <label className="btn btn--secondary" style={{ height: 38, padding: "0 12px" }}>
            +
            <input type="file" accept="image/*" hidden onChange={(e) => attach("photoUrl", e.target.files?.[0])} />
          </label>
        </div>
        <label className="row row--between" style={{ padding: "4px 0 12px", cursor: "pointer" }}>
          <span style={{ color: "var(--text)" }}>Использовать как аватарку</span>
          <input
            type="checkbox"
            checked={!!draft.usePhotoAsAvatar}
            disabled={!draft.photoUrl}
            onChange={(e) => setDraft((d) => ({ ...d, usePhotoAsAvatar: e.target.checked }))}
            style={{ width: 20, height: 20, accentColor: "var(--accent)", flexShrink: 0 }}
          />
        </label>
        <Button block disabled={updateUser.isPending || !fullName(draft)} onClick={save}>Сохранить</Button>
      </Card>

      <SectionHead label="История" meta={historyMode === "projects" ? `${history.length}` : `${actionHistory.data?.length ?? 0}`} />
      <div className="row" style={{ gap: 8 }}>
        <button className={`chip ${historyMode === "projects" ? "chip--accent chip--solid" : "chip--neutral"}`} style={{ border: "none", cursor: "pointer" }} onClick={() => setHistoryMode("projects")}>
          Проекты
        </button>
        <button className={`chip ${historyMode === "actions" ? "chip--accent chip--solid" : "chip--neutral"}`} style={{ border: "none", cursor: "pointer" }} onClick={() => setHistoryMode("actions")}>
          Действия
        </button>
      </div>
      {historyMode === "projects" ? (
        projects.isLoading || assignmentQueries.some((q) => q.isLoading) ? (
          <Loading />
        ) : history.length === 0 ? (
          <EmptyState title="Назначений нет" />
        ) : (
          <div className="stack">
            {history.map(({ project, assignment }) => (
              <Card key={assignment.id}>
                <div className="row row--between">
                  <div style={{ minWidth: 0 }}>
                    <p className="card__title">{project.name}</p>
                    <p className="card__subtitle">{dateRange(project.startsAt, project.endsAt)}</p>
                  </div>
                  <Chip label={assignment.status} tone={assignment.status === "declined" ? "warn" : assignment.status === "cancelled" ? "neutral" : "ok"} />
                </div>
                <p className="card__subtitle" style={{ marginTop: 6 }}>
                  {assignment.roleNote || "роль не указана"}{assignment.rateEUR != null ? ` · ${assignment.rateEUR} €` : ""}
                </p>
              </Card>
            ))}
          </div>
        )
      ) : actionHistory.isLoading || units.isLoading || models.isLoading || warehouses.isLoading ? (
        <Loading />
      ) : (actionHistory.data ?? []).length === 0 ? (
        <EmptyState title="Действий нет" />
      ) : (
        <div className="stack">
          {(actionHistory.data ?? []).map((entry) => {
            const unit = entry.unitId ? (units.data ?? []).find((u) => u.id === entry.unitId) : null;
            const model = entry.modelId ? (models.data ?? []).find((m) => m.id === entry.modelId) : unit ? (models.data ?? []).find((m) => m.id === unit.modelId) : null;
            const project = entry.projectId ? (projects.data ?? []).find((p) => p.id === entry.projectId) : null;
            const fromWh = entry.fromWarehouseId ? (warehouses.data ?? []).find((w) => w.id === entry.fromWarehouseId)?.name : null;
            const toWh = entry.toWarehouseId || entry.warehouseId ? (warehouses.data ?? []).find((w) => w.id === (entry.toWarehouseId ?? entry.warehouseId))?.name : null;
            const target = unit?.assetTag || model?.name || "—";
            const route = fromWh || toWh ? `${fromWh ? `${fromWh} → ` : ""}${toWh ?? "—"}` : null;
            return (
              <Card key={entry.id}>
                <div className="row row--between">
                  <p className="card__title">{actionLabel[entry.action] ?? entry.action}</p>
                  <span className="card__subtitle">{dateTime(entry.at)}</span>
                </div>
                <p className="card__subtitle" style={{ marginTop: 6 }}>
                  {[target, project?.name, route, entry.qty ? `${entry.qty} шт.` : null].filter(Boolean).join(" · ")}
                </p>
                {entry.note && <p className="card__subtitle">{entry.note}</p>}
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}
        </>
      )}
      {(canReviewApplications || canManagePeople) && (
        <div className="project-tabbar" role="tablist" aria-label="Crew">
          {([
            { id: "people" as const, label: "Работники", shortLabel: "Люди", count: list.length },
            canReviewApplications ? { id: "applications" as const, label: "Анкеты", shortLabel: "Анкеты", count: pendingApplications.length } : null,
            canManagePeople ? { id: "deleted" as const, label: "Удалённые", shortLabel: "Удал.", count: deletedList.length } : null,
          ].filter(Boolean) as { id: CrewTab; label: string; shortLabel: string; count: number }[]).map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`project-tabbar__item ${isActive ? "project-tabbar__item--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-selected={isActive}
                role="tab"
                type="button"
                style={{ ["--tab-c" as string]: tab.id === "applications" ? "var(--warn)" : tab.id === "deleted" ? "var(--danger)" : "var(--accent)" }}
              >
                <span className="project-tabbar__icon">
                  <CrewTabIcon type={tab.id} />
                  {tab.count > 0 && <span className="project-tabbar__badge">{tab.count > 9 ? "9+" : tab.count}</span>}
                </span>
                <span className="project-tabbar__label">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
