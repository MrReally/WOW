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

// ── Assignments (people on a project) ────────────────────────────────────────
// A person is either added directly (status "added") or invited (status
// "invited") — an invite is delivered to Telegram and the person accepts or
// declines, moving it to "accepted" / "declined".

export type AssignmentStatus = "added" | "invited" | "accepted" | "declined";

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ["added", "invited", "accepted", "declined"];

export interface AssignmentDTO {
  id: ID;
  projectId: ID;
  userId: ID; // people.userId, opaque
  roleNote: string | null;
  status: AssignmentStatus;
  /** Agreed rate in EUR for this engagement; null = unset / by agreement. */
  rateEUR: number | null;
  /** Who sent the invite (people id), null for a direct add. */
  invitedByUserId: ID | null;
  respondedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface AddAssignmentInput {
  projectId: ID;
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
  listAssignments(projectId: ID): Promise<AssignmentDTO[]>;
  getAssignment(id: ID): Promise<AssignmentDTO | null>;
  addAssignment(input: AddAssignmentInput): Promise<AssignmentDTO>;
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

export type ProjectsEvent =
  | ProjectConfirmedEvent
  | ReservationConflictEvent
  | ProjectAssignedEvent
  | ProjectUnassignedEvent
  | ProjectInvitedEvent
  | InviteRespondedEvent;
