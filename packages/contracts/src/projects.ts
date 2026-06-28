import type { ID, ISODateTime, Problem } from "./common.js";

// ── Clients (minimal directory, no CRM) ──────────────────────────────────────

export interface ClientDTO {
  id: ID;
  name: string;
  contacts: string | null;
  createdAt: ISODateTime;
}

export interface CreateClientInput {
  name: string;
  contacts?: string | null;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export type ProjectStatus =
  | "draft"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "draft",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
];

export interface ProjectDTO {
  id: ID;
  name: string;
  clientId: ID;
  status: ProjectStatus;
  operationStage: ProjectChecklistGroup;
  /** Opaque id of the venue (venues module, later phase). */
  venueId: ID | null;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  createdAt: ISODateTime;
}

export interface CreateProjectInput {
  name: string;
  clientId: ID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  venueId?: ID | null;
}

export interface UpdateProjectInput {
  name?: string;
  clientId?: ID;
  startsAt?: ISODateTime;
  endsAt?: ISODateTime;
  venueId?: ID | null;
}

// ── Hourly reservations ──────────────────────────────────────────────────────
// Early reservations can be model-level (qty); resolved to specific units at
// warehouse prep. Conflicts never block — they create a Problem.

export interface ReservationDTO {
  id: ID;
  projectId: ID;
  modelId: ID;
  qty: number;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  /** Specific unit ids once resolved at prep; empty while model-level. */
  resolvedUnitIds: ID[];
  createdAt: ISODateTime;
}

export interface CreateReservationInput {
  projectId: ID;
  modelId: ID;
  qty: number;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

// ── Timings (schedule blocks within a project) ───────────────────────────────

export interface TimingDTO {
  id: ID;
  projectId: ID;
  title: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  /** People (assignment user ids) responsible for this block. */
  assigneeIds: ID[];
}

export interface AddTimingInput {
  projectId: ID;
  title: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  assigneeIds?: ID[];
}

// ── Operations tasks + field checklist ──────────────────────────────────────

export type ProjectTaskStatus = "todo" | "in_progress" | "done";

export const PROJECT_TASK_STATUSES: ProjectTaskStatus[] = ["todo", "in_progress", "done"];

export interface ProjectTaskDTO {
  id: ID;
  projectId: ID;
  title: string;
  status: ProjectTaskStatus;
  assigneeId: ID | null;
  timingId: ID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface CreateProjectTaskInput {
  projectId: ID;
  title: string;
  assigneeId?: ID | null;
  timingId?: ID | null;
}

export interface UpdateProjectTaskInput {
  title?: string;
  status?: ProjectTaskStatus;
  assigneeId?: ID | null;
  timingId?: ID | null;
}

export type ProjectChecklistGroup = "prep" | "pickup" | "delivery" | "mount" | "show" | "dismantle" | "return";

export const PROJECT_CHECKLIST_GROUPS: ProjectChecklistGroup[] = ["prep", "pickup", "delivery", "mount", "show", "dismantle", "return"];

export interface ProjectChecklistItemDTO {
  id: ID;
  projectId: ID;
  group: ProjectChecklistGroup;
  title: string;
  done: boolean;
  doneByUserId: ID | null;
  doneAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface CreateProjectChecklistItemInput {
  projectId: ID;
  group: ProjectChecklistGroup;
  title: string;
}

export interface UpdateProjectChecklistItemInput {
  group?: ProjectChecklistGroup;
  title?: string;
  done?: boolean;
  actorId?: ID | null;
}

export interface UpdateProjectOperationStageInput {
  stage: ProjectChecklistGroup;
}

export interface ProjectOperationEventDTO {
  id: ID;
  projectId: ID;
  fromStage: ProjectChecklistGroup | null;
  toStage: ProjectChecklistGroup;
  actorId: ID | null;
  createdAt: ISODateTime;
}

export type OperationUnitMarkStatus =
  | "ready"
  | "packed"
  | "picked"
  | "missing"
  | "left"
  | "delivered"
  | "mounted"
  | "collected"
  | "broken"
  | "lost"
  | "returned";

export const OPERATION_UNIT_MARK_STATUSES: OperationUnitMarkStatus[] = [
  "ready",
  "packed",
  "picked",
  "missing",
  "left",
  "delivered",
  "mounted",
  "collected",
  "broken",
  "lost",
  "returned",
];

export interface OperationUnitMarkDTO {
  id: ID;
  projectId: ID;
  stage: ProjectChecklistGroup;
  unitId: ID;
  status: OperationUnitMarkStatus;
  actorId: ID | null;
  note: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SetOperationUnitMarkInput {
  projectId: ID;
  stage: ProjectChecklistGroup;
  unitId: ID;
  status: OperationUnitMarkStatus;
  actorId?: ID | null;
  note?: string | null;
}

export interface ClearOperationUnitMarkInput {
  projectId: ID;
  stage: ProjectChecklistGroup;
  unitId: ID;
  status: OperationUnitMarkStatus;
}

// ── Project roles + assignments (people on a project) ────────────────────────
// A project role is the staffing need: title, required seats, and per-person
// rate. Assignments are candidates/confirmed people attached to that role.

export interface ProjectRoleDTO {
  id: ID;
  projectId: ID;
  title: string;
  requiredCount: number;
  /** Planned per-person rate in EUR; null = unset / by agreement. */
  rateEUR: number | null;
  createdAt: ISODateTime;
}

export interface CreateProjectRoleInput {
  projectId: ID;
  title: string;
  requiredCount: number;
  rateEUR?: number | null;
}

export interface UpdateProjectRoleInput {
  title?: string;
  requiredCount?: number;
  rateEUR?: number | null;
}

// A person is either added directly (status "added") or invited (status
// "invited") — an invite is delivered to Telegram and the person accepts or
// declines. "cancelled" means the system closed the invite, usually because the
// role was filled before the person answered.

export type AssignmentStatus = "added" | "invited" | "accepted" | "declined" | "cancelled";

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ["added", "invited", "accepted", "declined", "cancelled"];

export interface AssignmentDTO {
  id: ID;
  projectId: ID;
  roleId: ID | null;
  userId: ID; // people.userId, opaque
  roleNote: string | null;
  status: AssignmentStatus;
  /** Agreed rate in EUR for this engagement; null = unset / by agreement. */
  rateEUR: number | null;
  telegramChatId: string | null;
  telegramMessageId: number | null;
  /** Who sent the invite (people id), null for a direct add. */
  invitedByUserId: ID | null;
  respondedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AddAssignmentInput {
  projectId: ID;
  roleId?: ID | null;
  userId: ID;
  roleNote?: string | null;
  rateEUR?: number | null;
  /** When true, send a Telegram invite the person accepts/declines. */
  invite?: boolean;
  /** People id of the inviter (set by the route from the auth context). */
  invitedByUserId?: ID | null;
}

// ── Contractor costs — external gear/services used on a project ───────────────
// Equipment is returnable subrent gear. Delivery/setup are service costs and do
// not appear in contractor return tracking.

export type ContractorItemKind = "equipment" | "delivery" | "setup";

export interface ContractorItemDTO {
  id: ID;
  projectId: ID;
  /** Opaque id of the contractor (equipment.contractors) — the source. */
  contractorId: ID;
  kind: ContractorItemKind;
  name: string;
  qty: number;
  /** Price charged to the client, per unit. */
  priceEUR: number;
  /** Our cost to the contractor, per unit. */
  costEUR: number;
  /** Free-form spec / note. */
  note: string | null;
  /** Null means we still need to return this rented contractor gear. */
  returnedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AddContractorItemInput {
  projectId: ID;
  contractorId: ID;
  kind?: ContractorItemKind;
  name: string;
  qty: number;
  priceEUR: number;
  costEUR: number;
  note?: string | null;
}

/** What we owe a contractor, summed across projects. */
export interface ContractorDebtDTO {
  contractorId: ID;
  debtEUR: number;
}

// ── Public service contract ──────────────────────────────────────────────────

export interface ProjectsService {
  // Clients
  listClients(): Promise<ClientDTO[]>;
  createClient(input: CreateClientInput): Promise<ClientDTO>;

  // Projects
  listProjects(filter?: { status?: ProjectStatus }): Promise<ProjectDTO[]>;
  getProject(id: ID): Promise<ProjectDTO | null>;
  createProject(input: CreateProjectInput): Promise<ProjectDTO>;
  updateProject(id: ID, input: UpdateProjectInput): Promise<ProjectDTO>;
  setStatus(id: ID, status: ProjectStatus): Promise<ProjectDTO>;
  setOperationStage(id: ID, stage: ProjectChecklistGroup, actorId?: ID | null): Promise<ProjectDTO>;
  listOperationEvents(projectId: ID): Promise<ProjectOperationEventDTO[]>;
  listOperationUnitMarks(projectId: ID): Promise<OperationUnitMarkDTO[]>;
  setOperationUnitMark(input: SetOperationUnitMarkInput): Promise<OperationUnitMarkDTO>;
  clearOperationUnitMark(input: ClearOperationUnitMarkInput): Promise<void>;

  // Reservations
  listReservations(projectId: ID): Promise<ReservationDTO[]>;
  createReservation(input: CreateReservationInput): Promise<ReservationDTO>;
  resolveReservation(id: ID, unitIds: ID[]): Promise<ReservationDTO>;
  deleteReservation(id: ID): Promise<void>;
  /** Reservations overlapping [from,to] for a model — used for conflict checks. */
  findOverlapping(modelId: ID, from: ISODateTime, to: ISODateTime): Promise<ReservationDTO[]>;

  // Timings + assignments
  /** When opts.forUserId is set, only timings that user is assigned to. */
  listTimings(projectId: ID, opts?: { forUserId?: ID }): Promise<TimingDTO[]>;
  addTiming(input: AddTimingInput): Promise<TimingDTO>;
  setTimingAssignees(timingId: ID, userIds: ID[]): Promise<TimingDTO>;
  deleteTiming(id: ID): Promise<void>;
  listTasks(projectId: ID, opts?: { forUserId?: ID }): Promise<ProjectTaskDTO[]>;
  createTask(input: CreateProjectTaskInput): Promise<ProjectTaskDTO>;
  updateTask(id: ID, input: UpdateProjectTaskInput): Promise<ProjectTaskDTO>;
  deleteTask(id: ID): Promise<void>;
  listChecklist(projectId: ID): Promise<ProjectChecklistItemDTO[]>;
  createChecklistItem(input: CreateProjectChecklistItemInput): Promise<ProjectChecklistItemDTO>;
  updateChecklistItem(id: ID, input: UpdateProjectChecklistItemInput): Promise<ProjectChecklistItemDTO>;
  deleteChecklistItem(id: ID): Promise<void>;
  listProjectRoles(projectId: ID): Promise<ProjectRoleDTO[]>;
  createProjectRole(input: CreateProjectRoleInput): Promise<ProjectRoleDTO>;
  updateProjectRole(id: ID, input: UpdateProjectRoleInput): Promise<ProjectRoleDTO>;
  deleteProjectRole(id: ID): Promise<void>;
  listAssignments(projectId: ID): Promise<AssignmentDTO[]>;
  getAssignment(id: ID): Promise<AssignmentDTO | null>;
  addAssignment(input: AddAssignmentInput): Promise<AssignmentDTO>;
  recordAssignmentTelegramMessage(id: ID, chatId: string, messageId: number): Promise<void>;
  /** Remove a person from the project (also drops them from its timing blocks). */
  removeAssignment(id: ID): Promise<void>;
  /** Accept or decline an invite (called from the Telegram bot). Verifies the
   *  assignment belongs to byUserId. */
  respondToInvite(assignmentId: ID, accept: boolean, byUserId: ID): Promise<AssignmentDTO>;
  /** Projects a given user is assigned to (for the Tech "my projects" view). */
  listProjectsForUser(userId: ID): Promise<ProjectDTO[]>;

  // Contractor equipment (subrent)
  listContractorItems(projectId: ID): Promise<ContractorItemDTO[]>;
  listContractorItemsByContractor(contractorId: ID): Promise<ContractorItemDTO[]>;
  listOpenContractorItems(): Promise<ContractorItemDTO[]>;
  addContractorItem(input: AddContractorItemInput): Promise<ContractorItemDTO>;
  returnContractorItem(id: ID): Promise<ContractorItemDTO>;
  removeContractorItem(id: ID): Promise<void>;
  /** Owed-to-contractor totals (cost × qty) grouped by contractor. */
  contractorDebts(): Promise<ContractorDebtDTO[]>;

  // Problems detected by this module (reservation conflicts).
  listProblems(opts?: { includeResolved?: boolean }): Promise<Problem[]>;
  resolveProblem(id: ID): Promise<void>;
}

// ── Domain events ────────────────────────────────────────────────────────────

export interface ProjectConfirmedEvent {
  type: "project.confirmed";
  projectId: ID;
  at: ISODateTime;
}

export interface ReservationConflictEvent {
  type: "reservation.conflict";
  projectId: ID;
  modelId: ID;
  at: ISODateTime;
}

export interface ProjectAssignedEvent {
  type: "project.assigned";
  projectId: ID;
  userId: ID;
  at: ISODateTime;
}

/** A person was removed from a project — notify them. */
export interface ProjectUnassignedEvent {
  type: "project.unassigned";
  projectId: ID;
  userId: ID;
  at: ISODateTime;
}

/** A person was invited (not yet accepted) — triggers a Telegram invite. */
export interface ProjectInvitedEvent {
  type: "project.invited";
  projectId: ID;
  userId: ID;
  assignmentId: ID;
  at: ISODateTime;
}

/** The invited person accepted or declined — notify the inviter. */
export interface InviteRespondedEvent {
  type: "project.invite.responded";
  projectId: ID;
  userId: ID;
  assignmentId: ID;
  accepted: boolean;
  at: ISODateTime;
}

export interface InviteCancelledEvent {
  type: "project.invite.cancelled";
  projectId: ID;
  userId: ID;
  assignmentId: ID;
  reason: "role_filled" | "already_assigned" | "role_removed";
  roleNote?: string | null;
  telegramChatId?: string | null;
  telegramMessageId?: number | null;
  at: ISODateTime;
}

export type ProjectsEvent =
  | ProjectConfirmedEvent
  | ReservationConflictEvent
  | ProjectAssignedEvent
  | ProjectUnassignedEvent
  | ProjectInvitedEvent
  | InviteRespondedEvent
  | InviteCancelledEvent;
