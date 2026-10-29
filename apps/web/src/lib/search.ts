import type { Equipment, People } from "@sever/contracts";

export function normalizeSearch(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

export function matchesSearch(query: string, values: readonly unknown[]): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(values.filter((value) => value !== null && value !== undefined).join(" ")).includes(needle);
}

function primitiveValues(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(primitiveValues);
  if (typeof value === "object") return Object.values(value).flatMap(primitiveValues);
  return [value];
}

export interface EquipmentSearchData {
  models: readonly Equipment.EquipmentModelDTO[];
  types?: readonly Equipment.EquipmentTypeDTO[];
  units?: readonly Equipment.EquipmentUnitDTO[];
  zones?: readonly Equipment.StorageZoneDTO[];
}

export function equipmentModelSearchValues(model: Equipment.EquipmentModelDTO, data: EquipmentSearchData): unknown[] {
  const type = data.types?.find((item) => item.id === model.typeId);
  const modelUnits = data.units?.filter((unit) => unit.modelId === model.id) ?? [];
  const zoneIds = new Set(modelUnits.map((unit) => unit.zoneId).filter((id): id is string => !!id));
  const zones = data.zones?.filter((zone) => zoneIds.has(zone.id)) ?? [];
  return [
    model.name,
    model.manufacturer,
    type?.name,
    ...primitiveValues(model.attrs),
    ...modelUnits.flatMap((unit) => [unit.assetTag, unit.serial]),
    ...zones.flatMap((zone) => [zone.name, zone.code]),
  ];
}

export function equipmentModelMatches(model: Equipment.EquipmentModelDTO, query: string, data: EquipmentSearchData): boolean {
  return matchesSearch(query, equipmentModelSearchValues(model, data));
}

export function equipmentUnitSearchValues(unit: Equipment.EquipmentUnitDTO, data: EquipmentSearchData): unknown[] {
  const model = data.models.find((item) => item.id === unit.modelId);
  const zone = data.zones?.find((item) => item.id === unit.zoneId);
  return [
    unit.assetTag,
    unit.serial,
    zone?.name,
    zone?.code,
    ...(model ? equipmentModelSearchValues(model, { ...data, units: [unit] }) : []),
  ];
}

export function equipmentUnitMatches(unit: Equipment.EquipmentUnitDTO, query: string, data: EquipmentSearchData): boolean {
  return matchesSearch(query, equipmentUnitSearchValues(unit, data));
}

export function personSearchValues(person: People.UserDTO): unknown[] {
  return [
    person.displayName,
    person.firstName,
    person.lastName,
    person.patronymic,
    person.roleName,
    person.email,
    person.telegramUsername,
    person.nickname,
    person.phone,
  ];
}

export function personMatches(person: People.UserDTO, query: string): boolean {
  return matchesSearch(query, personSearchValues(person));
}

export function contractorMatches(contractor: Equipment.ContractorDTO, query: string): boolean {
  return matchesSearch(query, [contractor.name, contractor.contacts]);
}
