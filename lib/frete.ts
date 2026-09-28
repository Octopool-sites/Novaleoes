// Cálculo de frete por CEP: endereço + coordenadas pela AwesomeAPI CEP (com ViaCEP de reserva para o endereço),
// distância até a loja (haversine × fator de rota) e tabela de faixas em lib/loja.ts.
import { LOJA } from "./loja";

export type Endereco = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string; lat: number | null; lng: number | null };
export type OpcaoFrete = { tipo: "retirada" | "entrega" | "combinar"; titulo: string; valorCents: number; prazo: string };
export type ResultadoFrete = { endereco: Endereco; distanciaKm: number | null; opcoes: OpcaoFrete[] };

export const CHAVE_CEP = "nl-cep-v1";

export function limparCep(valor: string) {
  return String(valor || "").replace(/\D/g, "").slice(0, 8);
}

export function formatarCep(valor: string) {
  const c = limparCep(valor);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function opcoesPorDistancia(km: number | null, mesmaCidade: boolean): OpcaoFrete[] {
  const { frete } = LOJA;
  const retirada: OpcaoFrete = { tipo: "retirada", titulo: `Retirar na loja · ${LOJA.endereco.bairro}`, valorCents: 0, prazo: frete.prazoRetirada };
  const faixa = km === null ? null : frete.faixas.find((f) => km <= f.ateKm);
  if (faixa) return [{ tipo: "entrega", titulo: "Entrega própria (motoboy da loja)", valorCents: faixa.valorCents, prazo: frete.prazoEntrega }, retirada];
  const combinar: OpcaoFrete = {
    tipo: "combinar",
    titulo: mesmaCidade && km === null ? "Entrega em Guarulhos" : "Entrega fora do raio da loja",
    valorCents: 0,
    prazo: "Valor e prazo combinados pelo WhatsApp",
  };
  return [combinar, retirada];
}

async function buscarJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function consultarCep(valor: string): Promise<Endereco> {
  const cep = limparCep(valor);
  if (cep.length !== 8) throw new Error("Digite os 8 números do CEP.");
  try {
    const d = await buscarJson(`https://cep.awesomeapi.com.br/json/${cep}`);
    if (d && d.city) {
      const lat = Number(d.lat), lng = Number(d.lng);
      return { cep, logradouro: d.address || "", bairro: d.district || "", cidade: d.city, uf: d.state || "", lat: Number.isFinite(lat) && lat ? lat : null, lng: Number.isFinite(lng) && lng ? lng : null };
    }
  } catch { /* tenta a reserva */ }
  try {
    const d = await buscarJson(`https://viacep.com.br/ws/${cep}/json/`);
    if (d && !d.erro) return { cep, logradouro: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", uf: d.uf || "", lat: null, lng: null };
  } catch { /* sem serviço */ }
  throw new Error("Não encontramos esse CEP. Confira os números.");
}

export async function calcularFrete(valor: string): Promise<ResultadoFrete> {
  const endereco = await consultarCep(valor);
  const km = endereco.lat !== null && endereco.lng !== null ? distanciaKm(LOJA.coordenadas, { lat: endereco.lat, lng: endereco.lng }) * LOJA.frete.fatorRota : null;
  const mesmaCidade = endereco.cidade.toLowerCase() === LOJA.endereco.cidade.toLowerCase();
  return { endereco, distanciaKm: km, opcoes: opcoesPorDistancia(km, mesmaCidade) };
}
