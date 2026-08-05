import type { ID, ISODateTime } from "./common.js";

export interface VenueDTO {
  id: ID;
  name: string;
  address: string | null;
  notes: string | null;
  /** Stage area in metres, used as a default canvas size for plans. */
  widthM: number | null;
  depthM: number | null;
  /** A place can be used as a project venue, a warehouse, or both. */
  isVenue: boolean;
  isWarehouse: boolean;
  contacts: string | null;
  workingHours: string | null;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  addressVerified: boolean;
  createdAt: ISODateTime;
}

export interface CreateVenueInput {
  name: string;
  address?: string | null;
  notes?: string | null;
  widthM?: number | null;
  depthM?: number | null;
  isVenue?: boolean;
  isWarehouse?: boolean;
  contacts?: string | null;
  workingHours?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  addressVerified?: boolean;
}

export interface AddressSuggestionDTO {
  placeId: string;
  label: string;
}

export interface ResolvedAddressDTO {
  placeId: string;
  address: string;
  latitude: number;
  longitude: number;
}

export type UpdateVenueInput = Partial<CreateVenueInput>;

export interface VenuesService {
  list(): Promise<VenueDTO[]>;
  get(id: ID): Promise<VenueDTO | null>;
  create(input: CreateVenueInput): Promise<VenueDTO>;
  update(id: ID, input: UpdateVenueInput): Promise<VenueDTO>;
}
