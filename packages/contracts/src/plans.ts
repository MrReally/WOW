import type { ID, ISODateTime } from "./common.js";

// Technical plans belong to a project, are versioned, and organize elements
// into layers. The Lightkey module (later) imports fixtures into a plan and
// links them to equipment units — this is the foundation it consumes.

export type PlanLayer = "fixtures" | "dmx" | "power" | "audio" | "rigging";
export const PLAN_LAYERS: PlanLayer[] = ["fixtures", "dmx", "power", "audio", "rigging"];

// `cable` is an edge, not a point: DMX / power / audio runs are drawn as lines
// linking two devices (fromId → toId) rather than as standalone markers.
export type PlanElementKind = "fixture" | "truss" | "power" | "audio" | "label" | "cable";

export interface PlanElementDTO {
  id: ID;
  planId: ID;
  layer: PlanLayer;
  kind: PlanElementKind;
  label: string;
  /** Position on the stage canvas (0..stageW / 0..stageH). For a cable this is
   *  the midpoint where the label sits; the line follows fromId/toId. */
  x: number;
  y: number;
  rotation: number;
  w: number | null;
  h: number | null;
  /** Cable endpoints — ids of other elements on this plan (null for points). */
  fromId: ID | null;
  toId: ID | null;
  /** Opaque equipment ids — what physical model/unit this represents. */
  modelId: ID | null;
  unitId: ID | null;
  attrs: Record<string, unknown> | null;
  createdAt: ISODateTime;
}

export interface PlanDTO {
  id: ID;
  projectId: ID;
  venueId: ID | null;
  name: string;
  version: number;
  isCurrent: boolean;
  stageW: number;
  stageH: number;
  createdAt: ISODateTime;
  /** Present when fetching a single plan. */
  elements: PlanElementDTO[];
}

export interface PlanSummaryDTO {
  id: ID;
  projectId: ID;
  name: string;
  version: number;
  isCurrent: boolean;
  elementCount: number;
  createdAt: ISODateTime;
}

export interface CreatePlanInput {
  projectId: ID;
  name: string;
  venueId?: ID | null;
  stageW?: number;
  stageH?: number;
}

export interface AddElementInput {
  planId: ID;
  layer: PlanLayer;
  kind: PlanElementKind;
  label: string;
  x: number;
  y: number;
  rotation?: number;
  w?: number | null;
  h?: number | null;
  fromId?: ID | null;
  toId?: ID | null;
  modelId?: ID | null;
  unitId?: ID | null;
  attrs?: Record<string, unknown> | null;
}

export interface UpdateElementInput {
  layer?: PlanLayer;
  label?: string;
  x?: number;
  y?: number;
  rotation?: number;
  w?: number | null;
  h?: number | null;
  fromId?: ID | null;
  toId?: ID | null;
  modelId?: ID | null;
  unitId?: ID | null;
  attrs?: Record<string, unknown> | null;
}

export interface PlansService {
  listPlans(projectId: ID): Promise<PlanSummaryDTO[]>;
  getPlan(id: ID): Promise<PlanDTO | null>;
  getCurrentPlan(projectId: ID): Promise<PlanDTO | null>;
  createPlan(input: CreatePlanInput): Promise<PlanDTO>;
  /** Snapshot the plan's elements into a new version and make it current. */
  newVersion(planId: ID): Promise<PlanDTO>;
  setCurrent(id: ID): Promise<PlanDTO>;
  updatePlan(id: ID, input: { name?: string; venueId?: ID | null; stageW?: number; stageH?: number }): Promise<PlanDTO>;
  deletePlan(id: ID): Promise<void>;

  addElement(input: AddElementInput): Promise<PlanElementDTO>;
  updateElement(id: ID, input: UpdateElementInput): Promise<PlanElementDTO>;
  /** Bulk position save after dragging. */
  moveElements(planId: ID, items: { id: ID; x: number; y: number; rotation?: number }[]): Promise<void>;
  deleteElement(id: ID): Promise<void>;
}
