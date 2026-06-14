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
}

// ── Assignments (people on a project) ────────────────────────────────────────

export interface AssignmentDTO {
  id: ID;
  projectId: ID;
  userId: ID; // people.userId, opaque
  roleNote: string | null;
  createdAt: ISODateTime;
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
  setStatus(id: ID, status: ProjectStatus): Promise<ProjectDTO>;

  // Reservations
  listReservations(projectId: ID): Promise<ReservationDTO[]>;
  createReservation(input: CreateReservationInput): Promise<ReservationDTO>;
  resolveReservation(id: ID, unitIds: ID[]): Promise<ReservationDTO>;
  /** Reservations overlapping [from,to] for a model — used for conflict checks. */
  findOverlapping(modelId: ID, from: ISODateTime, to: ISODateTime): Promise<ReservationDTO[]>;

  // Timings + assignments
  listTimings(projectId: ID): Promise<TimingDTO[]>;
  addTiming(input: { projectId: ID; title: string; startsAt: ISODateTime; endsAt: ISODateTime }): Promise<TimingDTO>;
  listAssignments(projectId: ID): Promise<AssignmentDTO[]>;
  addAssignment(input: { projectId: ID; userId: ID; roleNote?: string | null }): Promise<AssignmentDTO>;
  /** Projects a given user is assigned to (for the Tech "my projects" view). */
  listProjectsForUser(userId: ID): Promise<ProjectDTO[]>;

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

export type ProjectsEvent = ProjectConfirmedEvent | ReservationConflictEvent;
