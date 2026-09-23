import { handleApi } from "../server/handler.js";

const ROUTE_PARAMETER = "__commerce_route";
const routePattern = /^\/api\/(?:auth\/(?:status|login|logout|recover|activate)|public\/(?:catalog|orders)|maintenance|session|orders(?:\/[a-zA-Z0-9-]+(?:\/(?:approve|export))?)?|manage\/catalog(?:\/[a-zA-Z0-9-]+)?|integration(?:\/reconcile)?)$/;

export function commerceRequest(request: Request): Request | null {
  const url = new URL(request.url);
  const forwarded = url.searchParams.getAll(ROUTE_PARAMETER);
  // The adapter supports both original URLs and Vercel's rewritten URL. A
  // duplicate/conflicting reserved parameter is rejected rather than choosing
  // a client-controlled value over the routing value.
  if (forwarded.length > 1) return null;
  const rewritten = url.pathname === "/api/commerce" || url.pathname === "/api/commerce.ts";
  const pathname = rewritten && forwarded.length === 1 ? `/api/${forwarded[0]}` : url.pathname;
  if (!rewritten && forwarded.length && `/api/${forwarded[0]}` !== pathname) return null;
  if (!routePattern.test(pathname)) return null;
  url.pathname = pathname;
  url.searchParams.delete(ROUTE_PARAMETER);
  // Preserve the request method, stream, cookies and actual Origin. This is
  // routing only: the handler still enforces CSRF, Firebase and cron secrets.
  return new Request(url, request);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const routed = commerceRequest(request);
    if (!routed) return Response.json({ error: "Endereço não encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return handleApi(routed);
  },
};
