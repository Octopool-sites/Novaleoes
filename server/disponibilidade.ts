// Estoque ao vivo da vitrine: GET /api/public/disponibilidade (api/commerce.ts).
//
// O catálogo estático (public/catalogo, reconstruído pela tarefa do PC do Luca às 7h e 13h) traz nome, preço,
// foto e aplicações. O "tem / não tem" vem daqui, direto do ERP, servidor para servidor, com a mesma credencial
// do estoque (COMMERCE_ERP_TOKEN / COMMERCE_ERP_ORIGIN):
//   GET {origin}/api/commerce-stock/disponibilidade -> { contract, generatedAt, available: [id do produto no ERP] }
// O id do ERP não sai para o navegador: vira o id curto do catálogo (o mesmo de scripts/catalogo/construir.mjs).
//
// Fica fora do route() de server/handler.ts de propósito: lá toda resposta sai "no-store", e esta precisa da CDN
// da Vercel (5 min) para o ERP não ser consultado a cada visita. Query string é recusada (cada URL diferente seria
// uma consulta nova ao ERP), e cada instância reaproveita a última resposta por 60 s. Fora de produção (prévia,
// dev local) não há credencial: responde 503 e o site fica com o estoque do catálogo.
import { createHash } from "node:crypto";
import { z } from "zod";
import { configErp } from "./placa.js";

const TIMEOUT = 6000;
const MEMORIA = 60_000;
export const CACHE_CDN = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";
const SEM_CACHE = { "Cache-Control": "no-store" };

const respostaErpSchema = z.object({
  contract: z.literal("octopool.availability.v1"),
  generatedAt: z.string().datetime(),
  available: z.array(z.string().min(1).max(100)).max(200_000),
});
export type Disponibilidade = { geradoEm: string; ids: string[] };

// Mesmo id curto de scripts/catalogo/construir.mjs (idCurto); tests/disponibilidade.test.mjs confere os dois.
export function idCurto(id: string) {
  return parseInt(createHash("sha1").update(String(id)).digest("hex").slice(0, 12), 16).toString(36).padStart(8, "0").slice(-8);
}

let ultima: { em: number; dados: Disponibilidade } | null = null;
let emAndamento: Promise<Disponibilidade> | null = null;
export function esquecerDisponibilidade() { ultima = null; emAndamento = null; }

async function consultarErp(transport: typeof fetch): Promise<Disponibilidade> {
  const cfg = configErp();
  if (!cfg) throw new Error("SEM_CONFIGURACAO");
  const r = await transport(`${cfg.origin}/api/commerce-stock/disponibilidade`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`ERP_${r.status}`);
  const dados = respostaErpSchema.parse(await r.json());
  return { geradoEm: dados.generatedAt, ids: [...new Set(dados.available.map(idCurto))].sort() };
}

export async function disponibilidade(request: Request, deps: { transport?: typeof fetch; agora?: () => number } = {}): Promise<Response> {
  if (request.method !== "GET") return Response.json({ error: "Método não permitido." }, { status: 405, headers: { ...SEM_CACHE, Allow: "GET" } });
  if (new URL(request.url).search) return Response.json({ error: "Endereço não encontrado." }, { status: 404, headers: SEM_CACHE });
  const agora = (deps.agora ?? Date.now)();
  try {
    if (!ultima || agora - ultima.em > MEMORIA) {
      emAndamento ??= consultarErp(deps.transport ?? fetch).finally(() => { emAndamento = null; });
      ultima = { em: agora, dados: await emAndamento };
    }
    return Response.json(ultima.dados, { headers: { "Cache-Control": CACHE_CDN } });
  } catch (e) {
    console.warn("disponibilidade-erp", e instanceof Error ? e.message.slice(0, 60) : "falha");
    // ERP fora por pouco tempo: a última resposta boa desta instância (até 30 min) vale mais que o catálogo das 13h.
    if (ultima && agora - ultima.em < 30 * 60_000) return Response.json(ultima.dados, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
    return Response.json({ error: "Estoque ao vivo indisponível." }, { status: 503, headers: SEM_CACHE });
  }
}
