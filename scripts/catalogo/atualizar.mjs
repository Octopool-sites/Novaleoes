// Atualização recorrente do catálogo (preço e estoque) a partir do ERP, sem ninguém mexer.
//
//   node scripts/catalogo/atualizar.mjs [--sem-publicar]
//
// Roda num clone só para isso (C:\dev\novaleoes-site-estoque, sempre na main), nunca na pasta de trabalho:
//   1. git pull da main;
//   2. exportação SOMENTE LEITURA no container de produção (ECS Exec, profile AWS "octopool"), a mesma do
//      cabeçalho de exportar-erp.cjs;
//   3. confere a exportação (fim de arquivo, total de peças perto do anterior) e reconstrói public/catalogo;
//   4. se algo mudou, commita e faz push na main: a Vercel publica sozinha.
// Agendado no Windows pela tarefa "Nova Leoes estoque do site" (scripts/catalogo/atualizar-agendado.cmd).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const RAIZ = process.cwd();
const PUBLICAR = !process.argv.includes("--sem-publicar");
const AWS = ["--profile", "octopool", "--region", "sa-east-1"];

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
function rodar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: false, ...opcoes });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opcoes.tolerar) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} saiu com ${r.status}: ${(r.stderr || r.stdout || "").slice(-600)}`);
  return r;
}
const git = (...args) => rodar("git", args);

// 1. main atualizada e limpa
const ramo = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
if (ramo !== "main") throw new Error(`clone fora da main (${ramo}); este script só roda no clone dedicado`);
if (git("status", "--porcelain").stdout.trim()) throw new Error("clone com alterações locais; resolva antes de atualizar");
const lockAntes = readFileSync(join(RAIZ, "package-lock.json"), "utf8");
git("pull", "--ff-only", "origin", "main");
if (readFileSync(join(RAIZ, "package-lock.json"), "utf8") !== lockAntes || !existsSync(join(RAIZ, "node_modules/@aws-sdk/client-s3"))) {
  log("dependências mudaram: npm ci");
  rodar(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--no-audit", "--no-fund"], { shell: process.platform === "win32", timeout: 600000 });
}

// 2. exportação só leitura
const tarefa = rodar("aws", ["ecs", "list-tasks", "--cluster", "octopool-prod", "--service-name", "octopool-web", ...AWS, "--query", "taskArns[0]", "--output", "text"]).stdout.trim();
if (!tarefa.startsWith("arn:")) throw new Error(`tarefa do ECS não encontrada: ${tarefa}`);
// Trava: o site só acompanha o ERP. A exportação precisa abrir transação somente leitura e não pode ter
// nenhum comando de escrita; se alguém mudar o script, a atualização para aqui.
const fonte = readFileSync(join(RAIZ, "scripts/catalogo/exportar-erp.cjs"), "utf8");
const semComentarios = fonte.replace(/\/\/.*$/gm, "");
if (!semComentarios.includes('SET TRANSACTION READ ONLY')) throw new Error("exportação sem transação somente leitura; não rodo");
if (/\b(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|ALTER|DROP|CREATE)\b|\.(create|update|upsert|delete)(Many)?\(|\$executeRaw(?!Unsafe\("SET TRANSACTION READ ONLY"\))/i.test(semComentarios))
  throw new Error("exportação com comando de escrita; não rodo");
const script = Buffer.from(fonte).toString("base64");
log("exportando do ERP (somente leitura)…");
const saida = rodar("aws", ["ecs", "execute-command", "--cluster", "octopool-prod", "--task", tarefa, "--container", "web", "--interactive", ...AWS,
  "--command", `sh -c 'echo ${script} | base64 -d > /tmp/nl-export.js && NODE_PATH=/app/node_modules node /tmp/nl-export.js'`], { timeout: 280000 }).stdout;
if (!saida.includes("NL_END")) throw new Error(`exportação incompleta: ${saida.replace(/NL_CHUNK \S+/g, "").slice(-400)}`);
const b64 = [...saida.matchAll(/NL_CHUNK ([A-Za-z0-9+/=]+)/g)].map((m) => m[1]).join("");
const exportacao = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));

// 3. conferência antes de publicar
const anterior = JSON.parse(readFileSync(join(RAIZ, "public/catalogo/meta.json"), "utf8"));
const total = exportacao.prods?.length || 0;
if (total < anterior.total * 0.9) throw new Error(`exportação com ${total} peças, anterior ${anterior.total}: queda grande demais, não publico`);
mkdirSync(join(RAIZ, "outputs"), { recursive: true });
writeFileSync(join(RAIZ, "outputs/catalogo-erp.json"), JSON.stringify(exportacao));
log(`exportadas ${total} peças (${exportacao.prods.filter((p) => p.disp > 0).length} com estoque), ${exportacao.apl.length} aplicações`);
// Fotos com nome sem código: copia para site/ as que ainda não existem (só escreve nesse prefixo do bucket).
rodar(process.execPath, ["scripts/catalogo/publicar-fotos.mjs"], { timeout: 900000 });
rodar(process.execPath, ["scripts/catalogo/construir.mjs"]);

// 4. publica se mudou
if (!git("status", "--porcelain", "--", "public/catalogo").stdout.trim()) { log("nada mudou no ERP desde a última atualização"); process.exit(0); }
const quando = new Date(exportacao.exportadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
git("add", "public/catalogo");
git("commit", "-q", "-m", `chore(catalogo): estoque e preços do ERP — ${quando}`);
if (!PUBLICAR) { log("commit feito, sem push (--sem-publicar)"); process.exit(0); }
if (rodar("git", ["push", "origin", "HEAD:main"], { tolerar: true }).status !== 0) {
  git("pull", "--rebase", "origin", "main");
  git("push", "origin", "HEAD:main");
}
log(`publicado: estoque de ${quando}`);
