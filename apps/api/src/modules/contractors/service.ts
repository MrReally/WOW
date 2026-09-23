import type { Contractors } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";

interface PersonRow { id:string; contractor_id:string; first_name:string; last_name:string; patronymic:string|null; phone:string|null; telegram:string|null; document_number:string|null; photo_url:string|null; created_at:Date }
interface VehicleRow { id:string; contractor_id:string; make:string; model:string; color:string|null; plate_number:string; created_at:Date }
interface EquipmentRow { id:string; contractor_id:string; name:string; available_qty:number; default_cost_eur:string|null; note:string|null; created_at:Date }

const personDTO = (row: PersonRow): Contractors.ContractorPersonDTO => ({ id:row.id, contractorId:row.contractor_id, firstName:row.first_name, lastName:row.last_name, patronymic:row.patronymic, phone:row.phone, telegram:row.telegram, documentNumber:row.document_number, photoUrl:row.photo_url, createdAt:row.created_at.toISOString() });
const vehicleDTO = (row: VehicleRow): Contractors.ContractorVehicleDTO => ({ id:row.id, contractorId:row.contractor_id, make:row.make, model:row.model, color:row.color, plateNumber:row.plate_number, createdAt:row.created_at.toISOString() });
const equipmentDTO = (row: EquipmentRow): Contractors.ContractorEquipmentDTO => ({ id:row.id, contractorId:row.contractor_id, name:row.name, availableQty:row.available_qty, defaultCostEUR:row.default_cost_eur === null ? null : Number(row.default_cost_eur), note:row.note, createdAt:row.created_at.toISOString() });

export function createContractorsService(db: Sql): Contractors.ContractorsService {
  return {
    async listPeople(contractorId) {
      return (await query<PersonRow>(db, `SELECT * FROM contractors.people WHERE ($1::uuid IS NULL OR contractor_id=$1) ORDER BY last_name, first_name`, [contractorId ?? null])).map(personDTO);
    },
    async createPerson(input) {
      const row = await one<PersonRow>(db, `INSERT INTO contractors.people (contractor_id, first_name, last_name, patronymic, phone, telegram, document_number, photo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [input.contractorId, input.firstName.trim(), input.lastName.trim(), input.patronymic?.trim() || null, input.phone?.trim() || null, input.telegram?.trim() || null, input.documentNumber?.trim() || null, input.photoUrl?.trim() || null]);
      return personDTO(row!);
    },
    async listVehicles(contractorId) {
      return (await query<VehicleRow>(db, `SELECT * FROM contractors.vehicles WHERE ($1::uuid IS NULL OR contractor_id=$1) ORDER BY make, model, plate_number`, [contractorId ?? null])).map(vehicleDTO);
    },
    async createVehicle(input) {
      const row = await one<VehicleRow>(db, `INSERT INTO contractors.vehicles (contractor_id, make, model, color, plate_number) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.contractorId, input.make.trim(), input.model.trim(), input.color?.trim() || null, input.plateNumber.trim()]);
      return vehicleDTO(row!);
    },
    async listEquipment(contractorId) {
      return (await query<EquipmentRow>(db, `SELECT * FROM contractors.equipment WHERE ($1::uuid IS NULL OR contractor_id=$1) ORDER BY name`, [contractorId ?? null])).map(equipmentDTO);
    },
    async createEquipment(input) {
      const row = await one<EquipmentRow>(db, `INSERT INTO contractors.equipment (contractor_id, name, available_qty, default_cost_eur, note) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [input.contractorId, input.name.trim(), input.availableQty ?? 1, input.defaultCostEUR ?? null, input.note?.trim() || null]);
      return equipmentDTO(row!);
    },
  };
}
