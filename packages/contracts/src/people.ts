import type { ID, ISODateTime, Role } from "./common.js";

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: ID;
  telegramId: string;
  displayName: string;
  role: Role;
  /** Hourly rate in EUR for assignment costing (techs). null if not set. */
  hourlyRateEUR: number | null;
  active: boolean;
  createdAt: ISODateTime;
}

export interface CreateUserInput {
  telegramId: string;
  displayName: string;
  role: Role;
  hourlyRateEUR?: number | null;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: Role;
  hourlyRateEUR?: number | null;
  active?: boolean;
}

// ── Public service contract ──────────────────────────────────────────────────

export interface PeopleService {
  list(): Promise<UserDTO[]>;
  getById(id: ID): Promise<UserDTO | null>;
  getByTelegramId(telegramId: string): Promise<UserDTO | null>;
  create(input: CreateUserInput): Promise<UserDTO>;
  update(id: ID, input: UpdateUserInput): Promise<UserDTO>;
}

// ── Domain events ────────────────────────────────────────────────────────────

export interface UserCreatedEvent {
  type: "people.user.created";
  userId: ID;
  role: Role;
  at: ISODateTime;
}

export type PeopleEvent = UserCreatedEvent;
