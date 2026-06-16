import { useParams, useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import { Card, Button, SectionTitle, StatusBadge, Select, Loading, ErrorState } from "../../ui-kit/index.ts";
import { unitStatusLabel, unitStatusTone, dateTime } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useUnit, useUnitJournal, useChangeStatus } from "./hooks.ts";
import { RepairContractorPanel } from "./components/RepairContractor.tsx";

const journalActionLabel: Record<Equipment.JournalAction, string> = {
  created: "Создано",
  reserved: "Зарезервировано",
  issued: "Выдано на проект",
  returned: "Возвращено",
  return_incomplete: "Некомплект",
  sent_to_repair: "В ремонт",
  back_from_repair: "Из ремонта",
  sent_to_contractor: "Подрядчику",
  back_from_contractor: "От подрядчика",
  marked_lost: "Утеряно",
  status_changed: "Смена статуса",
};

export function UnitDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const canEdit = can("warehouse.unit.status");
  const unit = useUnit(id);
  const journal = useUnitJournal(id);
  const changeStatus = useChangeStatus();

  if (unit.isLoading) return <Loading />;
  if (unit.error) return <ErrorState error={unit.error} onRetry={unit.refetch} />;
  if (!unit.data) return null;
  const u = unit.data;

  const statusOptions: Equipment.UnitStatus[] = ["in_stock", "in_repair", "at_contractor", "lost", "reserved"];

  return (
    <div className="stack">
      <Button variant="ghost" onClick={() => navigate(-1)}>← Назад</Button>

      <Card>
        <div className="row row--between">
          <div>
            <p className="card__title" style={{ fontSize: "var(--fs-lg)" }}>{u.assetTag}</p>
            {u.serial && <p className="card__subtitle">S/N: {u.serial}</p>}
          </div>
          <StatusBadge tone={unitStatusTone[u.status]}>{unitStatusLabel[u.status]}</StatusBadge>
        </div>
      </Card>

      {canEdit && <RepairContractorPanel unit={u} />}

      {canEdit && (
        <Card>
          <SectionTitle>Сменить статус вручную</SectionTitle>
          <Select
            value={u.status}
            onChange={(e) => changeStatus.mutate({ id: u.id, status: e.target.value as Equipment.UnitStatus })}
            options={statusOptions.map((s) => ({ value: s, label: unitStatusLabel[s] }))}
          />
        </Card>
      )}

      <SectionTitle>История (журнал)</SectionTitle>
      {journal.isLoading ? (
        <Loading />
      ) : (
        <div className="stack">
          {(journal.data ?? []).slice().reverse().map((e) => (
            <Card key={e.id}>
              <div className="row row--between">
                <p className="card__title">{journalActionLabel[e.action] ?? e.action}</p>
                <span className="card__subtitle">{dateTime(e.at)}</span>
              </div>
              {e.note && <p className="card__subtitle">{e.note}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
