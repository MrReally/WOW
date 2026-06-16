import type { Projects, Problem, ISODateTime } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { NotFound, BadRequest, Conflict } from "../../core/errors.js";

function assertRange(startsAt: string, endsAt: string) {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw BadRequest("конец должен быть позже начала");
  }
}
import type { EventBus } from "../../core/eventBus.js";

interface ClientRow {
  id: string;
  name: string;
  contacts: string | null;
  created_at: Date;
}
interface ProjectRow {
  id: string;
  name: string;
  client_id: string;
  status: Projects.ProjectStatus;
  venue_id: string | null;
  starts_at: Date;
  ends_at: Date;
  created_at: Date;
}
interface ReservationRow {
  id: string;
  project_id: string;
  model_id: string;
  qty: number;
  starts_at: Date;
  ends_at: Date;
  resolved_unit_ids: string[];
  created_at: Date;
}
interface TimingRow {
  id: string;
  project_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
}
interface AssignmentRow {
  id: string;
  project_id: string;
  user_id: string;
  role_note: string | null;
  created_at: Date;
}
interface ProblemRow {
  id: string;
  kind: Problem["kind"];
  severity: Problem["severity"];
  title: string;
  detail: string;
  refs: Record<string, string>;
  resolved: boolean;
  created_at: Date;
  resolved_at: Date | null;
}

const clientDTO = (r: ClientRow): Projects.ClientDTO => ({
  id: r.id,
  name: r.name,
  contacts: r.contacts,
  createdAt: r.created_at.toISOString(),
});
const projectDTO = (r: ProjectRow): Projects.ProjectDTO => ({
  id: r.id,
  name: r.name,
  clientId: r.client_id,
  status: r.status,
  venueId: r.venue_id,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
  createdAt: r.created_at.toISOString(),
});
const reservationDTO = (r: ReservationRow): Projects.ReservationDTO => ({
  id: r.id,
  projectId: r.project_id,
  modelId: r.model_id,
  qty: r.qty,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
  resolvedUnitIds: r.resolved_unit_ids,
  createdAt: r.created_at.toISOString(),
});
const timingDTO = (r: TimingRow): Projects.TimingDTO => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
});
const assignmentDTO = (r: AssignmentRow): Projects.AssignmentDTO => ({
  id: r.id,
  projectId: r.project_id,
  userId: r.user_id,
  roleNote: r.role_note,
  createdAt: r.created_at.toISOString(),
});
const problemDTO = (r: ProblemRow): Problem => ({
  id: r.id,
  kind: r.kind,
  severity: r.severity,
  title: r.title,
  detail: r.detail,
  refs: r.refs,
  resolved: r.resolved,
  createdAt: r.created_at.toISOString(),
  resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
});

export function createProjectsService(db: Sql, bus: EventBus): Projects.ProjectsService {
  return {
    // ── Clients ──
    async listClients() {
      const rows = await query<ClientRow>(db, `SELECT * FROM projects.clients ORDER BY name`);
      return rows.map(clientDTO);
    },
    async createClient(input) {
      const row = await one<ClientRow>(
        db,
        `INSERT INTO projects.clients (name, contacts) VALUES ($1,$2) RETURNING *`,
        [input.name, input.contacts ?? null]
      );
      return clientDTO(row!);
    },

    // ── Projects ──
    async listProjects(filter) {
      const rows = filter?.status
        ? await query<ProjectRow>(db, `SELECT * FROM projects.projects WHERE status=$1 ORDER BY starts_at`, [filter.status])
        : await query<ProjectRow>(db, `SELECT * FROM projects.projects ORDER BY starts_at`);
      return rows.map(projectDTO);
    },
    async getProject(id) {
      const row = await one<ProjectRow>(db, `SELECT * FROM projects.projects WHERE id=$1`, [id]);
      return row ? projectDTO(row) : null;
    },
    async createProject(input) {
      assertRange(input.startsAt, input.endsAt);
      const client = await one<ClientRow>(db, `SELECT * FROM projects.clients WHERE id=$1`, [input.clientId]);
      if (!client) throw NotFound("client", input.clientId);
      const row = await one<ProjectRow>(
        db,
        `INSERT INTO projects.projects (name, client_id, venue_id, starts_at, ends_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [input.name, input.clientId, input.venueId ?? null, input.startsAt, input.endsAt]
      );
      return projectDTO(row!);
    },
    async updateProject(id, input) {
      const existing = await this.getProject(id);
      if (!existing) throw NotFound("project", id);
      const startsAt = input.startsAt ?? existing.startsAt;
      const endsAt = input.endsAt ?? existing.endsAt;
      assertRange(startsAt, endsAt);
      if (input.clientId) {
        const client = await one<ClientRow>(db, `SELECT id FROM projects.clients WHERE id=$1`, [input.clientId]);
        if (!client) throw NotFound("client", input.clientId);
      }
      const row = await one<ProjectRow>(
        db,
        `UPDATE projects.projects SET
           name      = COALESCE($2, name),
           client_id = COALESCE($3, client_id),
           venue_id  = $4,
           starts_at = $5,
           ends_at   = $6
         WHERE id=$1 RETURNING *`,
        [id, input.name ?? null, input.clientId ?? null, input.venueId === undefined ? existing.venueId : input.venueId, startsAt, endsAt]
      );
      return projectDTO(row!);
    },
    async setStatus(id, status) {
      const row = await one<ProjectRow>(
        db,
        `UPDATE projects.projects SET status=$2 WHERE id=$1 RETURNING *`,
        [id, status]
      );
      if (!row) throw NotFound("project", id);
      if (status === "confirmed") {
        await bus.publish({ type: "project.confirmed", projectId: id, at: new Date().toISOString() });
      }
      return projectDTO(row);
    },

    // ── Reservations ──
    async listReservations(projectId) {
      const rows = await query<ReservationRow>(
        db,
        `SELECT * FROM projects.reservations WHERE project_id=$1 ORDER BY starts_at`,
        [projectId]
      );
      return rows.map(reservationDTO);
    },
    async findOverlapping(modelId, from, to) {
      const rows = await query<ReservationRow>(
        db,
        `SELECT * FROM projects.reservations
         WHERE model_id=$1 AND starts_at < $3 AND ends_at > $2
         ORDER BY starts_at`,
        [modelId, from, to]
      );
      return rows.map(reservationDTO);
    },
    async createReservation(input) {
      assertRange(input.startsAt, input.endsAt);
      const overlapping = await this.findOverlapping(input.modelId, input.startsAt, input.endsAt);
      const row = await one<ReservationRow>(
        db,
        `INSERT INTO projects.reservations (project_id, model_id, qty, starts_at, ends_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [input.projectId, input.modelId, input.qty, input.startsAt, input.endsAt]
      );
      // Conflicts never block — they create a visible Problem for Apex.
      if (overlapping.length > 0) {
        await query(
          db,
          `INSERT INTO projects.problems (kind, severity, title, detail, refs)
           VALUES ('reservation_conflict','warning',$1,$2,$3)`,
          [
            `Пересечение броней`,
            `Модель уже забронирована на пересекающийся интервал (${overlapping.length})`,
            JSON.stringify({ projectId: input.projectId, modelId: input.modelId }),
          ]
        );
        await bus.publish({
          type: "reservation.conflict",
          projectId: input.projectId,
          modelId: input.modelId,
          at: new Date().toISOString(),
        });
      }
      return reservationDTO(row!);
    },
    async resolveReservation(id, unitIds) {
      const res = await one<ReservationRow>(db, `SELECT * FROM projects.reservations WHERE id=$1`, [id]);
      if (!res) throw NotFound("reservation", id);
      // No duplicates within the selection.
      if (new Set(unitIds).size !== unitIds.length) throw BadRequest("одна и та же единица выбрана дважды");
      // A unit can't be assigned to another reservation whose time window overlaps.
      if (unitIds.length > 0) {
        const clash = await one<ReservationRow>(
          db,
          `SELECT * FROM projects.reservations
           WHERE id <> $1 AND starts_at < $3 AND ends_at > $2 AND resolved_unit_ids && $4::uuid[]
           LIMIT 1`,
          [id, res.starts_at, res.ends_at, unitIds]
        );
        if (clash) {
          throw Conflict("часть единиц уже распределена на пересекающуюся бронь");
        }
      }
      const row = await one<ReservationRow>(
        db,
        `UPDATE projects.reservations SET resolved_unit_ids=$2 WHERE id=$1 RETURNING *`,
        [id, unitIds]
      );
      return reservationDTO(row!);
    },

    // ── Timings + assignments ──
    async listTimings(projectId) {
      const rows = await query<TimingRow>(
        db,
        `SELECT * FROM projects.timings WHERE project_id=$1 ORDER BY starts_at`,
        [projectId]
      );
      return rows.map(timingDTO);
    },
    async addTiming(input) {
      assertRange(input.startsAt, input.endsAt);
      const row = await one<TimingRow>(
        db,
        `INSERT INTO projects.timings (project_id, title, starts_at, ends_at)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [input.projectId, input.title, input.startsAt, input.endsAt]
      );
      return timingDTO(row!);
    },
    async listAssignments(projectId) {
      const rows = await query<AssignmentRow>(
        db,
        `SELECT * FROM projects.assignments WHERE project_id=$1 ORDER BY created_at`,
        [projectId]
      );
      return rows.map(assignmentDTO);
    },
    async addAssignment(input) {
      const dup = await one<AssignmentRow>(
        db,
        `SELECT id FROM projects.assignments WHERE project_id=$1 AND user_id=$2`,
        [input.projectId, input.userId]
      );
      if (dup) throw Conflict("этот человек уже назначен на проект");
      const row = await one<AssignmentRow>(
        db,
        `INSERT INTO projects.assignments (project_id, user_id, role_note)
         VALUES ($1,$2,$3) RETURNING *`,
        [input.projectId, input.userId, input.roleNote ?? null]
      );
      await bus.publish({ type: "project.assigned", projectId: input.projectId, userId: input.userId, at: new Date().toISOString() });
      return assignmentDTO(row!);
    },
    async listProjectsForUser(userId) {
      const rows = await query<ProjectRow>(
        db,
        `SELECT p.* FROM projects.projects p
         JOIN projects.assignments a ON a.project_id = p.id
         WHERE a.user_id = $1
         ORDER BY p.starts_at`,
        [userId]
      );
      return rows.map(projectDTO);
    },

    // ── Problems ──
    async listProblems(opts) {
      const rows = await query<ProblemRow>(
        db,
        opts?.includeResolved
          ? `SELECT * FROM projects.problems ORDER BY created_at DESC`
          : `SELECT * FROM projects.problems WHERE resolved=false ORDER BY created_at DESC`
      );
      return rows.map(problemDTO);
    },
    async resolveProblem(id) {
      await query(db, `UPDATE projects.problems SET resolved=true, resolved_at=now() WHERE id=$1`, [id]);
    },
  };
}

// Re-exported so the seed/tests can build ISO ranges consistently.
export type { ISODateTime };
