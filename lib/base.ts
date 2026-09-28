// Prefixo dos arquivos públicos: "/" na Vercel; "/Novaleoes/" numa prévia em subpasta (GitHub Pages).
// Vem de VITE_BASE no build (vite.config.ts → base).
export const BASE_URL: string = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/";
export const caminho = (p: string) => BASE_URL + p.replace(/^\//, "");
