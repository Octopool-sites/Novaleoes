import { AsyncLocalStorage } from "node:async_hooks";
export type RuntimeEnv = {
  DB:D1Database; ASSETS:Fetcher;
  STORE_OWNER:string; COMMERCE_APPROVERS?:string;
  SUPABASE_URL?:string; SUPABASE_PUBLISHABLE_KEY?:string;
  COMMERCE_AUTH_PROVIDER?:string;
  COMMERCE_LOGIN_ALIASES?:string;
  FIREBASE_PROJECT_ID?:string; FIREBASE_API_KEY?:string;
  PUBLIC_ORDERS_ENABLED?:string; CATALOG_MODE?:string;
  REQUIRE_SHARED_STOCK?:string;
  ORDER_RATE_LIMITER?:{limit(input:{key:string}):Promise<{success:boolean}>};
  AUTH_RATE_LIMITER?:{limit(input:{key:string}):Promise<{success:boolean}>};
  COMMERCE_ERP_ORIGIN?:string;COMMERCE_ERP_TOKEN?:string;COMMERCE_ERP_OWNER?:string;
};
export const requestContext = new AsyncLocalStorage<{request:Request;env:RuntimeEnv;authCookies?:string[];authHeaders?:Record<string,string>}>();
export function context(){const c=requestContext.getStore();if(!c)throw Error("REQUEST_CONTEXT_REQUIRED");return c;}
