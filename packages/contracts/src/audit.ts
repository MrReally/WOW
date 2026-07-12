import type { ID, ISODateTime } from "./common.js";

export interface AuditEntryDTO {
  id: ID;
  actorId: ID | null;
  method: string;
  path: string;
  statusCode: number;
  createdAt: ISODateTime;
}

export interface AuditService {
  append(input: Omit<AuditEntryDTO, "id" | "createdAt">): Promise<AuditEntryDTO>;
  list(limit?: number): Promise<AuditEntryDTO[]>;
}
