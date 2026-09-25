// "Meu veículo": o carro do cliente, guardado no navegador pelo NOME (os índices mudam entre exportações).
import type { Catalogo, Peca } from "./catalogo-site";
import { aplicaAno } from "./catalogo-site";

export type VeiculoSalvo = { montadora: string; modelo: string; ano: number };
export type Veiculo = { montadora: number; modelo: number; ano: number; rotulo: string };

const CHAVE = "nl-garagem-v1";

export function lerVeiculoSalvo(): VeiculoSalvo | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (v && typeof v.montadora === "string" && typeof v.modelo === "string") return { montadora: v.montadora, modelo: v.modelo, ano: Number(v.ano) || 0 };
  } catch {}
  return null;
}

export function salvarVeiculo(v: VeiculoSalvo | null) {
  try { if (v) localStorage.setItem(CHAVE, JSON.stringify(v)); else localStorage.removeItem(CHAVE); } catch {}
}

export function resolverVeiculo(catalogo: Catalogo, salvo: VeiculoSalvo | null): Veiculo | null {
  if (!salvo) return null;
  const montadora = catalogo.meta.montadoras.indexOf(salvo.montadora);
  if (montadora < 0) return null;
  const modelo = catalogo.meta.modelos.findIndex((m) => m[0] === montadora && m[1] === salvo.modelo);
  if (modelo < 0) return null;
  return { montadora, modelo, ano: salvo.ano, rotulo: rotuloVeiculo(catalogo, modelo, salvo.ano) };
}

export function rotuloVeiculo(catalogo: Catalogo, modelo: number, ano: number) {
  const [m, nome] = catalogo.meta.modelos[modelo];
  return `${catalogo.meta.montadoras[m]} ${nome}${ano ? ` ${ano}` : ""}`;
}

export function servePara(peca: Peca, veiculo: Veiculo | null) {
  if (!veiculo) return false;
  return peca.aplicacoes.some((a) => a[0] === veiculo.modelo && aplicaAno(a, veiculo.ano));
}
