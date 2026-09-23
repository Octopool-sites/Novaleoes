import {requestContext,type RuntimeEnv} from "./context";
import {operator,withAuthCookies} from "./auth";
import {authStatus,login,logout,activate,recoverPassword} from "./auth-routes";
import {route,owner,listProducts,HttpError} from "../lib/commerce-server";
import {submitOrder,intakeEnabled} from "./public-orders";
import {approveOrder} from "./approve-order";
import {reconcileInventory} from "../lib/commerce-inventory";
import * as orders from "../app/api/orders/route";
import * as order from "../app/api/orders/[id]/route";
import * as orderExport from "../app/api/orders/[id]/export/route";
import * as catalog from "../app/api/manage/catalog/route";
import * as product from "../app/api/manage/catalog/[id]/route";
import * as integration from "../app/api/integration/route";
import * as reconcile from "../app/api/integration/reconcile/route";
export default {
 async fetch(request:Request,env:RuntimeEnv):Promise<Response>{
  return requestContext.run({request,env},async()=>withAuthCookies(await route(async()=>{
   const {pathname}=new URL(request.url),method=request.method;
   if(pathname==="/api/auth/status"&&method==="GET")return authStatus();
   if(pathname==="/api/auth/login"&&method==="POST")return login(request);
   if(pathname==="/api/auth/logout"&&method==="POST")return logout(request);
   if(pathname==="/api/auth/activate"&&method==="POST")return activate(request);
   if(pathname==="/api/auth/recover"&&method==="POST")return recoverPassword(request);
   if((pathname==="/gestao"||pathname.startsWith("/gestao/"))&&method==="GET")return env.ASSETS.fetch(new Request(new URL("/",request.url),request));
   if(pathname==="/api/public/catalog"&&method==="GET")return Response.json({products:(await listProducts(env.STORE_OWNER)).filter(p=>p.published),requiresApproval:true,ordersEnabled:await intakeEnabled()});
   if(pathname==="/api/public/orders"&&method==="POST"){
    if(!env.ORDER_RATE_LIMITER)throw new HttpError(503,"O atendimento online está sendo preparado.");
    const ip=request.headers.get("cf-connecting-ip")||"unknown";
    const {success}=await env.ORDER_RATE_LIMITER.limit({key:ip});
    if(!success)throw new HttpError(429,"Muitas tentativas. Aguarde um minuto antes de reenviar.");
    return submitOrder(request);
   }
   if(pathname.startsWith("/api/")||pathname==="/gestao"||pathname.startsWith("/gestao/")){
    await owner();
    if(pathname==="/api/session"&&method==="GET"){const user=(await operator())!;return Response.json({name:user.displayName,email:user.email,role:"APPROVER",environment:env.CATALOG_MODE === "production" ? "production" : "staging"});}
    if(pathname==="/api/orders"&&method==="GET")return orders.GET();
    const approval=pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)\/approve$/);
    if(approval&&method==="POST")return approveOrder(request,approval[1]);
    const exported=pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)\/export$/);
    if(exported&&method==="GET")return orderExport.GET(request,{params:Promise.resolve({id:exported[1]})});
    const selected=pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)$/);
    if(selected){const params={params:Promise.resolve({id:selected[1]})};if(method==="GET")return order.GET(request,params);if(method==="PATCH")return order.PATCH(request,params);}
    if(pathname==="/api/manage/catalog"){if(method==="GET")return catalog.GET();if(method==="POST")return catalog.POST(request);}
    const piece=pathname.match(/^\/api\/manage\/catalog\/([a-zA-Z0-9-]+)$/);
    if(piece&&method==="PUT")return product.PUT(request,{params:Promise.resolve({id:piece[1]})});
    if(pathname==="/api/integration"){if(method==="GET")return integration.GET();if(method==="PUT")return integration.PUT(request);}
    if(pathname==="/api/integration/reconcile"&&method==="POST")return reconcile.POST(request);
    throw new HttpError(404,"Endereço não encontrado.");
   }
   return env.ASSETS.fetch(request);
  })));
 },
 async scheduled(_controller:ScheduledController,env:RuntimeEnv,ctx:ExecutionContext){
  ctx.waitUntil(requestContext.run({request:new Request("https://internal.invalid/maintenance"),env},async()=>{try{await reconcileInventory(env.STORE_OWNER);}catch(error){console.error("inventory-reconcile-failed",error instanceof Error?error.name:"unknown");}}));
 }
} satisfies ExportedHandler<RuntimeEnv>;
