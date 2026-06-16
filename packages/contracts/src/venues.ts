import type { ID, ISODateTime } from "./common.js";

export interface VenueDTO {
  id: ID;
  name: string;
  address: string | null;
  notes: string | null;
  /** Stage area in metres, used as a default canvas size for plans. */
  widthM: number | null;
  depthM: number | null;
  createdAt: ISODateTime;
}

export interface CreateVenueInput {
  name: string;
  address?: string | null;
  notes?: string | null;
  widthM?: number | null;
  depthM?: number | null;
}

export type UpdateVenueInput = Partial<CreateVenueInput>;

export interface VenuesService {
  list(): Promise<VenueDTO[]>;
  get(id: ID): Promise<VenueDTO | null>;
  create(input: CreateVenueInput): Promise<VenueDTO>;
  update(id: ID, input: UpdateVenueInput): Promise<VenueDTO>;
}
