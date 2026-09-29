import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { LOJA } from "./lib/loja";
import { placaLocal } from "./server/placa-local";

// Endereço público do site, para og:image/og:url/canonical (o WhatsApp só mostra a prévia com URL absoluta).
// SITE_URL manda; na Vercel vale o domínio de produção do projeto (vira o domínio próprio quando ele for ligado).
const SITE_URL = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://nova-leoes-preview.vercel.app")).replace(/\/$/, "");

// Dados da loja para o Google (schema.org AutoPartsStore), a partir de lib/loja.ts.
function dadosDaLoja() {
  const e = LOJA.endereco;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "AutoPartsStore",
    name: LOJA.nome,
    legalName: LOJA.razaoSocial,
    taxID: LOJA.cnpj,
    foundingDate: String(LOJA.fundacao),
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    image: `${SITE_URL}/og-image.jpg`,
    telephone: `+55 ${LOJA.telefone}`,
    address: { "@type": "PostalAddress", streetAddress: `${e.logradouro}, ${e.numero}`, addressLocality: e.cidade, addressRegion: e.uf, postalCode: e.cep, addressCountry: "BR" },
    geo: { "@type": "GeoCoordinates", latitude: LOJA.coordenadas.lat, longitude: LOJA.coordenadas.lng },
    areaServed: e.cidade,
    currenciesAccepted: "BRL",
    paymentAccepted: LOJA.pagamentos.join(", "),
    ...(LOJA.horario.length ? { openingHours: LOJA.horario.map((h) => `${h.dias} ${h.horas}`) } : {}),
  }).replace(/</g, "\\u003c");
}

const paginaInicial = (): Plugin => ({
  name: "nl-pagina-inicial",
  transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL).replace("%DADOS_DA_LOJA%", dadosDaLoja()),
});

// VITE_BASE: subpasta de publicação (ex.: "/Novaleoes/" na prévia do GitHub Pages). Padrão "/" (Vercel).
export default defineConfig({ base: process.env.VITE_BASE || "/", plugins: [react(), paginaInicial(), placaLocal()], resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, build: { outDir: "dist/client", sourcemap: false }, server: { host: "127.0.0.1" } });
