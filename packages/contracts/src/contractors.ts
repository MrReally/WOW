import type { ID, ISODateTime } from "./common.js";

export interface ContractorPersonDTO {
  id: ID;
  contractorId: ID;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  phone: string | null;
  telegram: string | null;
  documentNumber: string | null;
  photoUrl: string | null;
  createdAt: ISODateTime;
}

export interface CreateContractorPersonInput {
  contractorId: ID;
  firstName: string;
  lastName: string;
  patronymic?: string | null;
  phone?: string | null;
  telegram?: string | null;
  documentNumber?: string | null;
  photoUrl?: string | null;
}

export interface ContractorVehicleDTO {
  id: ID;
  contractorId: ID;
  make: string;
  model: string;
  color: string | null;
  plateNumber: string;
  createdAt: ISODateTime;
}

export interface CreateContractorVehicleInput {
  contractorId: ID;
  make: string;
  model: string;
  color?: string | null;
  plateNumber: string;
}

export interface ContractorEquipmentDTO {
  id: ID;
  contractorId: ID;
  name: string;
  availableQty: number;
  defaultCostEUR: number | null;
  /** Known physical ceiling; null when the supplier does not disclose stock. */
  maxQty: number | null;
  /** Supplier price for pickup/return by SEVER. */
  dryRentalCostEUR: number | null;
  /** Supplier price including their delivery and later pickup. */
  deliveredCostEUR: number | null;
  warehouseId: ID | null;
  note: string | null;
  createdAt: ISODateTime;
}

export interface CreateContractorEquipmentInput {
  contractorId: ID;
  name: string;
  availableQty?: number;
  defaultCostEUR?: number | null;
  maxQty?: number | null;
  dryRentalCostEUR?: number | null;
  deliveredCostEUR?: number | null;
  warehouseId?: ID | null;
  note?: string | null;
}

export interface UpdateContractorEquipmentInput extends Partial<Omit<CreateContractorEquipmentInput, "contractorId">> {}

export interface ContractorWarehouseDTO {
  id: ID;
  contractorId: ID;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  comment: string | null;
  /** Null when the caller lacks contractors.secret.view. */
  secretComment: string | null;
  createdAt: ISODateTime;
}

export interface CreateContractorWarehouseInput {
  contractorId: ID;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  comment?: string | null;
  secretComment?: string | null;
}

export type UpdateContractorWarehouseInput = Partial<Omit<CreateContractorWarehouseInput, "contractorId">>;

export interface ContractorsService {
  listPeople(contractorId?: ID): Promise<ContractorPersonDTO[]>;
  createPerson(input: CreateContractorPersonInput): Promise<ContractorPersonDTO>;
  listVehicles(contractorId?: ID): Promise<ContractorVehicleDTO[]>;
  createVehicle(input: CreateContractorVehicleInput): Promise<ContractorVehicleDTO>;
  listEquipment(contractorId?: ID): Promise<ContractorEquipmentDTO[]>;
  createEquipment(input: CreateContractorEquipmentInput): Promise<ContractorEquipmentDTO>;
  updateEquipment(id: ID, input: UpdateContractorEquipmentInput): Promise<ContractorEquipmentDTO>;
  listWarehouses(contractorId?: ID): Promise<ContractorWarehouseDTO[]>;
  createWarehouse(input: CreateContractorWarehouseInput): Promise<ContractorWarehouseDTO>;
  updateWarehouse(id: ID, input: UpdateContractorWarehouseInput): Promise<ContractorWarehouseDTO>;
}
