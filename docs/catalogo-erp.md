# Catálogo completo no site — 25/09/2026

Escopo: vitrine da Nova Leões (versão A). O catálogo inteiro do ERP passou a ser publicado no site como
arquivos estáticos; a integração de estoque (`octopool.stock.v1`), a gestão e a API de pedidos não mudaram.

## O que o site mostra

- **39.369 peças ativas** do tenant Nova Leões no Nexus ERP, das quais 9.435 com estoque e 23.376 com foto.
- Por peça: nome limpo, marca, grupo, departamento, preço de venda, disponibilidade, foto, descrição e
  aplicações veiculares (montadora, modelo, versão, motor, anos).
- **Nunca sai do ERP:** código interno, código do fabricante/OEM, custo, curva ABC, localização, similares.
  O nome também perde a referência colada no fim (`BOMBA DAGUA / 766` → "Bomba d'Água") e códigos entre
  parênteses (`PAST FREIO DT ( 4213 )`).

## Fluxo

1. **Exportar** (somente leitura, dentro do container do backend em produção, via ECS Exec):
   `scripts/catalogo/exportar-erp.cjs`. O script abre a transação com `SET TRANSACTION READ ONLY`, confere
   que a empresa é a Nova Leões (AUTOPECAS, ATIVA, raiz) e imprime o JSON comprimido em base64. O comando
   completo está no cabeçalho do arquivo. Resultado: `outputs/catalogo-erp.json` (24 MB, fora do Git).
2. **Construir**: `node scripts/catalogo/construir.mjs` lê a exportação e grava `public/catalogo/`:
   - `meta.json` (55 KB): departamentos, grupos, marcas, montadoras, modelos, unidades, datas e totais.
   - `indice.json` (3,8 MB, ~840 KB comprimido): uma linha por peça para busca e filtros no navegador.
   - `detalhes/000..199.json` (7,7 MB no total): descrição limpa e aplicações completas, carregadas
     só ao abrir a peça.
   O build é determinístico (ordenação fixa), então o diff no Git mostra só o que mudou no ERP.
3. **Publicar**: os arquivos vão no repositório e saem no deploy normal da Vercel (`vercel.json` dá
   cache de 1 h no navegador e 1 dia na CDN para `/catalogo/*`). Reexportar quando a loja quiser refletir
   cadastros novos; preço e estoque das sete peças integradas continuam vindo ao vivo do ERP.

`npm test` cobre limpeza de nomes, descrição, taxonomia, construção do índice e filtros
(`tests/catalogo.test.mjs`).

## Regras de apresentação

- **Nomes** (`scripts/catalogo/nomes.mjs`): expansão das abreviações do balcão (AMORT, DT, TS, LD, LE,
  MANG, VALV, PAST, ROL, TERM, CIL, RESERV, HOMO, EMBR…), acentos, caixa de título, "com/sem/para".
  Em disco de freio, VENT = ventilado e SOL = sólido. O nome original continua indexado pela busca
  (buscar "amort ts" acha "Amortecedor Traseiro").
- **Descrição**: linhas `> ... <` viram destaques; pontos soltos, códigos isolados e repetições saem.
- **Departamentos** (`scripts/catalogo/taxonomia.mjs`): 17 departamentos com regras de palavra-chave
  sobre o grupo do ERP. O grupo `LUBRIFICANTES` é um balde do legado (7.429 itens, de mangueira a
  furadeira): nesses casos o nome da peça decide e o grupo exibido é derivado do nome. O que não casa
  com regra nenhuma fica em "Outras peças" (916 itens na exportação de 25/09, a maioria nomes de uma
  palavra como "Mangueira" ou "Bucha").
- **Anos das aplicações**: erros do legado (`2106`, `2207`) são corrigidos para `2006`, `2007`; valores
  impossíveis (`120`, `5487`) ficam como "não informado".
- **Preço abaixo de R$ 1** (1.370 itens) é tratado como "consultar preço". Marcas com sufixo de linha
  (`COFAP AMORT`, `SABO JUNTAS`) aparecem só com o nome (`Cofap`, `Sabo`).
- **Fotos**: servidas direto do bucket público `octopool-fotos-produtos` (S3) ou da rota pública do ERP
  (`/api/produtos-foto/:id`); ambos liberados na CSP. Fotos apontando para sites de terceiros não entram.

## Comportamento na loja

- Busca por palavras (nome, marca, grupo, departamento, montadora e modelo), departamentos com contagem,
  grupos do departamento, filtro por montadora → modelo → ano, marca da peça, "só em estoque" e
  ordenação. O estado do filtro vai para a URL (`?dep=freios&modelo=41&ano=2010`) para compartilhar.
- Qualquer peça entra em **Meu pedido**. As sete peças vinculadas ao ERP seguem o fluxo de aprovação
  online quando ele estiver ligado (`PUBLIC_ORDERS_ENABLED=1`); o restante, e o pedido inteiro enquanto o
  online estiver desligado, sai pelo botão **Enviar pedido pelo WhatsApp** (mensagem pronta com itens,
  quantidades e veículo). O detalhe da peça também tem "Perguntar no WhatsApp".
- Seções institucionais: Quem somos (fundação 1993, Guarulhos, entrega própria), Onde estamos (endereço,
  mapa, telefone, WhatsApp, horário), Trocas e garantia e o rodapé com departamentos, links da loja,
  atendimento, razão social e CNPJ. Os dados ficam em `lib/loja.ts`.

## Pendências e limites

- **Dados da loja a confirmar** em `lib/loja.ts`: qual número tem WhatsApp (o site usa o telefone fixo
  `(11) 2452-8939` nos links `wa.me`), horário de atendimento, e-mail público e Instagram. O e-mail do
  ERP não foi publicado de propósito.
- **Texto de trocas e garantia** é genérico (garantia do fabricante + CDC, arrependimento de 7 dias para
  compra fora da loja). Revisar com a loja antes de divulgar.
- O catálogo é uma **fotografia** da exportação (data em `meta.json → exportadoEm` e no rodapé da
  gestão futura). Preço e estoque das peças não integradas podem mudar até a conferência da equipe.
- A classificação por departamento é heurística; revisar "Outras peças" e mover regras conforme a loja
  apontar. Ampliar o vínculo ERP para mais peças (aprovação online com reserva) é uma mudança no
  Nexus, fora deste repositório.
- Ainda não há página própria por peça (URL por produto) nem indexação: o site segue `noindex`.
