// Exportação SOMENTE LEITURA do catálogo da Nova Leões a partir do banco do Nexus ERP.
// Roda DENTRO do container do backend em produção (ECS Exec), onde o Prisma e a DATABASE_URL já existem.
// Nenhuma escrita: a transação é aberta com SET TRANSACTION READ ONLY.
//
// Uso (PC com AWS CLI + profile octopool; ver docs/catalogo-erp.md):
//   TASK=$(aws ecs list-tasks --cluster octopool-prod --service-name octopool-web --profile octopool --region sa-east-1 --query 'taskArns[0]' --output text)
//   B64=$(base64 -w0 scripts/catalogo/exportar-erp.cjs)
//   aws ecs execute-command --cluster octopool-prod --task "$TASK" --container web --interactive --profile octopool --region sa-east-1 \
//     --command "sh -c 'echo $B64 | base64 -d > /tmp/x.js && NODE_PATH=/app/node_modules node /tmp/x.js'" \
//     | sed '/Session\|Starting\|Exiting/d' > outputs/catalogo-erp.raw.txt
//   grep -o 'NL_CHUNK [A-Za-z0-9+/=]*' outputs/catalogo-erp.raw.txt | sed 's/NL_CHUNK //' | tr -d '\n' | base64 -d | gunzip > outputs/catalogo-erp.json
//   node scripts/catalogo/construir.mjs
//
// Campos exportados: id, nome, marca, grupo, descrição, preço de venda, disponível (físico − reservado),
// foto, unidade, quantidade mínima de venda, aplicações veiculares e o vínculo Commerce (externalId).
// NÃO exporta: código interno, código do fabricante/OEM, custo, curva ABC, localização, similares.
const { PrismaClient } = require("@prisma/client");
const zlib = require("zlib");
const db = new PrismaClient();
const TENANT = "cmr9m6jgi001lx34fzpaeyrzn"; // Nova Leões Autopeças (empresa raiz)

(async () => {
  const resultado = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const empresa = await tx.empresa.findUnique({ where: { id: TENANT }, select: { nome: true, tipoVertical: true, status: true, filialDeId: true } });
    if (!empresa || empresa.tipoVertical !== "AUTOPECAS" || empresa.status !== "ATIVA" || empresa.filialDeId) throw new Error("SCOPE_MISMATCH");
    const prods = await tx.$queryRawUnsafe(`SELECT p.id, p.nome, p.marca, p.grupo, p.descricao, p."precoVenda"::float preco,
        GREATEST(0, (p."estoqueAtual" - p."estoqueReservado"))::float disp, p."fotoUrl" foto, p.unidade,
        p."quantidadeMinimaVenda"::float qmin, p."updatedAt" upd
      FROM "Produto" p WHERE p."empresaId" = '${TENANT}' AND p.ativo ORDER BY p.nome`);
    const apl = await tx.$queryRawUnsafe(`SELECT a."produtoId" pid, a.montadora m, a.modelo mo, a.versao v, a.motor mt,
        a."anoInicio" ai, a."anoFim" af, a.observacao o
      FROM "AplicacaoVeiculo" a JOIN "Produto" p ON p.id = a."produtoId" WHERE p."empresaId" = '${TENANT}' AND p.ativo`);
    const bind = await tx.$queryRawUnsafe(`SELECT cp."externalId" ext, cp."productId" pid FROM "CommerceProduct" cp
      JOIN "CommerceConnection" c ON c.id = cp."connectionId" WHERE c."tenantRootId" = '${TENANT}'`);
    return { exportadoEm: new Date().toISOString(), empresa: empresa.nome, prods, apl, bind };
  }, { timeout: 120000 });
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(resultado)), { level: 9 }).toString("base64");
  console.log("NL_SIZE", resultado.prods.length, resultado.apl.length, gz.length);
  for (let i = 0; i < gz.length; i += 60000) console.log("NL_CHUNK " + gz.slice(i, i + 60000));
  console.log("NL_END");
})().catch((e) => { console.error("FAIL", e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
