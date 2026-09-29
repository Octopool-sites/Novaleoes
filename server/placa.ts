// Busca por placa do site: POST /api/public/placa e GET /api/public/placa (server/handler.ts).
//
// O navegador fala só com o próprio site (CSP 'self'). Em produção, este servidor pergunta ao ERP, servidor
// para servidor, com a mesma credencial do estoque (COMMERCE_ERP_TOKEN / COMMERCE_ERP_ORIGIN):
//   POST {origin}/api/commerce-stock/placa          { placa }  -> { encontrado, simulado, veiculo, catalogo }
//   GET  {origin}/api/commerce-stock/placa/status              -> { ativa }
// Fora de produção (preview da Vercel, dev local, testes) responde um STUB determinístico marcado
// simulado:true, para testar a tela sem gastar consulta paga.
//
// Privacidade: a placa não é logada nem guardada; sai daqui só no corpo do POST para o ERP. A resposta ao
// navegador é montada por lista fixa de campos (nada de município, UF, situação, chassi ou nº do motor).
import { createHash } from "node:crypto";
import { z } from "zod";
import { readJson } from "../lib/commerce-server.js";
import { normalizarPlaca, type RespostaPlaca } from "../lib/placa-site.js";

type Limitador = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type PlacaDeps = { limiter?: Limitador; transport?: typeof fetch };

const HOST_ERP = "api.octopool.com.br";
const TIMEOUT_CONSULTA = 8000;
const TIMEOUT_STATUS = 5000;
const CINCO_MIN = 5 * 60_000;
const UM_MIN = 60_000;

export const MENSAGENS = {
  PLACA_INVALIDA: "Confira a placa: use o formato ABC1234 ou ABC1D23.",
  RATE_LIMIT: "Muitas consultas em pouco tempo. Aguarde um minuto ou escolha o carro manualmente.",
  INDISPONIVEL: "A busca por placa está indisponível agora. Escolha o carro manualmente.",
} as const;
type Codigo = keyof typeof MENSAGENS;
const STATUS: Record<Codigo, number> = { PLACA_INVALIDA: 400, RATE_LIMIT: 429, INDISPONIVEL: 503 };

function erro(code: Codigo) {
  return Response.json({ code, error: MENSAGENS[code] }, { status: STATUS[code] });
}

export function emProducao() {
  return process.env.VERCEL_ENV === "production";
}

// Mesma trava do lib/erp-stock-client.ts: só https://api.octopool.com.br e token de 64 hex.
export function configErp(): { origin: string; token: string } | null {
  const token = process.env.COMMERCE_ERP_TOKEN || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  let u: URL;
  try { u = new URL(process.env.COMMERCE_ERP_ORIGIN || ""); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== HOST_ERP || u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash) return null;
  return { origin: u.origin, token };
}

// Resposta do ERP: só estes campos passam (o zod descarta qualquer outro).
const texto = z.string().trim().max(80);
const anoSchema = z.number().int().min(1900).max(2100).nullable().optional().transform((v) => v ?? null);
const textoOpcional = texto.nullable().optional().transform((v) => v || null);
const parSchema = z.object({ montadora: texto, modelo: texto });
export const respostaErpSchema = z.union([
  z.object({
    encontrado: z.literal(true),
    simulado: z.boolean().optional().default(false),
    veiculo: z.object({ marca: texto, modelo: texto, ano: anoSchema, anoFabricacao: anoSchema, combustivel: textoOpcional, cilindrada: textoOpcional }),
    catalogo: z.object({
      identificado: z.boolean(),
      montadora: texto.optional().default(""),
      modelo: texto.optional().default(""),
      motorSugerido: texto.nullable().optional().transform((v) => v || ""),
      alternativas: z.array(parSchema).max(20).optional().default([]),
    }),
  }),
  z.object({ encontrado: z.literal(false) }),
]);

// Monta a resposta pública campo a campo (lista fixa), mesmo depois da validação.
export function respostaPublica(dados: z.infer<typeof respostaErpSchema>): RespostaPlaca {
  if (!dados.encontrado) return { encontrado: false };
  const { veiculo: v, catalogo: c } = dados;
  return {
    encontrado: true,
    simulado: dados.simulado,
    veiculo: { marca: v.marca, modelo: v.modelo, ano: v.ano, anoFabricacao: v.anoFabricacao, combustivel: v.combustivel, cilindrada: v.cilindrada },
    catalogo: {
      identificado: c.identificado, montadora: c.montadora, modelo: c.modelo, motorSugerido: c.motorSugerido,
      alternativas: c.alternativas.slice(0, 3).map((a) => ({ montadora: a.montadora, modelo: a.modelo })),
    },
  };
}

// STUB fora de produção. Placas de teste para os estados da tela:
//   NAO....  não encontrada          FOR....  carro fora do catálogo do site
//   LIM....  limite (429)            ERR....  indisponível (503)
//   qualquer outra: um carro do catálogo, sempre o mesmo para a mesma placa.
const STUB_CARROS: Array<Extract<RespostaPlaca, { encontrado: true }>> = [
  { veiculo: { marca: "VOLKSWAGEN", modelo: "GOL 1.0 GIV", ano: 2012, anoFabricacao: 2011, combustivel: "FLEX", cilindrada: "999" }, catalogo: { montadora: "Volkswagen", modelo: "GOL" } },
  { veiculo: { marca: "FIAT", modelo: "UNO MILLE ECONOMY", ano: 2010, anoFabricacao: 2010, combustivel: "FLEX", cilindrada: "999" }, catalogo: { montadora: "Fiat", modelo: "UNO" } },
  { veiculo: { marca: "CHEVROLET", modelo: "ONIX 1.0MT LT", ano: 2016, anoFabricacao: 2015, combustivel: "FLEX", cilindrada: "999" }, catalogo: { montadora: "Chevrolet", modelo: "ONIX" } },
  { veiculo: { marca: "RENAULT", modelo: "SANDERO STEPWAY 1.6", ano: 2014, anoFabricacao: 2014, combustivel: "FLEX", cilindrada: "1598" }, catalogo: { montadora: "Renault", modelo: "SANDERO", alternativas: [{ montadora: "Renault", modelo: "STEPWAY" }] } },
  { veiculo: { marca: "FORD", modelo: "KA SE 1.0", ano: 2015, anoFabricacao: 2014, combustivel: "FLEX", cilindrada: "999" }, catalogo: { montadora: "Ford", modelo: "KA" } },
  { veiculo: { marca: "HYUNDAI", modelo: "HB20 1.0M COMFORT", ano: 2019, anoFabricacao: 2018, combustivel: "FLEX", cilindrada: "998" }, catalogo: { montadora: "Hyundai", modelo: "HB20" } },
].map(({ veiculo, catalogo }) => ({
  encontrado: true as const, simulado: true, veiculo,
  catalogo: { identificado: true, motorSugerido: "", alternativas: [], ...catalogo },
}));

export function respostaStub(placa: string): RespostaPlaca | Codigo {
  if (placa.startsWith("NAO")) return { encontrado: false, simulado: true };
  if (placa.startsWith("LIM")) return "RATE_LIMIT";
  if (placa.startsWith("ERR")) return "INDISPONIVEL";
  if (placa.startsWith("FOR")) return {
    encontrado: true, simulado: true,
    veiculo: { marca: "BYD", modelo: "DOLPHIN GS", ano: 2024, anoFabricacao: 2023, combustivel: "ELETRICO", cilindrada: null },
    catalogo: { identificado: false, montadora: "", modelo: "", motorSugerido: "", alternativas: [] },
  };
  const i = parseInt(createHash("sha256").update(placa).digest("hex").slice(0, 8), 16) % STUB_CARROS.length;
  return STUB_CARROS[i];
}

// Identificação da pessoa para o limite do ERP, sem mandar o IP: 32 hex do sha256(sal:ip).
export function clienteErp(ip: string) {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt || salt.length < 32) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// Lê o corpo com teto de tamanho (a resposta do ERP é pequena; nada de ler um corpo gigante).
async function lerJson(r: Response, limite: number): Promise<unknown> {
  if (Number(r.headers.get("content-length") || 0) > limite) throw Error("RESPOSTA_GRANDE");
  const reader = r.body?.getReader();
  if (!reader) return null;
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > limite) { await reader.cancel(); throw Error("RESPOSTA_GRANDE"); }
    partes.push(value);
  }
  const bytes = new Uint8Array(tamanho);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function codigoDoErro(r: Response) {
  const dados = await lerJson(r, 4000).catch(() => null) as { code?: unknown } | null;
  return typeof dados?.code === "string" && /^[A-Z_]{1,40}$/.test(dados.code) ? dados.code : "";
}

// Status em memória por instância: 5 min para resposta definitiva do ERP, 1 min para falha passageira.
let statusCache: { ativa: boolean; ate: number } | null = null;
let statusPendente: Promise<boolean> | null = null;
function lembrarStatus(ativa: boolean, ms: number) {
  statusCache = { ativa, ate: Date.now() + ms };
  return ativa;
}
export function reiniciarStatusPlaca() {
  statusCache = null;
  statusPendente = null;
}

async function perguntarStatus(cfg: { origin: string; token: string }, transport: typeof fetch) {
  try {
    const r = await transport(`${cfg.origin}/api/commerce-stock/placa/status`, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_STATUS),
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    });
    if (r.status === 200) {
      const d = z.object({ ativa: z.boolean() }).safeParse(await lerJson(r, 2000).catch(() => null));
      return d.success ? lembrarStatus(d.data.ativa, CINCO_MIN) : lembrarStatus(false, UM_MIN);
    }
    // 401/403 (token recusado, DISABLED) e 404 (ERP ainda sem a rota): desligada até a próxima conferência.
    if ([401, 403, 404].includes(r.status)) return lembrarStatus(false, CINCO_MIN);
    console.warn("placa-status-indisponivel", r.status);
    return lembrarStatus(false, UM_MIN);
  } catch {
    console.warn("placa-status-indisponivel", "transporte");
    return lembrarStatus(false, UM_MIN);
  }
}

export async function placaAtiva(deps: PlacaDeps = {}): Promise<boolean> {
  if (!emProducao()) return true;
  const cfg = configErp();
  if (!cfg) return false;
  if (statusCache && statusCache.ate > Date.now()) return statusCache.ativa;
  statusPendente ??= perguntarStatus(cfg, deps.transport ?? fetch).finally(() => { statusPendente = null; });
  return statusPendente;
}

export async function statusPlaca(deps: PlacaDeps = {}) {
  return Response.json({ ativa: await placaAtiva(deps) });
}

async function consultarErp(placa: string, ip: string, transport: typeof fetch): Promise<Response> {
  const cfg = configErp();
  const cliente = clienteErp(ip);
  if (!cfg || !cliente) return erro("INDISPONIVEL");
  // Já sabemos que está desligada: nem chama o ERP.
  if (statusCache && statusCache.ate > Date.now() && !statusCache.ativa) return erro("INDISPONIVEL");
  let r: Response;
  try {
    r = await transport(`${cfg.origin}/api/commerce-stock/placa`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_CONSULTA),
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", Accept: "application/json", "X-Octopool-Cliente": cliente },
      body: JSON.stringify({ placa }),
    });
  } catch {
    console.warn("placa-erp-indisponivel", "transporte");
    return erro("INDISPONIVEL");
  }
  if (r.status === 200) {
    const dados = respostaErpSchema.safeParse(await lerJson(r, 16_000).catch(() => null));
    if (dados.success) return Response.json(respostaPublica(dados.data));
    console.warn("placa-erp-resposta-invalida");
    return erro("INDISPONIVEL");
  }
  const codigo = await codigoDoErro(r);
  if (r.status === 400) return erro("PLACA_INVALIDA");
  if (r.status === 429) return erro("RATE_LIMIT");
  if (r.status === 401 || (r.status === 403 && codigo !== "SERVER_ONLY")) lembrarStatus(false, CINCO_MIN);
  console.warn("placa-erp-recusou", r.status, codigo);
  return erro("INDISPONIVEL");
}

export async function consultarPlaca(request: Request, deps: PlacaDeps = {}): Promise<Response> {
  const corpo = z.object({ placa: z.string().max(16) }).strict().safeParse(await readJson(request));
  const placa = corpo.success ? normalizarPlaca(corpo.data.placa) : null;
  if (!placa) return erro("PLACA_INVALIDA");
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (deps.limiter && !(await deps.limiter.limit({ key: ip })).success) return erro("RATE_LIMIT");
  if (!emProducao()) {
    const r = respostaStub(placa);
    return typeof r === "string" ? erro(r) : Response.json(r);
  }
  if (!deps.limiter) return erro("INDISPONIVEL"); // produção sem limite por IP não chama consulta paga
  return consultarErp(placa, ip, deps.transport ?? fetch);
}
