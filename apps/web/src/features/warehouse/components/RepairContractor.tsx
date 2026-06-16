import { useState } from "react";
import type { Equipment } from "@sever/contracts";
import { Card, Button, SectionTitle, Chip, Sheet, Field, Input, Select } from "../../../ui-kit/index.ts";
import { eur, dateTime } from "../../../lib/labels.ts";
import {
  useUnitRepairs, useUnitHandovers, useContractors, useCreateContractor,
  useOpenRepair, useCloseRepair, useSendToContractor, useReturnFromContractor,
} from "../hooks.ts";

const outcomeLabel: Record<string, string> = { repaired: "отремонтировано", written_off: "списано" };

export function RepairContractorPanel({ unit }: { unit: Equipment.EquipmentUnitDTO }) {
  const repairs = useUnitRepairs(unit.id);
  const handovers = useUnitHandovers(unit.id);
  const closeRepair = useCloseRepair();
  const returnHo = useReturnFromContractor();
  const [openRepairSheet, setOpenRepairSheet] = useState(false);
  const [closeSheet, setCloseSheet] = useState<Equipment.RepairDTO | null>(null);
  const [contractorSheet, setContractorSheet] = useState(false);

  const openRepair = (repairs.data ?? []).find((r) => r.status === "open") ?? null;
  const openHandover = (handovers.data ?? []).find((h) => h.status === "out") ?? null;
  const totalRepair = (repairs.data ?? []).filter((r) => r.status === "closed").reduce((a, r) => a + (r.costEUR ?? 0), 0);

  return (
    <>
      <SectionTitle>Ремонт и подрядчики</SectionTitle>
      <Card>
        {unit.status === "in_repair" && openRepair ? (
          <>
            <p className="card__title">В ремонте: {openRepair.problem}</p>
            <p className="card__subtitle">{openRepair.vendor ?? "—"} · с {dateTime(openRepair.openedAt)}</p>
            <div style={{ marginTop: 10 }}>
              <Button block onClick={() => setCloseSheet(openRepair)}>Закрыть ремонт</Button>
            </div>
          </>
        ) : unit.status === "at_contractor" && openHandover ? (
          <>
            <p className="card__title">У подрядчика: {openHandover.contractorName}</p>
            <p className="card__subtitle">{openHandover.reason ?? "—"} · с {dateTime(openHandover.sentAt)}</p>
            <div style={{ marginTop: 10 }}>
              <Button block disabled={returnHo.isPending} onClick={() => returnHo.mutate({ id: openHandover.id })}>
                Вернуть от подрядчика
              </Button>
            </div>
          </>
        ) : (
          <div className="row">
            <Button block variant="secondary" onClick={() => setOpenRepairSheet(true)}>В ремонт</Button>
            <Button block variant="secondary" onClick={() => setContractorSheet(true)}>Отдать подрядчику</Button>
          </div>
        )}
        {totalRepair > 0 && (
          <p className="card__subtitle" style={{ marginTop: 10 }}>Всего на ремонт: {eur(totalRepair)}</p>
        )}
      </Card>

      {/* History */}
      {(repairs.data ?? []).length > 0 && (
        <>
          <SectionTitle>Ремонты</SectionTitle>
          <div className="stack">
            {(repairs.data ?? []).map((r) => (
              <Card key={r.id}>
                <div className="row row--between">
                  <p className="card__title">{r.problem}</p>
                  <Chip label={r.status === "open" ? "открыт" : outcomeLabel[r.outcome ?? "repaired"]} tone={r.status === "open" ? "warn" : r.outcome === "written_off" ? "alert" : "ok"} />
                </div>
                <p className="card__subtitle">
                  {r.vendor ?? "—"} · {dateTime(r.openedAt)}{r.closedAt ? ` → ${dateTime(r.closedAt)}` : ""}
                  {r.costEUR != null ? ` · ${eur(r.costEUR)}` : ""}
                </p>
                {r.resolution && <p className="card__subtitle">{r.resolution}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
      {(handovers.data ?? []).length > 0 && (
        <>
          <SectionTitle>Передачи подрядчикам</SectionTitle>
          <div className="stack">
            {(handovers.data ?? []).map((h) => (
              <Card key={h.id}>
                <div className="row row--between">
                  <p className="card__title">{h.contractorName}</p>
                  <Chip label={h.status === "out" ? "у подрядчика" : "возвращено"} tone={h.status === "out" ? "warn" : "ok"} />
                </div>
                <p className="card__subtitle">
                  {h.reason ?? "—"} · {dateTime(h.sentAt)}{h.returnedAt ? ` → ${dateTime(h.returnedAt)}` : ""}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <OpenRepairSheet open={openRepairSheet} unitId={unit.id} onClose={() => setOpenRepairSheet(false)} />
      {closeSheet && <CloseRepairSheet repair={closeSheet} onClose={() => setCloseSheet(null)} closeRepair={closeRepair} />}
      <SendContractorSheet open={contractorSheet} unitId={unit.id} onClose={() => setContractorSheet(false)} />
    </>
  );
}

function OpenRepairSheet({ open, unitId, onClose }: { open: boolean; unitId: string; onClose: () => void }) {
  const m = useOpenRepair();
  const [problem, setProblem] = useState("");
  const [vendor, setVendor] = useState("");
  const [est, setEst] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="В ремонт">
      <Field label="Что не так"><Input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Не зажигается сегмент" /></Field>
      <Field label="Мастерская / подрядчик (необязательно)"><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
      <Field label="Оценка стоимости, € (необязательно)"><Input type="number" value={est} onChange={(e) => setEst(e.target.value)} /></Field>
      <Button block disabled={!problem || m.isPending} onClick={() => m.mutate({ unitId, input: { problem, vendor: vendor || null, estCostEUR: est ? Number(est) : null } }, { onSuccess: onClose })}>
        Отправить в ремонт
      </Button>
    </Sheet>
  );
}

function CloseRepairSheet({ repair, onClose, closeRepair }: { repair: Equipment.RepairDTO; onClose: () => void; closeRepair: ReturnType<typeof useCloseRepair> }) {
  const [cost, setCost] = useState(repair.estCostEUR != null ? String(repair.estCostEUR) : "");
  const [resolution, setResolution] = useState("");
  const [outcome, setOutcome] = useState<"repaired" | "written_off">("repaired");
  return (
    <Sheet open onClose={onClose} title="Закрыть ремонт">
      <Field label="Итог">
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value as "repaired" | "written_off")} options={[{ value: "repaired", label: "Отремонтировано → на склад" }, { value: "written_off", label: "Списано → утеряно" }]} />
      </Field>
      <Field label="Стоимость, €"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      <Field label="Что сделали"><Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Заменён драйвер" /></Field>
      <Button block disabled={closeRepair.isPending} onClick={() => closeRepair.mutate({ id: repair.id, input: { costEUR: cost ? Number(cost) : null, resolution: resolution || null, outcome } }, { onSuccess: onClose })}>
        Закрыть ремонт
      </Button>
    </Sheet>
  );
}

function SendContractorSheet({ open, unitId, onClose }: { open: boolean; unitId: string; onClose: () => void }) {
  const contractors = useContractors();
  const createContractor = useCreateContractor();
  const send = useSendToContractor();
  const [contractorId, setContractorId] = useState("");
  const [reason, setReason] = useState("");
  const [newName, setNewName] = useState("");

  const list = contractors.data ?? [];
  const eff = contractorId || list[0]?.id || "";

  return (
    <Sheet open={open} onClose={onClose} title="Отдать подрядчику">
      {list.length > 0 ? (
        <Field label="Подрядчик">
          <Select value={eff} onChange={(e) => setContractorId(e.target.value)} options={list.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      ) : (
        <p className="card__subtitle" style={{ marginBottom: 10 }}>Подрядчиков пока нет — добавьте.</p>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Field label="Новый подрядчик"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название" /></Field>
        </div>
        <Button variant="secondary" disabled={!newName || createContractor.isPending} style={{ marginBottom: 16 }}
          onClick={() => createContractor.mutate({ name: newName }, { onSuccess: () => setNewName("") })}>
          + Добавить
        </Button>
      </div>
      <Field label="Причина (субаренда, диагностика…)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button block disabled={!eff || send.isPending} onClick={() => send.mutate({ unitId, input: { contractorId: eff, reason: reason || null } }, { onSuccess: onClose })}>
        Передать подрядчику
      </Button>
    </Sheet>
  );
}
