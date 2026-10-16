/** Owner-side protocol for explicitly reviewed discipline handoffs.
 * This is NOT a cross-origin permission grant or independent write engine.
 * A Folio native UI must approve the operation, and original Folio service
 * must verify source state at the actual write boundary.
 */
export type DisciplineOperation='habit.complete'|'habit.reopen'|'focus.finish'|'calendar.review';
export interface DisciplineCommand {
  idempotencyKey:string;operation:DisciplineOperation;resourceId:string;expectedUpdatedAt:string;
}
export interface DisciplineReceipt {
  idempotencyKey:string;resourceId:string;operation:DisciplineOperation;
  result:'applied'|'conflict'|'denied'|'unavailable';
  currentUpdatedAt?:string;
}
const ID=/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/;
const NONCE=/^[a-f0-9]{32}$/;
const OPS:DisciplineOperation[]=['habit.complete','habit.reopen','focus.finish','calendar.review'];
export function validateDisciplineCommand(raw:unknown):DisciplineCommand|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const v=raw as Record<string,unknown>;
  if(typeof v.idempotencyKey!=='string'||!NONCE.test(v.idempotencyKey)||
    typeof v.resourceId!=='string'||!ID.test(v.resourceId)||
    typeof v.operation!=='string'||!OPS.includes(v.operation as DisciplineOperation)||
    typeof v.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(v.expectedUpdatedAt)))return null;
  return v as unknown as DisciplineCommand;
}
export async function executeReviewedDisciplineCommand(
  raw:unknown,
  owner:{
    approve:(command:DisciplineCommand)=>Promise<boolean>;
    readUpdatedAt:(command:DisciplineCommand)=>Promise<string|null>;
    originalServiceAction:(command:DisciplineCommand)=>Promise<'applied'|'conflict'|'unavailable'>;
  },
):Promise<DisciplineReceipt|null> {
  const cmd=validateDisciplineCommand(raw);
  if(!cmd)return null;
  const receipt=(result:DisciplineReceipt['result'],currentUpdatedAt?:string):DisciplineReceipt=>({
    idempotencyKey:cmd.idempotencyKey,resourceId:cmd.resourceId,operation:cmd.operation,
    result,...(currentUpdatedAt?{currentUpdatedAt}:{})
  });
  if(!await owner.approve(cmd))return receipt('denied');
  const actual=await owner.readUpdatedAt(cmd);
  if(actual===null)return receipt('unavailable');
  if(actual!==cmd.expectedUpdatedAt)return receipt('conflict',actual);
  // The native owner service MUST separately CAS and deduplicate the command.
  // Without such a handler there is intentionally no 'applied' receipt.
  return receipt(await owner.originalServiceAction(cmd));
}
