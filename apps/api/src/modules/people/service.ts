import type { People, Permission, ID } from "@sever/contracts";
import { ALL_PERMISSIONS } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from "../../core/errors.js";
import { hashPassword, verifyPassword, randomToken, temporaryPassword } from "../../core/crypto.js";
import type { EventBus } from "../../core/eventBus.js";
import { env } from "../../env.js";

const SESSION_TTL_DAYS = 30;

interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  is_system: boolean;
  is_owner: boolean;
  created_at: Date;
}
interface UserRow {
  id: string;
  email: string | null;
  telegram_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  nickname: string | null;
  role_id: string | null;
  role_name: string | null;
  password_hash: string | null;
  must_change_password: boolean;
  hourly_rate_eur: string | null;
  calendar_token: string | null;
  is_system: boolean;
  document_number: string | null;
  document_photo_url: string | null;
  languages: string | null;
  about: string | null;
  source: string | null;
  photo_url: string | null;
  use_photo_as_avatar: boolean;
  birth_date: Date | string | null;
  operations_show_all_projects: boolean;
  active: boolean;
  created_at: Date;
}
interface CrewApplicationRow {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  language: People.CrewApplicationLanguage;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  nickname: string;
  email: string;
  birth_date: Date | string;
  languages: string;
  about: string;
  source: string;
  photo_file_id: string;
  status: People.CrewApplicationStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  created_user_id: string | null;
  created_at: Date;
}
interface TelegramDialogMessageRow {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  telegram_display_name: string | null;
  direction: People.TelegramDialogDirection;
  message_type: People.TelegramMessageType;
  text: string;
  telegram_message_id: number | null;
  deleted_at: Date | null;
  created_at: Date;
}
interface TelegramDialogParticipantRow {
  telegram_id: string;
  telegram_username: string | null;
  telegram_display_name: string | null;
  display_name: string | null;
  last_message_at: Date;
}

const roleDTO = (r: RoleRow): People.RoleDTO => ({
  id: r.id,
  name: r.name,
  permissions: r.permissions as Permission[],
  isSystem: r.is_system,
  isOwner: r.is_owner,
  createdAt: r.created_at.toISOString(),
});
const userDTO = (r: UserRow): People.UserDTO => ({
  id: r.id,
  email: r.email,
  telegramId: r.telegram_id,
  displayName: r.display_name,
  roleId: r.role_id,
  roleName: r.role_name ?? "—",
  firstName: r.first_name,
  lastName: r.last_name,
  patronymic: r.patronymic,
  nickname: r.nickname,
  hourlyRateEUR: r.hourly_rate_eur === null ? null : Number(r.hourly_rate_eur),
  isSystem: r.is_system,
  documentNumber: r.document_number,
  documentPhotoUrl: r.document_photo_url,
  languages: r.languages,
  about: r.about,
  source: r.source,
  photoUrl: r.photo_url,
  usePhotoAsAvatar: r.use_photo_as_avatar,
  birthDate: r.birth_date ? (typeof r.birth_date === "string" ? r.birth_date : r.birth_date.toISOString().slice(0, 10)) : null,
  operationsShowAllProjects: r.operations_show_all_projects,
  active: r.active,
  mustChangePassword: r.must_change_password,
  hasPassword: r.password_hash !== null,
  createdAt: r.created_at.toISOString(),
});
const applicationDTO = (r: CrewApplicationRow): People.CrewApplicationDTO => ({
  id: r.id,
  telegramId: r.telegram_id,
  telegramUsername: r.telegram_username,
  language: r.language ?? "ru",
  firstName: r.first_name,
  lastName: r.last_name,
  patronymic: r.patronymic,
  nickname: r.nickname,
  email: r.email,
  birthDate: typeof r.birth_date === "string" ? r.birth_date : r.birth_date.toISOString().slice(0, 10),
  languages: r.languages,
  about: r.about,
  source: r.source,
  photoFileId: r.photo_file_id,
  status: r.status,
  reviewedByUserId: r.reviewed_by_user_id,
  reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
  createdUserId: r.created_user_id,
  createdAt: r.created_at.toISOString(),
});
const telegramDialogMessageDTO = (r: TelegramDialogMessageRow): People.TelegramDialogMessageDTO => ({
  id: r.id,
  telegramId: r.telegram_id,
  telegramUsername: r.telegram_username,
  telegramDisplayName: r.telegram_display_name,
  direction: r.direction,
  messageType: r.message_type,
  text: r.text,
  telegramMessageId: r.telegram_message_id,
  deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
});
const telegramDialogParticipantDTO = (r: TelegramDialogParticipantRow): People.TelegramDialogParticipantDTO => ({
  telegramId: r.telegram_id,
  telegramUsername: r.telegram_username,
  telegramDisplayName: r.telegram_display_name,
  displayName: r.display_name,
  lastMessageAt: r.last_message_at.toISOString(),
});

const USER_SELECT = `
  SELECT u.*, r.name AS role_name
  FROM people.users u
  LEFT JOIN people.roles r ON r.id = u.role_id`;

// Default role permission sets (Owner is implicit-all).
const WAREHOUSE_PERMS: Permission[] = [
  "operations.view", "warehouse.view", "warehouse.catalog.manage", "warehouse.import",
  "warehouse.issue", "warehouse.unit.status", "projects.view", "projects.reservation.manage",
  "projects.timing.manage", "projects.timing.viewAll", "projects.assignment.manage", "clients.manage",
  "venues.manage", "plans.view", "plans.manage", "people.view",
];
const TECH_PERMS: Permission[] = ["operations.view", "warehouse.view", "warehouse.issue", "projects.view", "plans.view"];

export function createPeopleService(db: Sql, bus: EventBus): People.PeopleService {
  async function permsForRow(u: UserRow): Promise<Permission[]> {
    if (u.is_system) return ALL_PERMISSIONS;
    if (!u.role_id) return [];
    const role = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE id=$1`, [u.role_id]);
    if (!role) return [];
    return role.is_owner ? ALL_PERMISSIONS : (role.permissions as Permission[]);
  }

  async function sessionUser(u: UserRow): Promise<People.SessionUser> {
    return { user: userDTO(u), permissions: await permsForRow(u) };
  }

  async function issueTokenFor(userId: ID): Promise<string> {
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString();
    await query(db, `INSERT INTO people.sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, [token, userId, expires]);
    return token;
  }

  const service: People.PeopleService = {
    async ensureDefaultRoles() {
      // Owner: created once, permissions are implicit (all) so we never store them.
      await query(
        db,
        `INSERT INTO people.roles (name, permissions, is_system, is_owner)
         VALUES ('Владелец', '{}', true, true)
         ON CONFLICT (name) DO NOTHING`
      );
      // Склад / Монтажник are defaults, but their permissions are editable in
      // Settings. Create them once and never overwrite local configuration.
      await query(
        db,
        `INSERT INTO people.roles (name, permissions, is_system, is_owner)
         VALUES ('Склад', $1, true, false)
         ON CONFLICT (name) DO NOTHING`,
        [WAREHOUSE_PERMS]
      );
      await query(
        db,
        `INSERT INTO people.roles (name, permissions, is_system, is_owner)
         VALUES ('Монтажник', $1, true, false)
         ON CONFLICT (name) DO NOTHING`,
        [TECH_PERMS]
      );
      if (env.auth.systemOwnerEmail && env.auth.systemOwnerPassword) {
        const owner = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE is_owner=true LIMIT 1`);
        await query(
          db,
          `INSERT INTO people.users (email, display_name, role_id, password_hash, must_change_password, is_system, active)
           VALUES (lower($1), 'SEVER System', $2, $3, false, true, true)
           ON CONFLICT (email) DO UPDATE SET
             role_id=EXCLUDED.role_id,
             password_hash=EXCLUDED.password_hash,
             must_change_password=false,
             is_system=true,
             active=true`,
          [env.auth.systemOwnerEmail, owner!.id, hashPassword(env.auth.systemOwnerPassword)]
        );
      }
    },

    async getRoleByName(name) {
      const row = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE name=$1`, [name]);
      return row ? roleDTO(row) : null;
    },

    async countUsers() {
      const row = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM people.users`);
      return Number(row?.n ?? 0);
    },

    async bootstrapOwner(input) {
      if ((await this.countUsers()) > 0) throw Conflict("система уже инициализирована");
      await this.ensureDefaultRoles();
      const owner = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE is_owner=true LIMIT 1`);
      const row = await one<UserRow>(
        db,
        `INSERT INTO people.users (email, display_name, role_id, password_hash, must_change_password)
         VALUES (lower($1), $2, $3, $4, false) RETURNING *, null::text AS role_name`,
        [input.email, input.displayName, owner!.id, hashPassword(input.password)]
      );
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [row!.id]);
      const token = await issueTokenFor(u!.id);
      await bus.publish({ type: "people.user.created", userId: u!.id, at: new Date().toISOString() });
      return { token, user: userDTO(u!), permissions: await permsForRow(u!), mustChangePassword: false };
    },

    async loginWithPassword(email, password) {
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE lower(u.email)=lower($1)`, [email]);
      if (!u || !u.active) throw Unauthorized("неверный email или пароль");
      if (!verifyPassword(password, u.password_hash)) throw Unauthorized("неверный email или пароль");
      const token = await issueTokenFor(u.id);
      return { token, user: userDTO(u), permissions: await permsForRow(u), mustChangePassword: u.must_change_password };
    },

    async resolveSession(token) {
      const row = await one<UserRow>(
        db,
        `${USER_SELECT}
         WHERE u.id = (SELECT user_id FROM people.sessions WHERE token=$1 AND expires_at > now())`,
        [token]
      );
      if (!row || !row.active) return null;
      return sessionUser(row);
    },

    async logout(token) {
      await query(db, `DELETE FROM people.sessions WHERE token=$1`, [token]);
    },

    async changePassword(userId, newPassword, currentPassword) {
      if (newPassword.length < 6) throw BadRequest("пароль слишком короткий (минимум 6)");
      const u = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [userId]);
      if (!u) throw NotFound("user", userId);
      if (currentPassword !== undefined && !verifyPassword(currentPassword, u.password_hash)) {
        throw Unauthorized("текущий пароль неверен");
      }
      await query(
        db,
        `UPDATE people.users SET password_hash=$2, must_change_password=false WHERE id=$1`,
        [userId, hashPassword(newPassword)]
      );
    },

    async resolveTelegramUser(telegramId, displayName) {
      const existing = await one<UserRow>(db, `${USER_SELECT} WHERE u.telegram_id=$1`, [telegramId]);
      if (existing) return existing.active ? sessionUser(existing) : null;
      // First-ever user via Telegram becomes the Owner.
      if ((await this.countUsers()) === 0) {
        await this.ensureDefaultRoles();
        const owner = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE is_owner=true LIMIT 1`);
        const row = await one<UserRow>(
          db,
          `INSERT INTO people.users (telegram_id, display_name, role_id) VALUES ($1,$2,$3) RETURNING id`,
          [telegramId, displayName, owner!.id]
        );
        const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [row!.id]);
        return sessionUser(u!);
      }
      return null; // unknown Telegram user — admin must pre-create them
    },

    async devIdentity() {
      let owner = await one<UserRow>(
        db,
        `${USER_SELECT} WHERE u.role_id = (SELECT id FROM people.roles WHERE is_owner=true LIMIT 1) ORDER BY u.created_at LIMIT 1`
      );
      if (!owner) {
        await this.ensureDefaultRoles();
        const ownerRole = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE is_owner=true LIMIT 1`);
        const created = await one<UserRow>(
          db,
          `INSERT INTO people.users (telegram_id, email, display_name, role_id)
           VALUES ('dev-admin', 'dev@local', 'Dev Owner', $1) RETURNING id`,
          [ownerRole!.id]
        );
        owner = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [created!.id]);
      }
      return owner ? sessionUser(owner) : null;
    },

    async issueToken(userId) {
      return issueTokenFor(userId);
    },
    async ensureCalendarToken(userId) {
      const existing = await one<{ calendar_token: string | null }>(db, `SELECT calendar_token FROM people.users WHERE id=$1`, [userId]);
      if (!existing) throw NotFound("user", userId);
      if (existing.calendar_token) return existing.calendar_token;
      const token = randomToken();
      await query(db, `UPDATE people.users SET calendar_token=$2 WHERE id=$1`, [userId, token]);
      return token;
    },
    async getByCalendarToken(token) {
      const row = await one<UserRow>(db, `${USER_SELECT} WHERE u.calendar_token=$1`, [token]);
      return row && row.active ? userDTO(row) : null;
    },
    async updateMyPreferences(userId, input) {
      const row = await one<UserRow>(
        db,
        `UPDATE people.users SET
           operations_show_all_projects = COALESCE($2, operations_show_all_projects)
         WHERE id=$1 RETURNING id`,
        [userId, input.operationsShowAllProjects ?? null]
      );
      if (!row) throw NotFound("user", userId);
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [userId]);
      return userDTO(u!);
    },
    async getTelegramInboxSettings() {
      const row = await one<{ value: string }>(db, `SELECT value FROM people.app_settings WHERE key='telegram.work_username'`);
      return { workUsername: row?.value ?? "" };
    },
    async updateTelegramInboxSettings(input) {
      const workUsername = input.workUsername.trim().replace(/^@/, "");
      await query(
        db,
        `INSERT INTO people.app_settings (key, value, updated_at)
         VALUES ('telegram.work_username', $1, now())
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
        [workUsername]
      );
      return { workUsername };
    },
    async getTelegramInboxWorkChatId() {
      const row = await one<{ value: string }>(db, `SELECT value FROM people.app_settings WHERE key='telegram.work_chat_id'`);
      return row?.value || null;
    },
    async rememberTelegramInboxWorkChatId(telegramId) {
      await query(
        db,
        `INSERT INTO people.app_settings (key, value, updated_at)
         VALUES ('telegram.work_chat_id', $1, now())
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
        [telegramId]
      );
    },
    async listTelegramDialogParticipants() {
      const rows = await query<TelegramDialogParticipantRow>(
        db,
        `SELECT DISTINCT ON (m.telegram_id)
           m.telegram_id,
           m.telegram_username,
           m.telegram_display_name,
           COALESCE(u.nickname, u.display_name) AS display_name,
           m.created_at AS last_message_at
         FROM people.telegram_dialog_messages m
         LEFT JOIN people.users u ON u.telegram_id=m.telegram_id
         WHERE m.telegram_id <> ''
         ORDER BY m.telegram_id, m.created_at DESC`
      );
      return rows
        .map(telegramDialogParticipantDTO)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    },
    async listTelegramDialogMessages(telegramId, limit = 80) {
      const rows = await query<TelegramDialogMessageRow>(
        db,
        `SELECT * FROM (
           SELECT * FROM people.telegram_dialog_messages
           WHERE telegram_id=$1
           ORDER BY created_at DESC
           LIMIT $2
         ) recent ORDER BY created_at ASC`,
        [telegramId, Math.max(1, Math.min(limit, 200))]
      );
      return rows.map(telegramDialogMessageDTO);
    },
    async logTelegramDialogMessage(input) {
      const row = await one<TelegramDialogMessageRow>(
        db,
        `INSERT INTO people.telegram_dialog_messages
           (telegram_id, telegram_username, telegram_display_name, direction, message_type, text, telegram_message_id, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          input.telegramId,
          input.telegramUsername ?? null,
          input.telegramDisplayName ?? null,
          input.direction,
          input.messageType ?? "text",
          input.text,
          input.telegramMessageId ?? null,
          input.deletedAt ?? null,
        ]
      );
      return telegramDialogMessageDTO(row!);
    },
    async markTelegramDialogMessageDeleted(telegramId, telegramMessageId) {
      await query(
        db,
        `UPDATE people.telegram_dialog_messages
         SET deleted_at=COALESCE(deleted_at, now())
         WHERE telegram_id=$1 AND telegram_message_id=$2 AND direction='user'`,
        [telegramId, telegramMessageId]
      );
    },

    // ── Users ──
    async list(status = "active") {
      const statusWhere =
        status === "all" ? "" :
        status === "deleted" ? " AND u.active=false" :
        " AND u.active=true";
      const rows = await query<UserRow>(db, `${USER_SELECT} WHERE u.is_system=false${statusWhere} ORDER BY u.created_at`);
      return rows.map(userDTO);
    },
    async getById(id) {
      const row = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [id]);
      return row ? userDTO(row) : null;
    },
    async listWithPermission(permission) {
      const rows = await query<UserRow>(db, `${USER_SELECT} WHERE u.active=true AND u.is_system=false ORDER BY u.created_at`);
      const out: People.UserDTO[] = [];
      for (const row of rows) {
        const perms = await permsForRow(row);
        if (perms.includes(permission)) out.push(userDTO(row));
      }
      return out;
    },
    async create(input) {
      if (!input.email && !input.telegramId) throw BadRequest("нужен email или Telegram ID");
      const role = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE id=$1`, [input.roleId]);
      if (!role) throw NotFound("role", input.roleId);
      if (input.email) {
        const dup = await one<{ id: string }>(db, `SELECT id FROM people.users WHERE lower(email)=lower($1)`, [input.email]);
        if (dup) throw Conflict("пользователь с таким email уже есть");
      }
      // Email users get a temporary password; Telegram-only users sign in via TG.
      const temp = input.email ? temporaryPassword() : null;
      const row = await one<UserRow>(
        db,
        `INSERT INTO people.users
           (email, telegram_id, display_name, role_id, hourly_rate_eur, password_hash, must_change_password,
            document_number, document_photo_url, languages, about, source, photo_url, use_photo_as_avatar, birth_date,
            first_name, last_name, patronymic, nickname)
         VALUES (lower($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
        [
          input.email ?? null,
          input.telegramId ?? null,
          input.displayName,
          input.roleId,
          input.hourlyRateEUR ?? null,
          temp ? hashPassword(temp) : null,
          temp !== null,
          input.documentNumber ?? null,
          input.documentPhotoUrl ?? null,
          input.languages ?? null,
          input.about ?? null,
          input.source ?? null,
          input.photoUrl ?? null,
          input.usePhotoAsAvatar ?? false,
          input.birthDate ?? null,
          input.firstName ?? null,
          input.lastName ?? null,
          input.patronymic ?? null,
          input.nickname ?? null,
        ]
      );
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [row!.id]);
      await bus.publish({ type: "people.user.created", userId: u!.id, at: new Date().toISOString() });
      return { user: userDTO(u!), temporaryPassword: temp };
    },
    async update(id, input) {
      const existing = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [id]);
      if (!existing) throw NotFound("user", id);
      if (existing.is_system) throw Forbidden("системный аккаунт нельзя редактировать");
      const row = await one<UserRow>(
        db,
        `UPDATE people.users SET
           display_name    = COALESCE($2, display_name),
           role_id         = COALESCE($3, role_id),
           email           = $4,
           telegram_id     = $5,
           hourly_rate_eur = $6,
           active          = COALESCE($7, active),
           document_number = $8,
           languages       = $9,
           about           = $10,
           source          = $11,
           photo_url       = $12,
           birth_date      = $13,
           first_name      = $14,
           last_name       = $15,
           patronymic      = $16,
           nickname        = $17,
           document_photo_url = $18,
           use_photo_as_avatar = COALESCE($19, use_photo_as_avatar)
         WHERE id=$1 RETURNING id`,
        [
          id,
          input.displayName ?? null,
          input.roleId ?? null,
          input.email === undefined ? existing.email : input.email,
          input.telegramId === undefined ? existing.telegram_id : input.telegramId,
          input.hourlyRateEUR === undefined ? existing.hourly_rate_eur : input.hourlyRateEUR,
          input.active ?? null,
          input.documentNumber === undefined ? existing.document_number : input.documentNumber,
          input.languages === undefined ? existing.languages : input.languages,
          input.about === undefined ? existing.about : input.about,
          input.source === undefined ? existing.source : input.source,
          input.photoUrl === undefined ? existing.photo_url : input.photoUrl,
          input.birthDate === undefined ? existing.birth_date : input.birthDate,
          input.firstName === undefined ? existing.first_name : input.firstName,
          input.lastName === undefined ? existing.last_name : input.lastName,
          input.patronymic === undefined ? existing.patronymic : input.patronymic,
          input.nickname === undefined ? existing.nickname : input.nickname,
          input.documentPhotoUrl === undefined ? existing.document_photo_url : input.documentPhotoUrl,
          input.usePhotoAsAvatar ?? null,
        ]
      );
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [row!.id]);
      return userDTO(u!);
    },
    async archive(id) {
      const existing = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [id]);
      if (!existing) throw NotFound("user", id);
      if (existing.is_system) throw Forbidden("системный аккаунт нельзя удалить");
      const row = await one<UserRow>(db, `UPDATE people.users SET active=false WHERE id=$1 RETURNING id`, [id]);
      await query(db, `DELETE FROM people.sessions WHERE user_id=$1`, [id]);
      const u = await one<UserRow>(db, `${USER_SELECT} WHERE u.id=$1`, [row!.id]);
      return userDTO(u!);
    },
    async deletePermanently(id) {
      const existing = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [id]);
      if (!existing) throw NotFound("user", id);
      if (existing.is_system) throw Forbidden("системный аккаунт нельзя удалить");
      if (existing.active) throw BadRequest("сначала переместите пользователя в удалённые");
      await query(db, `DELETE FROM people.sessions WHERE user_id=$1`, [id]);
      await query(db, `DELETE FROM people.users WHERE id=$1`, [id]);
    },
    async resetPassword(id) {
      const u = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [id]);
      if (!u) throw NotFound("user", id);
      if (u.is_system) throw Forbidden("системный аккаунт нельзя менять через админку");
      const temp = temporaryPassword();
      await query(
        db,
        `UPDATE people.users SET password_hash=$2, must_change_password=true WHERE id=$1`,
        [id, hashPassword(temp)]
      );
      return { temporaryPassword: temp };
    },

    async listApplications(status = "pending") {
      const rows = await query<CrewApplicationRow>(
        db,
        status === "all"
          ? `SELECT * FROM people.crew_applications ORDER BY created_at DESC`
          : `SELECT * FROM people.crew_applications WHERE status=$1 ORDER BY created_at DESC`,
        status === "all" ? [] : [status]
      );
      return rows.map(applicationDTO);
    },
    async getApplication(id) {
      const row = await one<CrewApplicationRow>(db, `SELECT * FROM people.crew_applications WHERE id=$1`, [id]);
      return row ? applicationDTO(row) : null;
    },
    async submitApplication(input) {
      const existingUser = await one<{ id: string }>(db, `SELECT id FROM people.users WHERE telegram_id=$1 OR lower(email)=lower($2)`, [input.telegramId, input.email]);
      if (existingUser) throw Conflict("такой пользователь уже есть");
      const pending = await one<{ id: string }>(
        db,
        `SELECT id FROM people.crew_applications WHERE status='pending' AND (telegram_id=$1 OR lower(email)=lower($2)) LIMIT 1`,
        [input.telegramId, input.email]
      );
      if (pending) throw Conflict("анкета уже отправлена");
      const row = await one<CrewApplicationRow>(
        db,
        `INSERT INTO people.crew_applications
           (telegram_id, telegram_username, language, first_name, last_name, patronymic, nickname, email, birth_date, languages, about, source, photo_file_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,lower($8),$9,$10,$11,$12,$13) RETURNING *`,
        [
          input.telegramId,
          input.telegramUsername ?? null,
          input.language ?? "ru",
          input.firstName.trim(),
          input.lastName.trim(),
          input.patronymic?.trim() || null,
          input.nickname.trim(),
          input.email.trim(),
          input.birthDate,
          input.languages.trim(),
          input.about.trim(),
          input.source.trim(),
          input.photoFileId,
        ]
      );
      const dto = applicationDTO(row!);
      await bus.publish({ type: "people.application.submitted", applicationId: dto.id, at: new Date().toISOString() });
      return dto;
    },
    async acceptApplication(id, input) {
      const app = await one<CrewApplicationRow>(db, `SELECT * FROM people.crew_applications WHERE id=$1`, [id]);
      if (!app) throw NotFound("crew application", id);
      if (app.status !== "pending") throw BadRequest("анкета уже обработана");
      const created = await this.create({
        displayName: [app.first_name, app.last_name, app.patronymic].filter(Boolean).join(" "),
        firstName: app.first_name,
        lastName: app.last_name,
        patronymic: app.patronymic,
        nickname: app.nickname,
        email: app.email,
        telegramId: app.telegram_id,
        roleId: input.roleId,
        languages: app.languages,
        about: app.about,
        source: app.source,
        photoUrl: `telegram-file:${app.photo_file_id}`,
        usePhotoAsAvatar: true,
        birthDate: typeof app.birth_date === "string" ? app.birth_date : app.birth_date.toISOString().slice(0, 10),
      });
      await query(
        db,
        `UPDATE people.crew_applications
         SET status='accepted', reviewed_by_user_id=$2, reviewed_at=now(), created_user_id=$3
         WHERE id=$1`,
        [id, input.reviewedByUserId, created.user.id]
      );
      await bus.publish({
        type: "people.application.accepted",
        applicationId: id,
        userId: created.user.id,
        temporaryPassword: created.temporaryPassword,
        at: new Date().toISOString(),
      });
      return created;
    },
    async rejectApplication(id, reviewedByUserId) {
      const row = await one<CrewApplicationRow>(
        db,
        `UPDATE people.crew_applications
         SET status='rejected', reviewed_by_user_id=$2, reviewed_at=now()
         WHERE id=$1 AND status='pending'
         RETURNING *`,
        [id, reviewedByUserId]
      );
      if (!row) {
        const existing = await one<CrewApplicationRow>(db, `SELECT * FROM people.crew_applications WHERE id=$1`, [id]);
        if (!existing) throw NotFound("crew application", id);
        throw BadRequest("анкета уже обработана");
      }
      return applicationDTO(row);
    },

    // ── Roles ──
    async listRoles() {
      const rows = await query<RoleRow>(db, `SELECT * FROM people.roles ORDER BY is_owner DESC, name`);
      return rows.map(roleDTO);
    },
    async getRole(id) {
      const row = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE id=$1`, [id]);
      return row ? roleDTO(row) : null;
    },
    async createRole(input) {
      const dup = await one<{ id: string }>(db, `SELECT id FROM people.roles WHERE name=$1`, [input.name]);
      if (dup) throw Conflict("роль с таким именем уже есть");
      const row = await one<RoleRow>(
        db,
        `INSERT INTO people.roles (name, permissions) VALUES ($1,$2) RETURNING *`,
        [input.name, input.permissions]
      );
      return roleDTO(row!);
    },
    async updateRole(id, input) {
      const role = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE id=$1`, [id]);
      if (!role) throw NotFound("role", id);
      if (role.is_owner && input.permissions) throw Forbidden("у роли Владельца всегда все права");
      if (role.is_system && input.name && input.name !== role.name) throw Forbidden("системную роль нельзя переименовать");
      const row = await one<RoleRow>(
        db,
        `UPDATE people.roles SET
           name = COALESCE($2, name),
           permissions = COALESCE($3, permissions)
         WHERE id=$1 RETURNING *`,
        [id, role.is_system ? null : (input.name ?? null), role.is_owner ? null : (input.permissions ?? null)]
      );
      return roleDTO(row!);
    },
    async deleteRole(id) {
      const role = await one<RoleRow>(db, `SELECT * FROM people.roles WHERE id=$1`, [id]);
      if (!role) throw NotFound("role", id);
      if (role.is_system) throw Forbidden("системную роль нельзя удалить");
      const inUse = await one<{ id: string }>(db, `SELECT id FROM people.users WHERE role_id=$1 LIMIT 1`, [id]);
      if (inUse) throw Conflict("роль назначена пользователям — сначала переназначьте");
      await query(db, `DELETE FROM people.roles WHERE id=$1`, [id]);
    },
    async permissionsForUser(userId) {
      const u = await one<UserRow>(db, `SELECT * FROM people.users WHERE id=$1`, [userId]);
      if (!u) return [];
      return permsForRow(u);
    },
  };

  return service;
}
