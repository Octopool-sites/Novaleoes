import {recoverInventoryOrder,changeIntegratedOrder} from "@/lib/commerce-inventory";
import {z} from "zod";
import {route,owner,findOrder,database,readJson,HttpError} from "@/lib/commerce-server";
import {STORE,transitions,type Status} from "@/lib/commerce-contracts";
import {releaseSql} from "@/lib/inventory-sql";
import {operator} from "@/worker/auth";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 return route(async()=>{const user=await owner(),{id}=await params;const order=await recoverInventoryOrder(user,id);const events=await database().prepare("SELECT status,created_at AS createdAt,actor,detail FROM commerce_order_events WHERE owner=? AND store=? AND order_id=? ORDER BY created_at").bind(user,STORE,id).all();return Response.json({order,events:events.results});});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 return route(async()=>{
  const user=await owner(),actor=(await operator())!,{id}=await params;
  const body=z.object({status:z.enum(["CONFIRMED","PACKING","READY","COMPLETED","CANCELLED"]),revision:z.number().int().nonnegative()}).strict().parse(await readJson(request));
  const order=await findOrder(user,id);
  if(order.revision!==body.revision)throw new HttpError(409,"O pedido mudou. Atualize antes de continuar.");
  if(order.status==="AWAITING_APPROVAL"&&body.status!=="CANCELLED")throw new HttpError(409,"Use Aprovar venda para conferir e reservar as peças.");
  if(!transitions[order.status].includes(body.status as Status))throw new HttpError(409,"Esta mudança de situação não é permitida.");
  const unreserved=["AWAITING_APPROVAL","STOCK_REJECTED","EXPIRED"].includes(order.status);
  if(!unreserved&&!order.approvedBy)throw new HttpError(409,"Não há aprovação registrada para este pedido.");
  if(order.inventoryMode==="erp"&&!unreserved){
   const updated=await changeIntegratedOrder(user,order,body.status,actor.email);
   return Response.json({order:updated},{status:updated.inventoryStatus==="PENDING"?202:200});
  }
  const db=database(),now=new Date().toISOString();
  const releases=body.status==="CANCELLED"&&!unreserved&&order.inventoryStatus==="LOCAL_RESERVED"?order.items.map(i=>db.prepare(releaseSql).bind(i.quantity,user,STORE,i.productId,id,user,STORE,body.revision,order.status)):[];
  const result=await db.batch([
   ...releases,
   db.prepare("UPDATE commerce_orders SET status=?,inventory_status=CASE WHEN ?='CANCELLED' AND inventory_status='LOCAL_RESERVED' THEN 'LOCAL_RELEASED' WHEN ?='COMPLETED' THEN 'LOCAL_COMPLETED' ELSE inventory_status END,updated_at=?,revision=revision+1 WHERE owner=? AND store=? AND id=? AND revision=? AND status=?").bind(body.status,body.status,body.status,now,user,STORE,id,body.revision,order.status),
   db.prepare("INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at,actor,detail) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0").bind(crypto.randomUUID(),user,STORE,id,body.status,now,actor.email,unreserved?"Encerrado sem reserva ou movimentação de estoque":"Atualização pelo responsável")
  ]);
  if(result[releases.length].meta.changes!==1)throw new HttpError(409,"O pedido foi tratado por outra pessoa. Atualize a lista.");
  return Response.json({order:await findOrder(user,id)});
 });
}
