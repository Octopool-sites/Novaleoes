import { AsyncLocalStorage } from "node:async_hooks";
export type RuntimeEnv = {
  DB:D1Database; ASSETS:Fetcher;
  STORE_OWNER:string; COMMERCE_APPROVERS?:string;
  ACCESS_ISSUER?:string; ACCESS_AUDIENCE?:string;
  PUBLIC_ORDERS_ENABLED?:string; CATALOG_MODE?:string;
  REQUIRE_SHARED_STOCK?:string;
  ORDER_RATE_LIMITER?:{limit(input:{key:string}):Promise<{success:boolean}>};
  COMMERCE_ERP_ORIGIN?:string;COMMERCE_ERP_TOKEN?:string;COMMERCE_ERP_OWNER?:string;
};
export const requestContext = new AsyncLocalStorage<{request:Request;env:RuntimeEnv}>();
export function context(){const c=requestContext.getStore();if(!c)throw Error("REQUEST_CONTEXT_REQUIRED");return c;}
