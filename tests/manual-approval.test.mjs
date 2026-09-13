import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,jwtVerify,SignJWT} from 'jose';
import worker from '../outputs/test-worker.mjs';
const supabaseUrl='https://abcdefghijklmnopqrst.supabase.co',issuer=supabaseUrl+'/auth/v1',aud='authenticated';
let privateKey,publicKey,token,erpMock,authRedirect=false;const originalFetch=globalThis.fetch;let erpCalls=[];
before(async()=>{
 const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;publicKey=pair.publicKey;token=await sign('approver@example.invalid');
 globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url.startsWith(supabaseUrl+'/auth/v1/')){
   assert.equal(init.redirect,'manual','Workers-compatible transport must refuse automatic redirects');
   if(authRedirect)return new Response(null,{status:302,headers:{location:'https://attacker.invalid/collect'}});
   const headers=new Headers(init?.headers);
   if(url.includes('/token?grant_type=password')){const body=JSON.parse(init.body);if(body.email!=='approver@example.invalid'||body.password!=='correct-test-password')return Response.json({msg:'Invalid login credentials'},{status:400});return Response.json(session(token));}
   if(url.includes('/logout'))return new Response(null,{status:204});
   try {const {payload}=await jwtVerify(headers.get('authorization').replace(/^Bearer /,''),publicKey,{issuer,audience:aud});return Response.json({id:payload.sub,email:payload.email,role:payload.role||'authenticated',email_confirmed_at:payload.unconfirmed?null:'2026-01-01T00:00:00Z',is_anonymous:payload.anonymous||false});}
   catch{return Response.json({msg:'Invalid JWT'},{status:401});}
  }
  erpCalls.push(url);if(erpMock)return erpMock(url,init);throw Error('ERP must not be called in these standalone tests');
 };
});
function session(accessToken){return {access_token:accessToken,refresh_token:'fixture-refresh-token',expires_in:300,expires_at:Math.floor(Date.now()/1000)+300,token_type:'bearer',user:{id:'operator-one',email:'approver@example.invalid',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z'}};}
function authCookie(accessToken){return '__Host-commerce-session=base64-'+Buffer.from(JSON.stringify(session(accessToken))).toString('base64url');}

after(()=>{globalThis.fetch=originalFetch;});
async function sign(email,overrides={}){return new SignJWT({email,...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('operator-one').setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);}
class Statement{
 constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
 bind(...values){return new Statement(this.db,this.sql,values);}
 async first(){return this.db.prepare(this.sql).get(...this.values)||null;}
 async all(){return {results:this.db.prepare(this.sql).all(...this.values),success:true};}
 async run(){const x=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(x.changes)}};}
}
function fixture(stock=3){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0000_flawless_tarantula.sql','0001_lame_obadiah_stane.sql','0002_manual_approval.sql'])db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const owner of ['tenant-a','tenant-b'])db.prepare("INSERT INTO commerce_products(owner,store,id,sku,name,brand,category,price_cents,stock,image,description,published) VALUES(?,'nova-leoes','piece','SKU','Peça','Marca','Motor',1000,?,'','',1)").run(owner,stock);
 const binding={prepare:sql=>new Statement(db,sql),async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB:binding,ASSETS:{fetch:async()=>new Response('asset')},STORE_OWNER:'tenant-a',COMMERCE_APPROVERS:'approver@example.invalid',SUPABASE_URL:supabaseUrl,SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture",AUTH_RATE_LIMITER:{limit:async()=>({success:true})},PUBLIC_ORDERS_ENABLED:'1',ORDER_RATE_LIMITER:{limit:async()=>({success:true})}};
 const input=()=>({idempotency:randomUUID(),customerName:'Cliente de teste',email:'customer@example.invalid',phone:'11999999999',vehicle:'',note:'',items:[{productId:'piece',quantity:1}]});
 const stockOf=(tenant='tenant-a')=>db.prepare('SELECT stock FROM commerce_products WHERE owner=?').get(tenant).stock;
 const call=async(path,method='GET',body,auth=false,extra={})=>{const req=new Request('https://shop.example.invalid'+path,{method,headers:{origin:'https://shop.example.invalid','content-type':'application/json',...(auth?{cookie:authCookie(typeof auth==='string'?auth:token)}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});const r=await worker.fetch(req,env,{});return {status:r.status,body:await r.json(),cookies:r.headers.getSetCookie(),headers:r.headers};};
 return {db,env,input,stockOf,call};
}
test('public request and replay persist pending orders with zero inventory calls/writes',async()=>{const f=fixture(),body=f.input();erpCalls=[];const one=await f.call('/api/public/orders','POST',body);assert.equal(one.status,201,JSON.stringify(one));assert.equal(one.body.order.status,'AWAITING_APPROVAL');assert.equal(one.body.order.inventoryStatus,'UNRESERVED');assert.equal(f.stockOf(),3);assert.equal(f.stockOf('tenant-b'),3);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_inventory_jobs').get().n,0);const replay=await f.call('/api/public/orders','POST',body);assert.equal(replay.body.order.id,one.body.order.id);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,1);assert.deepEqual(erpCalls,[]);});
test('anonymous, forged Sites headers, wrong email and invalid JWT cannot approve',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;const path=`/api/orders/${o.id}/approve`,body={revision:0,idempotency:randomUUID()};for(const auth of [false,'invalid.jwt.token',await sign('other@example.invalid')]){const r=await f.call(path,'POST',body,auth,{'oai-authenticated-user-id':'operator-one','oai-authenticated-user-email':'approver@example.invalid'});assert.equal(r.status,401,JSON.stringify(r));}assert.equal(f.stockOf(),3);assert.equal(f.db.prepare('SELECT approved_by FROM commerce_orders').get().approved_by,null);});
test('approval reserves exactly once and records the named operator',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;const body={revision:0,idempotency:randomUUID()};let r=await f.call(`/api/orders/${o.id}/approve`,'POST',body,true);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.order.status,'CONFIRMED');assert.equal(r.body.order.approvedBy,'approver@example.invalid');assert.equal(f.stockOf(),2);r=await f.call(`/api/orders/${o.id}/approve`,'POST',body,true);assert.equal(r.status,200);assert.equal(f.stockOf(),2);assert.equal(f.stockOf('tenant-b'),3);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_order_events WHERE detail='Venda aprovada manualmente'").get().n,1);});
test('PATCH cannot bypass the dedicated approval operation',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;const r=await f.call(`/api/orders/${o.id}`,'PATCH',{status:'CONFIRMED',revision:0},true);assert.equal(r.status,409);assert.equal(f.stockOf(),3);});
test('cancelling before approval does not replenish inventory or create jobs',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;const r=await f.call(`/api/orders/${o.id}`,'PATCH',{status:'CANCELLED',revision:0},true);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.order.status,'CANCELLED');assert.equal(f.stockOf(),3);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_inventory_jobs').get().n,0);const approval=await f.call(`/api/orders/${o.id}/approve`,'POST',{revision:1,idempotency:randomUUID()},true);assert.equal(approval.status,409);});
test('two requests may await approval for the last piece, only one can be approved',async()=>{const f=fixture(1);const a=(await f.call('/api/public/orders','POST',f.input())).body.order,b=(await f.call('/api/public/orders','POST',f.input())).body.order;assert.equal(f.stockOf(),1);const first=await f.call(`/api/orders/${a.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},true);assert.equal(first.status,200);const second=await f.call(`/api/orders/${b.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},true);assert.equal(second.status,409);assert.equal(f.stockOf(),0);assert.equal(f.db.prepare('SELECT status FROM commerce_orders WHERE id=?').get(b.id).status,'AWAITING_APPROVAL');});
test('price change blocks approval without changing inventory',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;f.db.prepare("UPDATE commerce_products SET price_cents=1200 WHERE owner='tenant-a'").run();const r=await f.call(`/api/orders/${o.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},true);assert.equal(r.status,409);assert.equal(f.stockOf(),3);});
test('cancelling an approved order releases exactly once',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;const approved=await f.call(`/api/orders/${o.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},true);const revision=approved.body.order.revision;assert.equal(f.stockOf(),2);assert.equal((await f.call(`/api/orders/${o.id}`,'PATCH',{status:'CANCELLED',revision},true)).status,200);assert.equal(f.stockOf(),3);assert.equal((await f.call(`/api/orders/${o.id}`,'PATCH',{status:'CANCELLED',revision},true)).status,409);assert.equal(f.stockOf(),3);});
test('database refuses inventory jobs without an approved order',async()=>{const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;assert.throws(()=>f.db.prepare("INSERT INTO commerce_inventory_jobs(id,owner,store,order_id,local_revision,action,payload,state,created_at,updated_at) VALUES(?,'tenant-a','nova-leoes',?,0,'RESERVE','{}','PENDING','now','now')").run(randomUUID(),o.id),/APPROVAL_REQUIRED/);assert.equal(f.stockOf(),3);});
test('private list, cross-origin approval and disabled public intake fail closed',async()=>{const f=fixture();assert.equal((await f.call('/api/orders')).status,401);const o=(await f.call('/api/public/orders','POST',f.input())).body.order;assert.equal((await f.call(`/api/orders/${o.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},true,{origin:'https://other.invalid'})).status,403);f.env.PUBLIC_ORDERS_ENABLED='0';assert.equal((await f.call('/api/public/orders','POST',f.input())).status,503);assert.equal(f.stockOf(),3);});

function integratedFixture(){
 const f=fixture();f.env.COMMERCE_ERP_ORIGIN='https://api.octopool.com.br';f.env.COMMERCE_ERP_TOKEN='a'.repeat(64);f.env.COMMERCE_ERP_OWNER='tenant-a';
 f.db.prepare("INSERT INTO commerce_settings(owner,store,stock_integration_enabled) VALUES('tenant-a','nova-leoes',1)").run();
 let reservation,reserveWrites=0,confirmWrites=0,completeWrites=0,fault;
 const remote=async(url,init)=>{
  const path=new URL(url).pathname.replace('/api/commerce-stock','');
  const body=init?.body?JSON.parse(init.body):undefined;
  assert.equal(init?.headers.Authorization,'Bearer '+'a'.repeat(64));
  if(path==='/inventory')return Response.json({contract:'octopool.stock.v1',storeKey:'nova-leoes',ownerRef:'tenant-a',products:[{externalId:'piece',available:reservation?2:3,priceCents:1000,version:1}]});
  if(path==='/reservations'&&body){if(!reservation){reservation={externalOrderId:body.externalOrderId,status:'HELD',revision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),totalCents:1000};reserveWrites++;}return Response.json(reservation);}
  if(path.endsWith('/commands')){
   if(body.action==='CONFIRM'&&reservation.status==='HELD'){
    if(fault==='conflict-confirm'){fault=null;return Response.json({code:'REVISION_CONFLICT'},{status:409});}
    reservation={...reservation,status:'CONFIRMED',revision:2};confirmWrites++;
    if(fault==='lost-confirm-response'){fault=null;throw Error('Simulated connection dropped after commit');}
   }
   if(body.action==='COMPLETE'&&reservation.status==='CONFIRMED'){reservation={...reservation,status:'COMPLETED',revision:3};completeWrites++;}
   return Response.json(reservation);
  }
  if(path.startsWith('/reservations/')&&!body&&reservation)return Response.json(reservation);
  throw Error('Unexpected ERP request '+path);
 };
 return {...f,remote,fault(value){fault=value;},counts:()=>({reserveWrites,confirmWrites,completeWrites})};
}
test('shared-stock submission and replay never call ERP, even when it is unavailable',async()=>{
 const f=integratedFixture();erpCalls=[];erpMock=undefined;const body=f.input();
 const first=await f.call('/api/public/orders','POST',body);assert.equal(first.status,201);assert.equal(first.body.order.inventoryMode,'erp');
 assert.equal((await f.call('/api/public/orders','POST',body)).status,200);
 assert.deepEqual(erpCalls,[]);assert.equal(f.stockOf(),3);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_inventory_jobs').get().n,0);
});
test('shared approval reserves once; only completed pickup decrements physical inventory',async()=>{
 const f=integratedFixture();erpMock=f.remote;
 try{
  const order=(await f.call('/api/public/orders','POST',f.input())).body.order;
  const approval={revision:0,idempotency:randomUUID()};
  let r=await f.call(`/api/orders/${order.id}/approve`,'POST',approval,true);
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.order.status,'CONFIRMED');assert.deepEqual(f.counts(),{reserveWrites:1,confirmWrites:1,completeWrites:0});
  await f.call(`/api/orders/${order.id}/approve`,'POST',approval,true);assert.equal(f.counts().reserveWrites,1);
  for(const status of ['PACKING','READY','COMPLETED']){r=await f.call(`/api/orders/${order.id}`,'PATCH',{status,revision:r.body.order.revision},true);assert.equal(r.status,200,JSON.stringify(r));}
  assert.equal(r.body.order.status,'COMPLETED');assert.equal(f.counts().completeWrites,1);assert.equal(f.stockOf(),3);
 }finally{erpMock=undefined;}
});
for(const failure of ['lost-confirm-response','conflict-confirm'])test(`confirmation ${failure} stays pending and recovers without duplicate reservation`,async()=>{
 const f=integratedFixture();erpMock=f.remote;f.fault(failure);
 try{
  const o=(await f.call('/api/public/orders','POST',f.input())).body.order;
  const body={revision:0,idempotency:randomUUID()};
  let r=await f.call(`/api/orders/${o.id}/approve`,'POST',body,true);
  assert.equal(r.status,202,JSON.stringify(r));assert.equal(r.body.order.status,'STOCK_PENDING');assert.equal(r.body.order.approvedBy,'approver@example.invalid');
  r=await f.call(`/api/orders/${o.id}/approve`,'POST',body,true);
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.order.status,'CONFIRMED');assert.deepEqual(f.counts(),{reserveWrites:1,confirmWrites:1,completeWrites:0});
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM commerce_inventory_jobs WHERE state='PENDING'").get().n,0);
 }finally{erpMock=undefined;}
});
test('unapproved integrated cancellation remains local and never invokes ERP',async()=>{
 const f=integratedFixture();erpCalls=[];const order=(await f.call('/api/public/orders','POST',f.input())).body.order;
 assert.equal((await f.call(`/api/orders/${order.id}`,'PATCH',{status:'CANCELLED',revision:0},true)).status,200);
 assert.deepEqual(erpCalls,[]);assert.equal(f.stockOf(),3);
});
test('oversized chunked input and client-supplied approval identity are rejected',async()=>{
 const f=fixture();assert.equal((await f.call('/api/public/orders','POST',{...f.input(),approvedBy:'approver@example.invalid'})).status,400);
 assert.equal((await f.call('/api/public/orders','POST',{...f.input(),note:'a'.repeat(25000)})).status,413);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,0);
});
test('live intake requires approvers and configured shared stock when mandated',async()=>{
 const f=fixture();f.env.REQUIRE_SHARED_STOCK='1';
 assert.equal((await f.call('/api/public/catalog')).body.ordersEnabled,false);
 assert.equal((await f.call('/api/public/orders','POST',f.input())).status,503);
 f.env.REQUIRE_SHARED_STOCK='0';delete f.env.COMMERCE_APPROVERS;
 assert.equal((await f.call('/api/public/orders','POST',f.input())).status,503);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,0);
});
test('login sets HttpOnly host cookies without leaking tokens and logout clears them',async()=>{
 const f=fixture();const result=await f.call('/api/auth/login','POST',{email:'approver@example.invalid',password:'correct-test-password'});
 assert.equal(result.status,200,JSON.stringify(result));assert.deepEqual(result.body,{ok:true});assert.ok(result.cookies.length>0);
 for(const cookie of result.cookies){assert.match(cookie,/^__Host-commerce-session/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);assert.match(cookie,/Path=\//i);assert.doesNotMatch(cookie,/Domain=/i);}
 assert.match(result.headers.get('cache-control'),/private.*no-store/);
 const out=await f.call('/api/auth/logout','POST',{},true);assert.equal(out.status,200);assert.ok(out.cookies.some(cookie=>/Max-Age=0/.test(cookie)));
});
test('wrong password, unauthorized address and login CSRF cannot create a session',async()=>{
 const f=fixture();
 for(const body of [{email:'approver@example.invalid',password:'wrong'},{email:'other@example.invalid',password:'correct-test-password'}]){const r=await f.call('/api/auth/login','POST',body);assert.equal(r.status,401);assert.equal(r.cookies.length,0);}
 const csrf=await f.call('/api/auth/login','POST',{email:'approver@example.invalid',password:'correct-test-password'},false,{origin:'https://hostile.invalid'});assert.equal(csrf.status,403);assert.equal(csrf.cookies.length,0);
 f.env.AUTH_RATE_LIMITER={limit:async()=>({success:false})};assert.equal((await f.call('/api/auth/login','POST',{email:'approver@example.invalid',password:'correct-test-password'})).status,429);
});
test('unconfirmed, anonymous and wrong-role users cannot approve even with a valid session',async()=>{
 const f=fixture();const o=(await f.call('/api/public/orders','POST',f.input())).body.order;
 for(const claims of [{unconfirmed:true},{anonymous:true},{role:'service_role'}]){const r=await f.call(`/api/orders/${o.id}/approve`,'POST',{revision:0,idempotency:randomUUID()},await sign('approver@example.invalid',claims));assert.equal(r.status,401);}
 assert.equal(f.stockOf(),3);
});
test('removing permission takes effect immediately and another Supabase host is refused',async()=>{
 const f=fixture();assert.equal((await f.call('/api/orders','GET',undefined,true)).status,200);
 f.env.COMMERCE_APPROVERS='other@example.invalid';assert.equal((await f.call('/api/orders','GET',undefined,true)).status,401);
 f.env.SUPABASE_URL='https://attacker.invalid';assert.equal((await f.call('/api/auth/status')).body.configured,false);assert.equal((await f.call('/api/orders','GET',undefined,true)).status,401);
});
test('provider redirects cannot forward credentials or authorize an operator',async()=>{
 const f=fixture();erpCalls=[];authRedirect=true;
 try {
  const result=await f.call('/api/auth/login','POST',{email:'approver@example.invalid',password:'correct-test-password'});
  assert.equal(result.status,401);assert.equal(result.cookies.length,0);
  assert.equal((await f.call('/api/orders','GET',undefined,true)).status,401);
  assert.deepEqual(erpCalls,[]);assert.equal(f.stockOf(),3);
 } finally {authRedirect=false;}
});
