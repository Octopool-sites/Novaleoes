import {integratedCatalog,inventoryEnabled} from "@/lib/commerce-inventory";
import {route,owner,listProducts,readJson,ensureCatalog,database,HttpError} from "@/lib/commerce-server";
import {productInput,STORE} from "@/lib/commerce-contracts";
export const dynamic="force-dynamic";
export async function GET(){return route(async()=>{const user=await owner();return Response.json({products:await integratedCatalog(user,await listProducts(user))});});}
export async function POST(request:Request){return route(async()=>{const user=await owner();if(await inventoryEnabled(user))throw new HttpError(409,"Cadastre e vincule a peça no ERP antes de publicá-la.");const p=productInput.parse(await readJson(request));await ensureCatalog(user);const id=crypto.randomUUID();await database().prepare("INSERT INTO commerce_products (owner,store,id,sku,name,brand,category,price_cents,stock,image,description,published) VALUES (?,?,?,?,?,?,?,?,?,'',?,?)").bind(user,STORE,id,p.sku,p.name,p.brand,p.category,p.priceCents,p.stock,p.description,Number(p.published)).run();return Response.json({id},{status:201});});}
