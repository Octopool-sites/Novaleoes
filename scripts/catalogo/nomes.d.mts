// Tipos do que o servidor do site usa de nomes.mjs (server/produto-publico.ts). O resto do módulo é usado só pelos
// scripts do catálogo, em JavaScript.
export const VAZAMENTO_CODIGO: RegExp;
export function limparNome(nome: string): string;
export function limparMarca(marca: string): string;
export function removerCodigosDePeca(texto: string): string;
export function temCodigoDePeca(texto: string): boolean;
