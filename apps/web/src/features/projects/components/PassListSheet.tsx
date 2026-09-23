import { useEffect, useMemo, useState } from "react";
import type { Contractors, People } from "@sever/contracts";
import type { Locale } from "../../../app/i18n.tsx";
import { Button, Card, Field, Input, Select, Sheet } from "../../../ui-kit/index.ts";
import { toast } from "../../../lib/toastBus.ts";
import { useContractors, useContractorPeople, useContractorVehicles, useCreateContractorPerson, useCreateContractorVehicle } from "../../contractors/hooks.ts";

type PassPerson = { id:string; lastName:string; firstName:string; patronymic:string; documentNumber:string };
type PassVehicle = { id:string; model:string; color:string; plateNumber:string };
type ContractorPersonRow = { id:string; sourceId:string|null; contractorId:string; name:string; documentNumber:string };
type ContractorVehicleRow = { id:string; sourceId:string|null; contractorId:string; make:string; model:string; color:string; plateNumber:string };
type Draft = { people:PassPerson[]; vehicles:PassVehicle[]; contractorPeople:ContractorPersonRow[]; contractorVehicles:ContractorVehicleRow[] };

const uiCopy = {
  ru: { title:"Данные для пропусков", language:"Язык сообщения", people:"Люди", vehicles:"Машины", contractors:"Подрядчики", contractorPeople:"Сотрудники подрядчиков", contractorVehicles:"Машины подрядчиков", chooseContractor:"Выберите подрядчика", addPerson:"Добавить человека", addVehicle:"Добавить машину", surname:"Фамилия", name:"Имя", patronymic:"Отчество", showPatronymic:"Отчество", document:"Номер документа", make:"Марка", model:"Модель", makeModel:"Марка и модель", color:"Цвет", plate:"Гос. номер", saveHint:"Новые строки сохранятся в справочнике подрядчика при копировании.", copied:"Текст скопирован", copyError:"Не удалось скопировать текст", contractorRequired:"Для каждой строки выберите подрядчика и заполните обязательные поля", copy:"Скопировать" },
  en: { title:"Pass details", language:"Message language", people:"People", vehicles:"Vehicles", contractors:"Contractors", contractorPeople:"Contractor people", contractorVehicles:"Contractor vehicles", chooseContractor:"Choose contractor", addPerson:"Add person", addVehicle:"Add vehicle", surname:"Last name", name:"First name", patronymic:"Middle name", showPatronymic:"Include middle name", document:"Document number", make:"Make", model:"Model", makeModel:"Make and model", color:"Color", plate:"Plate number", saveHint:"New rows will be saved to the contractor directory when copied.", copied:"Text copied", copyError:"Could not copy text", contractorRequired:"Choose a contractor and complete required fields for every row", copy:"Copy" },
  sr: { title:"Podaci za propusnice", language:"Jezik poruke", people:"Ljudi", vehicles:"Vozila", contractors:"Izvođači", contractorPeople:"Ljudi izvođača", contractorVehicles:"Vozila izvođača", chooseContractor:"Izaberite izvođača", addPerson:"Dodaj osobu", addVehicle:"Dodaj vozilo", surname:"Prezime", name:"Ime", patronymic:"Srednje ime", showPatronymic:"Prikaži srednje ime", document:"Broj dokumenta", make:"Marka", model:"Model", makeModel:"Marka i model", color:"Boja", plate:"Registarski broj", saveHint:"Novi redovi biće sačuvani u imeniku izvođača prilikom kopiranja.", copied:"Tekst je kopiran", copyError:"Tekst nije moguće kopirati", contractorRequired:"Izaberite izvođača i popunite obavezna polja za svaki red", copy:"Kopiraj" },
} as const;

const messageCopy = {
  ru: { people:"Люди", vehicles:"Машины", contractor:"Подрядчик", plate:"гос. номер" },
  en: { people:"People", vehicles:"Vehicles", contractor:"Contractor", plate:"plate" },
  sr: { people:"Ljudi", vehicles:"Vozila", contractor:"Izvođač", plate:"reg. broj" },
} as const;

const blankPerson = ():PassPerson => ({ id:crypto.randomUUID(), lastName:"", firstName:"", patronymic:"", documentNumber:"" });
const blankVehicle = ():PassVehicle => ({ id:crypto.randomUUID(), model:"", color:"", plateNumber:"" });
const blankContractorPerson = ():ContractorPersonRow => ({ id:crypto.randomUUID(), sourceId:null, contractorId:"", name:"", documentNumber:"" });
const blankContractorVehicle = ():ContractorVehicleRow => ({ id:crypto.randomUUID(), sourceId:null, contractorId:"", make:"", model:"", color:"", plateNumber:"" });
const fullPersonName = (person:Contractors.ContractorPersonDTO) => [person.lastName,person.firstName,person.patronymic].filter(Boolean).join(" ");

function personFromCrew(person:People.UserDTO):PassPerson {
  const fallback=(person.displayName || "").trim().split(/\s+/);
  return { id:`crew-${person.id}`, lastName:person.lastName?.trim() || fallback[0] || "", firstName:person.firstName?.trim() || fallback.slice(1).join(" ") || "", patronymic:person.patronymic?.trim() || "", documentNumber:person.documentNumber?.trim() || "" };
}

async function writeClipboard(text:string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea=document.createElement("textarea"); textarea.value=text; textarea.style.position="fixed"; textarea.style.opacity="0"; document.body.appendChild(textarea); textarea.select();
  const copied=document.execCommand("copy"); textarea.remove(); if (!copied) throw new Error("Clipboard unavailable");
}

export function PassListSheet({ open,onClose,projectId,crew,locale,contractorIds }: { open:boolean; onClose:()=>void; projectId:string; crew:People.UserDTO[]; locale:Locale; contractorIds:string[] }) {
  const labels=uiCopy[locale];
  const [messageLang,setMessageLang]=useState<Locale>(locale);
  const output=messageCopy[messageLang];
  const [showPatronymic,setShowPatronymic]=useState(false);
  const [draft,setDraft]=useState<Draft>({ people:[],vehicles:[],contractorPeople:[],contractorVehicles:[] });
  const contractors=useContractors();
  const directoryPeople=useContractorPeople(open && contractorIds.length>0);
  const directoryVehicles=useContractorVehicles(open && contractorIds.length>0);
  const createPerson=useCreateContractorPerson();
  const createVehicle=useCreateContractorVehicle();
  const connectedContractors=(contractors.data ?? []).filter(item => contractorIds.includes(item.id));
  const contractorOptions=[{ value:"",label:labels.chooseContractor },...connectedContractors.map(item => ({ value:item.id,label:item.name }))];
  const storageKey=`sever.pass-list.${projectId}`;
  const crewKey=crew.map(person => [person.id,person.lastName,person.firstName,person.patronymic,person.displayName,person.documentNumber].join("|")).join(";");
  const crewSeed=useMemo(() => crew.map(personFromCrew),[crewKey]);

  useEffect(() => {
    if (!open) return;
    setMessageLang(locale);
    try {
      const stored=localStorage.getItem(storageKey);
      if (!stored) return setDraft({ people:crewSeed,vehicles:[],contractorPeople:[],contractorVehicles:[] });
      const parsed=JSON.parse(stored) as Partial<Draft>;
      setDraft({ people:Array.isArray(parsed.people)?parsed.people:crewSeed,vehicles:Array.isArray(parsed.vehicles)?parsed.vehicles:[],contractorPeople:Array.isArray(parsed.contractorPeople)?parsed.contractorPeople:[],contractorVehicles:Array.isArray(parsed.contractorVehicles)?parsed.contractorVehicles:[] });
    } catch { setDraft({ people:crewSeed,vehicles:[],contractorPeople:[],contractorVehicles:[] }); }
  },[open,storageKey,crewSeed,locale]);
  useEffect(() => { if (open) localStorage.setItem(storageKey,JSON.stringify(draft)); },[draft,open,storageKey]);

  const patch=<K extends keyof Draft>(key:K,id:string,value:Partial<Draft[K][number]>) => setDraft(current => ({ ...current,[key]:current[key].map(item => item.id===id ? { ...item,...value } : item) }));
  const remove=(key:keyof Draft,id:string) => setDraft(current => ({ ...current,[key]:current[key].filter(item => item.id!==id) }));

  const message=useMemo(() => {
    const ownVehicles=draft.vehicles.filter(item => item.model.trim() || item.plateNumber.trim()).flatMap(item => [item.model.trim(),item.color.trim(),item.plateNumber.trim()?`${output.plate} ${item.plateNumber.trim()}`:""].filter(Boolean));
    const ownPeople=draft.people.filter(item => item.lastName.trim() || item.firstName.trim() || item.documentNumber.trim()).map(item => `- ${[item.lastName,item.firstName,showPatronymic?item.patronymic:""].filter(part => part.trim()).join(" ") || "—"}${item.documentNumber.trim()?` — ID ${item.documentNumber.trim()}`:""}`);
    const contractorBlocks=connectedContractors.map(contractor => {
      const people=draft.contractorPeople.filter(item => item.contractorId===contractor.id && item.name.trim()).map(item => `- ${item.name.trim()}${item.documentNumber.trim()?` — ID ${item.documentNumber.trim()}`:""}`);
      const vehicles=draft.contractorVehicles.filter(item => item.contractorId===contractor.id && (item.make.trim() || item.model.trim() || item.plateNumber.trim())).flatMap(item => [[item.make,item.model].filter(Boolean).join(" "),item.color.trim(),item.plateNumber.trim()?`${output.plate} ${item.plateNumber.trim()}`:""].filter(Boolean));
      return !people.length && !vehicles.length ? "" : [`${output.contractor}: ${contractor.name}`,vehicles.length?[output.vehicles+":",...vehicles].join("\n"):"",people.length?[output.people+":",...people].join("\n"):""].filter(Boolean).join("\n");
    }).filter(Boolean);
    return [[output.vehicles+":",...ownVehicles].join("\n"),[output.people+":",...ownPeople].join("\n"),...contractorBlocks].join("\n\n");
  },[draft,output,showPatronymic,connectedContractors]);

  const saveAndCopy=async () => {
    const people=draft.contractorPeople.filter(item => item.name.trim() || item.documentNumber.trim());
    const vehicles=draft.contractorVehicles.filter(item => item.make.trim() || item.model.trim() || item.plateNumber.trim());
    if (people.some(item => !item.contractorId || !item.name.trim()) || vehicles.some(item => !item.contractorId || !item.make.trim() || !item.model.trim() || !item.plateNumber.trim())) return toast("error",labels.contractorRequired);
    try {
      for (const item of people.filter(item => !item.sourceId)) {
        const parts=item.name.trim().split(/\s+/);
        const saved=await createPerson.mutateAsync({ contractorId:item.contractorId,lastName:parts.shift()!,firstName:parts.shift() || "—",patronymic:parts.join(" ") || null,documentNumber:item.documentNumber.trim() || null });
        patch("contractorPeople",item.id,{ sourceId:saved.id });
      }
      for (const item of vehicles.filter(item => !item.sourceId)) {
        const saved=await createVehicle.mutateAsync({ contractorId:item.contractorId,make:item.make.trim(),model:item.model.trim(),color:item.color.trim() || null,plateNumber:item.plateNumber.trim() });
        patch("contractorVehicles",item.id,{ sourceId:saved.id });
      }
      await writeClipboard(message); toast("success",labels.copied);
    } catch { toast("error",labels.copyError); }
  };

  return <Sheet open={open} onClose={onClose} title={labels.title}><div className="stack" style={{ padding:"0 var(--space-4) var(--space-4)",maxHeight:"72vh",overflowY:"auto" }}>
    <Field label={labels.language}><div className="discount-switch" role="group">{(["ru","en","sr"] as Locale[]).map(lang => <button type="button" key={lang} className={messageLang===lang?"is-active":""} onClick={() => setMessageLang(lang)}>{lang.toUpperCase()}</button>)}</div></Field>
    <div className="row row--between" style={{ flexWrap:"wrap",gap:8 }}><p className="card__title">{labels.people}</p><label className="row" style={{ gap:6,cursor:"pointer" }}><input type="checkbox" checked={showPatronymic} onChange={event => setShowPatronymic(event.target.checked)} />{labels.showPatronymic}</label><Button variant="secondary" onClick={() => setDraft(current => ({ ...current,people:[...current.people,blankPerson()] }))}>+ {labels.addPerson}</Button></div>
    {draft.people.map(item => <Card key={item.id} style={{ padding:"var(--space-3)" }}><div className="row"><Field label={labels.surname}><Input value={item.lastName} onChange={event => patch("people",item.id,{ lastName:event.target.value })} /></Field><Field label={labels.name}><Input value={item.firstName} onChange={event => patch("people",item.id,{ firstName:event.target.value })} /></Field></div><div className="row" style={{ marginTop:8 }}>{showPatronymic && <Field label={labels.patronymic}><Input value={item.patronymic} onChange={event => patch("people",item.id,{ patronymic:event.target.value })} /></Field>}<Field label={labels.document}><Input value={item.documentNumber} onChange={event => patch("people",item.id,{ documentNumber:event.target.value })} /></Field><Button variant="ghost" onClick={() => remove("people",item.id)}>×</Button></div></Card>)}
    <div className="row row--between"><p className="card__title">{labels.vehicles}</p><Button variant="secondary" onClick={() => setDraft(current => ({ ...current,vehicles:[...current.vehicles,blankVehicle()] }))}>+ {labels.addVehicle}</Button></div>
    {draft.vehicles.map(item => <Card key={item.id} style={{ padding:"var(--space-3)" }}><Field label={labels.makeModel}><Input value={item.model} onChange={event => patch("vehicles",item.id,{ model:event.target.value })} /></Field><div className="row" style={{ marginTop:8 }}><Field label={labels.color}><Input value={item.color} onChange={event => patch("vehicles",item.id,{ color:event.target.value })} /></Field><Field label={labels.plate}><Input value={item.plateNumber} onChange={event => patch("vehicles",item.id,{ plateNumber:event.target.value })} /></Field><Button variant="ghost" onClick={() => remove("vehicles",item.id)}>×</Button></div></Card>)}
    {connectedContractors.length>0 && <><p className="card__title" style={{ marginTop:8 }}>{labels.contractors}</p><p className="card__subtitle">{labels.saveHint}</p>
      <div className="row row--between"><p>{labels.contractorPeople}</p><Button variant="secondary" onClick={() => setDraft(current => ({ ...current,contractorPeople:[...current.contractorPeople,blankContractorPerson()] }))}>+ {labels.addPerson}</Button></div>
      {draft.contractorPeople.map(item => { const options=(directoryPeople.data ?? []).filter(person => person.contractorId===item.contractorId); return <Card key={item.id} style={{ padding:"var(--space-3)" }}><Select value={item.contractorId} options={contractorOptions} onChange={event => patch("contractorPeople",item.id,{ contractorId:event.target.value,sourceId:null })} /><div className="row" style={{ marginTop:8 }}><Field label={`${labels.surname} / ${labels.name}`}><Input list={`contractor-person-${item.id}`} value={item.name} onChange={event => { const found=options.find(person => fullPersonName(person)===event.target.value); patch("contractorPeople",item.id,{ name:event.target.value,sourceId:found?.id ?? null,documentNumber:found?.documentNumber ?? item.documentNumber }); }} /><datalist id={`contractor-person-${item.id}`}>{options.map(person => <option key={person.id} value={fullPersonName(person)} />)}</datalist></Field><Field label={labels.document}><Input value={item.documentNumber} onChange={event => patch("contractorPeople",item.id,{ documentNumber:event.target.value,sourceId:null })} /></Field><Button variant="ghost" onClick={() => remove("contractorPeople",item.id)}>×</Button></div></Card>; })}
      <div className="row row--between"><p>{labels.contractorVehicles}</p><Button variant="secondary" onClick={() => setDraft(current => ({ ...current,contractorVehicles:[...current.contractorVehicles,blankContractorVehicle()] }))}>+ {labels.addVehicle}</Button></div>
      {draft.contractorVehicles.map(item => { const options=(directoryVehicles.data ?? []).filter(vehicle => vehicle.contractorId===item.contractorId); return <Card key={item.id} style={{ padding:"var(--space-3)" }}><Select value={item.contractorId} options={contractorOptions} onChange={event => patch("contractorVehicles",item.id,{ contractorId:event.target.value,sourceId:null })} /><div className="row" style={{ marginTop:8 }}><Field label={labels.make}><Input list={`contractor-vehicle-${item.id}`} value={item.make} onChange={event => { const found=options.find(vehicle => `${vehicle.make} ${vehicle.model}`===event.target.value); patch("contractorVehicles",item.id,{ make:found?.make ?? event.target.value,model:found?.model ?? item.model,color:found?.color ?? item.color,plateNumber:found?.plateNumber ?? item.plateNumber,sourceId:found?.id ?? null }); }} /><datalist id={`contractor-vehicle-${item.id}`}>{options.map(vehicle => <option key={vehicle.id} value={`${vehicle.make} ${vehicle.model}`} />)}</datalist></Field><Field label={labels.model}><Input value={item.model} onChange={event => patch("contractorVehicles",item.id,{ model:event.target.value,sourceId:null })} /></Field><Field label={labels.color}><Input value={item.color} onChange={event => patch("contractorVehicles",item.id,{ color:event.target.value,sourceId:null })} /></Field><Field label={labels.plate}><Input value={item.plateNumber} onChange={event => patch("contractorVehicles",item.id,{ plateNumber:event.target.value,sourceId:null })} /></Field><Button variant="ghost" onClick={() => remove("contractorVehicles",item.id)}>×</Button></div></Card>; })}
    </>}
    <Button block disabled={createPerson.isPending || createVehicle.isPending} onClick={() => void saveAndCopy()}>{labels.copy}</Button>
  </div></Sheet>;
}
