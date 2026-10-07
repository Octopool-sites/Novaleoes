// Fotos das peças integradas ao estoque do ERP (as 7 do piloto, cadastradas no Firestore).
// O cadastro antigo guarda o caminho com o código interno do ERP no nome do arquivo, e o AGENTS.md proíbe expor esse
// código. Os arquivos foram renomeados pelo id da peça em public/assets/pecas/ (06/10/2026). Caminho antigo nesse
// formato vira o novo; peça fora da lista fica sem foto, porque o arquivo antigo não existe mais.
export const FOTOS_INTEGRADAS: Record<string, string> = {
  amortecedor: "/assets/pecas/amortecedor.jpg",
  bomba: "/assets/pecas/bomba.jpg",
  "cabo-bateria": "/assets/pecas/cabo-bateria.jpg",
  correia: "/assets/pecas/correia.jpg",
  "filtro-ar": "/assets/pecas/filtro-ar.jpg",
  palheta: "/assets/pecas/palheta.jpg",
};

const CAMINHO_COM_CODIGO = /^\/assets\/\d+(?:\.\d+)+\.(?:jpe?g|png|webp)$/i;

export function fotoIntegrada(id: string, image: string) {
  if (!image) return "";
  if (CAMINHO_COM_CODIGO.test(image)) return FOTOS_INTEGRADAS[id] ?? "";
  return image;
}
