import {context} from "./context";
import {database,readJson,listProducts,mapOrder,HttpError} from "../lib/commerce-server";
import {inventoryConfigured,inventoryEnabled} from "../lib/commerce-inventory";
import {orderInput,STORE} from "../lib/commerce-contracts";
import {authConfigured,approverEmails} from "./auth";
export async function intakeEnabled(){
 const {env}=context();
 if(env.PUBLIC_ORDERS_ENABLED!=="1"||!env.STORE_OWNER||!authConfigured(env)||!approverEmails().length)return false;
 if(env.REQUIRE_SHARED_STOCK==="1"&&(!inventoryConfigured(env.STORE_OWNER)||!await inventoryEnabled(env.STORE_OWNER)))return false;
 return true;
}
export async function submitOrder(request:Request){
 const {env}=context();
 if(!await intakeEnabled())throw new HttpError(503,"A loja está preparando o atendimento online. Tente novamente em breve.");
 const input=orderInput.parse(await readJson(request)),user=env.STORE_OWNER;
 const fingerprint=JSON.stringify({...input,idempotency:undefined,items:[...input.items].sort((a,b)=>a.productId.localeCompare(b.productId))});
 const db=database();
 const previous=await db.prepare("SELECT * FROM commerce_orders WHERE owner=? AND store=? AND idempotency=?").bind(user,STORE,input.idempotency).first<Record<string,unknown>>();
 if(previous){if(previous.fingerprint!==fingerprint)throw new HttpError(409,"Esta tentativa já foi usada com outros dados.");return Response.json({order:mapOrder(previous),replayed:true});}
 // This is deliberately a local catalog read. A customer's submission never
 // invokes ERP reserve/command/recovery/maintenance, even when replayed.
 const catalog=await listProducts(user);
 const items=input.items.map(i=>{const p=catalog.find(p=>p.id===i.productId&&p.published);if(!p||p.priceCents<=0)throw new HttpError(400,"Uma peça não está mais disponível. Atualize o carrinho.");return {productId:p.id,name:p.name,sku:p.sku,image:p.image,quantity:i.quantity,priceCents:p.priceCents};});
 const id=crypto.randomUUID(),now=new Date().toISOString(),total=items.reduce((s,i)=>s+i.quantity*i.priceCents,0);
 const mode=await inventoryEnabled(user)?"erp":"standalone";
 try{await db.batch([
  db.prepare("INSERT INTO commerce_orders(id,owner,store,idempotency,fingerprint,number,customer_name,email,phone,vehicle,note,items_json,total_cents,status,created_at,updated_at,revision,inventory_mode,inventory_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'AWAITING_APPROVAL',?,?,0,?,'UNRESERVED')").bind(id,user,STORE,input.idempotency,fingerprint,`NL-${id.slice(0,8).toUpperCase()}`,input.customerName,input.email,input.phone,input.vehicle,input.note,JSON.stringify(items),total,now,now,mode),
  db.prepare("INSERT INTO commerce_order_events(id,owner,store,order_id,status,created_at,actor,detail) VALUES(?,?,?,?,'AWAITING_APPROVAL',?,'CUSTOMER','Pedido recebido; nenhum estoque reservado')").bind(crypto.randomUUID(),user,STORE,id,now)
 ]);}catch(error){const duplicate=await db.prepare("SELECT * FROM commerce_orders WHERE owner=? AND store=? AND idempotency=?").bind(user,STORE,input.idempotency).first<Record<string,unknown>>();if(duplicate?.fingerprint===fingerprint)return Response.json({order:mapOrder(duplicate),replayed:true});throw error;}
 const row=await db.prepare("SELECT * FROM commerce_orders WHERE owner=? AND store=? AND id=?").bind(user,STORE,id).first<Record<string,unknown>>();
 return Response.json({order:mapOrder(row!),message:"Pedido recebido. A loja vai conferir e aprovar sua solicitação antes de reservar as peças."},{status:201});
}
