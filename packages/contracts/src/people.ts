import type { ID, ISODateTime, Permission } from "./common.js";

// ── Roles ────────────────────────────────────────────────────────────────────

export interface RoleDTO {
  id: ID;
  name: string;
  permissions: Permission[];
  /** System roles (Owner) can't be deleted; Owner always has all permissions. */
  isSystem: boolean;
  isOwner: boolean;
  createdAt: ISODateTime;
}

export interface CreateRoleInput {
  name: string;
  permissions: Permission[];
}

export interface UpdateRoleInput {
  name?: string;
  permissions?: Permission[];
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: ID;
  email: string | null;
  telegramId: string | null;
  displayName: string;
  roleId: ID | null;
  roleName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  nickname: string | null;
  /** Hourly rate in EUR for assignment costing (techs). null if not set. */
  hourlyRateEUR: number | null;
  /** Hidden protected account for recovery/developer access. */
  isSystem: boolean;
  documentNumber: string | null;
  documentPhotoUrl: string | null;
  languages: string | null;
  photoUrl: string | null;
  usePhotoAsAvatar: boolean;
  birthDate: string | null;
  operationsShowAllProjects: boolean;
  active: boolean;
  mustChangePassword: boolean;
  hasPassword: boolean;
  createdAt: ISODateTime;
}

export interface CreateUserInput {
  displayName: string;
  roleId: ID;
  email?: string | null;
  telegramId?: string | null;
  hourlyRateEUR?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  nickname?: string | null;
  documentNumber?: string | null;
  documentPhotoUrl?: string | null;
  languages?: string | null;
  photoUrl?: string | null;
  usePhotoAsAvatar?: boolean;
  birthDate?: string | null;
}

export interface UpdateUserInput {
  displayName?: string;
  roleId?: ID;
  email?: string | null;
  telegramId?: string | null;
  hourlyRateEUR?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  nickname?: string | null;
  documentNumber?: string | null;
  documentPhotoUrl?: string | null;
  languages?: string | null;
  photoUrl?: string | null;
  usePhotoAsAvatar?: boolean;
  birthDate?: string | null;
  active?: boolean;
}

export interface UpdateMyPreferencesInput {
  operationsShowAllProjects?: boolean;
}

/** Returned when an admin creates a user — the one-time temporary password. */
export interface CreatedUserDTO {
  user: UserDTO;
  temporaryPassword: string | null;
}

export interface CalendarFeedDTO {
  url: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  token: string;
  user: UserDTO;
  permissions: Permission[];
  mustChangePassword: boolean;
}

export interface SessionUser {
  user: UserDTO;
  permissions: Permission[];
}

// ── Public service contract ──────────────────────────────────────────────────

export interface PeopleService {
  // Setup
  ensureDefaultRoles(): Promise<void>;
  getRoleByName(name: string): Promise<RoleDTO | null>;

  // Bootstrap / auth
  countUsers(): Promise<number>;
  bootstrapOwner(input: { email: string; password: string; displayName: string }): Promise<AuthResult>;
  loginWithPassword(email: string, password: string): Promise<AuthResult>;
  resolveSession(token: string): Promise<SessionUser | null>;
  logout(token: string): Promise<void>;
  changePassword(userId: ID, newPassword: string, currentPassword?: string): Promise<void>;
  /** Resolve (and auto-provision the owner if empty) a Telegram user. */
  resolveTelegramUser(telegramId: string, displayName: string): Promise<SessionUser | null>;
  /** Dev-only bypass identity (first owner). */
  devIdentity(): Promise<SessionUser | null>;
  issueToken(userId: ID): Promise<string>;
  ensureCalendarToken(userId: ID): Promise<string>;
  getByCalendarToken(token: string): Promise<UserDTO | null>;
  updateMyPreferences(userId: ID, input: UpdateMyPreferencesInput): Promise<UserDTO>;

  // Users
  list(): Promise<UserDTO[]>;
  getById(id: ID): Promise<UserDTO | null>;
  listWithPermission(permission: Permission): Promise<UserDTO[]>;
  create(input: CreateUserInput): Promise<CreatedUserDTO>;
  update(id: ID, input: UpdateUserInput): Promise<UserDTO>;
  resetPassword(id: ID): Promise<{ temporaryPassword: string }>;

  // Roles
  listRoles(): Promise<RoleDTO[]>;
  getRole(id: ID): Promise<RoleDTO | null>;
  createRole(input: CreateRoleInput): Promise<RoleDTO>;
  updateRole(id: ID, input: UpdateRoleInput): Promise<RoleDTO>;
  deleteRole(id: ID): Promise<void>;
  permissionsForUser(userId: ID): Promise<Permission[]>;
}

// ── Domain events ────────────────────────────────────────────────────────────

export interface UserCreatedEvent {
  type: "people.user.created";
  userId: ID;
  at: ISODateTime;
}

export type PeopleEvent = UserCreatedEvent;
