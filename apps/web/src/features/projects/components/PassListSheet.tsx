import { useEffect, useMemo, useState } from "react";
import type { People } from "@sever/contracts";
import type { Locale } from "../../../app/i18n.tsx";
import { Button, Card, Field, Input, Sheet } from "../../../ui-kit/index.ts";
import { toast } from "../../../lib/toastBus.ts";

type PassPerson = { id: string; lastName: string; firstName: string; patronymic: string; documentNumber: string };
type PassVehicle = { id: string; model: string; color: string; plateNumber: string };
type Draft = { people: PassPerson[]; vehicles: PassVehicle[] };

const copy = {
  ru: { title: "Данные для пропусков", people: "Люди", vehicles: "Машины", addPerson: "Добавить человека", addVehicle: "Добавить машину", surname: "Фамилия", name: "Имя", patronymic: "Отчество", showPatronymic: "Отчество", document: "Номер документа", model: "Марка и модель", color: "Цвет", plate: "Гос. номер", copied: "Текст скопирован", copyError: "Не удалось скопировать текст", plateLabel: "гос. номер" },
  en: { title: "Pass details", people: "People", vehicles: "Vehicles", addPerson: "Add person", addVehicle: "Add vehicle", surname: "Last name", name: "First name", patronymic: "Middle name", showPatronymic: "Include middle name", document: "Document number", model: "Make and model", color: "Color", plate: "Plate number", copied: "Text copied", copyError: "Could not copy text", plateLabel: "plate" },
  sr: { title: "Podaci za propusnice", people: "Ljudi", vehicles: "Vozila", addPerson: "Dodaj osobu", addVehicle: "Dodaj vozilo", surname: "Prezime", name: "Ime", patronymic: "Srednje ime", showPatronymic: "Prikaži srednje ime", document: "Broj dokumenta", model: "Marka i model", color: "Boja", plate: "Registarski broj", copied: "Tekst je kopiran", copyError: "Tekst nije moguće kopirati", plateLabel: "reg. broj" },
} as const;

const blankPerson = (): PassPerson => ({ id: crypto.randomUUID(), lastName: "", firstName: "", patronymic: "", documentNumber: "" });
const blankVehicle = (): PassVehicle => ({ id: crypto.randomUUID(), model: "", color: "", plateNumber: "" });

function personFromCrew(person: People.UserDTO): PassPerson {
  const fallback = (person.displayName || "").trim().split(/\s+/);
  return {
    id: `crew-${person.id}`,
    lastName: person.lastName?.trim() || fallback[0] || "",
    firstName: person.firstName?.trim() || fallback.slice(1).join(" ") || "",
    patronymic: person.patronymic?.trim() || "",
    documentNumber: person.documentNumber?.trim() || "",
  };
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

export function PassListSheet({ open, onClose, projectId, crew, locale }: { open: boolean; onClose: () => void; projectId: string; crew: People.UserDTO[]; locale: Locale }) {
  const labels = copy[locale];
  const storageKey = `sever.pass-list.${projectId}`;
  const [draft, setDraft] = useState<Draft>({ people: [], vehicles: [] });
  const [showPatronymic, setShowPatronymic] = useState(false);
  const crewKey = crew.map((person) => [person.id, person.lastName, person.firstName, person.patronymic, person.displayName, person.documentNumber].join("|")).join(";");
  const crewSeed = useMemo(() => crew.map(personFromCrew), [crewKey]);

  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Draft;
        setDraft({ people: Array.isArray(parsed.people) ? parsed.people : [], vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [] });
      } else {
        setDraft({ people: crewSeed, vehicles: [] });
      }
    } catch {
      setDraft({ people: crewSeed, vehicles: [] });
    }
  }, [open, storageKey, crewSeed]);

  useEffect(() => {
    if (open) localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, open, storageKey]);

  const patchPerson = (id: string, patch: Partial<PassPerson>) => setDraft((current) => ({ ...current, people: current.people.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const patchVehicle = (id: string, patch: Partial<PassVehicle>) => setDraft((current) => ({ ...current, vehicles: current.vehicles.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const removePerson = (id: string) => setDraft((current) => ({ ...current, people: current.people.filter((item) => item.id !== id) }));
  const removeVehicle = (id: string) => setDraft((current) => ({ ...current, vehicles: current.vehicles.filter((item) => item.id !== id) }));
  const message = useMemo(() => {
    const vehicleLines = draft.vehicles.filter((item) => item.model.trim() || item.plateNumber.trim()).flatMap((item) => [item.model.trim(), item.color.trim(), item.plateNumber.trim() ? `${labels.plateLabel} ${item.plateNumber.trim()}` : ""].filter(Boolean));
    const peopleLines = draft.people.filter((item) => item.lastName.trim() || item.firstName.trim() || item.documentNumber.trim()).map((item) => {
      const name = [item.lastName, item.firstName, showPatronymic ? item.patronymic : ""].filter((part) => part.trim()).join(" ");
      return `- ${name || "—"}${item.documentNumber.trim() ? ` — ID ${item.documentNumber.trim()}` : ""}`;
    });
    return [[labels.vehicles + ":", ...vehicleLines].join("\n"), [labels.people + ":", ...peopleLines].join("\n")].join("\n\n");
  }, [draft, labels, showPatronymic]);

  return <Sheet open={open} onClose={onClose} title={labels.title}>
    <div className="stack" style={{ padding: "0 var(--space-4) var(--space-4)", maxHeight: "72vh", overflowY: "auto" }}>
      <div className="row row--between" style={{ flexWrap: "wrap", gap: 8 }}><p className="card__title">{labels.people}</p><label className="row" style={{ gap: 6, cursor: "pointer" }}><input type="checkbox" checked={showPatronymic} onChange={(event) => setShowPatronymic(event.target.checked)} />{labels.showPatronymic}</label><Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, people: [...current.people, blankPerson()] }))}>+ {labels.addPerson}</Button></div>
      {draft.people.map((item) => <Card key={item.id} style={{ padding: "var(--space-3)" }}>
        <div className="row" style={{ gap: 8 }}>
          <Field label={labels.surname}><Input value={item.lastName} onChange={(event) => patchPerson(item.id, { lastName: event.target.value })} /></Field>
          <Field label={labels.name}><Input value={item.firstName} onChange={(event) => patchPerson(item.id, { firstName: event.target.value })} /></Field>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          {showPatronymic && <Field label={labels.patronymic}><Input value={item.patronymic} onChange={(event) => patchPerson(item.id, { patronymic: event.target.value })} /></Field>}
          <Field label={labels.document}><Input value={item.documentNumber} onChange={(event) => patchPerson(item.id, { documentNumber: event.target.value })} /></Field>
          <Button variant="ghost" onClick={() => removePerson(item.id)}>×</Button>
        </div>
      </Card>)}
      <div className="row row--between" style={{ marginTop: 8 }}><p className="card__title">{labels.vehicles}</p><Button variant="secondary" onClick={() => setDraft((current) => ({ ...current, vehicles: [...current.vehicles, blankVehicle()] }))}>+ {labels.addVehicle}</Button></div>
      {draft.vehicles.map((item) => <Card key={item.id} style={{ padding: "var(--space-3)" }}>
        <Field label={labels.model}><Input value={item.model} onChange={(event) => patchVehicle(item.id, { model: event.target.value })} /></Field>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <Field label={labels.color}><Input value={item.color} onChange={(event) => patchVehicle(item.id, { color: event.target.value })} /></Field>
          <Field label={labels.plate}><Input value={item.plateNumber} onChange={(event) => patchVehicle(item.id, { plateNumber: event.target.value })} /></Field>
          <Button variant="ghost" onClick={() => removeVehicle(item.id)}>×</Button>
        </div>
      </Card>)}
      <Button block onClick={() => void writeClipboard(message).then(() => toast("success", labels.copied)).catch(() => toast("error", labels.copyError))}>{locale === "ru" ? "Скопировать" : locale === "sr" ? "Kopiraj" : "Copy"}</Button>
    </div>
  </Sheet>;
}
