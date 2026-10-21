import type { Contractors } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";

interface PersonRow { id:string; contractor_id:string; first_name:string; last_name:string; patronymic:string|null; phone:string|null; telegram:string|null; document_number:string|null; photo_url:string|null; created_at:Date }
interface VehicleRow { id:string; contractor_id:string; make:string; model:string; color:string|null; plate_number:string; created_at:Date }
interface EquipmentRow { id:string; contractor_id:string; name:string; available_qty:number; default_cost_eur:string|null; max_qty:number|null; dry_rental_cost_eur:string|null; delivered_cost_eur:string|null; warehouse_id:string|null; note:string|null; created_at:Date }
interface WarehouseRow { id:string; contractor_id:string; name:string; address:string|null; latitude:number|null; longitude:number|null; comment:string|null; secret_comment:string|null; created_at:Date }

const personDTO = (row: PersonRow): Contractors.ContractorPersonDTO => ({ id:row.id, contractorId:row.contractor_id, firstName:row.first_name, lastName:row.last_name, patronymic:row.patronymic, phone:row.phone, telegram:row.telegram, documentNumber:row.document_number, photoUrl:row.photo_url, createdAt:row.created_at.toISOString() });
const vehicleDTO = (row: VehicleRow): Contractors.ContractorVehicleDTO => ({ id:row.id, contractorId:row.contractor_id, make:row.make, model:row.model, color:row.color, plateNumber:row.plate_number, createdAt:row.created_at.toISOString() });
const equipmentDTO = (row: EquipmentRow): Contractors.ContractorEquipmentDTO => ({ id:row.id, contractorId:row.contractor_id, name:row.name, availableQty:row.available_qty, defaultCostEUR:row.default_cost_eur === null ? null : Number(row.default_cost_eur), maxQty:row.max_qty, dryRentalCostEUR:row.dry_rental_cost_eur === null ? null : Number(row.dry_rental_cost_eur), deliveredCostEUR:row.delivered_cost_eur === null ? null : Number(row.delivered_cost_eur), warehouseId:row.warehouse_id, note:row.note, createdAt:row.created_at.toISOString() });
const warehouseDTO = (row: WarehouseRow): Contractors.ContractorWarehouseDTO => ({ id:row.id, contractorId:row.contractor_id, name:row.name, address:row.address, latitude:row.latitude, longitude:row.longitude, comment:row.comment, secretComment:row.secret_comment, createdAt:row.created_at.toISOString() });

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
      const row = await one<EquipmentRow>(db, `INSERT INTO contractors.equipment (contractor_id, name, available_qty, default_cost_eur, max_qty, dry_rental_cost_eur, delivered_cost_eur, warehouse_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [input.contractorId, input.name.trim(), input.availableQty ?? 1, input.defaultCostEUR ?? input.dryRentalCostEUR ?? null, input.maxQty ?? null, input.dryRentalCostEUR ?? input.defaultCostEUR ?? null, input.deliveredCostEUR ?? null, input.warehouseId ?? null, input.note?.trim() || null]);
      return equipmentDTO(row!);
    },
    async updateEquipment(id, input) {
      const current = await one<EquipmentRow>(db, `SELECT * FROM contractors.equipment WHERE id=$1`, [id]);
      if (!current) throw new Error("contractor equipment not found");
      const row = await one<EquipmentRow>(db, `UPDATE contractors.equipment SET name=$2, available_qty=$3, default_cost_eur=$4, max_qty=$5, dry_rental_cost_eur=$6, delivered_cost_eur=$7, warehouse_id=$8, note=$9 WHERE id=$1 RETURNING *`, [id, input.name?.trim() ?? current.name, input.availableQty ?? current.available_qty, input.defaultCostEUR === undefined ? current.default_cost_eur : input.defaultCostEUR, input.maxQty === undefined ? current.max_qty : input.maxQty, input.dryRentalCostEUR === undefined ? current.dry_rental_cost_eur : input.dryRentalCostEUR, input.deliveredCostEUR === undefined ? current.delivered_cost_eur : input.deliveredCostEUR, input.warehouseId === undefined ? current.warehouse_id : input.warehouseId, input.note === undefined ? current.note : input.note?.trim() || null]);
      return equipmentDTO(row!);
    },
    async listWarehouses(contractorId) {
      return (await query<WarehouseRow>(db, `SELECT * FROM contractors.warehouses WHERE ($1::uuid IS NULL OR contractor_id=$1) ORDER BY name`, [contractorId ?? null])).map(warehouseDTO);
    },
    async createWarehouse(input) {
      const row = await one<WarehouseRow>(db, `INSERT INTO contractors.warehouses (contractor_id,name,address,latitude,longitude,comment,secret_comment) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.contractorId,input.name.trim(),input.address?.trim()||null,input.latitude??null,input.longitude??null,input.comment?.trim()||null,input.secretComment?.trim()||null]);
      return warehouseDTO(row!);
    },
    async updateWarehouse(id, input) {
      const current = await one<WarehouseRow>(db, `SELECT * FROM contractors.warehouses WHERE id=$1`, [id]);
      if (!current) throw new Error("contractor warehouse not found");
      const row = await one<WarehouseRow>(db, `UPDATE contractors.warehouses SET name=$2,address=$3,latitude=$4,longitude=$5,comment=$6,secret_comment=$7 WHERE id=$1 RETURNING *`, [id,input.name?.trim()??current.name,input.address===undefined?current.address:input.address?.trim()||null,input.latitude===undefined?current.latitude:input.latitude,input.longitude===undefined?current.longitude:input.longitude,input.comment===undefined?current.comment:input.comment?.trim()||null,input.secretComment===undefined?current.secret_comment:input.secretComment?.trim()||null]);
      return warehouseDTO(row!);
    },
  };
}
