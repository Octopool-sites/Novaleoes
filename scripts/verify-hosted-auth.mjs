import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev';
if(!process.env.COMMERCE_QA_EMAIL?.endsWith('@example.invalid')||!process.env.COMMERCE_QA_PASSWORD)throw Error('Dedicated QA credentials required');
const jar=new Map();const evidence=[];
async function call(path,method='GET',body,authenticated=true,extra={}){
 const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(authenticated&&jar.size?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
 const cookies=response.headers.getSetCookie();
 if(authenticated)for(const cookie of cookies){const pair=cookie.split(';')[0];const i=pair.indexOf('=');if(/Max-Age=0/i.test(cookie))jar.delete(pair.slice(0,i));else jar.set(pair.slice(0,i),pair.slice(i+1));}
 return {response,cookies,data:await response.json()};
}
const status=await call('/api/auth/status');assert.equal(status.response.status,200);assert.equal(status.data.configured,true);assert.equal(status.data.accessReady,true);evidence.push('Supabase configured');
assert.equal((await call('/api/orders')).response.status,401);evidence.push('Anonymous private API denied');
const loggedIn=await call('/api/auth/login','POST',{email:process.env.COMMERCE_QA_EMAIL,password:process.env.COMMERCE_QA_PASSWORD});assert.equal(loggedIn.response.status,200,JSON.stringify({status:loggedIn.response.status,error:loggedIn.data.error}));assert.deepEqual(loggedIn.data,{ok:true});assert.ok(loggedIn.cookies.length>0);
for(const cookie of loggedIn.cookies){assert.match(cookie,/^__Host-commerce-session/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.doesNotMatch(cookie,/Domain=/i);}
assert.match(loggedIn.response.headers.get('cache-control'),/private.*no-store/);evidence.push('Real Supabase login with HttpOnly Secure host cookies');
const session=await call('/api/session');assert.equal(session.response.status,200);assert.equal(session.data.email,process.env.COMMERCE_QA_EMAIL);assert.equal(session.data.role,'APPROVER');evidence.push('Server validates real Supabase identity');
assert.equal((await call('/api/orders')).response.status,200);evidence.push('Authorized management API accessible');
assert.equal((await call('/api/orders','GET',undefined,false,{'cf-access-jwt-assertion':'forged','oai-authenticated-user-email':process.env.COMMERCE_QA_EMAIL})).response.status,401);evidence.push('Legacy and forged headers denied');
const catalog=await call('/api/public/catalog');assert.equal(catalog.data.ordersEnabled,false);evidence.push('Orders remain disabled');
assert.equal((await call('/api/auth/logout','POST',{})).response.status,200);assert.equal(jar.size,0);assert.equal((await call('/api/session')).response.status,401);evidence.push('Logout clears cookies and access');
const result={verifiedAt:new Date().toISOString(),origin,evidence,orderOrInventoryMutation:false};fs.writeFileSync('outputs/supabase-hosted-auth-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
