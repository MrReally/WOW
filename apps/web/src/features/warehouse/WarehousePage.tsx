import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Equipment } from "@sever/contracts";
import {
  Button,
  SectionHead,
  Chip,
  Dot,
  ProgressRing,
  Loading,
  ErrorState,
  EmptyState,
  type Tone,
} from "../../ui-kit/index.ts";
import { eur, unitStatusLabel } from "../../lib/labels.ts";
import { useSession } from "../../app/session.ts";
import { useModels, useUnits, useTypes, useProjectsForOps } from "./hooks.ts";
import { AddModelSheet } from "./components/AddModelSheet.tsx";
import { ImportSheet } from "./components/ImportSheet.tsx";
import { CableMoveSheet, CableRow } from "./components/CableMoveSheet.tsx";

function PrepStat({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  return (
    <div className="row" style={{ gap: 11 }}>
      <Dot tone={tone} size={9} />
      <span className="t-cond" style={{ fontSize: 21, fontWeight: 800, color: "var(--text)", minWidth: 30 }}>{value}</span>
      <span className="t-mono" style={{ fontSize: 12.5, color: "var(--text2)" }}>{label}</span>
    </div>
  );
}

function PrepHero({ units, onGoOperations }: { units: Equipment.EquipmentUnitDTO[]; onGoOperations: () => void }) {
  const total = units.length;
  const inStock = units.filter((u) => u.status === "in_stock").length;
  const onProject = units.filter((u) => u.status === "on_project").length;
  const inRepair = units.filter((u) => u.status === "in_repair").length;
  const pct = total ? (inStock / total) * 100 : 0;

  return (
    <div style={{ padding: "6px 4px 4px" }}>
      <div className="row" style={{ gap: 8 }}>
        <Dot tone="warn" glow />
        <span className="t-label">СКЛАД · ГОТОВНОСТЬ</span>
      </div>
      <div className="t-cond" style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", marginTop: 8 }}>Warehouse</div>

      <div className="row" style={{ gap: 20, marginTop: 18, alignItems: "center" }}>
        <ProgressRing pct={pct} tone="warn" size={128} stroke={11}>
          <span className="t-cond" style={{ fontSize: 30, fontWeight: 800, color: "var(--text)", lineHeight: 0.9 }}>{inStock}</span>
          <span className="t-mono" style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>of {total}</span>
        </ProgressRing>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <PrepStat tone="ok" value={inStock} label="на складе" />
          <PrepStat tone="warn" value={onProject} label="на проектах" />
          <PrepStat tone="alert" value={inRepair} label="в ремонте" />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <Button block variant="secondary" onClick={onGoOperations}>Выдача / Возврат — в Operations →</Button>
      </div>
    </div>
  );
}

function ModelRow({ model, units, last }: { model: Equipment.EquipmentModelDTO; units: Equipment.EquipmentUnitDTO[]; last?: boolean }) {
  const mine = units.filter((u) => u.modelId === model.id);
  const inStock = mine.filter((u) => u.status === "in_stock").length;
  const onProject = mine.filter((u) => u.status === "on_project").length;
  return (
    <div className="lrow" style={{ borderBottom: last ? "none" : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow__title">{model.name}</div>
        <div className="lrow__detail">{model.manufacturer ?? "—"} · {eur(model.dailyPriceEUR)}/день</div>
      </div>
      <span className="t-mono" style={{ fontSize: 12, color: "var(--text2)" }}>×{mine.length}</span>
      {onProject > 0 ? <Chip label={`${onProject} в работе`} tone="warn" /> : <Chip label={`${inStock} своб.`} tone="ok" />}
    </div>
  );
}

export function WarehousePage() {
  const { role } = useSession();
  const canEdit = role === "admin" || role === "warehouse";
  const navigate = useNavigate();
  const models = useModels();
  const units = useUnits();
  const types = useTypes();
  const projects = useProjectsForOps();

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cableModel, setCableModel] = useState<Equipment.EquipmentModelDTO | null>(null);
  const [statusFilter, setStatusFilter] = useState<Equipment.UnitStatus | "all">("all");

  if (models.isLoading || units.isLoading) return <Loading />;
  if (models.error) return <ErrorState error={models.error} onRetry={models.refetch} />;

  const allUnits = units.data ?? [];
  const allModels = models.data ?? [];
  const serialModels = allModels.filter((m) => m.trackingMode === "serial");
  const cableModels = allModels.filter((m) => m.trackingMode === "quantity");
  const filtered = statusFilter === "all" ? allUnits : allUnits.filter((u) => u.status === statusFilter);
  const statuses: (Equipment.UnitStatus | "all")[] = ["all", "in_stock", "on_project", "in_repair", "reserved", "lost"];

  return (
    <div>
      <PrepHero units={allUnits} onGoOperations={() => navigate("/apex")} />

      <SectionHead label="Каталог" meta={canEdit ? undefined : `${allModels.length} МОДЕЛЕЙ`} />
      {canEdit && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Button block variant="secondary" onClick={() => setAddOpen(true)}>+ Модель / единица</Button>
          <Button block variant="secondary" onClick={() => setImportOpen(true)}>Импорт CSV</Button>
        </div>
      )}
      {allModels.length === 0 ? (
        <EmptyState title="Каталог пуст" hint={canEdit ? "Добавьте модели или импортируйте CSV" : undefined} />
      ) : (
        <>
          {serialModels.length > 0 && (
            <div className="card" style={{ padding: "2px 16px" }}>
              {serialModels.map((m, i) => (
                <ModelRow key={m.id} model={m} units={allUnits} last={i === serialModels.length - 1} />
              ))}
            </div>
          )}
          {cableModels.length > 0 && (
            <>
              <SectionHead label="Кабели (по количеству)" meta={`${cableModels.length}`} />
              <div className="card" style={{ padding: "2px 16px" }}>
                {cableModels.map((m, i) => (
                  <CableRow key={m.id} model={m} onMove={() => setCableModel(m)} last={i === cableModels.length - 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <SectionHead label="Единицы" meta={`${filtered.length}`} />
      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {statuses.map((s) => (
          <button
            key={s}
            className={`chip ${statusFilter === s ? "chip--accent chip--solid" : "chip--neutral"}`}
            style={{ cursor: "pointer", border: "none" }}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "Все" : unitStatusLabel[s]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Нет единиц" />
      ) : (
        <div className="card" style={{ padding: "2px 16px" }}>
          {filtered.map((u, i) => {
            const model = allModels.find((m) => m.id === u.modelId);
            const tone: Tone = u.status === "in_stock" ? "ok" : u.status === "on_project" ? "warn" : u.status === "lost" || u.status === "in_repair" ? "alert" : "info";
            return (
              <div
                key={u.id}
                className="lrow card--tappable"
                style={{ borderBottom: i === filtered.length - 1 ? "none" : undefined }}
                onClick={() => navigate(`/warehouse/units/${u.id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lrow__title">{u.assetTag}</div>
                  <div className="lrow__detail">{model?.name ?? u.modelId}</div>
                </div>
                <Chip label={unitStatusLabel[u.status]} tone={tone} />
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <>
          <AddModelSheet open={addOpen} onClose={() => setAddOpen(false)} types={types.data ?? []} models={allModels} />
          <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
        </>
      )}
      <CableMoveSheet model={cableModel} projects={projects.data ?? []} onClose={() => setCableModel(null)} />
    </div>
  );
}
