// Busca por placa no `vite dev` / `vite preview` (máquina local): atende /api/public/placa com o mesmo código
// de server/placa.ts, que fora de produção responde o STUB simulado. Não entra no build publicado
// (configureServer/configurePreviewServer só rodam nos servidores locais do Vite).
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { HttpError } from "../lib/commerce-server.js";
import { consultarPlaca, statusPlaca } from "./placa.js";
import { disponibilidade } from "./disponibilidade.js";

function limitadorEmMemoria(maximo: number) {
  const contagem = new Map<string, { janela: number; n: number }>();
  return { async limit({ key }: { key: string }) {
    const janela = Math.floor(Date.now() / 60_000);
    const atual = contagem.get(key);
    const n = atual?.janela === janela ? atual.n : 0;
    if (n >= maximo) return { success: false };
    contagem.set(key, { janela, n: n + 1 });
    return { success: true };
  } };
}

async function corpo(req: IncomingMessage) {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of req) { tamanho += parte.length; if (tamanho > 24_000) break; partes.push(parte as Buffer); }
  return Buffer.concat(partes);
}

export function placaLocal(): Plugin {
  const limiter = limitadorEmMemoria(5);
  async function atender(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const caminho = (req.url || "").split("?")[0];
    if (process.env.VERCEL_ENV === "production") return next();
    // Estoque ao vivo: sem credencial na máquina local, responde { indisponivel: true } e o site usa o catálogo.
    if (caminho === "/api/public/disponibilidade") {
      const r = await disponibilidade(new Request(new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`), { method: req.method || "GET" }));
      res.statusCode = r.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (caminho !== "/api/public/placa") return next();
    let resposta: Response;
    try {
      if (req.method === "GET") resposta = await statusPlaca();
      else if (req.method === "POST") {
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        headers.set("cf-connecting-ip", req.socket.remoteAddress || "unknown");
        const request = new Request(new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`), { method: "POST", headers, body: await corpo(req) });
        resposta = await consultarPlaca(request, { limiter });
      } else resposta = Response.json({ error: "Endereço não encontrado." }, { status: 404 });
    } catch (e) {
      resposta = Response.json({ error: e instanceof HttpError ? e.message : "Não foi possível concluir." }, { status: e instanceof HttpError ? e.status : 503 });
    }
    res.statusCode = resposta.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(await resposta.arrayBuffer()));
  }
  return {
    name: "nl-placa-local",
    configureServer: (server) => { server.middlewares.use((req, res, next) => { void atender(req, res, next); }); },
    configurePreviewServer: (server) => { server.middlewares.use((req, res, next) => { void atender(req, res, next); }); },
  };
}
