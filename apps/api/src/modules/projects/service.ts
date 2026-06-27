import { PROJECT_CHECKLIST_GROUPS, type Projects, type Problem, type ISODateTime, type ID } from "@sever/contracts";
import { one, query, tx, type Sql } from "../../core/db.js";
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
  operation_stage: Projects.ProjectChecklistGroup;
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
  assignee_ids?: string[];
}
interface ProjectTaskRow {
  id: string;
  project_id: string;
  title: string;
  status: Projects.ProjectTaskStatus;
  assignee_id: string | null;
  timing_id: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}
interface ProjectChecklistRow {
  id: string;
  project_id: string;
  group_key: Projects.ProjectChecklistGroup;
  title: string;
  done: boolean;
  done_by_user_id: string | null;
  done_at: Date | null;
  created_at: Date;
}
interface OperationEventRow {
  id: string;
  project_id: string;
  from_stage: Projects.ProjectChecklistGroup | null;
  to_stage: Projects.ProjectChecklistGroup;
  actor_id: string | null;
  created_at: Date;
}
interface OperationUnitMarkRow {
  id: string;
  project_id: string;
  stage: Projects.ProjectChecklistGroup;
  unit_id: string;
  status: Projects.OperationUnitMarkStatus;
  actor_id: string | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}
interface AssignmentRow {
  id: string;
  project_id: string;
  user_id: string;
  role_note: string | null;
  status: Projects.AssignmentStatus;
  rate_eur: string | null;
  invited_by: string | null;
  responded_at: Date | null;
  created_at: Date;
}
interface ContractorItemRow {
  id: string;
  project_id: string;
  contractor_id: string;
  kind: Projects.ContractorItemKind;
  name: string;
  qty: number;
  price_eur: string;
  cost_eur: string;
  note: string | null;
  returned_at: Date | null;
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
  operationStage: r.operation_stage ?? "prep",
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
  assigneeIds: r.assignee_ids ?? [],
});
const taskDTO = (r: ProjectTaskRow): Projects.ProjectTaskDTO => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  status: r.status,
  assigneeId: r.assignee_id,
  timingId: r.timing_id,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  completedAt: r.completed_at ? r.completed_at.toISOString() : null,
});
const checklistDTO = (r: ProjectChecklistRow): Projects.ProjectChecklistItemDTO => ({
  id: r.id,
  projectId: r.project_id,
  group: r.group_key,
  title: r.title,
  done: r.done,
  doneByUserId: r.done_by_user_id,
  doneAt: r.done_at ? r.done_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
});
const operationEventDTO = (r: OperationEventRow): Projects.ProjectOperationEventDTO => ({
  id: r.id,
  projectId: r.project_id,
  fromStage: r.from_stage,
  toStage: r.to_stage,
  actorId: r.actor_id,
  createdAt: r.created_at.toISOString(),
});
const operationUnitMarkDTO = (r: OperationUnitMarkRow): Projects.OperationUnitMarkDTO => ({
  id: r.id,
  projectId: r.project_id,
  stage: r.stage,
  unitId: r.unit_id,
  status: r.status,
  actorId: r.actor_id,
  note: r.note,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});
const assignmentDTO = (r: AssignmentRow): Projects.AssignmentDTO => ({
  id: r.id,
  projectId: r.project_id,
  userId: r.user_id,
  roleNote: r.role_note,
  status: r.status,
  rateEUR: r.rate_eur === null ? null : Number(r.rate_eur),
  invitedByUserId: r.invited_by,
  respondedAt: r.responded_at ? r.responded_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
});
const contractorItemDTO = (r: ContractorItemRow): Projects.ContractorItemDTO => ({
  id: r.id,
  projectId: r.project_id,
  contractorId: r.contractor_id,
  kind: r.kind,
  name: r.name,
  qty: r.qty,
  priceEUR: Number(r.price_eur),
  costEUR: Number(r.cost_eur),
  note: r.note,
  returnedAt: r.returned_at ? r.returned_at.toISOString() : null,
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

const defaultChecklist: { group: Projects.ProjectChecklistGroup; title: string }[] = [
  { group: "prep", title: "Собрано" },
  { group: "prep", title: "Комплект" },
  { group: "pickup", title: "Забрано" },
  { group: "delivery", title: "На площадке" },
  { group: "mount", title: "Смонтировано" },
  { group: "mount", title: "Проверено" },
  { group: "show", title: "Готово" },
  { group: "dismantle", title: "Собрано обратно" },
  { group: "return", title: "Вернули на склад" },
];

export function createProjectsService(db: Sql, bus: EventBus): Projects.ProjectsService {
  async function loadChecklist(projectId: ID): Promise<ProjectChecklistRow[]> {
    return query<ProjectChecklistRow>(
      db,
      `SELECT * FROM projects.project_checklist WHERE project_id=$1
       ORDER BY
         CASE group_key
           WHEN 'prep' THEN 0
           WHEN 'pickup' THEN 1
           WHEN 'delivery' THEN 2
           WHEN 'mount' THEN 3
           WHEN 'show' THEN 4
           WHEN 'dismantle' THEN 5
           ELSE 6
         END,
         created_at`,
      [projectId]
    );
  }

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
    async setOperationStage(id, stage, actorId) {
      const existing = await one<ProjectRow>(db, `SELECT * FROM projects.projects WHERE id=$1`, [id]);
      if (!existing) throw NotFound("project", id);
      if (existing.operation_stage === stage) return projectDTO(existing);
      const isForward = PROJECT_CHECKLIST_GROUPS.indexOf(stage) > PROJECT_CHECKLIST_GROUPS.indexOf(existing.operation_stage);
      if (isForward) {
        const currentItems = await query<ProjectChecklistRow>(
          db,
          `SELECT * FROM projects.project_checklist WHERE project_id=$1 AND group_key=$2`,
          [id, existing.operation_stage]
        );
        if (currentItems.length > 0 && currentItems.some((item) => !item.done)) {
          throw BadRequest("сначала закройте чек-лист текущего этапа");
        }
      }
      let row: ProjectRow | null = null;
      await tx(async (client) => {
        row = await one<ProjectRow>(
          client,
          `UPDATE projects.projects SET operation_stage=$2 WHERE id=$1 RETURNING *`,
          [id, stage]
        );
        await query(
          client,
          `INSERT INTO projects.operation_events (project_id, from_stage, to_stage, actor_id)
           VALUES ($1,$2,$3,$4)`,
          [id, existing.operation_stage, stage, actorId ?? null]
        );
      });
      return projectDTO(row!);
    },
    async listOperationEvents(projectId) {
      const rows = await query<OperationEventRow>(
        db,
        `SELECT * FROM projects.operation_events WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [projectId]
      );
      return rows.map(operationEventDTO);
    },
    async listOperationUnitMarks(projectId) {
      const project = await this.getProject(projectId);
      if (!project) throw NotFound("project", projectId);
      const rows = await query<OperationUnitMarkRow>(
        db,
        `SELECT * FROM projects.operation_unit_marks WHERE project_id=$1
         ORDER BY
           CASE stage
             WHEN 'prep' THEN 0
             WHEN 'pickup' THEN 1
             WHEN 'delivery' THEN 2
             WHEN 'mount' THEN 3
             WHEN 'show' THEN 4
             WHEN 'dismantle' THEN 5
             ELSE 6
           END,
           updated_at DESC`,
        [projectId]
      );
      return rows.map(operationUnitMarkDTO);
    },
    async setOperationUnitMark(input) {
      const project = await this.getProject(input.projectId);
      if (!project) throw NotFound("project", input.projectId);
      const row = await one<OperationUnitMarkRow>(
        db,
        `INSERT INTO projects.operation_unit_marks (project_id, stage, unit_id, status, actor_id, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (project_id, stage, unit_id)
         DO UPDATE SET
           status=EXCLUDED.status,
           actor_id=EXCLUDED.actor_id,
           note=EXCLUDED.note,
           updated_at=now()
         RETURNING *`,
        [input.projectId, input.stage, input.unitId, input.status, input.actorId ?? null, input.note ?? null]
      );
      return operationUnitMarkDTO(row!);
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
    async deleteReservation(id) {
      const row = await one<{ id: string }>(db, `DELETE FROM projects.reservations WHERE id=$1 RETURNING id`, [id]);
      if (!row) throw NotFound("reservation", id);
    },

    // ── Timings + assignments ──
    async listTimings(projectId, opts) {
      // Aggregate each block's responsible people in one round trip. When
      // forUserId is set (caller can't see the whole timing), keep only blocks
      // that person is on.
      const params: unknown[] = [projectId];
      let mineClause = "";
      if (opts?.forUserId) {
        params.push(opts.forUserId);
        mineClause = `AND EXISTS (SELECT 1 FROM projects.timing_assignees x WHERE x.timing_id = t.id AND x.user_id = $2)`;
      }
      const rows = await query<TimingRow>(
        db,
        `SELECT t.*,
                COALESCE(array_agg(ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assignee_ids
         FROM projects.timings t
         LEFT JOIN projects.timing_assignees ta ON ta.timing_id = t.id
         WHERE t.project_id = $1 ${mineClause}
         GROUP BY t.id
         ORDER BY t.starts_at`,
        params
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
      const assignees = input.assigneeIds ?? [];
      for (const uid of assignees) {
        await query(db, `INSERT INTO projects.timing_assignees (timing_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row!.id, uid]);
      }
      return timingDTO({ ...row!, assignee_ids: assignees });
    },
    async setTimingAssignees(timingId, userIds) {
      const timing = await one<TimingRow>(db, `SELECT * FROM projects.timings WHERE id=$1`, [timingId]);
      if (!timing) throw NotFound("timing", timingId);
      const unique = [...new Set(userIds)];
      await tx(async (client) => {
        await query(client, `DELETE FROM projects.timing_assignees WHERE timing_id=$1`, [timingId]);
        for (const uid of unique) {
          await query(client, `INSERT INTO projects.timing_assignees (timing_id, user_id) VALUES ($1,$2)`, [timingId, uid]);
        }
      });
      return timingDTO({ ...timing, assignee_ids: unique });
    },
    async deleteTiming(id) {
      await query(db, `DELETE FROM projects.timings WHERE id=$1`, [id]);
    },
    async listTasks(projectId, opts) {
      const params: unknown[] = [projectId];
      let mineClause = "";
      if (opts?.forUserId) {
        params.push(opts.forUserId);
        mineClause = `AND (assignee_id IS NULL OR assignee_id = $2)`;
      }
      const rows = await query<ProjectTaskRow>(
        db,
        `SELECT * FROM projects.project_tasks
         WHERE project_id=$1 ${mineClause}
         ORDER BY
           CASE status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
           created_at`,
        params
      );
      return rows.map(taskDTO);
    },
    async createTask(input) {
      const project = await this.getProject(input.projectId);
      if (!project) throw NotFound("project", input.projectId);
      if (input.timingId) {
        const timing = await one<TimingRow>(db, `SELECT * FROM projects.timings WHERE id=$1 AND project_id=$2`, [input.timingId, input.projectId]);
        if (!timing) throw NotFound("timing", input.timingId);
      }
      const row = await one<ProjectTaskRow>(
        db,
        `INSERT INTO projects.project_tasks (project_id, title, assignee_id, timing_id)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [input.projectId, input.title, input.assigneeId ?? null, input.timingId ?? null]
      );
      return taskDTO(row!);
    },
    async updateTask(id, input) {
      const existing = await one<ProjectTaskRow>(db, `SELECT * FROM projects.project_tasks WHERE id=$1`, [id]);
      if (!existing) throw NotFound("project task", id);
      const nextStatus = input.status ?? existing.status;
      if (input.timingId) {
        const timing = await one<TimingRow>(db, `SELECT * FROM projects.timings WHERE id=$1 AND project_id=$2`, [input.timingId, existing.project_id]);
        if (!timing) throw NotFound("timing", input.timingId);
      }
      const completedAt =
        nextStatus === "done"
          ? existing.completed_at ?? new Date()
          : null;
      const row = await one<ProjectTaskRow>(
        db,
        `UPDATE projects.project_tasks SET
           title=$2,
           status=$3,
           assignee_id=$4,
           timing_id=$5,
           updated_at=now(),
           completed_at=$6
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.title ?? existing.title,
          nextStatus,
          input.assigneeId === undefined ? existing.assignee_id : input.assigneeId,
          input.timingId === undefined ? existing.timing_id : input.timingId,
          completedAt,
        ]
      );
      return taskDTO(row!);
    },
    async deleteTask(id) {
      const row = await one<{ id: string }>(db, `DELETE FROM projects.project_tasks WHERE id=$1 RETURNING id`, [id]);
      if (!row) throw NotFound("project task", id);
    },
    async listChecklist(projectId) {
      const project = await this.getProject(projectId);
      if (!project) throw NotFound("project", projectId);
      let rows = await loadChecklist(projectId);
      const hasDefault = (item: { group: Projects.ProjectChecklistGroup; title: string }) =>
        rows.some((row) => row.group_key === item.group && row.title === item.title);
      const missingDefaults = defaultChecklist.filter((item) => !hasDefault(item));
      if (missingDefaults.length > 0) {
        await tx(async (client) => {
          for (const item of missingDefaults) {
            await query(
              client,
              `INSERT INTO projects.project_checklist (project_id, group_key, title) VALUES ($1,$2,$3)`,
              [projectId, item.group, item.title]
            );
          }
        });
        rows = await loadChecklist(projectId);
      }
      return rows.map(checklistDTO);
    },
    async createChecklistItem(input) {
      const project = await this.getProject(input.projectId);
      if (!project) throw NotFound("project", input.projectId);
      const row = await one<ProjectChecklistRow>(
        db,
        `INSERT INTO projects.project_checklist (project_id, group_key, title)
         VALUES ($1,$2,$3) RETURNING *`,
        [input.projectId, input.group, input.title]
      );
      return checklistDTO(row!);
    },
    async updateChecklistItem(id, input) {
      const existing = await one<ProjectChecklistRow>(db, `SELECT * FROM projects.project_checklist WHERE id=$1`, [id]);
      if (!existing) throw NotFound("project checklist item", id);
      const done = input.done ?? existing.done;
      const row = await one<ProjectChecklistRow>(
        db,
        `UPDATE projects.project_checklist SET
           group_key=$2,
           title=$3,
           done=$4,
           done_by_user_id=$5,
           done_at=$6
         WHERE id=$1 RETURNING *`,
        [
          id,
          input.group ?? existing.group_key,
          input.title ?? existing.title,
          done,
          done ? (input.actorId ?? existing.done_by_user_id) : null,
          done ? (existing.done_at ?? new Date()) : null,
        ]
      );
      return checklistDTO(row!);
    },
    async deleteChecklistItem(id) {
      const row = await one<{ id: string }>(db, `DELETE FROM projects.project_checklist WHERE id=$1 RETURNING id`, [id]);
      if (!row) throw NotFound("project checklist item", id);
    },
    async listAssignments(projectId) {
      const rows = await query<AssignmentRow>(
        db,
        `SELECT * FROM projects.assignments WHERE project_id=$1 ORDER BY created_at`,
        [projectId]
      );
      return rows.map(assignmentDTO);
    },
    async getAssignment(id) {
      const row = await one<AssignmentRow>(db, `SELECT * FROM projects.assignments WHERE id=$1`, [id]);
      return row ? assignmentDTO(row) : null;
    },
    async addAssignment(input) {
      const dup = await one<AssignmentRow>(
        db,
        `SELECT id FROM projects.assignments WHERE project_id=$1 AND user_id=$2`,
        [input.projectId, input.userId]
      );
      if (dup) throw Conflict("этот человек уже назначен на проект");
      const status: Projects.AssignmentStatus = input.invite ? "invited" : "added";
      const row = await one<AssignmentRow>(
        db,
        `INSERT INTO projects.assignments (project_id, user_id, role_note, status, rate_eur, invited_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [input.projectId, input.userId, input.roleNote ?? null, status, input.rateEUR ?? null, input.invitedByUserId ?? null]
      );
      const at = new Date().toISOString();
      if (input.invite) {
        // Invited: a Telegram invite goes out; no "assigned" notice yet.
        await bus.publish({ type: "project.invited", projectId: input.projectId, userId: input.userId, assignmentId: row!.id, at });
      } else {
        await bus.publish({ type: "project.assigned", projectId: input.projectId, userId: input.userId, at });
      }
      return assignmentDTO(row!);
    },
    async removeAssignment(id) {
      const row = await one<AssignmentRow>(db, `SELECT * FROM projects.assignments WHERE id=$1`, [id]);
      if (!row) throw NotFound("assignment", id);
      await tx(async (client) => {
        // Drop them from this project's timing blocks too.
        await query(
          client,
          `DELETE FROM projects.timing_assignees
           WHERE user_id=$1 AND timing_id IN (SELECT id FROM projects.timings WHERE project_id=$2)`,
          [row.user_id, row.project_id]
        );
        await query(client, `DELETE FROM projects.assignments WHERE id=$1`, [id]);
      });
      await bus.publish({ type: "project.unassigned", projectId: row.project_id, userId: row.user_id, at: new Date().toISOString() });
    },
    async respondToInvite(assignmentId, accept, byUserId) {
      const row = await one<AssignmentRow>(db, `SELECT * FROM projects.assignments WHERE id=$1`, [assignmentId]);
      if (!row) throw NotFound("assignment", assignmentId);
      if (row.user_id !== byUserId) throw BadRequest("это приглашение адресовано не вам");
      const status: Projects.AssignmentStatus = accept ? "accepted" : "declined";
      let updated: AssignmentRow | null = null;
      await tx(async (client) => {
        updated = await one<AssignmentRow>(
          client,
          `UPDATE projects.assignments SET status=$2, responded_at=now() WHERE id=$1 RETURNING *`,
          [assignmentId, status]
        );
        if (accept) {
          await query(
            client,
            `UPDATE projects.assignments
             SET status='declined', responded_at=now()
             WHERE project_id=$1
               AND id <> $2
               AND status='invited'
               AND COALESCE(role_note, '') = COALESCE($3, '')`,
            [row.project_id, assignmentId, row.role_note]
          );
        }
      });
      await bus.publish({
        type: "project.invite.responded",
        projectId: row.project_id,
        userId: row.user_id,
        assignmentId,
        accepted: accept,
        at: new Date().toISOString(),
      });
      return assignmentDTO(updated!);
    },
    async listProjectsForUser(userId) {
      // "My projects" = directly added or accepted invites (not pending/declined).
      const rows = await query<ProjectRow>(
        db,
        `SELECT p.* FROM projects.projects p
         JOIN projects.assignments a ON a.project_id = p.id
         WHERE a.user_id = $1 AND a.status IN ('added','accepted')
         ORDER BY p.starts_at`,
        [userId]
      );
      return rows.map(projectDTO);
    },

    // ── Contractor equipment (subrent) ──
    async listContractorItems(projectId) {
      const rows = await query<ContractorItemRow>(
        db,
        `SELECT * FROM projects.contractor_items WHERE project_id=$1 ORDER BY created_at`,
        [projectId]
      );
      return rows.map(contractorItemDTO);
    },
    async listContractorItemsByContractor(contractorId) {
      const rows = await query<ContractorItemRow>(
        db,
        `SELECT * FROM projects.contractor_items WHERE contractor_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [contractorId]
      );
      return rows.map(contractorItemDTO);
    },
    async listOpenContractorItems() {
      const rows = await query<ContractorItemRow>(
        db,
        `SELECT * FROM projects.contractor_items WHERE kind='equipment' AND returned_at IS NULL ORDER BY created_at DESC`
      );
      return rows.map(contractorItemDTO);
    },
    async addContractorItem(input) {
      const row = await one<ContractorItemRow>(
        db,
        `INSERT INTO projects.contractor_items (project_id, contractor_id, kind, name, qty, price_eur, cost_eur, note, returned_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          input.projectId,
          input.contractorId,
          input.kind ?? "equipment",
          input.name,
          input.qty,
          input.priceEUR,
          input.costEUR,
          input.note ?? null,
          null,
        ]
      );
      return contractorItemDTO(row!);
    },
    async returnContractorItem(id) {
      const row = await one<ContractorItemRow>(
        db,
        `UPDATE projects.contractor_items SET returned_at=COALESCE(returned_at, now()) WHERE id=$1 RETURNING *`,
        [id]
      );
      if (!row) throw NotFound("contractor item", id);
      return contractorItemDTO(row);
    },
    async removeContractorItem(id) {
      await query(db, `DELETE FROM projects.contractor_items WHERE id=$1`, [id]);
    },
    async contractorDebts() {
      const rows = await query<{ contractor_id: string; debt: string }>(
        db,
        `SELECT contractor_id, COALESCE(SUM(cost_eur * qty),0)::text AS debt
         FROM projects.contractor_items GROUP BY contractor_id`
      );
      return rows
        .map((r) => ({ contractorId: r.contractor_id, debtEUR: Math.round(Number(r.debt) * 100) / 100 }))
        .filter((d) => d.debtEUR > 0);
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
