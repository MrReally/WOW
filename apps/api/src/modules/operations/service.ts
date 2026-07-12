import type { Equipment, Operations } from "@sever/contracts";
import { one, query, type Sql } from "../../core/db.js";
import { BadRequest, NotFound } from "../../core/errors.js";
type Row={id:string;number:string;kind:Operations.OperationDocumentKind;status:Operations.OperationDocumentStatus;payload:Operations.OperationPayload;created_by:string;created_at:Date;posted_at:Date|null;reversed_at:Date|null};
const dto=(r:Row):Operations.OperationDocumentDTO=>({id:r.id,number:r.number,kind:r.kind,status:r.status,payload:r.payload,createdBy:r.created_by,createdAt:r.created_at.toISOString(),postedAt:r.posted_at?.toISOString()??null,reversedAt:r.reversed_at?.toISOString()??null});
export function createOperationsService(db:Sql,equipment:Equipment.EquipmentService):Operations.OperationsService{
 const load=async(id:string)=>one<Row>(db,`SELECT * FROM operations.documents WHERE id=$1`,[id]);
 const apply=async(payload:Operations.OperationPayload,actorId:string,reverse=false)=>{
  if(payload.kind==="issue") return reverse?equipment.returnUnits({projectId:payload.projectId,returnedUnitIds:payload.unitIds,expectedUnitIds:payload.unitIds,actorId,note:"Сторно документа"}):equipment.issueUnits({projectId:payload.projectId,unitIds:payload.unitIds,actorId,note:payload.note??undefined});
  if(payload.kind==="return") return reverse?equipment.issueUnits({projectId:payload.projectId,unitIds:payload.returnedUnitIds,actorId,note:"Сторно документа"}):equipment.returnUnits({projectId:payload.projectId,returnedUnitIds:payload.returnedUnitIds,expectedUnitIds:payload.expectedUnitIds,actorId,note:payload.note??undefined});
  if(payload.kind==="transfer"){const target=reverse?payload.fromWarehouseId:payload.warehouseId;if(!target)throw BadRequest("source warehouse is required for reversal");return equipment.transferUnit(payload.unitId,target,actorId,reverse?"Сторно документа":payload.note??null);}
  for(const line of payload.lines){if(reverse){if(line.beforeStatus)await equipment.changeStatus(line.unitId,line.beforeStatus,actorId,"Сторно инвентаризации");}else if(!line.present)await equipment.changeStatus(line.unitId,"lost",actorId,payload.note??"Не найдено при инвентаризации");}
 };
 return {
  async list(){return(await query<Row>(db,`SELECT * FROM operations.documents ORDER BY created_at DESC LIMIT 500`)).map(dto);},
  async get(id){const r=await load(id);return r?dto(r):null;},
  async create(payload,actorId){let enriched=payload;if(payload.kind==="transfer"){const unit=await equipment.getUnit(payload.unitId);if(!unit)throw NotFound("unit",payload.unitId);enriched={...payload,fromWarehouseId:unit.warehouseId};}if(payload.kind==="inventory"){enriched={...payload,lines:await Promise.all(payload.lines.map(async line=>{const unit=await equipment.getUnit(line.unitId);if(!unit)throw NotFound("unit",line.unitId);return{...line,beforeStatus:unit.status};}))};}const prefix={issue:"ISS",return:"RET",transfer:"TRN",inventory:"INV"}[payload.kind];const number=`${prefix}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;const r=await one<Row>(db,`INSERT INTO operations.documents(number,kind,payload,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[number,payload.kind,JSON.stringify(enriched),actorId]);return dto(r!);},
  async post(id,actorId){const r=await load(id);if(!r)throw NotFound("operation document",id);if(r.status!=="draft")throw BadRequest("only draft documents can be posted");await apply(r.payload,actorId);const updated=await one<Row>(db,`UPDATE operations.documents SET status='posted',posted_at=now() WHERE id=$1 AND status='draft' RETURNING *`,[id]);return dto(updated!);},
  async reverse(id,actorId){const r=await load(id);if(!r)throw NotFound("operation document",id);if(r.status!=="posted")throw BadRequest("only posted documents can be reversed");await apply(r.payload,actorId,true);const updated=await one<Row>(db,`UPDATE operations.documents SET status='reversed',reversed_at=now() WHERE id=$1 AND status='posted' RETURNING *`,[id]);return dto(updated!);}
 };
}
