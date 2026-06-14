import type { People } from "@sever/contracts";
import type { ID } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { NotFound } from "../../core/errors.js";
import type { EventBus } from "../../core/eventBus.js";

interface UserRow {
  id: string;
  telegram_id: string;
  display_name: string;
  role: People.UserDTO["role"];
  hourly_rate_eur: string | null;
  active: boolean;
  created_at: Date;
}

function toDTO(r: UserRow): People.UserDTO {
  return {
    id: r.id,
    telegramId: r.telegram_id,
    displayName: r.display_name,
    role: r.role,
    hourlyRateEUR: r.hourly_rate_eur === null ? null : Number(r.hourly_rate_eur),
    active: r.active,
    createdAt: r.created_at.toISOString(),
  };
}

export function createPeopleService(db: Sql, bus: EventBus): People.PeopleService {
  return {
    async list() {
      const rows = await query<UserRow>(
        db,
        `SELECT * FROM people.users ORDER BY created_at`
      );
      return rows.map(toDTO);
    },

    async getById(id: ID) {
      const row = await one<UserRow>(db, `SELECT * FROM people.users WHERE id = $1`, [id]);
      return row ? toDTO(row) : null;
    },

    async getByTelegramId(telegramId: string) {
      const row = await one<UserRow>(
        db,
        `SELECT * FROM people.users WHERE telegram_id = $1`,
        [telegramId]
      );
      return row ? toDTO(row) : null;
    },

    async create(input) {
      const row = await one<UserRow>(
        db,
        `INSERT INTO people.users (telegram_id, display_name, role, hourly_rate_eur)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.telegramId, input.displayName, input.role, input.hourlyRateEUR ?? null]
      );
      const dto = toDTO(row!);
      await bus.publish({
        type: "people.user.created",
        userId: dto.id,
        role: dto.role,
        at: new Date().toISOString(),
      });
      return dto;
    },

    async update(id, input) {
      const existing = await this.getById(id);
      if (!existing) throw NotFound("user", id);
      const row = await one<UserRow>(
        db,
        `UPDATE people.users SET
           display_name    = COALESCE($2, display_name),
           role            = COALESCE($3, role),
           hourly_rate_eur = $4,
           active          = COALESCE($5, active)
         WHERE id = $1
         RETURNING *`,
        [
          id,
          input.displayName ?? null,
          input.role ?? null,
          input.hourlyRateEUR === undefined ? existing.hourlyRateEUR : input.hourlyRateEUR,
          input.active ?? null,
        ]
      );
      return toDTO(row!);
    },
  };
}
