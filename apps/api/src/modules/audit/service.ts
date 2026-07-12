import type { Audit } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";

interface Row { id:string; actor_id:string|null; method:string; path:string; status_code:number; created_at:Date }
const dto=(r:Row):Audit.AuditEntryDTO=>({id:r.id,actorId:r.actor_id,method:r.method,path:r.path,statusCode:r.status_code,createdAt:r.created_at.toISOString()});

export function createAuditService(db:Sql):Audit.AuditService {
  return {
    async append(input) { const row=await one<Row>(db,`INSERT INTO audit.entries(actor_id,method,path,status_code) VALUES($1,$2,$3,$4) RETURNING *`,[input.actorId,input.method,input.path,input.statusCode]); return dto(row!); },
    async list(limit=500) { return (await query<Row>(db,`SELECT * FROM audit.entries ORDER BY created_at DESC LIMIT $1`,[Math.min(Math.max(limit,1),2000)])).map(dto); },
  };
}
