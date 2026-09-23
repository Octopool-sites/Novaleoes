type RetiredEnvironment = { RETIRED_DESTINATION?: string };

const allowedDestination = "https://nova-leoes-preview.vercel.app";
const maintenanceHtml = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nova Leões — atualização</title><body><main><h1>Estamos atualizando a loja.</h1><p>O atendimento online volta em breve. Aguarde alguns minutos e tente novamente.</p></main></body></html>`;

function isApiPath(pathname: string) {
  // Encoded separators and repeated leading slashes must not turn an old API
  // request into a frontend redirect to the new host.
  let path = pathname;
  for (let n = 0; n < 4; n++) {
    if (/^\/+api(?:\/|$)/i.test(path.replace(/\\/g, "/"))) return true;
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) return false;
      path = decoded;
    } catch { return true; }
  }
  return path.includes("%");
}

function headers() {
  return new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
}

const worker = {
  async fetch(request: Request, env: RetiredEnvironment): Promise<Response> {
    // An invalid destination stays in maintenance; never accept a caller URL,
    // alternate host, path, credentials, or protocol as a redirect destination.
    const retired = env.RETIRED_DESTINATION === allowedDestination;
    const readOnly = request.method === "GET" || request.method === "HEAD";
    const url = new URL(request.url);
    const responseHeaders = headers();
    if (!retired) responseHeaders.set("Retry-After", "300");
    if (!readOnly || isApiPath(url.pathname)) {
      responseHeaders.set("Content-Type", "application/json; charset=utf-8");
      const message = retired ? "Este endereço de atendimento foi desativado. Abra a loja atual para continuar."
        : "A loja está em atualização. Tente novamente em alguns minutos.";
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: message }), {
        status: retired ? 410 : 503, headers: responseHeaders,
      });
    }
    if (retired) {
      const destination = new URL(allowedDestination);
      destination.pathname = url.pathname;
      destination.search = url.search;
      responseHeaders.set("Location", destination.href);
      // Redirect only the navigation URL. No proxy request, submitted body,
      // Authorization header, or old authentication cookie crosses hosts.
      return new Response(null, { status: 302, headers: responseHeaders });
    }
    responseHeaders.set("Content-Type", "text/html; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : maintenanceHtml, { status: 503, headers: responseHeaders });
  },
  async scheduled(): Promise<void> {
    // Previous deployments may have a queued invocation. It must do no work.
  },
};

export default worker;
