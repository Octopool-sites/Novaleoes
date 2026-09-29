import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARQUIVOS_VITRINE, aplicar, temMatiz } from "../scripts/marca/aplicar-tokens.mjs";

// Marca Nova Leões (components/nl-marca.css): contraste dos pares de cor usados e nada de cor solta no CSS da vitrine.
const ler = (arq) => readFileSync(arq, "utf8");
const marca = ler("components/nl-marca.css");
const TOKENS = Object.fromEntries([...marca.matchAll(/--nl-([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a, b) => { const [x, y] = [lum(TOKENS[a] ?? a), lum(TOKENS[b] ?? b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("marca: tokens do escudo (laranja, chumbo, creme) e cores de apoio existem", () => {
  assert.equal(TOKENS.laranja.toUpperCase(), "FF9E2F");
  assert.equal(TOKENS.chumbo.toUpperCase(), "2F2E2E");
  assert.equal(TOKENS.creme.toUpperCase(), "FFF4D5");
  assert.equal(TOKENS["laranja-texto"].toUpperCase(), "A84F00");
  for (const t of ["laranja-forte", "laranja-claro", "laranja-tinta", "chumbo-2", "chumbo-3", "muted", "creme-suave", "papel", "branco", "linha", "linha-forte", "erro", "erro-fundo"]) assert.ok(TOKENS[t], `falta --nl-${t}`);
});

test("marca: texto normal passa AA (4,5:1) em todas as combinações usadas", () => {
  const pares = [
    ["chumbo", "laranja"], ["chumbo", "laranja-forte"], ["chumbo", "laranja-claro"], ["chumbo", "laranja-tinta"], // botão primário, selo "tem", avisos
    ["laranja", "chumbo"], ["creme", "chumbo"], ["creme-suave", "chumbo"], ["creme", "chumbo-2"], // rodapé, faixa, botão escuro
    ...["branco", "papel", "creme", "creme-claro", "laranja-claro", "laranja-tinta"].map((f) => ["laranja-texto", f]), // kicker, link, destaque
    ["laranja-texto-forte", "creme"], ["laranja-texto-forte", "laranja-tinta"],
    ...["branco", "papel", "creme", "creme-claro"].flatMap((f) => [["chumbo", f], ["chumbo-2", f], ["chumbo-3", f], ["muted", f]]),
    ["erro", "branco"], ["erro", "erro-fundo"],
  ];
  for (const [texto, fundo] of pares) {
    const c = contraste(texto, fundo);
    assert.ok(c >= 4.5, `--nl-${texto} sobre --nl-${fundo}: ${c.toFixed(2)} (mínimo 4,5)`);
  }
});

test("marca: laranja da marca nunca é texto em fundo claro nem fundo de texto branco", () => {
  assert.ok(contraste("FFFFFF", "laranja") < 3, "branco sobre laranja reprova (por isso o botão usa texto chumbo)");
  assert.ok(contraste("laranja", "branco") < 3, "laranja sobre branco reprova (texto de destaque usa --nl-laranja-texto)");
  // Nenhuma regra da vitrine põe texto branco em fundo laranja
  for (const arq of ARQUIVOS_VITRINE) {
    for (const [, corpo] of ler(arq).matchAll(/[^{}]+\{([^{}]*)\}/g)) {
      const fundoLaranja = /background(-color)?:\s*var\(--nl-laranja(-forte)?\)/.test(corpo);
      const textoBranco = /(^|;|\s)color:\s*(#fff\b|#ffffff\b|white\b|var\(--nl-branco\))/i.test(corpo);
      assert.ok(!(fundoLaranja && textoBranco), `${arq}: texto branco sobre laranja em { ${corpo.trim().slice(0, 120)} }`);
    }
  }
});

test("marca: foco visível contrasta com o fundo (3:1)", () => {
  assert.ok(contraste("chumbo", "branco") >= 3 && contraste("chumbo", "papel") >= 3, "anel chumbo em fundo claro");
  assert.ok(contraste("laranja", "chumbo") >= 3, "contorno laranja em fundo chumbo");
});

test("marca: CSS da vitrine e do login sem cor solta (oliva, verde, dourado): só var(--nl-*)", () => {
  for (const arq of ARQUIVOS_VITRINE) {
    const log = [];
    aplicar(ler(arq), arq, log);
    assert.deepEqual(log, [], `${arq}: cores com matiz fora dos tokens (rode node scripts/marca/aplicar-tokens.mjs)`);
    // variáveis locais com cor escrita direto também não (o :root do shadcn em globals.css é do painel /gestao;
    // na vitrine ele é sobrescrito por :root:has(.nl-store) em nl-marca.css)
    if (arq === "app/globals.css") continue;
    const soltas = [...ler(arq).matchAll(/(--[a-z0-9-]+):\s*#([0-9a-fA-F]{3,8})\b/g)].filter((m) => temMatiz(m[2].length <= 4 ? [...m[2].slice(0, 3)].map((x) => x + x).join("") : m[2].slice(0, 6)));
    assert.deepEqual(soltas.map((m) => m[0]), [], `${arq}: variável com cor escrita direto`);
  }
});

test("marca: tipografia do logo (Barlow auto-hospedada), sem Georgia e sem títulos espremidos", () => {
  const main = ler("main.tsx");
  for (const f of ["@fontsource/barlow/latin-400.css", "@fontsource/barlow/latin-600.css", "@fontsource/barlow-semi-condensed/latin-700.css"]) assert.ok(main.includes(f), `main.tsx não importa ${f}`);
  assert.ok(main.indexOf("./components/nl-marca.css") < main.indexOf("./components/storefront"), "nl-marca.css precisa vir antes da vitrine");
  for (const arq of ARQUIVOS_VITRINE) {
    const css = ler(arq);
    assert.ok(!/Georgia/i.test(css), `${arq}: ainda usa Georgia`);
    assert.ok(!/letter-spacing:\s*-[1-9][\d.]*px/.test(css), `${arq}: letter-spacing de -1px ou menos (títulos usam -.01em)`);
  }
});

test("marca: theme-color chumbo e rodapé público sem o link da equipe", () => {
  assert.match(ler("index.html"), /<meta name="theme-color" content="#2F2E2E"\s*\/?>/i);
  const rodape = ler("components/storefront-institucional.tsx");
  assert.ok(!/href="\/gestao"/.test(rodape) && !/Acesso da equipe/.test(rodape), "rodapé público não deve linkar /gestao");
});
