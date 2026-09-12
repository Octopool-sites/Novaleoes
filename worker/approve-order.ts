import {z} from "zod";
import {operator} from "./auth";
import {database,owner,findOrder,readJson,HttpError,listProducts} from "../lib/commerce-server";
import {STORE} from "../lib/commerce-contracts";
import {integratedCatalog,inventoryEnabled,processInventoryJob,recoverInventoryOrder} from "../lib/commerce-inventory";
import {approveIntegratedSql,approveStandaloneSql,reserveApprovedSql} from "../lib/approval-sql";
export async function approveOrder(request:Request,id:string){
 const user=await owner(),actor=(await operator())!;
 const body=z.object({revision:z.number().int().nonnegative(),idempotency:z.string().uuid()}).strict().parse(await readJson(request));
 const db=database();
 const existing=await db.prepare("SELECT approval_key,approved_by FROM commerce_orders WHERE id=? AND owner=? AND store=?").bind(id,user,STORE).first<{approval_key:string|null;approved_by:string|null}>();
 if(existing?.approval_key===body.idempotency){if(existing.approved_by!==actor.email)throw new HttpError(403,"Aprovação pertence a outro responsável.");return Response.json({order:await recoverInventoryOrder(user,id),replayed:true});}
 const order=await findOrder(user,id);
 if(order.status!=="AWAITING_APPROVAL"||order.revision!==body.revision||order.approvedBy)throw new HttpError(409,"O pedido mudou ou já foi aprovado. Atualize antes de continuar.");
 const integrated=await inventoryEnabled(user);
 if(integrated!==(order.inventoryMode==="erp"))throw new HttpError(409,"A configuração de estoque mudou. Confira este pedido antes de aprovar.");
 const catalog=await integratedCatalog(user,await listProducts(user));
 for(const i of order.items){const p=catalog.find(p=>p.id===i.productId&&p.published);if(!p||p.stock<i.quantity)throw new HttpError(409,`Estoque insuficiente para ${i.name}. Nenhuma reserva foi realizada.`);if(p.priceCents!==i.priceCents)throw new HttpError(409,`O preço de ${i.name} mudou. Confirme o novo valor com o cliente e solicite um novo pedido.`);}
 const now=new Date().toISOString(),jobId=crypto.randomUUID();
 const payload=JSON.stringify({externalOrderId:id,items:order.items.map(i=>({externalId:i.productId,quantity:i.quantity,priceCents:i.priceCents}))});
 const writes=integrated?[]:order.items.map(i=>db.prepare(reserveApprovedSql).bind(i.quantity,i.priceCents,i.quantity,user,STORE,i.productId,id,body.revision));
 writes.push(db.prepare(integrated?approveIntegratedSql:approveStandaloneSql).bind(actor.email,now,body.idempotency,now,user,STORE,id,body.revision));
 const approvalIndex=writes.length-1;
 writes.push(db.prepare("INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at,actor,detail) SELECT ?,owner,store,id,?,?,?,? FROM commerce_orders WHERE owner=? AND store=? AND id=? AND approval_key=? AND changes()>0").bind(crypto.randomUUID(),integrated?"STOCK_PENDING":"CONFIRMED",now,actor.email,"Venda aprovada manualmente",user,STORE,id,body.idempotency));
 if(integrated)writes.push(db.prepare("INSERT INTO commerce_inventory_jobs(id,owner,store,order_id,local_revision,action,payload,state,created_at,updated_at) SELECT ?,owner,store,id,revision,'RESERVE',?,'PENDING',?,? FROM commerce_orders WHERE owner=? AND store=? AND id=? AND approval_key=? AND approved_by=?").bind(jobId,payload,now,now,user,STORE,id,body.idempotency,actor.email));
 try{const result=await db.batch(writes);if(result[approvalIndex].meta.changes!==1)throw new HttpError(409,"Outro responsável já tratou este pedido. Atualize a lista.");}catch(error){const row=await db.prepare("SELECT approval_key,approved_by FROM commerce_orders WHERE owner=? AND store=? AND id=?").bind(user,STORE,id).first<{approval_key:string;approved_by:string}>();if(row?.approval_key===body.idempotency&&row.approved_by===actor.email)return Response.json({order:await recoverInventoryOrder(user,id),replayed:true});throw error;}
 if(integrated)await processInventoryJob(user,{id:jobId,owner:user,order_id:id,local_revision:order.revision+1,action:"RESERVE",payload,state:"PENDING"});
 const updated=await findOrder(user,id);
 return Response.json({order:updated},{status:updated.inventoryStatus==="PENDING"?202:200});
}
