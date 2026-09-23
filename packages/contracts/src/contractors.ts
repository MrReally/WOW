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
  note: string | null;
  createdAt: ISODateTime;
}

export interface CreateContractorEquipmentInput {
  contractorId: ID;
  name: string;
  availableQty?: number;
  defaultCostEUR?: number | null;
  note?: string | null;
}

export interface ContractorsService {
  listPeople(contractorId?: ID): Promise<ContractorPersonDTO[]>;
  createPerson(input: CreateContractorPersonInput): Promise<ContractorPersonDTO>;
  listVehicles(contractorId?: ID): Promise<ContractorVehicleDTO[]>;
  createVehicle(input: CreateContractorVehicleInput): Promise<ContractorVehicleDTO>;
  listEquipment(contractorId?: ID): Promise<ContractorEquipmentDTO[]>;
  createEquipment(input: CreateContractorEquipmentInput): Promise<ContractorEquipmentDTO>;
}
