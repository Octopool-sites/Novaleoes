import { createRemoteJWKSet, jwtVerify } from "jose";
import { context } from "./context";
const keysets=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export type Operator={userId:string;email:string;displayName:string;fullName:string|null};
const identities=new WeakMap<Request,Promise<Operator|null>>();
export function operator():Promise<Operator|null>{
  const request=context().request;
  let pending=identities.get(request);
  if(!pending){pending=verifyOperator();identities.set(request,pending);}
  return pending;
}
async function verifyOperator():Promise<Operator|null>{
  const {request,env}=context();
  if(!env.ACCESS_ISSUER||!env.ACCESS_AUDIENCE||!env.COMMERCE_APPROVERS)return null;
  try{
  const issuer=new URL(env.ACCESS_ISSUER);
  if(issuer.protocol!=="https:"||!issuer.hostname.endsWith(".cloudflareaccess.com")||issuer.pathname!=="/"||issuer.search||issuer.username||issuer.password)return null;
  const token=request.headers.get("cf-access-jwt-assertion");
  if(!token||token.length>16384)return null;
    let keys=keysets.get(issuer.origin);
    if(!keys){keys=createRemoteJWKSet(new URL("/cdn-cgi/access/certs",issuer),{timeoutDuration:5000});keysets.set(issuer.origin,keys);}
    const {payload}=await jwtVerify(token,keys,{issuer:issuer.origin,audience:env.ACCESS_AUDIENCE,algorithms:["RS256"],requiredClaims:["sub","email","exp","iat"],clockTolerance:5});
    const email=String(payload.email||"").toLowerCase();
    const allowed=env.COMMERCE_APPROVERS.split(",").map(e=>e.trim().toLowerCase()).filter(Boolean);
    if(!allowed.includes(email))return null;
    return {userId:String(payload.sub),email,displayName:email,fullName:null};
  }catch{return null;}
}
