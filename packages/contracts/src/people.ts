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
  about: string | null;
  source: string | null;
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
  about?: string | null;
  source?: string | null;
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
  about?: string | null;
  source?: string | null;
  photoUrl?: string | null;
  usePhotoAsAvatar?: boolean;
  birthDate?: string | null;
  active?: boolean;
}

export interface UpdateMyPreferencesInput {
  operationsShowAllProjects?: boolean;
}

export type UserListStatus = "active" | "deleted" | "all";

/** Returned when an admin creates a user — the one-time temporary password. */
export interface CreatedUserDTO {
  user: UserDTO;
  temporaryPassword: string | null;
}

export interface CalendarFeedDTO {
  url: string;
}

// ── Telegram inbox ──────────────────────────────────────────────────────────

export type TelegramDialogDirection = "user" | "bot" | "operator";
export type TelegramMessageType = "text" | "photo" | "system";

export interface TelegramInboxSettingsDTO {
  workUsername: string;
}

export interface UpdateTelegramInboxSettingsInput {
  workUsername: string;
}

export interface TelegramDialogParticipantDTO {
  telegramId: string;
  telegramUsername: string | null;
  displayName: string | null;
  lastMessageAt: ISODateTime;
}

export interface TelegramDialogMessageDTO {
  id: ID;
  telegramId: string;
  telegramUsername: string | null;
  direction: TelegramDialogDirection;
  messageType: TelegramMessageType;
  text: string;
  telegramMessageId: number | null;
  deletedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface LogTelegramDialogMessageInput {
  telegramId: string;
  telegramUsername?: string | null;
  direction: TelegramDialogDirection;
  messageType?: TelegramMessageType;
  text: string;
  telegramMessageId?: number | null;
  deletedAt?: string | null;
}

// ── Telegram crew applications ───────────────────────────────────────────────

export type CrewApplicationStatus = "pending" | "accepted" | "rejected";
export type CrewApplicationLanguage = "ru" | "sr" | "en";

export interface CrewApplicationDTO {
  id: ID;
  telegramId: string;
  telegramUsername: string | null;
  language: CrewApplicationLanguage;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  nickname: string;
  email: string;
  birthDate: string;
  languages: string;
  about: string;
  source: string;
  photoFileId: string;
  status: CrewApplicationStatus;
  reviewedByUserId: ID | null;
  reviewedAt: ISODateTime | null;
  createdUserId: ID | null;
  createdAt: ISODateTime;
}

export interface SubmitCrewApplicationInput {
  telegramId: string;
  telegramUsername?: string | null;
  language?: CrewApplicationLanguage;
  firstName: string;
  lastName: string;
  patronymic?: string | null;
  nickname: string;
  email: string;
  birthDate: string;
  languages: string;
  about: string;
  source: string;
  photoFileId: string;
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
  getTelegramInboxSettings(): Promise<TelegramInboxSettingsDTO>;
  updateTelegramInboxSettings(input: UpdateTelegramInboxSettingsInput): Promise<TelegramInboxSettingsDTO>;
  getTelegramInboxWorkChatId(): Promise<string | null>;
  rememberTelegramInboxWorkChatId(telegramId: string): Promise<void>;
  listTelegramDialogParticipants(): Promise<TelegramDialogParticipantDTO[]>;
  listTelegramDialogMessages(telegramId: string, limit?: number): Promise<TelegramDialogMessageDTO[]>;
  logTelegramDialogMessage(input: LogTelegramDialogMessageInput): Promise<TelegramDialogMessageDTO>;
  markTelegramDialogMessageDeleted(telegramId: string, telegramMessageId: number): Promise<void>;

  // Users
  list(status?: UserListStatus): Promise<UserDTO[]>;
  getById(id: ID): Promise<UserDTO | null>;
  listWithPermission(permission: Permission): Promise<UserDTO[]>;
  create(input: CreateUserInput): Promise<CreatedUserDTO>;
  update(id: ID, input: UpdateUserInput): Promise<UserDTO>;
  archive(id: ID): Promise<UserDTO>;
  deletePermanently(id: ID): Promise<void>;
  resetPassword(id: ID): Promise<{ temporaryPassword: string }>;
  listApplications(status?: CrewApplicationStatus | "all"): Promise<CrewApplicationDTO[]>;
  getApplication(id: ID): Promise<CrewApplicationDTO | null>;
  submitApplication(input: SubmitCrewApplicationInput): Promise<CrewApplicationDTO>;
  acceptApplication(id: ID, input: { roleId: ID; reviewedByUserId: ID }): Promise<CreatedUserDTO>;
  rejectApplication(id: ID, reviewedByUserId: ID): Promise<CrewApplicationDTO>;

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

export interface CrewApplicationSubmittedEvent {
  type: "people.application.submitted";
  applicationId: ID;
  at: ISODateTime;
}

export interface CrewApplicationAcceptedEvent {
  type: "people.application.accepted";
  applicationId: ID;
  userId: ID;
  temporaryPassword: string | null;
  at: ISODateTime;
}

export type PeopleEvent = UserCreatedEvent | CrewApplicationSubmittedEvent | CrewApplicationAcceptedEvent;
